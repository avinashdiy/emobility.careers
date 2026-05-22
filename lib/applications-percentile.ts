import "server-only";

import { db } from "@/lib/db";

// Re-export the pure UI helper from the client-safe split file so
// existing server callers that destructured both helpers in one
// `import { getApplicationPercentiles, percentileBadge } …` keep
// working without an import-path sweep. The badge helper itself
// lives in `lib/applications-percentile-constants.ts` — client
// components MUST import it from there (this file's `import
// "server-only"` marker above will error at build time if a client
// component imports from HERE instead).
export { percentileBadge } from "@/lib/applications-percentile-constants";

/**
 * #3 Wave A — Top Applicant percentile compute.
 *
 * Given a set of (applicationId, jobId, matchScore) tuples — usually
 * the candidate's own applications — return a Map of applicationId →
 * percentile rank (0..1, higher = more competitive).
 *
 * Pure SQL via $queryRaw — Prisma doesn't expose window functions
 * natively, and per-application count() round-trips would be N+1.
 * One query handles every input in a single round-trip regardless
 * of how many applications the candidate has.
 *
 * Behaviour:
 *   - Applications without a matchScore get `null` (returned, not
 *     mapped) so the caller can render a neutral "Unscored yet" pill.
 *   - Applications on jobs with < MIN_PEERS competitors are also
 *     returned `null` — a "top 10%" badge on a job with 4 applicants
 *     is meaningless. Caller can suppress the badge in those cases.
 */
const MIN_PEERS = 5;

export interface PercentileInput {
  applicationId: string;
  jobId: string;
}

export async function getApplicationPercentiles(
  inputs: PercentileInput[],
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  if (inputs.length === 0) return result;

  const applicationIds = inputs.map((i) => i.applicationId);

  // Window-function ranking. PERCENT_RANK gives 0..1 with 1 being the
  // best score in the partition. We flip it to "this is the top X% of
  // applicants" by computing 1 - rank as a competitiveness proxy, but
  // the convention we display is "top N%" — meaning N is the
  // percentage of applicants with a HIGHER score. So we compute
  // `(higher / total) * 100` directly per row.
  const rows = await db.$queryRaw<
    { id: string; jobId: string; higher: bigint; total: bigint; score: number | null }[]
  >`
    WITH peer_counts AS (
      SELECT
        a.id,
        a."jobId",
        a."matchScore",
        COUNT(*) FILTER (WHERE peer."matchScore" > a."matchScore") AS higher,
        COUNT(*) AS total
      FROM "Application" a
      JOIN "Application" peer ON peer."jobId" = a."jobId"
      WHERE a.id = ANY(${applicationIds})
      GROUP BY a.id, a."jobId", a."matchScore"
    )
    SELECT id, "jobId", higher, total, "matchScore" AS score FROM peer_counts
  `;

  for (const row of rows) {
    const total = Number(row.total);
    const higher = Number(row.higher);
    if (row.score === null || total < MIN_PEERS) {
      result.set(row.id, null);
      continue;
    }
    // `higher / total` = the percentile rank (closer to 0 = better).
    // We round up so a candidate who's strictly better than 90% of
    // peers shows as "top 10%", not "top 5%". The +1 in the denominator
    // bias removes the edge case where the candidate is exactly tied
    // with everyone above them — without it, a 5-applicant job with
    // all tied scores would show "top 0%".
    const rank = higher / Math.max(1, total - 1);
    result.set(row.id, rank);
  }

  // Backfill nulls for any inputs that didn't appear in the rows
  // (deleted application, etc.).
  for (const i of inputs) {
    if (!result.has(i.applicationId)) result.set(i.applicationId, null);
  }
  return result;
}

// `percentileBadge` used to live here, but it's been moved to
// `lib/applications-percentile-constants.ts` so the `JobTrackerBoard`
// client component can import it without pulling Prisma into the
// browser bundle. It's re-exported from this file (see top) so
// server callers don't need to change their import paths.
