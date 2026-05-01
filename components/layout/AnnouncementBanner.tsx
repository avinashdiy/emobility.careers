import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";
import { AnnouncementBannerClient } from "./AnnouncementBannerClient";

/**
 * Site-wide announcement banner. Picks the highest-severity active
 * announcement targeted at the current viewer and renders it above
 * page content. Most pages will see nothing — that's the design.
 *
 * The active-window logic and audience filter live server-side so
 * the announcement is only computed once per request. The
 * client-side wrapper handles dismiss + localStorage stickiness so
 * the user doesn't see the same INFO banner forever.
 *
 * Severity ordering when multiple are active:
 *   CRITICAL > WARNING > SUCCESS > INFO
 *
 * If no announcement matches, returns null (zero overhead).
 */
export async function AnnouncementBanner() {
  const session = await auth();
  const role = (session?.user?.role ?? null) as Role | null;
  const now = new Date();

  // Build the audience filter — EVERYONE always matches, plus the
  // role-specific bucket. Admins see EVERYONE + ADMINS but not the
  // CANDIDATES / EMPLOYERS ones (those are direct messages to those
  // audiences and admins shouldn't see them as if they were the user).
  const audienceMatches: ("EVERYONE" | "CANDIDATES" | "EMPLOYERS" | "ADMINS")[] = [
    "EVERYONE",
  ];
  if (role === "CANDIDATE") audienceMatches.push("CANDIDATES");
  if (role === "EMPLOYER") audienceMatches.push("EMPLOYERS");
  if (role === "ADMIN") audienceMatches.push("ADMINS");

  const candidates = await db.announcement.findMany({
    where: {
      isActive: true,
      audience: { in: audienceMatches },
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    orderBy: [{ createdAt: "desc" }],
    take: 5,
  });
  if (candidates.length === 0) return null;
  const SEVERITY_RANK: Record<string, number> = {
    CRITICAL: 4,
    WARNING: 3,
    SUCCESS: 2,
    INFO: 1,
  };
  const winner = candidates.slice().sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  )[0];

  return (
    <AnnouncementBannerClient
      id={winner.id}
      title={winner.title}
      body={winner.body}
      ctaLabel={winner.ctaLabel}
      ctaUrl={winner.ctaUrl}
      severity={winner.severity}
      dismissible={winner.dismissible}
    />
  );
}
