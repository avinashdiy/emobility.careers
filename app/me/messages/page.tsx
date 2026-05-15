import Link from "next/link";
import { redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Messages" };

export default async function MessagesInbox() {
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());

  const threads = await db.messageThread.findMany({
    where: {
      OR: [
        { candidateUserId: session.user.id },
        { application: { candidate: { userId: session.user.id } } },
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

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="text-dashboard text-emce-text">Messages</h1>
      {threads.length === 0 ? (
        <Card className="mt-6 p-10 text-center">
          <div className="text-4xl">💬</div>
          <p className="mt-3 text-section text-emce-text">No conversations yet</p>
          <p className="mt-1 text-hint text-emce-text-sec">
            Recruiters can message you about your applications. Threads will appear here.
          </p>
        </Card>
      ) : (
        <ul className="emce-stagger mt-6 space-y-2">
          {threads.map((t) => (
            <li key={t.id}>
              <Link href={`/me/messages/${t.id}`}>
                <Card className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-emce-text">
                        {t.application?.job.title ?? "Conversation"}
                      </div>
                      <div className="text-hint text-emce-text-sec">
                        {t.application?.job.company.name}
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
          ))}
        </ul>
      )}
    </div>
  );
}
