import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { MessagingDock } from "@/components/messaging/MessagingDock";

/**
 * Server-side wrapper that fetches the current user's recent message threads
 * and hands them to the floating dock. Renders nothing on routes where the
 * widget shouldn't show: signed-out pages, the admin shell (it has its own
 * left sidebar), and inside the messages routes themselves (the user is
 * already in messaging — duplicate UI is noisy).
 */

const HIDE_PATH_PREFIXES = ["/admin", "/signin", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/onboarding", "/me/messages", "/employer/messages", "/api"];

export async function MessagingWidget() {
  const [session, hdrs] = await Promise.all([auth(), headers()]);
  if (!session?.user) return null;

  const pathname = hdrs.get("x-pathname") ?? "/";
  if (HIDE_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  // Pull recent threads — same shape /me/messages uses, but capped at 6 to fit
  // the dock's compact size. The "other party" name + avatar is resolved
  // here so the client doesn't need access to the User table.
  const threads = await db.messageThread.findMany({
    where: {
      OR: [
        { candidateUserId: session.user.id },
        { employerUserId: session.user.id },
        { application: { candidate: { userId: session.user.id } } },
      ],
    },
    orderBy: { lastMessageAt: "desc" },
    take: 6,
    include: {
      application: {
        include: {
          job: { select: { title: true, company: { select: { name: true, logoUrl: true } } } },
          candidate: { select: { firstName: true, lastName: true, slug: true, profilePhotoUrl: true } },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, senderId: true, readAt: true, createdAt: true } },
    },
  });

  // Cold-outreach threads (no application) carry candidateUserId / employerUserId —
  // we resolve the "other side" by selecting the side that isn't us.
  const coldUserIds = new Set<string>();
  for (const t of threads) {
    if (t.application) continue;
    const other = t.candidateUserId === session.user.id ? t.employerUserId : t.candidateUserId;
    if (other) coldUserIds.add(other);
  }
  const coldUsers = coldUserIds.size > 0
    ? await db.user.findMany({
        where: { id: { in: [...coldUserIds] } },
        select: {
          id: true,
          email: true,
          candidateProfile: { select: { firstName: true, lastName: true, profilePhotoUrl: true } },
          employerProfile: { select: { company: { select: { name: true, logoUrl: true } } } },
        },
      })
    : [];
  const coldUserById = new Map(coldUsers.map((u) => [u.id, u]));

  const items = threads.map((t) => {
    const lastMsg = t.messages[0];
    const unread = Boolean(lastMsg && !lastMsg.readAt && lastMsg.senderId !== session.user.id);
    let label = "Conversation";
    let avatar: string | null = null;
    let href = `/me/messages/${t.id}`;

    if (t.application) {
      const cp = t.application.candidate;
      // If WE are the candidate, the other side is the employer (job poster).
      const meIsCandidate = t.application.candidate;
      if (meIsCandidate) {
        label = `${t.application.job.company.name} · ${t.application.job.title}`;
        avatar = t.application.job.company.logoUrl ?? null;
      } else {
        label = `${cp.firstName} ${cp.lastName ?? ""}`.trim();
        avatar = cp.profilePhotoUrl ?? null;
      }
    } else {
      const otherId = t.candidateUserId === session.user.id ? t.employerUserId : t.candidateUserId;
      const other = otherId ? coldUserById.get(otherId) : null;
      if (other) {
        const cp = other.candidateProfile;
        const co = other.employerProfile?.company;
        label = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : (co?.name ?? other.email);
        avatar = cp?.profilePhotoUrl ?? co?.logoUrl ?? null;
      }
    }

    return {
      id: t.id,
      label,
      avatar,
      lastBody: lastMsg?.body ?? "",
      lastAt: (lastMsg?.createdAt ?? t.lastMessageAt ?? t.createdAt).toISOString(),
      unread,
      href,
    };
  });

  const unreadCount = items.filter((i) => i.unread).length;

  return <MessagingDock items={items} unreadCount={unreadCount} />;
}
