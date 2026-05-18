import Link from "next/link";
import { redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Messages" };

export default async function MessagesInbox() {
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());

  // Peer (member-to-member) threads use the canonical-pair scheme:
  // smaller userId → candidateUserId, larger → employerUserId. Without
  // the third OR branch below, a candidate on the "high" side of a
  // peer thread would never see their own conversation in the inbox.
  // applicationId === null narrows the branch to peer threads only,
  // so we don't accidentally surface recruiter-job threads to the
  // wrong side.
  const threads = await db.messageThread.findMany({
    where: {
      OR: [
        { candidateUserId: session.user.id },
        { application: { candidate: { userId: session.user.id } } },
        { applicationId: null, employerUserId: session.user.id },
      ],
    },
    orderBy: { lastMessageAt: "desc" },
    include: {
      application: {
        include: { job: { include: { company: true } } },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  // Resolve peer-thread display names. For application threads the
  // job + company already give the row a title; for peer threads we
  // need to look up the other party's name so the inbox shows
  // something more useful than "Conversation". One batched query.
  const peerUserIds = Array.from(
    new Set(
      threads
        .filter((t) => t.applicationId === null)
        .map((t) => (t.candidateUserId === session.user.id ? t.employerUserId : t.candidateUserId))
        .filter((id): id is string => !!id),
    ),
  );
  const peerUsers = peerUserIds.length
    ? await db.user.findMany({
        where: { id: { in: peerUserIds } },
        select: {
          id: true,
          name: true,
          email: true,
          candidateProfile: { select: { slug: true, headline: true } },
        },
      })
    : [];
  const peerById = new Map(peerUsers.map((u) => [u.id, u]));

  return (
    <div className="container max-w-3xl py-10">
      <div className="animate-fade-up">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
          💬 Conversations
        </p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight text-emce-text md:text-[28px]">
          Messages
        </h1>
      </div>
      {threads.length === 0 ? (
        <EmptyState
          variant="mesh"
          className="mt-6"
          icon="💬"
          title="No conversations yet"
          body="Recruiters can message you about your applications. Threads will appear here."
        />
      ) : (
        <ul className="emce-stagger mt-6 space-y-2">
          {threads.map((t) => {
            const peerUserId =
              t.applicationId === null
                ? t.candidateUserId === session.user.id
                  ? t.employerUserId
                  : t.candidateUserId
                : null;
            const peer = peerUserId ? peerById.get(peerUserId) : null;
            const title = t.application?.job.title ?? peer?.name ?? peer?.email ?? "Conversation";
            const subtitle = t.application?.job.company.name ?? peer?.candidateProfile?.headline ?? "Direct message";
            return (
            <li key={t.id}>
              <Link href={`/me/messages/${t.id}`}>
                <Card className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-emce-text">
                        {title}
                      </div>
                      <div className="text-hint text-emce-text-sec">
                        {subtitle}
                      </div>
                      {t.messages[0] && (
                        <p className="mt-2 line-clamp-1 text-body text-emce-text-sec">
                          {t.messages[0].body}
                        </p>
                      )}
                    </div>
                    {t.lastMessageAt && (
                      <span className="text-hint text-emce-text-muted">
                        {relativeTime(t.lastMessageAt)}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
