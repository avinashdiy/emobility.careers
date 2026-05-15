import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { ChatThread } from "@/components/chat/ChatThread";
import { EmployerShell } from "@/components/layout/employer-shell";

export default async function EmployerMessageThread({
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
        include: {
          job: { include: { company: { include: { team: true } } } },
          candidate: true,
        },
      },
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
  if (!thread) notFound();
  if (
    session.user.role !== "ADMIN" &&
    !thread.application?.job.company.team.some((t) => t.userId === session.user.id)
  ) {
    redirect("/403");
  }

  return (
    <EmployerShell>
      <div className="container max-w-3xl py-6">
        <Link href="/employer/messages" className="text-hint font-bold text-emce-text-sec hover:text-emce-dark">
          ← Inbox
        </Link>
        <Card className="mt-3 p-4">
          <h1 className="text-section text-emce-text">
            {[thread.application?.candidate.firstName, thread.application?.candidate.lastName]
              .filter(Boolean)
              .join(" ")}{" "}
            <span className="text-emce-text-sec">— {thread.application?.job.title}</span>
          </h1>
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
            pusherTls={env.NEXT_PUBLIC_SOKETI_TLS}
          />
        </div>
      </div>
    </EmployerShell>
  );
}
