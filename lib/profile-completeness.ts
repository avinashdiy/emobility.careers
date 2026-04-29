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
 *   • 90% — unlocks job applications. Below this, the apply server action
 *           throws and the apply button shows "Complete profile to apply".
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
  APPLY: 90,
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
    {
      id: "photo",
      label: "Add a profile photo",
      weight: 8,
      filled: !!profile.profilePhotoUrl,
      href: "/me/profile?focus=photo",
    },
    {
      id: "headline",
      label: "Write a headline",
      weight: 6,
      filled: !!profile.headline && profile.headline.trim().length >= 10,
      href: "/me/profile?focus=headline",
    },
    {
      id: "summary",
      label: "Add an about / summary section",
      weight: 8,
      filled: !!profile.summary && profile.summary.trim().length >= 50,
      href: "/me/profile?focus=summary",
    },
    {
      id: "location",
      label: "Set your location",
      weight: 4,
      filled: !!profile.location,
      href: "/me/profile?focus=location",
    },
    {
      id: "phone",
      label: "Verify your phone number",
      weight: 6,
      filled: flags.phoneVerified,
      href: "/me/profile?focus=phone",
    },
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
      href: "/me/profile?focus=experience",
    },
    {
      id: "education",
      label: "Add your education",
      weight: 8,
      filled: profile.education.length >= 1,
      href: "/me/profile?focus=education",
    },
    {
      id: "skills",
      label: "Add at least 3 skills",
      weight: 10,
      filled: profile.skills.length >= 3,
      href: "/me/profile?focus=skills",
    },
    {
      id: "evDomains",
      label: "Pick the EV domains you work in",
      weight: 6,
      filled: profile.evDomains.length >= 1,
      href: "/me/profile?focus=evDomains",
    },
    {
      id: "certifications",
      label: "Add a certification (DIYguru course / training)",
      weight: 5,
      filled: profile.certifications.length >= 1,
      href: "/me/profile?focus=certifications",
    },
    {
      id: "projects",
      label: "Showcase a project",
      weight: 6,
      filled: profile.projects.length >= 1,
      href: "/me/profile?focus=projects",
    },
    {
      id: "ctc",
      label: "Set expected salary range",
      weight: 4,
      filled: !!profile.expectedCtcMin,
      href: "/me/profile?focus=preferences",
    },
    {
      id: "notice",
      label: "Set your notice period",
      weight: 3,
      filled: profile.noticePeriodDays !== null,
      href: "/me/profile?focus=preferences",
    },
    {
      id: "languages",
      label: "Add languages you speak",
      weight: 3,
      filled: profile.languagesSpoken.length >= 1,
      href: "/me/profile?focus=languages",
    },
    {
      id: "preferredCities",
      label: "Pick preferred cities",
      weight: 2,
      filled: profile.preferredCities.length >= 1,
      href: "/me/profile?focus=preferences",
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
