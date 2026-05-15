import { openai, aiModels } from "@/lib/ai/openai";
import { trackAICall, type TrackCallOpts } from "@/lib/ai/track-cost";
import { logger } from "@/lib/logger";

/**
 * Structured JSON helper. The Wave C features (Career Explorer, Hiring
 * Assistant, Calling Agent scoring) all need OpenAI to return data in
 * a fixed shape we can immediately consume — not free-form prose we
 * then have to re-parse.
 *
 * This wraps `chat.completions.create({ response_format: { type:
 * "json_object" } })` with two things you'd otherwise duplicate
 * everywhere:
 *
 *   1. Cost tracking via `trackAICall` so the call shows up in the
 *      /admin/ai-ops dashboard with feature attribution.
 *   2. A safe JSON.parse pass — if the model returns malformed JSON
 *      (rare with `response_format: "json_object"`, but possible on a
 *      truncated response) we throw a typed error the caller can
 *      handle without bringing down the action.
 *
 * The function is generic over the expected shape `T` but does NOT
 * validate the shape itself — callers should pipe the result through
 * a Zod schema if shape correctness matters. The generic is just a
 * convenience for the call site's typing.
 */
export interface StructuredCallOpts {
  /**
   * Feature attribution string for the cost log. Use kebab-case +
   * include the wave: `wavec.career-explorer.suggest`,
   * `wavec.hiring-assistant.draft-outreach`. Drives the
   * /admin/ai-ops breakdown.
   */
  feature: string;
  /**
   * Model override. Defaults to the rerank-model env (typically
   * gpt-4o) since most Wave C calls want reasoning quality. Use
   * `aiModels.parser` (gpt-4o-mini) when the call is mostly templated
   * and cost matters more than nuance.
   */
  model?: string;
  /** System prompt — establishes the agent's role + output contract. */
  system: string;
  /** User prompt — the task input. */
  user: string;
  /**
   * Optional Zod-validated entity attribution for the cost-log row.
   * Lets /admin/ai-ops slice spend by job / candidate / company /
   * career-explorer-run.
   */
  entityType?: string;
  entityId?: string;
  /**
   * Hard cap on output tokens. Default 1500 — plenty for the
   * structured payloads we ask for, and small enough that a runaway
   * model can't burn through tokens silently.
   */
  maxOutputTokens?: number;
  /**
   * Temperature. Default 0.3 — low enough that structured outputs are
   * reproducible across retries, high enough that the model picks
   * different candidate phrasings on each outreach draft.
   */
  temperature?: number;
}

export class StructuredAIError extends Error {
  constructor(
    message: string,
    public cause: "PARSE_FAILED" | "EMPTY_RESPONSE" | "API_ERROR",
    public raw?: string,
  ) {
    super(message);
    this.name = "StructuredAIError";
  }
}

/**
 * Run a structured-JSON chat completion and return the parsed object.
 * Throws `StructuredAIError` on parse failure or empty content.
 * Throws the raw OpenAI error on API failure (caller decides whether
 * to retry / fall back).
 */
export async function structuredJsonCall<T = unknown>(
  opts: StructuredCallOpts,
): Promise<{ data: T; tokens: number }> {
  const model = opts.model ?? aiModels.rerank ?? "gpt-4o";
  const completion = await trackAICall(
    {
      feature: opts.feature,
      model,
      entityType: opts.entityType,
      entityId: opts.entityId,
    } as TrackCallOpts,
    () =>
      openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: { type: "json_object" },
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxOutputTokens ?? 1500,
      }),
  );
  const raw = completion.choices[0]?.message?.content ?? "";
  if (!raw) {
    throw new StructuredAIError("OpenAI returned empty content.", "EMPTY_RESPONSE");
  }
  let data: T;
  try {
    data = JSON.parse(raw) as T;
  } catch (err) {
    logger.warn(
      { err, feature: opts.feature, rawPreview: raw.slice(0, 200) },
      "[structured] JSON parse failed",
    );
    throw new StructuredAIError("Could not parse model JSON.", "PARSE_FAILED", raw);
  }
  return { data, tokens: completion.usage?.total_tokens ?? 0 };
}
