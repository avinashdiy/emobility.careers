import Link from "next/link";
import { redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { EmployerShell } from "@/components/layout/employer-shell";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Messages" };

export default async function EmployerMessages() {
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const threads = await db.messageThread.findMany({
    where: {
      application: {
        job: { companyId: employer.companyId },
      },
    },
    orderBy: { lastMessageAt: "desc" },
    include: {
      application: {
        include: {
          job: { select: { title: true } },
          candidate: { select: { firstName: true, lastName: true } },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return (
    <EmployerShell>
      <div className="container max-w-3xl py-10">
        <h1 className="text-dashboard text-emce-text">Messages</h1>
        {threads.length === 0 ? (
          <Card className="mt-6 p-10 text-center">
            <div className="text-4xl">💬</div>
            <p className="mt-3 text-section text-emce-text">No conversations yet</p>
          </Card>
        ) : (
          <ul className="mt-6 space-y-2">
            {threads.map((t) => (
              <li key={t.id}>
                <Link href={`/employer/messages/${t.id}`}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-emce-text">
                          {[t.application?.candidate.firstName, t.application?.candidate.lastName].filter(Boolean).join(" ")}
                        </div>
                        <div className="text-hint text-emce-text-sec">{t.application?.job.title}</div>
                        {t.messages[0] && (
                          <p className="mt-1 line-clamp-1 text-body text-emce-text-sec">
                            {t.messages[0].body}
                          </p>
                        )}
                      </div>
                      {t.lastMessageAt && (
                        <span className="text-hint text-emce-text-muted">{relativeTime(t.lastMessageAt)}</span>
                      )}
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </EmployerShell>
  );
}
