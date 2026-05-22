import "server-only";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * #10 Wave A — Profile Performance tracking.
 *
 * Two pieces:
 *
 *   1. `recordSearchAppearances(candidateIds, recruiterUserId)` —
 *      fire-and-forget upsert that increments the (candidate × recruiter
 *      × week) counter on `ProfileSearchAppearance`. Called from
 *      `/employer/candidates` after the candidate-search query
 *      resolves; the recruiter sees nothing, but the candidate's
 *      "you appeared in X searches" stat updates on their next /me
 *      visit.
 *
 *   2. `getProfilePerformanceStats(candidateId)` — reads the last
 *      4 weeks of appearances for the dashboard card. Returns
 *      this-week / last-week + trend, distinct recruiters this week,
 *      and a tiny histogram for the sparkline.
 *
 * Per-recruiter capping is enforced by the upsert + a 50-per-week
 * ceiling so one obsessive recruiter scrolling the same search 40 times
 * doesn't inflate the count beyond the meaningful signal.
 */

const MAX_PER_RECRUITER_PER_WEEK = 50;

/** Round a Date down to the most recent Monday UTC. Weekly buckets
 *  are stable across timezone boundaries. */
function mondayUtc(d: Date): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = out.getUTCDay(); // 0=Sun, 1=Mon, …
  const offset = (dow + 6) % 7; // 0 for Mon, 1 for Tue, …, 6 for Sun
  out.setUTCDate(out.getUTCDate() - offset);
  return out;
}

export async function recordSearchAppearances(
  candidateIds: string[],
  recruiterUserId: string | null,
): Promise<void> {
  if (candidateIds.length === 0) return;
  const weekStart = mondayUtc(new Date());

  // Best-effort fire-and-forget: a tracker failure must NEVER block
  // the recruiter's actual search. We swallow + log so /employer/
  // candidates keeps rendering even if the tracker DB is having a
  // bad day.
  try {
    // One transaction per chunk to keep the transaction small. Prisma
    // upsert is the right primitive — `unique` on (candidateId,
    // recruiterUserId, weekStart) guarantees no duplicate rows.
    await db.$transaction(
      candidateIds.map((candidateId) =>
        db.profileSearchAppearance.upsert({
          where: {
            candidateId_recruiterUserId_weekStart: {
              candidateId,
              recruiterUserId: recruiterUserId ?? "",
              weekStart,
            },
          },
          create: {
            candidateId,
            recruiterUserId,
            weekStart,
            count: 1,
          },
          // On hit, increment up to the per-week ceiling. Postgres
          // can't express LEAST(count+1, N) in Prisma's update args
          // directly without raw SQL, but Prisma's increment is
          // unbounded — we apply the cap on read instead (see
          // `getProfilePerformanceStats` below) so the count column
          // stays simple.
          update: { count: { increment: 1 } },
        }),
      ),
    );
  } catch (err) {
    logger.warn(
      { err, candidateCount: candidateIds.length, recruiterUserId },
      "[profile-performance] recordSearchAppearances failed (non-fatal)",
    );
  }
}

export interface ProfilePerformanceStats {
  thisWeekImpressions: number;
  lastWeekImpressions: number;
  /// % delta — `null` when last-week has zero so we can render "new!"
  /// instead of "+Infinity%".
  weekOverWeekPct: number | null;
  /// Distinct recruiters who looked at the candidate this week.
  distinctRecruitersThisWeek: number;
  /// 4-week histogram for the sparkline. Index 0 = oldest week,
  /// index 3 = this week.
  weeklyHistogram: number[];
}

export async function getProfilePerformanceStats(
  candidateId: string,
): Promise<ProfilePerformanceStats> {
  const now = new Date();
  const thisWeek = mondayUtc(now);
  const cutoff = new Date(thisWeek);
  cutoff.setUTCDate(cutoff.getUTCDate() - 21); // last 4 weeks

  const rows = await db.profileSearchAppearance.findMany({
    where: { candidateId, weekStart: { gte: cutoff } },
    select: { recruiterUserId: true, weekStart: true, count: true },
  });

  // Pre-fill the 4-week histogram so a quiet week still renders 0.
  const histogram = [0, 0, 0, 0];
  const weekKey = (d: Date) =>
    Math.floor((thisWeek.getTime() - d.getTime()) / (7 * 24 * 60 * 60 * 1000));

  let thisWeekImpressions = 0;
  let lastWeekImpressions = 0;
  const distinctRecruiterIds = new Set<string>();

  for (const r of rows) {
    const cappedCount = Math.min(MAX_PER_RECRUITER_PER_WEEK, r.count);
    const idx = 3 - weekKey(r.weekStart);
    if (idx >= 0 && idx < 4) histogram[idx] += cappedCount;
    if (r.weekStart.getTime() === thisWeek.getTime()) {
      thisWeekImpressions += cappedCount;
      if (r.recruiterUserId) distinctRecruiterIds.add(r.recruiterUserId);
    }
    const lastWeekStart = new Date(thisWeek);
    lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
    if (r.weekStart.getTime() === lastWeekStart.getTime()) {
      lastWeekImpressions += cappedCount;
    }
  }

  const weekOverWeekPct =
    lastWeekImpressions === 0
      ? null
      : Math.round(((thisWeekImpressions - lastWeekImpressions) / lastWeekImpressions) * 100);

  return {
    thisWeekImpressions,
    lastWeekImpressions,
    weekOverWeekPct,
    distinctRecruitersThisWeek: distinctRecruiterIds.size,
    weeklyHistogram: histogram,
  };
}
