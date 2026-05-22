import "server-only";

import { redis } from "@/lib/redis";

/**
 * Redis-backed sliding-window rate limiter.
 * Returns { ok, remaining, resetMs } and throws on Redis failure (callers
 * should treat unavailability as fail-open for non-critical endpoints).
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetMs: number;
}

export async function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - opts.windowMs;
  const redisKey = `ratelimit:${key}`;

  // Sliding window via sorted set
  await redis.zremrangebyscore(redisKey, 0, windowStart);
  const count = await redis.zcard(redisKey);
  if (count >= opts.limit) {
    const oldest = await redis.zrange(redisKey, 0, 0, "WITHSCORES");
    const oldestScore = oldest[1] ? parseInt(oldest[1]) : now;
    return {
      ok: false,
      remaining: 0,
      resetMs: oldestScore + opts.windowMs - now,
    };
  }
  await redis.zadd(redisKey, now, `${now}-${Math.random()}`);
  await redis.pexpire(redisKey, opts.windowMs);
  return {
    ok: true,
    remaining: opts.limit - count - 1,
    resetMs: opts.windowMs,
  };
}

/** Helpers for common limits. */
export const limits = {
  signin: { limit: 10, windowMs: 60_000 },        // 10/min per email
  signinIp: { limit: 30, windowMs: 15 * 60_000 }, // 30/15min per IP — credential-stuffing brake
  signup: { limit: 5, windowMs: 60 * 60_000 },    // 5/hour per email
  signupIp: { limit: 5, windowMs: 60 * 60_000 },  // 5/hour per IP — caps account creation regardless of email rotation
  magicLinkIp: { limit: 8, windowMs: 60 * 60_000 }, // 8/hour per IP — caps SES burn-through
  apply: { limit: 30, windowMs: 60 * 60_000 },    // 30 applications/hour per user
  message: { limit: 60, windowMs: 60_000 },       // 60 messages/min per user
  resumeUpload: { limit: 5, windowMs: 60_000 },   // 5 uploads/min per user
  ai: { limit: 30, windowMs: 60_000 },            // 30 AI calls/min per user
  ats: { limit: 120, windowMs: 60_000 },          // 120 ATS mutations/min per user
  invite: { limit: 20, windowMs: 60 * 60_000 },   // 20 invites/hour per user
  saveItem: { limit: 60, windowMs: 60_000 },      // saved jobs / candidates
  bulkInMail: { limit: 200, windowMs: 24 * 60 * 60_000 }, // 200 cold-outreach messages / 24h per recruiter — caps abuse
} as const;

export async function rateLimitOrThrow(key: string, preset: keyof typeof limits) {
  const r = await rateLimit(key, limits[preset]).catch(() => ({ ok: true, remaining: -1, resetMs: 0 } as RateLimitResult));
  if (!r.ok) {
    const seconds = Math.ceil(r.resetMs / 1000);
    const err: Error & { code?: string; retryAfter?: number } = new Error(`Rate limited. Try again in ${seconds}s.`);
    err.code = "RATE_LIMITED";
    err.retryAfter = seconds;
    throw err;
  }
  return r;
}
