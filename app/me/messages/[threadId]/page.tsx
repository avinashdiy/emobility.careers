import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { ChatThread } from "@/components/chat/ChatThread";
import { realtime, channels as rtChannels, events as rtEvents } from "@/lib/realtime";
import { logger } from "@/lib/logger";

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());

  const thread = await db.messageThread.findUnique({
    where: { id: threadId },
    include: {
      application: {
        include: { job: { include: { company: true } }, candidate: true },
      },
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
  if (!thread) notFound();
  // Authorization. Peer threads use the canonical-pair scheme
  // (smaller userId → candidateUserId, larger → employerUserId), so
  // for a peer thread (applicationId === null) the viewer can legitimately
  // be on EITHER slot. Without the third branch below, the high-side
  // peer would 403 on their own conversation.
  const isPeerHighSide =
    thread.applicationId === null && thread.employerUserId === session.user.id;
  if (
    thread.candidateUserId !== session.user.id &&
    thread.application?.candidate.userId !== session.user.id &&
    !isPeerHighSide &&
    session.user.role !== "ADMIN"
  ) {
    redirect("/403");
  }

  // Mark every incoming (not-from-me, still-unread) message as read.
  // `updateMany` is one query regardless of how many messages there
  // are, and we only fire the realtime push when at least one row
  // was actually flipped — saves a no-op event on every refresh.
  const readAt = new Date();
  const marked = await db.message.updateMany({
    where: { threadId: thread.id, senderId: { not: session.user.id }, readAt: null },
    data: { readAt },
  });
  if (marked.count > 0) {
    try {
      await realtime.trigger(
        rtChannels.thread(thread.id),
        rtEvents.messageRead,
        { at: readAt.toISOString(), byUserId: session.user.id },
      );
    } catch (err) {
      logger.warn({ err, threadId }, "[messages] realtime read receipt failed");
    }
  }

  return (
    <div className="container max-w-3xl py-6">
      <Link href="/me/messages" className="text-hint font-bold text-emce-text-sec hover:text-emce-dark">
        ← Inbox
      </Link>
      <Card className="mt-3 p-4">
        <h1 className="text-section text-emce-text">
          {thread.application?.job.title ?? "Conversation"}
        </h1>
        <p className="text-hint text-emce-text-sec">
          {thread.application?.job.company.name}
        </p>
      </Card>
      <div className="mt-4">
        <ChatThread
          threadId={thread.id}
          selfUserId={session.user.id}
          initialMessages={thread.messages.map((m) => ({
            id: m.id,
            senderId: m.senderId,
            body: m.body,
            createdAt: m.createdAt.toISOString(),
            // Reflect the read pass we just did: any message we marked
            // read in this request gets the fresh timestamp; older
            // already-read rows keep their original. Self-messages
            // also surface their stored readAt so the sender sees
            // "Seen" if the recipient has opened the thread before.
            readAt:
              m.senderId === session.user.id
                ? m.readAt?.toISOString() ?? null
                : (m.readAt ?? readAt).toISOString(),
          }))}
          pusherKey={env.NEXT_PUBLIC_SOKETI_KEY}
          pusherHost={env.NEXT_PUBLIC_SOKETI_HOST}
          pusherPort={env.NEXT_PUBLIC_SOKETI_PORT}
          pusherTls={env.NEXT_PUBLIC_SOKETI_TLS}
        />
      </div>
    </div>
  );
}
