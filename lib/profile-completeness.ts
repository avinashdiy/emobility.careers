import "server-only";

import { db } from "@/lib/db";

/**
 * Profile-completeness scoring. Single source of truth — every server
 * action that mutates the profile calls `recalcCompleteness(candidateId)`
 * inside its transaction so the cached `CandidateProfile.profileCompleteness`
 * column never drifts.
 *
 * Two thresholds drive product behaviour:
 *   • 50% — unlocks site-wide browsing (feed, jobs, mentors, network).
 *           Below this, soft-redirects to /me/profile with a guidance banner.
 *   • 60% — unlocks job applications. Below this, the apply server action
 *           throws and the apply button shows "Complete profile to apply".
 *           (Was 90%; softened on 2026-05-01 — the 90% bar was so high
 *           that even motivated candidates with a verified resume,
 *           experience, and skills could fall short and bounce off the
 *           apply CTA. 60% is a "you've put in real effort" floor — it
 *           still requires the headline, summary, photo, and a couple
 *           of structured sections — without locking the door on
 *           pragmatic profiles. Recruiters can still rank by full
 *           completeness in the ATS.)
 *
 * Weights below total exactly 100. They reflect what a recruiter scans
 * for in 5 seconds: who you are, what you've done, what you can do, where
 * you fit, and how to reach you. Bumping one section up means another
 * comes down — keep the maths balanced.
 *
 * The breakdown returned by `evaluateProfile()` powers the gauge UI's
 * "next steps" list — sections sorted by descending weight so the
 * candidate sees the biggest unlock first.
 */

export const COMPLETENESS_THRESHOLDS = {
  /** Soft gate — below this, candidate is redirected to /me/profile. */
  EXPLORE: 50,
  /** Hard gate — below this, applyToJob throws. */
  APPLY: 60,
} as const;

interface ProfileShape {
  headline: string | null;
  summary: string | null;
  profilePhotoUrl: string | null;
  location: string | null;
  noticePeriodDays: number | null;
  expectedCtcMin: { toString(): string } | null;
  resumeUrl: string | null;
  aiResumeUrl: string | null;
  useAiResume: boolean;
  languagesSpoken: string[];
  preferredCities: string[];
  // Phone-verified flag lives on the User row, not the profile — the
  // calculator accepts it as a sibling input below.
  evDomains: { evDomainId: string }[];
  skills: { skillId: string }[];
  experiences: { id: string }[];
  education: { id: string }[];
  certifications: { id: string }[];
  projects: { id: string }[];
}

export interface SectionResult {
  /** Stable id so the UI can deep-link to the editor section. */
  id: string;
  /** Short, candidate-facing label. Used in the gauge "next steps" list. */
  label: string;
  /** % weight contribution — sums to 100 across all sections. */
  weight: number;
  /** True when this section's filled-out criteria pass. */
  filled: boolean;
  /** Deep-link URL into the editor — used by next-steps CTAs. */
  href: string;
}

export interface CompletenessResult {
  pct: number;
  sections: SectionResult[];
  /** Convenience flags read by gates + banners. */
  canExplore: boolean;
  canApply: boolean;
}

/**
 * Pure scorer. Pass an already-loaded profile shape and the user's
 * phoneVerified flag. Returns 0..100 plus the section breakdown.
 */
