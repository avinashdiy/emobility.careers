import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * OpenAI cost tracking. Wrap a chat-completion or embedding call with
 * `trackAICall()` and the wrapper records token counts + estimated
 * USD cost into the `AICostLog` table. The /admin/ai-ops dashboard
 * sums these for daily spend, per-feature attribution, and model
 * cost comparison.
 *
 * Pricing is hand-maintained below — OpenAI doesn't expose a pricing
 * endpoint, so we copy from their pricing page and bump when models
 * are upgraded. Numbers are USD per 1M tokens (input / output split
 * for chat models, single number for embeddings).
 *
 * If the wrapper itself fails (DB outage, calculation error) we
 * never re-throw into the caller — bookkeeping must not block the
 * actual AI call.
 */

type ChatPrice = { in: number; out: number };
type EmbedPrice = { single: number };
type Price = ChatPrice | EmbedPrice;

// USD per 1,000,000 tokens. Last verified 2026-04. Update when
// OpenAI publishes new prices.
const PRICING: Record<string, Price> = {
  // Chat models (input/output per 1M)
  "gpt-4o": { in: 2.5, out: 10.0 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4-turbo": { in: 10.0, out: 30.0 },
  "gpt-4": { in: 30.0, out: 60.0 },
  "gpt-3.5-turbo": { in: 0.5, out: 1.5 },
  // Embedding models (per 1M)
  "text-embedding-3-large": { single: 0.13 },
  "text-embedding-3-small": { single: 0.02 },
  "text-embedding-ada-002": { single: 0.1 },
};

function isChatPrice(p: Price): p is ChatPrice {
  return (p as ChatPrice).in !== undefined;
}

/**
 * Compute estimated cost in USD micros (10^-6). Defaults to zero for
 * unknown models so a typo doesn't create misleading entries — the
 * row is still recorded with token counts so we'd notice in the
 * dashboard's "unknown model" column.
 */
function calcCostMicros(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = PRICING[model];
  if (!price) return 0;
  if (isChatPrice(price)) {
    // (tokens / 1e6) × $/1M × 1e6 micros = tokens × $/1M
    return Math.round(promptTokens * price.in + completionTokens * price.out);
  }
  // Embeddings — input only, output is a no-op.
  return Math.round(promptTokens * price.single);
}

export interface TrackCallOpts {
  feature: string;
  model: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Wrap an OpenAI call so the wrapper records the call once it
 * resolves. The callback returns the OpenAI response which must
 * have a `usage` field (chat completions + embeddings both do).
 *
 * Usage:
 *   const completion = await trackAICall(
 *     { feature: "resume-parse", model: "gpt-4o-mini", entityType: "Candidate", entityId: profileId },
 *     () => openai.chat.completions.create({ ... }),
 *   );
 */
export async function trackAICall<
  T extends { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null },
>(opts: TrackCallOpts, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  let success = true;
  let errorMessage: string | null = null;
  let result: T | null = null;
  try {
    result = await fn();
    return result;
  } catch (err) {
    success = false;
    errorMessage = err instanceof Error ? err.message.slice(0, 1000) : String(err);
    throw err;
  } finally {
    // The whole logging block is fire-and-forget — never let bookkeeping
    // errors propagate. We don't await this because the caller already
    // has its return value (or its rethrown error) by now and shouldn't
    // wait an extra DB round-trip for billing telemetry.
    void (async () => {
      try {
        const u = result?.usage ?? null;
        const promptTokens = u?.prompt_tokens ?? 0;
        const completionTokens = u?.completion_tokens ?? 0;
        const totalTokens = u?.total_tokens ?? promptTokens + completionTokens;
        const costUsdMicros = success ? calcCostMicros(opts.model, promptTokens, completionTokens) : 0;
        await db.aICostLog.create({
          data: {
            feature: opts.feature,
            model: opts.model,
            promptTokens,
            completionTokens,
            totalTokens,
            costUsdMicros,
            entityType: opts.entityType ?? null,
            entityId: opts.entityId ?? null,
            durationMs: Date.now() - startedAt,
            success,
            errorMessage,
          },
        });
      } catch (logErr) {
        logger.warn({ err: logErr, opts }, "[ai-cost] log write failed");
      }
    })();
  }
}

/** Convert micro-USD back to a $-formatted string for display. */
export function formatUsdMicros(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  if (dollars < 1) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}
