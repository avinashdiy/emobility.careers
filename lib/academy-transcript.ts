// ============================================================================
//  careers-side: lib/academy-transcript.ts
//
//  Reference implementation of the careers-→-academy transcript fetch.
//  Drop into careers' tree under lib/. Adapt the Redis client + db
//  import to careers' conventions.
//
//  How careers uses this:
//
//    import { getAcademyTranscript } from "@/lib/academy-transcript";
//
//    // On a candidate-profile render:
//    const transcript = await getAcademyTranscript(candidate.userId);
//    // → renders the "Verified Learning" section with the
//    //    enrollments + certificates + achievements arrays.
//    // Returns null when academy has no learning data for the user
//    // (404 from academy, careers should hide the whole section).
//
//  Caching: the 60-second Redis cache here matches the Cache-Control
//  hint academy returns. We don't even need to set max-age on the
//  fetch side — the Redis wrapper is the cache; Redis just stores
//  the parsed JSON.
//
//  Auth: HMAC-SHA256 over the canonical request, same shape academy
//  verifies. The secret is ACADEMY_API_SECRET in careers' env
//  (byte-identical to academy's SYNC_WEBHOOK_SECRET — one secret,
//  two names; see PLAN-FINAL.md §"Env vars").
//
//  Why pull, not subscribe: the data we pull here (enrollments,
//  certificates, achievements) updates via the outbox push we already
//  consume in app/api/v1/sync/academy/route.ts — so careers's local
//  LearningCredential table is already authoritative for the
//  derived view. This transcript pull exists for cases where careers
//  wants the FULL shape on demand (e.g. the gamification totals,
//  which aren't pushed event-by-event but only summarised in this
//  endpoint). Most reads will be Redis cache hits.
// ============================================================================

import { createHmac } from "node:crypto";
// careers uses ioredis (see lib/redis.ts) — get/set/del all use the
// idiomatic ioredis call shapes below.
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";

// Academy base URL — localhost since both apps are on the same Hetzner
// box. Validated as required in careers' lib/env.ts (no default —
// matches the DATABASE_URL / REDIS_URL pattern for intra-cluster infra).
const ACADEMY_BASE_URL = env.ACADEMY_API_URL;

// Validated as required in careers' lib/env.ts. Same byte value as
// SYNC_WEBHOOK_SECRET (one secret, two names — see lib/env.ts comment).
const ACADEMY_API_SECRET = env.ACADEMY_API_SECRET;

const CACHE_TTL_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 4_000;

// ─── Response shape (mirrors academy's route) ───────────────────────────

export type AcademyEnrollment = {
  courseSlug: string;
  courseTitle: string;
  courseLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  courseDurationMinutes: number;
  tenantSubdomain: string;
  tenantKind: "MASTER" | "RESELLER" | "CORPORATE";
  enrolledAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  progressPct: number;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED";
  lastActivityAt: string | null;
};

export type AcademyCertificate = {
  publicCode: string;
  courseSlug: string;
  courseTitle: string;
  issuedAt: string;
  pdfUrl: string | null;
  verifyUrl: string;
};

export type AcademyAchievement = {
  id: string;
  title: string;
  description: string;
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "LEGENDARY";
  xpReward: number;
  unlockedAt: string;
};

export type AcademyTranscript = {
  userId: string;
  transcript: {
    enrollments: AcademyEnrollment[];
    certificates: AcademyCertificate[];
    gamification: {
      totalXp: number;
      level: number;
      currentStreakDays: number;
      longestStreakDays: number;
      lastActivityDate: string | null;
      achievementCount: number;
    };
    achievements: AcademyAchievement[];
  };
  generatedAt: string;
  version: number;
};

// ─── Fetcher ────────────────────────────────────────────────────────────

/**
 * Fetch the academy transcript for one user. Cached in Redis for 60s.
 * Returns null when academy has no learning data (404) or when the
 * request fails — callers should treat null as "no Verified Learning
 * section to render".
 */
export async function getAcademyTranscript(
  userId: string,
): Promise<AcademyTranscript | null> {
  if (!userId || typeof userId !== "string") return null;
  if (!ACADEMY_API_SECRET) {
    console.warn("[academy-transcript] ACADEMY_API_SECRET not configured");
    return null;
  }

  // 1. Cache check.
  const cacheKey = `academy:transcript:${userId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      // ioredis returns string; adapt if careers uses a different client.
      return JSON.parse(cached) as AcademyTranscript;
    }
  } catch (err) {
    // Cache lookup failure shouldn't kill the request — fall through to fetch.
    console.warn("[academy-transcript] cache get failed", err);
  }

  // 2. Compose the HMAC-signed request.
  const path = `/api/v1/users/${encodeURIComponent(userId)}/transcript`;
  const timestamp = Math.floor(Date.now() / 1000);
  const canonical = `GET\n${path}\n${timestamp}`;
  const signature = createHmac("sha256", ACADEMY_API_SECRET)
    .update(canonical)
    .digest("hex");

  // 3. Fetch with a tight timeout — academy is on the same Hetzner box
  //    over localhost, so anything >1s is anomalous. 4s leaves room
  //    for a cold prisma client.
  let res: Response;
  try {
    res = await fetch(`${ACADEMY_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        "X-Signature": signature,
        "X-Timestamp": String(timestamp),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Next-side cache: don't (we cache in Redis ourselves).
      cache: "no-store",
    });
  } catch (err) {
    console.warn("[academy-transcript] fetch failed", userId, err);
    return null;
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    console.warn(
      "[academy-transcript] non-2xx",
      userId,
      res.status,
      await res.text().catch(() => ""),
    );
    return null;
  }

  const data = (await res.json()) as AcademyTranscript;

  // 4. Cache the parsed JSON in Redis. 60s matches academy's
  //    Cache-Control hint — beyond that we'd be serving stale
  //    achievement-counts on profile renders.
  try {
    // ioredis: SET key val EX seconds
    await redis.set(cacheKey, JSON.stringify(data), "EX", CACHE_TTL_SECONDS);
  } catch (err) {
    console.warn("[academy-transcript] cache set failed", err);
  }

  return data;
}

/**
 * Invalidate the cached transcript for a user. Call this when a known
 * domain change on careers side (a new LearningCredential row from
 * the outbox webhook) should immediately reflect in a profile render
 * — without waiting up to 60s for the cache to expire.
 */
export async function invalidateAcademyTranscript(userId: string): Promise<void> {
  try {
    await redis.del(`academy:transcript:${userId}`);
  } catch {
    // Best-effort. Worst case: the stale entry expires within 60s.
  }
}
