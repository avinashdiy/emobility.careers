import type { ContactVisibility, ResumeVisibility } from "@prisma/client";

/**
 * Pure UI-display constants for the profile-visibility controls.
 *
 * Split out from `lib/profile-visibility.ts` because that file's
 * authorization helpers (`getViewerContext`, `canSeeContact`,
 * `canSeeResume`) all import `@/lib/db` (Prisma client at module
 * load). The `PrivacyEditor` client component only needs these
 * description strings — importing them from the parent file would
 * drag the entire Prisma runtime into the browser bundle, bloating
 * `/me/profile` by ~MB of JavaScript and creating a future
 * production-crash vector (the same pattern that took the homepage
 * down via `lib/seo/hreflang.ts` → `lib/env.ts`).
 *
 * Rule of thumb: anything imported by a "use client" component
 * should live in a file with NO server-only imports. Constants +
 * pure functions + Prisma type-only imports are safe; runtime
 * Prisma client / db / auth / redis / etc. is not.
 *
 * `lib/profile-visibility.ts` re-exports both constants from here
 * so server callers that destructured them in one import still
 * work without churn.
 */

/**
 * UI-friendly description for the contact-visibility toggle in
 * /me/profile.
 *
 * Note: as of 2026-05 the platform enforces a privacy floor —
 * contact info only surfaces to admins, employers at companies
 * where you've applied, and people you've explicitly granted via
 * a contact-share request. The dropdown options below stay in the
 * schema for a future relaxation, but every option behaves the
 * same right now: signed-out visitors and casual browsers never
 * see your email/phone. Keep the wording aligned with the
 * authorization logic in `canSeeContact()` whenever that policy
 * changes.
 */
export const CONTACT_VISIBILITY_DESCRIPTIONS: Record<ContactVisibility, string> = {
  PRIVATE: "Hidden by default. Recruiters at companies you've applied to see it; everyone else has to send a contact-share request which you can accept or decline.",
  CONNECTIONS: "Same as Private right now — site-wide policy keeps email and phone hidden from connections too. Use the contact-share flow if you want a connection to have your details.",
  EMPLOYERS_ONLY: "Recruiters at companies where you've applied see your contact. Other employers must send a contact-share request — like LinkedIn InMail.",
  EVERYONE: "Same as Private right now — site-wide privacy policy keeps email and phone off the public profile regardless. Change back to PRIVATE if you don't want to revisit this when the policy relaxes.",
};

export const RESUME_VISIBILITY_DESCRIPTIONS: Record<ResumeVisibility, string> = {
  PRIVATE: "Your resume is hidden. Employers see it only when you apply to a job.",
  EMPLOYERS_ONLY: "Verified employers can download your resume from your profile.",
  EVERYONE: "Anyone with your profile link can download your resume.",
};
