import { db } from "@/lib/db";
import type { ContactVisibility, ResumeVisibility, Role } from "@prisma/client";

/**
 * Central authorization helpers for sensitive profile fields. Use these
 * everywhere a profile is rendered so the rules stay consistent — never
 * inline the `===` checks at the call site.
 *
 * The viewer perspective:
 *   - "owner" — the candidate is viewing their own profile (always allowed)
 *   - "connection" — viewer is a 1st-degree connection of the candidate
 *   - "employer" — viewer is a verified employer (Role = EMPLOYER, status ACTIVE)
 *   - "admin" — site admin (sees everything, audit-logged elsewhere)
 *   - "anon" — signed-out or no relationship
 */

export interface ViewerContext {
  viewerId: string | null;
  ownerUserId: string;
  isOwner: boolean;
  role: Role | null;
  isConnection: boolean;
  /// Whether the viewer's company has at least one Application from
  /// this candidate. The "legitimate need" gate for employers — a
  /// candidate who applied has implicitly shared contact with that
  /// employer (LinkedIn-style). Without this signal, ANY employer
  /// would be able to see contact for any candidate whose
  /// `contactVisibility` is `EMPLOYERS_ONLY`, which is the privacy
  /// leak we're closing.
  ///
  /// Resolved by `getViewerContext` for the public-profile path; ATS
  /// + candidate-search call sites compute it themselves because
  /// they already have the application context in hand.
  hasApplicationRelationship: boolean;
  /// Whether there's an active GRANTED `ContactShareRequest` from
  /// the viewer to the owner. Set by `getViewerContext` when the
  /// viewer is signed in. A grant turns contact on for that
  /// recruiter even if the candidate's profile is set to PRIVATE —
  /// the candidate explicitly said yes. REVOKED / EXPIRED / DENIED
  /// rows do NOT count here; the action layer flips the status and
  /// this lookup respects only `status: "GRANTED"`.
  hasActiveContactGrant: boolean;
}

/** Resolves the viewer's relationship to a profile owner in one DB hit. */
export async function getViewerContext(
  viewerId: string | null,
  ownerUserId: string,
  role: Role | null,
): Promise<ViewerContext> {
  const isOwner = Boolean(viewerId && viewerId === ownerUserId);
  if (isOwner || !viewerId) {
    return {
      viewerId,
      ownerUserId,
      isOwner,
      role,
      isConnection: false,
      hasApplicationRelationship: false,
      hasActiveContactGrant: false,
    };
  }
  // Run the connection, employer-profile, and contact-share-grant
  // lookups in parallel — all three are cheap indexed queries, and
  // the extra serial round-trips would be visible on profile-page LCP.
  const [conn, employerProfile, grant] = await Promise.all([
    db.connection.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: viewerId, recipientId: ownerUserId },
          { requesterId: ownerUserId, recipientId: viewerId },
        ],
      },
      select: { id: true },
    }),
    role === "EMPLOYER"
      ? db.employerProfile.findUnique({
          where: { userId: viewerId },
          select: { companyId: true },
        })
      : Promise.resolve(null),
    // Grant lookup — uses the (requesterUserId, targetUserId) unique
    // index. We look at all statuses but only `GRANTED` flips the
    // bool; that lets the inbox / dashboard read the same row to
    // show the request's history without a second query.
    db.contactShareRequest.findUnique({
      where: {
        requesterUserId_targetUserId: {
          requesterUserId: viewerId,
          targetUserId: ownerUserId,
        },
      },
      select: { status: true },
    }),
  ]);

  let hasApplicationRelationship = false;
  if (employerProfile?.companyId) {
    // Application table joins via `job.companyId`. Candidate is
    // identified through their CandidateProfile.userId. We do a
    // single existence check rather than a full scan.
    const app = await db.application.findFirst({
      where: {
        candidate: { userId: ownerUserId },
        job: { companyId: employerProfile.companyId },
      },
      select: { id: true },
    });
    hasApplicationRelationship = Boolean(app);
  }

  return {
    viewerId,
    ownerUserId,
    isOwner,
    role,
    isConnection: Boolean(conn),
    hasApplicationRelationship,
    hasActiveContactGrant: grant?.status === "GRANTED",
  };
}

/**
 * Decide whether the viewer is allowed to see the candidate's email
 * + phone. LinkedIn-strict by default:
 *
 *   • Owner — always.
 *   • Admin — always (audit-logged elsewhere; site-ops need contact
 *     for support tickets, account recovery, abuse investigations).
 *   • Active contact-share GRANT from this viewer to this owner —
 *     always, regardless of the candidate's `contactVisibility`.
 *     A GRANT is the candidate explicitly saying "yes you can have
 *     my contact" via the request flow in `server/contact-share/`.
 *     This is the "consent overrides default privacy" path.
 *   • EVERYONE visibility — public on the profile page (rare opt-in).
 *   • EMPLOYERS_ONLY visibility — gated on BOTH (a) viewer is an
 *     employer AND (b) the candidate has applied to one of their
 *     company's jobs. This is the "legitimate need" gate. We
 *     deliberately do NOT honour `EMPLOYERS_ONLY` for any random
 *     verified employer — that's the leak we're closing.
 *   • CONNECTIONS visibility — only ACCEPTED connections see contact.
 *   • PRIVATE — nobody but owner sees contact (unless granted above).
 */
export function canSeeContact(visibility: ContactVisibility, ctx: ViewerContext): boolean {
  if (ctx.isOwner) return true;
  if (ctx.role === "ADMIN") return true;
  // Explicit grant trumps every other rule below — including PRIVATE.
  // The candidate said yes; that's the strongest possible consent.
  if (ctx.hasActiveContactGrant) return true;
  switch (visibility) {
    case "EVERYONE":
      return true;
    case "EMPLOYERS_ONLY":
      // Strict: employer role alone isn't enough — they need a real
      // application relationship with the candidate. Without that,
      // they should send an InMail / messaging request like LinkedIn,
      // not silently lift the candidate's email + phone.
      return ctx.role === "EMPLOYER" && ctx.hasApplicationRelationship;
    case "CONNECTIONS":
      return ctx.isConnection;
    case "PRIVATE":
    default:
      return false;
  }
}

export function canSeeResume(visibility: ResumeVisibility, ctx: ViewerContext): boolean {
  if (ctx.isOwner) return true;
  if (ctx.role === "ADMIN") return true;
  switch (visibility) {
    case "EVERYONE":
      return true;
    case "EMPLOYERS_ONLY":
      return ctx.role === "EMPLOYER";
    case "PRIVATE":
    default:
      return false;
  }
}

/** UI-friendly description for the toggle screens in /me/profile. */
export const CONTACT_VISIBILITY_DESCRIPTIONS: Record<ContactVisibility, string> = {
  PRIVATE: "Only you can see your email and phone. Recruiters can still message you in-app — your contact stays hidden until you reply.",
  CONNECTIONS: "Your accepted 1st-degree connections can see your email and phone. Everyone else can only message you in-app.",
  EMPLOYERS_ONLY: "Recruiters at companies where you've applied can see your email and phone. Other employers can only message you in-app — like LinkedIn.",
  EVERYONE: "Your email and phone are public on your profile page. Visible to anyone with the link, including search engines.",
};

export const RESUME_VISIBILITY_DESCRIPTIONS: Record<ResumeVisibility, string> = {
  PRIVATE: "Your resume is hidden. Employers see it only when you apply to a job.",
  EMPLOYERS_ONLY: "Verified employers can download your resume from your profile.",
  EVERYONE: "Anyone with your profile link can download your resume.",
};
