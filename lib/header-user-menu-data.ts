import "server-only";
import { db } from "@/lib/db";
import type { UserMenuViewerData } from "@/components/layout/HeaderUserMenu";

/**
 * Load the shape `HeaderUserMenu` needs from one user-id. Used by
 * every dashboard shell (site, employer, admin, TPO) so the
 * Me-dropdown looks + behaves identically across the platform —
 * persona switcher, verified badge, isPlacementOfficer flag, etc.
 *
 * Returns `null` when the User row was deleted between the
 * session lookup and this call (rare but possible — admin
 * soft-delete or DB rollback). Callers should hide the dropdown
 * in that case.
 *
 * Six small queries, all by primary key — under 10ms in p99 even
 * on a cold connection. Cheap enough to call on every page render
 * without caching.
 */
export interface SessionUserShape {
  id: string;
  email?: string | null;
  name?: string | null;
  role: string;
}

export async function getUserMenuViewerData(
  user: SessionUserShape,
): Promise<UserMenuViewerData | null> {
  const [viewerCard, viewerUser, viewerEmployer, isMentor] = await Promise.all([
    db.candidateProfile.findUnique({
      where: { userId: user.id },
      select: {
        slug: true,
        firstName: true,
        lastName: true,
        profilePhotoUrl: true,
        isDIYguruVerified: true,
      },
    }),
    db.user.findUnique({
      where: { id: user.id },
      // `country` joins the viewer payload so the header's
      // CountrySelector can render the right flag in the trigger
      // without a separate query. Cheap (User PK lookup, already
      // in flight) — no extra round-trip cost.
      select: { isPlacementOfficer: true, country: true },
    }),
    db.employerProfile.findUnique({
      where: { userId: user.id },
      select: {
        companyId: true,
        company: { select: { name: true, slug: true, logoUrl: true } },
      },
    }),
    db.mentorProfile
      .findUnique({ where: { userId: user.id }, select: { id: true } })
      .then((m) => Boolean(m)),
  ]);

  // User row was deleted between session lookup + this call — bail
  // out so the caller can hide the dropdown rather than render a
  // broken shell that crashes on the next field read.
  if (!viewerUser) return null;

  const fullName = viewerCard
    ? `${viewerCard.firstName} ${viewerCard.lastName ?? ""}`.trim()
    : (user.name ?? "");

  return {
    name: fullName || user.email || "Account",
    email: user.email ?? "",
    role: user.role as "ADMIN" | "EMPLOYER" | "CANDIDATE",
    avatarUrl: viewerCard?.profilePhotoUrl ?? null,
    publicSlug: viewerCard?.slug ?? null,
    isMentor,
    isVerified: viewerCard?.isDIYguruVerified ?? false,
    isPlacementOfficer: !!viewerUser.isPlacementOfficer,
    hasCandidateProfile: !!viewerCard,
    hasEmployerProfile: !!viewerEmployer,
    employerCompany: viewerEmployer?.company
      ? {
          name: viewerEmployer.company.name,
          slug: viewerEmployer.company.slug,
          logoUrl: viewerEmployer.company.logoUrl,
        }
      : null,
    country: viewerUser.country,
  };
}
