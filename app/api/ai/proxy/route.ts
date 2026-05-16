import { NextResponse } from "next/server";
import { z } from "zod";
import { openai, aiModels } from "@/lib/ai/openai";
import { trackAICall } from "@/lib/ai/track-cost";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

/**
 * Public AI proxy for admin-trusted CMS pages (the AI-tool landing
 * decks). Mirrors the WordPress `/wp-json/diyguru/v1/openai-proxy`
 * endpoint shape exactly, so existing tool HTML can be pasted into
 * /admin/pages/new with no JS changes other than swapping the
 * `apiEndpoint` constant.
 *
 * Request shape (matches WP plugin):
 *   POST /api/ai/proxy
 *   Content-Type: application/json
 *   Body: {
 *     messages: [{ role, content }, ...],
 *     temperature?: number (default 0.7),
 *     max_tokens?: number  (default 1500, hard-capped at 4000),
 *     model?: string       (default our parser model — gpt-4o-mini)
 *   }
 *
 * Response shape (matches OpenAI chat-completion):
 *   { choices: [{ message: { content }, finish_reason }, ... ], usage }
 *
 * Trust + abuse model:
 *   • This endpoint accepts cross-origin requests (CORS *) so it
 *     works from iframed pages with allow-same-origin OFF too. The
 *     real protection is per-IP rate limit + per-IP daily ceiling +
 *     per-call max_tokens cap.
 *   • Everyone shares the same OpenAI API key and budget. Watch
 *     spending; if it spikes, drop the limits below.
 *   • No auth required — these tools are public-facing landing
 *     pages whose lead-capture forms gate the experience separately.
 */

// ─── Rate limits ─────────────────────────────────────────────
const PER_MINUTE = { limit: 10, windowMs: 60_000 };          // 10 req/min/IP
const PER_DAY = { limit: 200, windowMs: 24 * 60 * 60_000 };  // 200 req/day/IP

// Hard caps on the request body itself — defence against
// runaway prompts that would burn tokens.
const MAX_MESSAGES = 30;
const MAX_TOKENS_CAP = 4000;
const MAX_TOTAL_PROMPT_CHARS = 60_000;

const proxySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().min(1).max(MAX_TOTAL_PROMPT_CHARS),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(MAX_TOKENS_CAP).optional(),
  model: z.string().max(120).optional(),
});

const corsHeaders = {
  // Allow any origin including `null` (the opaque-sandbox iframes
  // we render in PageIframe when allowScripts is false).
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: Request) {
  const ip = clientIp(req);

  // Per-IP rate limits — minute + daily. We check minute first because
  // it's the most common abuser pattern (a runaway client loop).
  const minute = await rateLimit(`ai-proxy:m:${ip}`, PER_MINUTE).catch(() => null);
  if (minute && !minute.ok) {
    return NextResponse.json(
      {
        error: { message: "Rate limit exceeded — slow down. (10 req/min per IP)" },
        retryAfterMs: minute.resetMs,
      },
      { status: 429, headers: corsHeaders },
    );
  }
  const day = await rateLimit(`ai-proxy:d:${ip}`, PER_DAY).catch(() => null);
  if (day && !day.ok) {
    return NextResponse.json(
      {
        error: { message: "Daily AI quota for this IP reached. Try again tomorrow." },
        retryAfterMs: day.resetMs,
      },
      { status: 429, headers: corsHeaders },
    );
  }

  // Parse + validate the body.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Body must be JSON." } },
      { status: 400, headers: corsHeaders },
    );
  }
  const parsed = proxySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Invalid request body.", details: parsed.error.flatten() } },
      { status: 400, headers: corsHeaders },
    );
  }
  const { messages, temperature, max_tokens, model } = parsed.data;

  // Total prompt size guard — catches a 30-message, 50KB-each
  // payload that individually slipped past the per-field cap.
  const totalChars = messages.reduce((n, m) => n + m.content.length, 0);
  if (totalChars > MAX_TOTAL_PROMPT_CHARS) {
    return NextResponse.json(
      { error: { message: `Total prompt too large (${totalChars} > ${MAX_TOTAL_PROMPT_CHARS} chars).` } },
      { status: 400, headers: corsHeaders },
    );
  }

  // Refuse if the OpenAI key isn't configured. Returns the same
  // shape OpenAI uses so the tool's existing error handling works.
  if (!env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: { message: "AI service not configured on this deployment." } },
      { status: 503, headers: corsHeaders },
    );
  }

  // Optional per-tool attribution: AI-tool landing pages can pass
  // `X-AI-Tool: cover-letter` so /admin/ai-ops attributes the call
  // to the right line item. Anything outside the allow-list collapses
  // to the generic "ai-tools.proxy" bucket.
  const toolHeader = req.headers.get("x-ai-tool")?.trim().toLowerCase() ?? "";
  const featureLabel = ALLOWED_TOOL_LABELS.has(toolHeader)
    ? `ai-tools.${toolHeader}`
    : "ai-tools.proxy";
  const usedModel = model ?? aiModels.parser;

  try {
    const completion = await trackAICall(
      { feature: featureLabel, model: usedModel },
      () =>
        openai.chat.completions.create({
          model: usedModel,
          messages,
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 1500,
        }),
    );
    return NextResponse.json(completion, { headers: corsHeaders });
  } catch (err) {
    logger.warn({ err, ip, feature: featureLabel }, "[ai-proxy] OpenAI call failed");
    const message = err instanceof Error ? err.message : "AI call failed.";
    return NextResponse.json(
      { error: { message } },
      { status: 502, headers: corsHeaders },
    );
  }
}

// Allow-list of tool labels we permit on the X-AI-Tool header. Keeps
// the cost dashboard's by-feature column tidy — random user-supplied
// strings can't pollute it. Add new entries here when a new AI-tool
// landing page ships.
const ALLOWED_TOOL_LABELS = new Set<string>([
  "interview-prep",
  "mock-interview",
  "interview-simulator",
  "skills-analyzer",
  "internship-navigator",
  "cover-letter",
  "career-path",
  "linkedin-optimizer",
  "cv-evaluation",
  "resume-creator",
]);
