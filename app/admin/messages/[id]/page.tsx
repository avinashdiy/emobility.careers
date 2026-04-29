import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { audit } from "@/lib/audit";
import { relativeTime, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Thread", robots: { index: false, follow: false } };

/**
 * Read-only admin view of a single message thread. Every body is rendered;
 * the page render itself is audit-logged with the threadId so we know
 * exactly which conversation an admin opened. There is NO send / reply UI
 * here by design — admins inspect, they don't impersonate.
 */
export default async function AdminThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;

  const thread = await db.messageThread.findUnique({
    where: { id },
    include: {
      application: {
        include: {
          job: { select: { id: true, title: true, slug: true, company: { select: { id: true, slug: true, name: true, logoUrl: true } } } },
          candidate: { select: { firstName: true, lastName: true, slug: true, profilePhotoUrl: true, user: { select: { id: true, email: true } } } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              candidateProfile: { select: { firstName: true, lastName: true, profilePhotoUrl: true, slug: true } },
              employerProfile: { select: { company: { select: { name: true, logoUrl: true } } } },
            },
          },
        },
      },
    },
  });
  if (!thread) notFound();

  await audit({
    actorId: session.user.id,
    action: "admin.messages.thread_view",
    entity: "MessageThread",
    entityId: id,
    meta: { messageCount: thread.messages.length },
  });

  return (
    <AdminShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4">
        <div>
          <Link href="/admin/messages" className="text-sm text-emce-text-sec hover:underline">← All threads</Link>
          <h1 className="mt-1 text-dashboard text-emce-text md:text-3xl">
            {thread.application ? thread.application.job.title : "Cold outreach"}
          </h1>
          {thread.application && (
            <p className="mt-1 text-sm text-emce-text-sec">
              {thread.application.job.company.name} · application started {relativeTime(thread.application.appliedAt)}
            </p>
          )}
        </div>

        <Card className="bg-emce-light-soft text-sm text-emce-text">
          <strong>Read-only:</strong> This view is for moderation, abuse, and support reviews. Your visit has been written to the audit log.
        </Card>

        <Card>
          <h2 className="text-section text-emce-text">Participants</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {participantsFor(thread).map((p, i) => (
              <li key={i} className="flex items-center gap-3 rounded-md border border-emce-border bg-white p-3">
                <Avatar src={p.avatar} name={p.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-emce-text">{p.name}</p>
                  {p.email && (
                    <p className="text-hint text-emce-text-sec">{p.email}</p>
                  )}
                  {p.userId && (
                    <Link href={`/admin/users/${p.userId}`} className="text-xs font-bold text-emce-dark hover:underline">
                      Open user record →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-0">
          <div className="border-b border-emce-border px-5 py-3">
            <h2 className="text-section text-emce-text">Conversation</h2>
            <p className="text-hint text-emce-text-sec">
              {thread.messages.length} message{thread.messages.length === 1 ? "" : "s"} · started {formatDateTime(thread.createdAt)}
            </p>
          </div>
          {thread.messages.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-emce-text-sec">
              The thread exists but no messages have been sent yet.
            </div>
          ) : (
            <ul className="divide-y divide-emce-border">
              {thread.messages.map((m) => {
                const cp = m.sender.candidateProfile;
                const co = m.sender.employerProfile?.company;
                const name = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : (co?.name ?? m.sender.email);
                const avatar = cp?.profilePhotoUrl ?? co?.logoUrl ?? null;
                return (
                  <li key={m.id} className="flex gap-3 px-5 py-4">
                    <Avatar src={avatar} name={name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-bold text-emce-text">{name}</span>
                        <span className="text-[10px] uppercase text-emce-text-sec">{formatDateTime(m.createdAt)}</span>
                        {m.readAt ? (
                          <Badge variant="outline" className="text-[10px]">Read · {relativeTime(m.readAt)}</Badge>
                        ) : (
                          <Badge variant="warning" className="text-[10px]">Unread</Badge>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm text-emce-text">{m.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

function participantsFor(t: {
  application: {
    candidate: {
      firstName: string;
      lastName: string | null;
      profilePhotoUrl: string | null;
      slug: string;
      user: { id: string; email: string };
    };
    job: { company: { name: string; logoUrl: string | null; slug: string } };
  } | null;
  candidateUserId: string | null;
  employerUserId: string | null;
  messages: { sender: { id: string; email: string; candidateProfile: { firstName: string; lastName: string | null; profilePhotoUrl: string | null } | null; employerProfile: { company: { name: string; logoUrl: string | null } } | null } }[];
}): { name: string; avatar: string | null; email?: string; userId?: string }[] {
  if (t.application) {
    const cp = t.application.candidate;
    return [
      {
        name: `${cp.firstName} ${cp.lastName ?? ""}`.trim(),
        avatar: cp.profilePhotoUrl,
        email: cp.user.email,
        userId: cp.user.id,
      },
      {
        name: t.application.job.company.name,
        avatar: t.application.job.company.logoUrl,
      },
    ];
  }
  // Cold outreach — derive from sender list
  const seen = new Set<string>();
  return t.messages
    .map((m) => m.sender)
    .filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    })
    .map((s) => {
      const cp = s.candidateProfile;
      const co = s.employerProfile?.company;
      return {
        name: cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : (co?.name ?? s.email),
        avatar: cp?.profilePhotoUrl ?? co?.logoUrl ?? null,
        email: s.email,
        userId: s.id,
      };
    });
}
