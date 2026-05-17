import crypto from "crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Feature flag resolver. Distinct from `lib/site-settings.ts` —
 * settings handle binary kill switches that pre-date the FeatureFlag
 * model. New flags should live here.
 *
 * Three flag types:
 *   • BOOLEAN — on/off for everyone (modulo the master `enabled`).
 *   • PERCENTAGE — hash(key, userId) % 100 < rolloutPercent. Sticky:
 *     the same user always gets the same answer at the same percent.
 *     Anonymous calls return `defaultForAnonymous`.
 *   • TARGETED — only members of `FeatureFlagTarget` get the flag's
 *     value (almost always true). Anonymous returns false.
 *
 * Resolution short-circuits:
 *   1. enabled === false → false (full kill).
 *   2. Targeted membership → that row's `enabled` value (allows
 *      explicit exclude-from-percent too).
 *   3. type === BOOLEAN → enabled.
 *   4. type === PERCENTAGE → rolloutPercent check.
 *   5. type === TARGETED → false (not in target set).
 *
 * In-process cache (60s TTL) for the flag rows + per-flag target
 * sets. Cost is one DB query per flag per 60s per process; for hot
 * paths the cache is essentially free.
 */

const CACHE_TTL_MS = 60_000;

type CachedFlag = {
  enabled: boolean;
  type: "BOOLEAN" | "PERCENTAGE" | "TARGETED";
  rolloutPercent: number;
  defaultForAnonymous: boolean;
  targets: Map<string, boolean>; // userId → enabled
};

const cache = new Map<string, { value: CachedFlag | null; expiresAt: number }>();

async function loadFlag(key: string): Promise<CachedFlag | null> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value: CachedFlag | null = null;
  try {
    const row = await db.featureFlag.findUnique({
      where: { key },
      include: { targets: { select: { userId: true, enabled: true } } },
    });
    if (row) {
      value = {
        enabled: row.enabled,
        type: row.type,
        rolloutPercent: row.rolloutPercent,
        defaultForAnonymous: row.defaultForAnonymous,
        targets: new Map(row.targets.map((t) => [t.userId, t.enabled])),
      };
    }
  } catch (err) {
    logger.warn({ err, key }, "[feature-flags] load failed");
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Deterministic 0–99 bucket per (key, userId) — so the same user
 * always lands on the same side of a 25% rollout, until the percent
 * changes. SHA-256 mod 100 is overkill cryptographically but cheap
 * (~µs per call) and avoids the FNV / DJB hash collision concerns.
 */
function bucket(key: string, userId: string): number {
  const hash = crypto.createHash("sha256").update(`${key}:${userId}`).digest();
  // 4 bytes → uint32 → mod 100. Slight modulo bias (2^32 % 100 = 96)
  // is invisible at this scale; for ~100k users in either bucket
  // the imbalance is well under 0.001%.
  const n = hash.readUInt32BE(0);
  return n % 100;
}

/**
 * Resolve a flag for the given context. The standard entry point —
 * pass `userId` when you have it, undefined for anonymous calls.
 *
 *   if (await isFeatureEnabled("new_search_ui", session?.user?.id)) {
 *     // render the new UI
 *   }
 */
export async function isFeatureEnabled(
  key: string,
  userId: string | null | undefined,
): Promise<boolean> {
  const flag = await loadFlag(key);
  if (!flag) return false;            // Unknown key → off (safe default).
  if (!flag.enabled) return false;    // Master kill.

  // Targeted membership wins regardless of type — lets admin
  // explicitly include OR exclude specific users on top of a
  // percentage rollout.
  if (userId && flag.targets.has(userId)) {
    return flag.targets.get(userId)!;
  }

  switch (flag.type) {
    case "BOOLEAN":
      return true;
    case "PERCENTAGE":
      if (!userId) return flag.defaultForAnonymous;
      return bucket(key, userId) < flag.rolloutPercent;
    case "TARGETED":
      // No userId match above → not targeted.
      return false;
  }
}

/**
 * Invalidate the in-process cache for a key. Called by the admin
 * UI's mutation server actions so admin edits take effect on the
 * next page load (rather than waiting up to 60s for the cache to
 * expire). Process-level — other Node processes still wait for
 * their own cache TTL.
 */
export function invalidateFlagCache(key: string): void {
  cache.delete(key);
}

/** Wipe the entire cache — useful after bulk edits. */
export function invalidateAllFlagCache(): void {
  cache.clear();
}
