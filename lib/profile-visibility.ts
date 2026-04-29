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
}

/** Resolves the viewer's relationship to a profile owner in one DB hit. */
export async function getViewerContext(
  viewerId: string | null,
  ownerUserId: string,
  role: Role | null,
): Promise<ViewerContext> {
  const isOwner = Boolean(viewerId && viewerId === ownerUserId);
  if (isOwner || !viewerId) {
    return { viewerId, ownerUserId, isOwner, role, isConnection: false };
  }
  const conn = await db.connection.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: viewerId, recipientId: ownerUserId },
        { requesterId: ownerUserId, recipientId: viewerId },
      ],
    },
    select: { id: true },
  });
  return { viewerId, ownerUserId, isOwner, role, isConnection: Boolean(conn) };
}

export function canSeeContact(visibility: ContactVisibility, ctx: ViewerContext): boolean {
  if (ctx.isOwner) return true;
  if (ctx.role === "ADMIN") return true;
  switch (visibility) {
    case "EVERYONE":
      return true;
    case "EMPLOYERS_ONLY":
      return ctx.role === "EMPLOYER";
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
  PRIVATE: "Only you can see your email and phone. Visitors see a 'Request contact' button.",
  CONNECTIONS: "Your 1st-degree connections can see your email and phone.",
  EMPLOYERS_ONLY: "Only verified employers can see your email and phone — they reach out for roles.",
  EVERYONE: "Your email and phone are public on your profile page.",
};

export const RESUME_VISIBILITY_DESCRIPTIONS: Record<ResumeVisibility, string> = {
  PRIVATE: "Your resume is hidden. Employers see it only when you apply to a job.",
  EMPLOYERS_ONLY: "Verified employers can download your resume from your profile.",
  EVERYONE: "Anyone with your profile link can download your resume.",
};
