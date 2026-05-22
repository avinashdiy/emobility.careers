/**
 * Pure UI helpers for the Top-Applicant percentile feature.
 *
 * Split out from `lib/applications-percentile.ts` for the same
 * reason as `lib/profile-visibility-constants.ts`: the sibling file
 * pulls `@/lib/db` (Prisma client at module load) and the
 * `JobTrackerBoard` client component only needs `percentileBadge` —
 * importing it from the parent file dragged the entire Prisma
 * runtime (~113KB) into the `/me/applications` browser bundle,
 * surfacing as a `2272-…js` shared chunk in the build manifest.
 *
 * Rule of thumb (same as the privacy split): anything imported by a
 * "use client" component must live in a file with NO server-only
 * imports. Constants + pure functions + Prisma type-only imports are
 * safe; runtime Prisma client / db / auth / redis / etc. are not.
 *
 * `lib/applications-percentile.ts` re-exports `percentileBadge`
 * from here so server callers that destructured both
 * `getApplicationPercentiles` AND `percentileBadge` in a single
 * import keep working without an import-path sweep.
 */

/**
 * Pick a friendly percentile bucket label. Pass the percentile from
 * `getApplicationPercentiles` (where 0 = best, 1 = worst). Returns
 * null when the badge shouldn't surface.
 *
 * Bands:
 *   - top 5%   → "Top applicant" (verified-tone badge)
 *   - top 10%  → "Top 10%"
 *   - top 25%  → "Top 25%"
 *   - else     → null (don't surface)
 */
export function percentileBadge(pct: number | null): {
  label: string;
  tone: "verified" | "success" | "default";
} | null {
  if (pct === null) return null;
  if (pct <= 0.05) return { label: "Top applicant", tone: "verified" };
  if (pct <= 0.1) return { label: "Top 10%", tone: "success" };
  if (pct <= 0.25) return { label: "Top 25%", tone: "default" };
  return null;
}
