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
 * + phone. Strict-by-default policy (tightened on 2026-05-01 in
 * response to user-reported leakage on legacy `EVERYONE` profiles):
 *
 *   • Owner — always.
 *   • Admin — always (audit-logged elsewhere; site-ops need contact
 *     for support tickets, account recovery, abuse investigations).
 *   • Active contact-share GRANT from this viewer to this owner —
 *     always, regardless of any other field. A GRANT is the candidate
 *     explicitly saying "yes you can have my contact" via the request
 *     flow in `server/contact-share/`. This is the "consent overrides
 *     default privacy" path.
 *   • Verified employer who has at least one Application from this
 *     candidate to one of their company's jobs — they have a
 *     legitimate need (the candidate volunteered into their pipeline).
 *
 *   • EVERYONE ELSE — hidden. This includes:
 *      - signed-out / anonymous visitors
 *      - other CANDIDATE viewers (peer browsing)
 *      - 1st-degree CONNECTIONS (use messaging instead)
 *      - verified EMPLOYERS without an application from this candidate
 *        (they should send a contact-share request — same as LinkedIn
 *        InMail-then-reveal flow)
 *
 * The candidate's `ContactVisibility` setting is intentionally
 * IGNORED here — it remains in the schema and the editor for a
 * future relaxation, but for now the floor (admin / grant /
 * applied-employer) is the policy regardless of what the candidate
 * picked. Legacy EVERYONE / CONNECTIONS settings are not honoured;
 * those candidates effectively land at the same privacy posture as
 * PRIVATE until they explicitly grant a contact-share request.
 */
export function canSeeContact(_visibility: ContactVisibility, ctx: ViewerContext): boolean {
  if (ctx.isOwner) return true;
  if (ctx.role === "ADMIN") return true;
  // Explicit consent — strongest signal. Trumps everything else.
  if (ctx.hasActiveContactGrant) return true;
  // Application-derived legitimate need.
  if (ctx.role === "EMPLOYER" && ctx.hasApplicationRelationship) return true;
  return false;
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

/** UI-friendly description for the toggle screens in /me/profile.
 *  Note: as of 2026-05 the platform enforces a privacy floor —
 *  contact info only surfaces to admins, employers at companies
 *  where you've applied, and people you've explicitly granted via a
 *  contact-share request. The dropdown options below stay in the
 *  schema for a future relaxation but every option behaves the
 *  same right now: signed-out visitors and casual browsers never
 *  see your email/phone. */
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
