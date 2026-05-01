import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

/**
 * Sticky-by-user experiment allocator. Call `allocate(experimentKey, userId)`
 * (or pass `null` for anonymous + cookie-based stickiness) and you get back
 * a variant key that's stable for the life of the user's allocation row.
 *
 * The first call inserts an Allocation; subsequent calls read it. We don't
 * cache in-process — the DB roundtrip is one indexed lookup and stickiness
 * is the entire point.
 *
 * Conversion logging: call `logExposure(experimentKey, variantKey, userId)`
 * on render, `logConversion(experimentKey, goal, userId)` when the metric
 * fires. The /admin/experiments/[id] page sums these for lift.
 */

const ANON_COOKIE = "emce_anon";
const COOKIE_TTL_S = 60 * 60 * 24 * 365; // 1 year

interface VariantSpec {
  key: string;
  weight: number; // 0-100; sums across variants must equal 100
}

async function getOrSetAnonId(): Promise<string> {
  const c = await cookies();
  const existing = c.get(ANON_COOKIE)?.value;
  if (existing) return existing;
  const anonId = randomUUID();
  c.set(ANON_COOKIE, anonId, {
    path: "/",
    maxAge: COOKIE_TTL_S,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return anonId;
}

/** Pick a variant by weight from a uniform-random hash of the user id —
    deterministic re-allocation across processes without storing state. */
function pickByWeight(userOrAnonId: string, variants: VariantSpec[]): string {
  const total = variants.reduce((s, v) => s + (v.weight || 0), 0);
  if (total <= 0) return variants[0]?.key ?? "control";
  // Cheap deterministic hash → 0..99
  let hash = 0;
  for (let i = 0; i < userOrAnonId.length; i++) {
    hash = (hash * 31 + userOrAnonId.charCodeAt(i)) | 0;
  }
  const bucket = ((hash % total) + total) % total;
  let cum = 0;
  for (const v of variants) {
    cum += v.weight || 0;
    if (bucket < cum) return v.key;
  }
  return variants[variants.length - 1]?.key ?? "control";
}

export async function allocate(
  experimentKey: string,
  userId?: string | null,
): Promise<string> {
  try {
    const exp = await db.experiment.findUnique({
      where: { key: experimentKey },
      select: { id: true, status: true, variants: true, winnerKey: true },
    });
    if (!exp) return "control";
    // After a winner is declared and status COMPLETED, every caller
    // gets the winner — so we can ship the winning copy without a
    // code change while the experiment is archived.
    if (exp.status === "COMPLETED" && exp.winnerKey) return exp.winnerKey;
    if (exp.status !== "RUNNING") return "control";

    const variants = (exp.variants as unknown) as VariantSpec[];
    if (!Array.isArray(variants) || variants.length === 0) return "control";

    const stickinessKey = userId ?? (await getOrSetAnonId());
    const where = userId
      ? { experimentId_userId: { experimentId: exp.id, userId } }
      : { experimentId_anonymousId: { experimentId: exp.id, anonymousId: stickinessKey } };
    const existing = await db.experimentAllocation.findUnique({ where });
    if (existing) return existing.variantKey;

    const variantKey = pickByWeight(stickinessKey, variants);
    await db.experimentAllocation
      .create({
        data: {
          experimentId: exp.id,
          userId: userId ?? null,
          anonymousId: userId ? null : stickinessKey,
          variantKey,
        },
      })
      .catch(() => undefined); // race-tolerant: another concurrent insert wins, we just re-pick by hash on next call
    return variantKey;
  } catch (err) {
    logger.warn({ err, experimentKey }, "[experiments] allocate failed");
    return "control";
  }
}

export async function logExposure(
  experimentKey: string,
  variantKey: string,
  userId?: string | null,
): Promise<void> {
  await logEvent(experimentKey, variantKey, "exposed", userId);
}

export async function logConversion(
  experimentKey: string,
  goal: string,
  userId?: string | null,
  value?: number,
): Promise<void> {
  await logEvent(experimentKey, "", `converted:${goal}`, userId, value);
}

async function logEvent(
  experimentKey: string,
  variantKey: string,
  kind: string,
  userId?: string | null,
  value?: number,
): Promise<void> {
  try {
    const exp = await db.experiment.findUnique({
      where: { key: experimentKey },
      select: { id: true },
    });
    if (!exp) return;
    // For conversion events we look up the user's allocation so the
    // funnel attribution is accurate even if the caller doesn't pass
    // variantKey.
    let resolvedVariant = variantKey;
    if (!resolvedVariant && userId) {
      const alloc = await db.experimentAllocation.findUnique({
        where: { experimentId_userId: { experimentId: exp.id, userId } },
        select: { variantKey: true },
      });
      resolvedVariant = alloc?.variantKey ?? "unknown";
    }
    await db.experimentEvent.create({
      data: {
        experimentId: exp.id,
        variantKey: resolvedVariant || "unknown",
        kind,
        userId: userId ?? null,
        value: value ?? null,
      },
    });
  } catch (err) {
    logger.warn({ err, experimentKey, kind }, "[experiments] event log failed");
  }
}