export function evaluateProfile(
  profile: ProfileShape,
  flags: { phoneVerified: boolean; emailVerified: boolean },
): CompletenessResult {
  const hasResume = !!(profile.resumeUrl || (profile.useAiResume && profile.aiResumeUrl));
  const sections: SectionResult[] = [
    // Hrefs are anchor-based (#card-id) rather than query params so the
    // browser auto-scrolls to the editor card on click. Each anchor
    // matches a `<div id="…">` wrapper in /me/profile/page.tsx
    // (header / experience / education / skills / etc.). The anchor
    // also gets `scroll-mt-20` so the section sits below the sticky
    // SiteHeader rather than under it.
    {
      id: "photo",
      label: "Add a profile photo",
      weight: 8,
      filled: !!profile.profilePhotoUrl,
      href: "/me/profile#header",
    },
    {
      id: "headline",
      label: "Write a headline",
      weight: 6,
      filled: !!profile.headline && profile.headline.trim().length >= 10,
      href: "/me/profile#header",
    },
    {
      id: "summary",
      label: "Add an about / summary section",
      weight: 8,
      filled: !!profile.summary && profile.summary.trim().length >= 50,
      href: "/me/profile#header",
    },
    {
      id: "location",
      label: "Set your location",
      weight: 4,
      filled: !!profile.location,
      href: "/me/profile#header",
    },
    // Phone-verify step is intentionally dropped from the completeness
    // checklist for now — the OTP flow isn't wired into the editor yet
    // (lib/sms.ts has sendOTP, server/auth/phone-actions.ts and
    // components/profile/PhoneVerifier.tsx are scaffolded but not
    // surfaced). Re-add when phone verification ships:
    //
    //   { id: "phone", label: "Verify your phone number", weight: 6,
    //     filled: flags.phoneVerified, href: "/me/profile#header" },
    {
      id: "email",
      label: "Verify your email address",
      weight: 4,
      filled: flags.emailVerified,
      href: "/verify-email",
    },
    {
      id: "experience",
      label: "Add at least one work experience",
      weight: 12,
      filled: profile.experiences.length >= 1,
      href: "/me/profile#experience",
    },
    {
      id: "education",
      label: "Add your education",
      weight: 8,
      filled: profile.education.length >= 1,
      href: "/me/profile#education",
    },
    {
      id: "skills",
      label: "Add at least 3 skills",
      weight: 10,
      filled: profile.skills.length >= 3,
      href: "/me/profile#skills",
    },
    {
      id: "evDomains",
      label: "Pick the EV domains you work in",
      weight: 6,
      filled: profile.evDomains.length >= 1,
      href: "/me/profile#skills",
    },
    {
      id: "certifications",
      label: "Add a certification (DIYguru course / training)",
      weight: 5,
      filled: profile.certifications.length >= 1,
      href: "/me/profile#certifications",
    },
    {
      id: "projects",
      label: "Showcase a project",
      weight: 6,
      filled: profile.projects.length >= 1,
      href: "/me/profile#projects",
    },
    {
      id: "ctc",
      label: "Set expected salary range",
      weight: 4,
      filled: !!profile.expectedCtcMin,
      href: "/me/profile#availability",
    },
    {
      id: "notice",
      label: "Set your notice period",
      weight: 3,
      filled: profile.noticePeriodDays !== null,
      href: "/me/profile#availability",
    },
    {
      id: "languages",
      label: "Add languages you speak",
      weight: 3,
      filled: profile.languagesSpoken.length >= 1,
      href: "/me/profile#languages",
    },
    {
      id: "preferredCities",
      label: "Pick preferred cities",
      weight: 2,
      filled: profile.preferredCities.length >= 1,
      href: "/me/profile#header",
    },
    {
      id: "resume",
      label: "Have a resume on file (uploaded or AI-drafted)",
      weight: 5,
      filled: hasResume,
      href: "/me/profile?focus=resume",
    },
  ];

  const pct = sections.reduce((acc, s) => acc + (s.filled ? s.weight : 0), 0);

  return {
    pct,
    sections,
    canExplore: pct >= COMPLETENESS_THRESHOLDS.EXPLORE,
    canApply: pct >= COMPLETENESS_THRESHOLDS.APPLY,
  };
}

/**
 * Sections still missing, ordered by descending weight. The gauge UI
 * shows the first 3–5 to drive the candidate's next click.
 */
export function nextSteps(result: CompletenessResult, limit = 5): SectionResult[] {
  return result.sections
    .filter((s) => !s.filled)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

/**
 * Minimum-count subset of unfilled sections whose combined weight
 * crosses the requested threshold. Used by the gauge UI when the
 * candidate is in a gating band (e.g. 80–89% needing 90% to apply,
 * or <50% needing 50% to explore) to surface the SHORTEST list of
 * actions that unlocks the gate, rather than the highest-impact list.
 *
 * Greedy descending-weight pick is optimal here for cardinality
 * minimisation when items are non-negative — picking the heaviest
 * each iteration is always at least as good as any alternative for
 * "fewest items to reach X". n=16 anyway, so even brute-force would
 * be fine.
 *
 * Returns null when the candidate is already past the threshold
 * (caller should fall back to nextSteps).
 */
export function cheapestPathToThreshold(
  result: CompletenessResult,
  thresholdPct: number,
): { path: SectionResult[]; gap: number } | null {
  const gap = thresholdPct - result.pct;
  if (gap <= 0) return null;

  const remaining = result.sections
    .filter((s) => !s.filled)
    .sort((a, b) => b.weight - a.weight);

  const path: SectionResult[] = [];
  let total = 0;
  for (const step of remaining) {
    path.push(step);
    total += step.weight;
    if (total >= gap) break;
  }
  // If even all unfilled sections together don't close the gap, we
  // still return the full set — the candidate has nothing else to do
  // anyway. Caller can detect this with `total < gap` if needed.
  return { path, gap };
}

/**
 * Recompute and persist `CandidateProfile.profileCompleteness`. Call this
 * inside the same transaction as any profile-edit so the column never
 * lags. Returns the fresh result.
 *
 * Accepts an optional Prisma-tx-like client so callers inside a
 * `db.$transaction(async (tx) => …)` block can pass `tx` and stay
 * inside the same transaction. Falls back to the default `db` instance.
 */
export async function recalcCompleteness(
  candidateId: string,
  client: typeof db = db,
): Promise<CompletenessResult> {
  const profile = await client.candidateProfile.findUnique({
    where: { id: candidateId },
    include: {
      evDomains: { select: { evDomainId: true } },
      skills: { select: { skillId: true } },
      experiences: { select: { id: true } },
      education: { select: { id: true } },
      certifications: { select: { id: true } },
      projects: { select: { id: true } },
      user: { select: { phoneVerifiedAt: true, emailVerifiedAt: true } },
    },
  });
  if (!profile) {
    return {
      pct: 0,
      sections: [],
      canExplore: false,
      canApply: false,
    };
  }

  const result = evaluateProfile(profile, {
    phoneVerified: !!profile.user.phoneVerifiedAt,
    emailVerified: !!profile.user.emailVerifiedAt,
  });

  await client.candidateProfile.update({
    where: { id: candidateId },
    data: { profileCompleteness: result.pct },
  });

  return result;
}
