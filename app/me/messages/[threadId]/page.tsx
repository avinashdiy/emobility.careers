import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { ChatThread } from "@/components/chat/ChatThread";

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/signin");

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
  // Authorization
  if (
    thread.candidateUserId !== session.user.id &&
    thread.application?.candidate.userId !== session.user.id &&
    session.user.role !== "ADMIN"
  ) {
    redirect("/403");
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
          }))}
          pusherKey={env.NEXT_PUBLIC_SOKETI_KEY}
          pusherHost={env.NEXT_PUBLIC_SOKETI_HOST}
          pusherPort={env.NEXT_PUBLIC_SOKETI_PORT}
        />
      </div>
    </div>
  );
}
