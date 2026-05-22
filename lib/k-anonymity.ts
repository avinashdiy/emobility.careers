import "server-only";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * k-anonymity guard for the public-profile experience years display.
 *
 * Scenario: an attacker browsing the public web sees a profile with
 * "Senior Battery Engineer at Tata Motors · 12.4 yrs experience" plus a
 * city, photo, and a couple of skills. Even without a name, that triple
 * (company, title, exp_years_bucket) can be unique enough to identify
 * the person inside their employer's HR system — and a hostile peer
 * could correlate it back to a real identity.
 *
 * The fix isn't to hide the profile (then the platform loses value);
 * it's to suppress the *narrowest* quasi-identifier — the precise
 * experience years — when the bucket is too small to provide cover.
 *
 * Rule: if fewer than `K_THRESHOLD` published candidate profiles share
 * the same (current_company, current_title, exp_years_bucket), we
 * suppress the years display for non-owner / non-employer viewers.
 *
 * Buckets are 5-year wide (0–4, 5–9, 10–14, 15+) — narrow enough that
 * employers using talent-search find what they need, wide enough that
 * a single 12.4-year profile blends with the rest of the 10–14
 * cluster.
 *
 * Owner ALWAYS sees their own years (it's their data). Employer/admin
 * viewers also see the full data — they're the audience the platform
 * exists to serve, and they sign a recruiter ToS that prohibits
 * disclosure.
 */

export const K_THRESHOLD = 5;

interface CurrentRole {
  company: string;
  title: string;
}

interface ProfileForKAnon {
  totalExperienceMonths: number;
  experiences: { company: string; title: string; current: boolean }[];
}

export interface KAnonResult {
  /** True when the years should be hidden from the current viewer. */
  suppress: boolean;
  /** Why the call was made — useful in logs and the admin diagnostic. */
  reason:
    | "owner_or_employer"
    | "no_current_role"
    | "no_total_experience"
    | "bucket_too_small"
    | "k_satisfied"
    | "lookup_failed";
  /** How many other public profiles share the same (company, title, bucket). */
  bucketSize?: number;
  /** Bucket label for diagnostics ("0-4", "5-9", "10-14", "15+"). */
  bucket?: string;
}

export function experienceBucket(months: number): string {
  if (months <= 0) return "0-4";
  const years = Math.floor(months / 12);
  if (years < 5) return "0-4";
  if (years < 10) return "5-9";
  if (years < 15) return "10-14";
  return "15+";
}

/**
 * Convert a bucket label back into a `[minMonths, maxMonths]` pair so we
 * can run a SQL count against `totalExperienceMonths`. The upper bound
 * is exclusive; for "15+" we use a very high cap.
 */
function bucketRangeMonths(bucket: string): { gte: number; lt: number } {
  switch (bucket) {
    case "0-4": return { gte: 0, lt: 5 * 12 };
    case "5-9": return { gte: 5 * 12, lt: 10 * 12 };
    case "10-14": return { gte: 10 * 12, lt: 15 * 12 };
    case "15+": return { gte: 15 * 12, lt: 100 * 12 };
    default: return { gte: 0, lt: 100 * 12 };
  }
}

function pickCurrentRole(profile: ProfileForKAnon): CurrentRole | null {
  const cur = profile.experiences.find((e) => e.current && e.company && e.title);
  if (cur) return { company: cur.company.trim(), title: cur.title.trim() };
  // Fall back to the most recent experience even if it isn't flagged
  // current — many candidates forget to tick the checkbox. The
  // ordering in the page query is `startDate desc`, so index 0 is
  // most recent.
  const first = profile.experiences[0];
  if (first?.company && first?.title) {
    return { company: first.company.trim(), title: first.title.trim() };
  }
  return null;
}

/**
 * Decide whether to suppress the years display.
 *
 * Viewer roles that bypass the gate:
 *   • The profile owner (they're not a re-identification risk to
 *     themselves).
 *   • EMPLOYER and ADMIN — they're the audience.
 *
 * For everyone else (logged-out + CANDIDATE viewers), check the
 * cohort size and suppress when too thin.
 */
export async function shouldSuppressExperienceYears(
  profile: ProfileForKAnon,
  viewer: { isOwner: boolean; role: "ADMIN" | "EMPLOYER" | "CANDIDATE" | null },
): Promise<KAnonResult> {
  if (viewer.isOwner || viewer.role === "EMPLOYER" || viewer.role === "ADMIN") {
    return { suppress: false, reason: "owner_or_employer" };
  }
  if (profile.totalExperienceMonths <= 0) {
    // Nothing to display, nothing to suppress. Returning `suppress:false`
    // keeps the page logic simple — the existing `> 0` guard already
    // hides the snippet.
    return { suppress: false, reason: "no_total_experience" };
  }
  const role = pickCurrentRole(profile);
  if (!role) {
    // No current employer/title to anchor the lookup. We can't form a
    // (company, title, bucket) triple, so the most-narrow quasi-
    // identifier doesn't apply — leave the years visible.
    return { suppress: false, reason: "no_current_role" };
  }
  const bucket = experienceBucket(profile.totalExperienceMonths);
  const range = bucketRangeMonths(bucket);

  try {
    // Count published, EVERYONE-visible candidate profiles whose
    // current/most-recent experience matches the same company+title
    // and whose totalExperienceMonths falls in the same bucket. Case-
    // insensitive on company/title because input is free-text — "Tata
    // Motors" and "TATA MOTORS" should land in the same cohort.
    //
    // We look only at experiences flagged `current=true` so a long-ago
    // ex-Tesla engineer doesn't inflate Tesla's current-cohort count.
    // The trade-off: candidates who forgot to tick the current flag
    // get a smaller cohort (and possibly suppressed). That's the
    // privacy-safe side of the trade-off.
    const cohort = await db.candidateProfile.count({
      where: {
        cvVisibility: "EVERYONE",
        totalExperienceMonths: { gte: range.gte, lt: range.lt },
        experiences: {
          some: {
            current: true,
            company: { equals: role.company, mode: "insensitive" },
            title: { equals: role.title, mode: "insensitive" },
          },
        },
      },
    });

    // Subtle but important — `cohort` already includes the subject
    // profile (it matches all the same predicates). The threshold
    // semantics we want is "at least K-1 OTHER profiles share this
    // bucket", so we test `cohort >= K_THRESHOLD`.
    if (cohort < K_THRESHOLD) {
      logger.info(
        {
          company: role.company,
          title: role.title,
          bucket,
          cohort,
          threshold: K_THRESHOLD,
        },
        "[k-anon] suppressed years display — bucket too small",
      );
      return { suppress: true, reason: "bucket_too_small", bucketSize: cohort, bucket };
    }
    return { suppress: false, reason: "k_satisfied", bucketSize: cohort, bucket };
  } catch (err) {
    // DB outage at view time shouldn't 500 the public profile. Fail
    // OPEN (i.e. show the years) — yes, that's a privacy regression on
    // the failure path, but a blank page is a worse UX and it's a
    // bounded outage. Log loud so it gets noticed.
    logger.error({ err, company: role.company, title: role.title }, "[k-anon] cohort lookup failed");
    return { suppress: false, reason: "lookup_failed", bucket };
  }
}
