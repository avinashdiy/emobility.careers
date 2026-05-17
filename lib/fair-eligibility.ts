import { COMPLETENESS_THRESHOLDS } from "@/lib/profile-completeness";

/**
 * "Is this candidate eligible to register / apply for a job fair?"
 *
 * The bar is intentionally LOW — we want every reasonably-complete
 * candidate to convert, not turn the fair into an exclusive event.
 * But the bar can't be zero either, because half the value of the
 * fair to recruiters is "every candidate you meet has the basics" —
 * a CV they can read, a phone they can call, and a verified email
 * we can reach.
 *
 * Two AND'd gates:
 *
 *   1. **Profile completeness ≥ 60%** (`COMPLETENESS_THRESHOLDS.APPLY`).
 *      The same threshold `applyToJob` already uses. Mirrors the
 *      "filled enough that a recruiter has something to read"
 *      heuristic, weighted across all profile sections.
 *
 *   2. **Three explicit must-haves**, even if 60% is reached via
 *      other means:
 *        • CV — either `resumeUrl` (uploaded PDF/DOCX) OR
 *          `aiResumeUrl` (AI-generated). Recruiters expect to
 *          download a resume at the booth, not piece one together
 *          from on-screen sections.
 *        • Phone — recruiters need to call/WhatsApp on the day
 *          for "you're up next at our booth" coordination.
 *        • Email verified — confirms the platform can reach the
 *          candidate post-fair with offers / follow-ups.
 *
 * The function never throws. It returns a single object so the
 * caller (server action + UI surface) can both gate AND surface
 * the exact gaps to the candidate. Each gap maps to a stable
 * `id` that the UI uses to deep-link to the right fix:
 *
 *   completeness  → /me/profile (general completeness gauge)
 *   resume        → /me/profile?section=resume
 *   phone         → /me/profile?section=contact
 *   email         → /me/verify-email
 */

export type FairEligibilityGap = "completeness" | "resume" | "phone" | "email";

export interface FairEligibility {
  /// True when every gate passes. Server actions check this first;
  /// UI surfaces gate-pass / per-gap copy from `missing`.
  ok: boolean;
  /// Candidate's current profile completeness percentage. Always
  /// populated even when ok=true so the UI can show "✓ 87%
  /// complete — you're eligible" without an extra fetch.
  completeness: number;
  /// Threshold the candidate needs to clear. Constant for now but
  /// exposed so the UI doesn't hardcode 60.
  threshold: number;
  /// Ordered list of gaps. Order = display order in the
  /// "Complete these to register" inline list. Empty when ok=true.
  missing: FairEligibilityGap[];
}

interface ProfileLike {
  profileCompleteness: number;
  resumeUrl: string | null;
  aiResumeUrl: string | null;
  /// CandidateProfile.phone. We accept the User.phone fallback
  /// below via the second arg — same shape as `applyToJob`.
  phone: string | null;
}

interface UserLike {
  emailVerifiedAt: Date | null;
  /// User.phone is the SMS-OTP phone captured during signup; many
  /// existing users only have this field set (and never filled
  /// the profile-level phone). Either is fine for fair-day reach.
  phone: string | null;
}

export function evaluateFairEligibility(
  profile: ProfileLike,
  user: UserLike,
): FairEligibility {
  const missing: FairEligibilityGap[] = [];

  // Order the gaps roughly by "fix difficulty" so the candidate
  // sees the easiest fixes first — email verify is one click, CV
  // upload is a real chore.
  if (!user.emailVerifiedAt) missing.push("email");
  if (!(user.phone || profile.phone)) missing.push("phone");
  if (!(profile.resumeUrl || profile.aiResumeUrl)) missing.push("resume");
  if (profile.profileCompleteness < COMPLETENESS_THRESHOLDS.APPLY) {
    missing.push("completeness");
  }

  return {
    ok: missing.length === 0,
    completeness: profile.profileCompleteness,
    threshold: COMPLETENESS_THRESHOLDS.APPLY,
    missing,
  };
}

/**
 * UI-side labels + fix-links per gap. Keep here (not in the
 * component) so the same labels render consistently across the
 * fair page, the application apply form, and the eventual
 * /me/profile gap nudge.
 */
export const FAIR_GAP_COPY: Record<FairEligibilityGap, { label: string; cta: string; href: string }> = {
  email: {
    label: "Verify your email",
    cta: "Open verification",
    // The link is the standard email-verification trigger that
    // mails a fresh link. Same page candidates land on from
    // signup.
    href: "/me?verify=email",
  },
  phone: {
    label: "Add a phone number",
    cta: "Add phone",
    // Profile editor scrolls to the contact section via the
    // hash anchor. The editor doesn't yet have a deep-link
    // scroll target — adding `?section=contact` here so the
    // future polish pass can wire it.
    href: "/me/profile?section=contact",
  },
  resume: {
    label: "Upload a CV (PDF) or generate one with AI",
    cta: "Add resume",
    href: "/me/profile?section=resume",
  },
  completeness: {
    label: "Reach 60% profile completeness",
    cta: "Continue profile",
    href: "/me/profile",
  },
};
