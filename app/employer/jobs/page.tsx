import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmployerShell } from "@/components/layout/employer-shell";
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
      <div className="container max-w-6xl py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-dashboard text-emce-text">Jobs</h1>
          <Button asChild>
            <Link href="/employer/jobs/new">+ New job</Link>
          </Button>
        </div>

        {jobs.length === 0 ? (
          <Card className="p-10 text-center">
            <div className="text-4xl">📝</div>
            <h2 className="mt-3 text-section text-emce-text">No jobs yet</h2>
            <p className="mt-1 text-hint text-emce-text-sec">
              Post your first job to start matching with candidates.
            </p>
            <Button asChild className="mt-4">
              <Link href="/employer/jobs/new">Post a job</Link>
            </Button>
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-emce-border">
              {jobs.map((j) => (
                <li key={j.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
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
