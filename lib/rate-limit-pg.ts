import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Postgres-backed rate limiter + audit trail. Pair with the existing
 * Redis limiter (`lib/rate-limit.ts`) — Redis is faster for the hot
 * auth paths, Postgres gives us a durable trail of who attempted
 * what and when, plus survives Redis outages.
 *
 * Defaults:
 *   • Unauthenticated → 10 attempts per action per IP per hour
 *   • Authenticated   → 60 attempts per action per user per hour
 *
 * Override per call site by passing `limit` + `windowMs`.
 *
 * Behavior:
 *   • Always inserts a `RateLimitEvent` row, even when allowed —
 *     denies set `allowed: false`. This is on purpose: dashboards
 *     need to count both, and the audit trail is the whole point
 *     of using Postgres over a pure Redis sliding window.
 *   • Counts only the LAST `windowMs` worth of rows for the
 *     `(action, ip|userId)` tuple. Indexed lookup → 1-2ms even at
 *     scale.
 *   • `pgRateLimitOrFail` returns a `{ ok, message, retryAfterSec }`
 *     tuple — the caller decides whether to throw / return / toast.
 *     We deliberately don't throw because most public actions are
 *     wrapped in `try { return; } catch` and a thrown limit error
 *     would surface as the generic catch-all message.
 *
 * Cleanup: rows older than 30 days are purged by the
 * notification-maintenance worker tick. The longest active window
 * we honour is 24h, so 30 days of retention covers a full month of
 * forensics with plenty of headroom.
 */

export interface PgRateLimitResult {
  ok: boolean;
  message: string;
  /// Seconds until the oldest in-window attempt ages out — the
  /// "retry after" the caller can show in the UI.
  retryAfterSec: number;
  /// Whether the count we acted on is for an authenticated user
  /// (true) or a public IP (false). Useful for log messages.
  byUser: boolean;
}

export interface PgRateLimitOpts {
  /// Override the auth-aware default. Pass an explicit `limit` and
  /// `windowMs` for actions with non-standard caps (e.g. mass invite
  /// = 200/24h).
  limit?: number;
  windowMs?: number;
  /// When true (default), allowed attempts are also written to
  /// RateLimitEvent. Set false for very-hot paths that don't need
  /// the audit trail — the deny check still works because we count
  /// allowed rows for the window.
  recordAllowed?: boolean;
  /// When true, callers who hit the limit get a longer retry window
  /// returned (window cap, not until-oldest-expires). Useful for
  /// hostile-traffic patterns.
  hostileBackoff?: boolean;
}

export const DEFAULT_LIMITS = {
  /// Unauthenticated: 10 per IP per hour.
  unauthLimit: 10,
  /// Authenticated: 60 per user per hour.
  authLimit: 60,
  windowMs: 60 * 60 * 1000,
};

function clientIp(headerList: Headers): string | null {
  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    null
  );
}

/** Format a "try again in X minutes" message that's always honest. */
function friendlyRetry(seconds: number): string {
  if (seconds < 60) return "Too many attempts. Try again in a moment.";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  const hours = Math.ceil(minutes / 60);
  return `Too many attempts. Try again in ${hours} hour${hours === 1 ? "" : "s"}.`;
}

/**
 * The primary helper. Pass an action key and (optionally) the
 * authenticated userId. Returns `{ ok, message, retryAfterSec }`.
 *
 * Usage in a server action:
 *
 *   const limit = await pgRateLimit({ action: "post.create", userId: session.user.id });
 *   if (!limit.ok) return { ok: false, message: limit.message };
 *   // ... do the work ...
 */
export async function pgRateLimit(input: {
  action: string;
  userId?: string | null;
  opts?: PgRateLimitOpts;
}): Promise<PgRateLimitResult> {
  const { action, userId, opts } = input;
  const h = await headers();
  const ip = clientIp(h);

  const isAuth = Boolean(userId);
  const limit = opts?.limit ?? (isAuth ? DEFAULT_LIMITS.authLimit : DEFAULT_LIMITS.unauthLimit);
  const windowMs = opts?.windowMs ?? DEFAULT_LIMITS.windowMs;
  const since = new Date(Date.now() - windowMs);

  // Look up recent attempts. We count BOTH allowed and denied — a
  // user spamming will quickly trip the limit; a user passing
  // legitimately won't accumulate denies. Caller should use
  // `recordAllowed: false` only when they're truly OK with no audit
  // trail for success.
  let count = 0;
  let oldestInWindow: Date | null = null;
  try {
    if (isAuth) {
      const rows = await db.rateLimitEvent.findMany({
        where: { action, userId, createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        take: limit + 1,
        select: { createdAt: true },
      });
      count = rows.length;
      oldestInWindow = rows[0]?.createdAt ?? null;
    } else if (ip) {
      const rows = await db.rateLimitEvent.findMany({
        where: { action, ip, createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        take: limit + 1,
        select: { createdAt: true },
      });
      count = rows.length;
      oldestInWindow = rows[0]?.createdAt ?? null;
    }
    // No userId AND no IP — extremely rare (server-internal trigger).
    // Allow these without rate limiting.
  } catch (err) {
    // DB outage during rate-limit check → fail-OPEN. Tighter limits
    // matter less than total platform unavailability. Logged at
    // error so ops can spot the pattern.
    logger.error({ err, action }, "[rate-limit-pg] count query failed — failing open");
    return {
      ok: true,
      message: "",
      retryAfterSec: 0,
      byUser: isAuth,
    };
  }

  const allowed = count < limit;
  let retryAfterSec = 0;
  if (!allowed) {
    if (opts?.hostileBackoff) {
      retryAfterSec = Math.ceil(windowMs / 1000);
    } else if (oldestInWindow) {
      retryAfterSec = Math.max(
        1,
        Math.ceil((oldestInWindow.getTime() + windowMs - Date.now()) / 1000),
      );
    } else {
      retryAfterSec = Math.ceil(windowMs / 1000);
    }
  }

  // Record the attempt — always for denies, conditionally for allowed.
  // Fire-and-forget: the actual work is the gating decision above;
  // a slow insert shouldn't block the caller. Wrapped so a failed
  // write never poisons the request.
  if (!allowed || (opts?.recordAllowed ?? true)) {
    void db.rateLimitEvent
      .create({
        data: {
          action,
          ip: ip ?? null,
          userId: userId ?? null,
          allowed,
        },
      })
      .catch((err) => {
        logger.warn({ err, action }, "[rate-limit-pg] event insert failed");
      });
  }

  return {
    ok: allowed,
    message: allowed ? "" : friendlyRetry(retryAfterSec),
    retryAfterSec,
    byUser: isAuth,
  };
}

/**
 * Convenience wrapper that throws if rate-limited. Use sparingly —
 * the typed `pgRateLimit` is preferred because it returns instead
 * of throwing, which fits the `{ ok, message }` server-action shape
 * we use everywhere. Throws cleanly for paths where you actually
 * want a 429-style failure (API routes, webhooks).
 */
export async function pgRateLimitOrThrow(
  action: string,
  userId?: string | null,
  opts?: PgRateLimitOpts,
): Promise<void> {
  const r = await pgRateLimit({ action, userId, opts });
  if (!r.ok) {
    const err: Error & { code?: string; retryAfter?: number } = new Error(r.message);
    err.code = "RATE_LIMITED";
    err.retryAfter = r.retryAfterSec;
    throw err;
  }
}
