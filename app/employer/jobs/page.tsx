import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmployerShell } from "@/components/layout/employer-shell";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { updateJobStatus } from "@/server/employer/actions";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "My jobs" };

export default async function EmployerJobsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const jobs = await db.jobPosting.findMany({
    where: { companyId: employer.companyId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { applications: true } } },
  });

  return (
    <EmployerShell>
      <div className="container max-w-6xl py-10 space-y-6">
        <PageHeader
          eyebrow="Hiring"
          title="Jobs"
          subtitle={`${jobs.length} ${jobs.length === 1 ? "role" : "roles"} on file`}
          actions={
            <Button asChild>
              <Link href="/employer/jobs/new">+ New job</Link>
            </Button>
          }
        />

        {jobs.length === 0 ? (
          <EmptyState
            icon="📝"
            title="No jobs yet"
            body="Post your first job to start matching with candidates."
            action={
              <Button asChild>
                <Link href="/employer/jobs/new">Post a job →</Link>
              </Button>
            }
          />
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-emce-border">
              {jobs.map((j) => (
                <li key={j.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/employer/jobs/${j.id}`}
                        className="font-bold text-emce-text hover:underline"
                      >
                        {j.title}
                      </Link>
                      <Badge variant={
                        j.status === "OPEN" ? "success"
                        : j.status === "DRAFT" ? "outline"
                        : "default"
                      }>{j.status}</Badge>
                      {/* Audience cue — DIYGURU_ONLY listings need to be
                          obvious to recruiters managing many jobs since
                          they obey different rules (forced salary
                          disclosure, restricted browse). */}
                      {j.audience === "DIYGURU_ONLY" && (
                        <Badge variant="verified" className="text-[10px]">⭐ DIYguru exclusive</Badge>
                      )}
                      {j.audience === "INVITE_ONLY" && (
                        <Badge variant="warning" className="text-[10px]">🔒 Invite-only</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-hint text-emce-text-sec">
                      {j._count.applications} applications · {j.workMode} · {j.profileMode}
                      <span className="ml-2 text-emce-text-muted">Updated {relativeTime(j.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/employer/jobs/${j.id}/ats`}>ATS ({j._count.applications})</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/employer/jobs/${j.id}/matches`}>Matches</Link>
                    </Button>
                    {j.status === "DRAFT" ? (
                      <form action={updateJobStatus}>
                        <input type="hidden" name="id" value={j.id} />
                        <input type="hidden" name="status" value="OPEN" />
                        <Button type="submit" variant="default" size="sm">Publish</Button>
                      </form>
                    ) : j.status === "OPEN" ? (
                      <form action={updateJobStatus}>
                        <input type="hidden" name="id" value={j.id} />
                        <input type="hidden" name="status" value="PAUSED" />
                        <Button type="submit" variant="ghost" size="sm">Pause</Button>
                      </form>
                    ) : (
                      <form action={updateJobStatus}>
                        <input type="hidden" name="id" value={j.id} />
                        <input type="hidden" name="status" value="OPEN" />
                        <Button type="submit" variant="default" size="sm">Resume</Button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </EmployerShell>
  );
}
