import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmployerShell } from "@/components/layout/employer-shell";
import { formatSalaryRange, relativeTime } from "@/lib/utils";
import { htmlOrFallback } from "@/lib/cms/job-sanitize";

export default async function EmployerJobDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  const { id } = await params;

  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const job = await db.jobPosting.findUnique({
    where: { id },
    include: {
      company: true,
      evDomains: { include: { evDomain: true } },
      skills: { include: { skill: true } },
      _count: { select: { applications: true } },
    },
  });
  if (!job || job.companyId !== employer.companyId) notFound();

  return (
    <EmployerShell>
      <div className="container max-w-4xl py-10">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/employer/jobs" className="text-sm font-bold text-emce-text-sec hover:text-emce-dark">
            ← All jobs
          </Link>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              {/* Link to the canonical slug URL, not the legacy
                  `/jobs/<id>` redirect alias. The redirect route
                  exists only for backwards-compatible inbound links
                  (search-engine indexes, old shares); routing our
                  own UI through it added a network hop AND was the
                  failure point recruiters reported as "View public
                  shows Page Not Found" — easier to skip the redirect
                  than to debug why it intermittently misbehaves on
                  prod. */}
              <Link href={`/job/${job.slug}`}>View public</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/employer/jobs/${job.id}/edit`}>Edit</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/employer/jobs/${job.id}/ats`}>Open ATS ({job._count.applications})</Link>
            </Button>
          </div>
        </div>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-emce-text">{job.title}</h1>
            <Badge variant={job.status === "OPEN" ? "success" : "outline"}>{job.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-emce-text-sec">
            {job.profileMode} · {job.seniorityLevel} · {job.workMode} · {job.locations.join(", ") || "—"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {job.evDomains.map((d) => (
              <Badge key={d.evDomain.slug} variant="success">{d.evDomain.name}</Badge>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Applications" value={job._count.applications} />
            <Stat label="Views" value={job.viewsCount} />
            <Stat label="Salary" value={formatSalaryRange(
              job.salaryMin ? Number(job.salaryMin) : null,
              job.salaryMax ? Number(job.salaryMax) : null,
              job.salaryCurrency,
              job.salaryPeriod,
            )} />
            <Stat label="Updated" value={relativeTime(job.updatedAt)} />
          </div>
        </Card>

        <Card className="mt-4 p-6">
          <h2 className="text-section text-emce-text">Description</h2>
          <div
            className="prose prose-sm mt-2 max-w-none text-body text-emce-text-sec"
            dangerouslySetInnerHTML={{ __html: htmlOrFallback(job.description) }}
          />
        </Card>

        {job.responsibilities && (
          <Card className="mt-4 p-6">
            <h2 className="text-section text-emce-text">Responsibilities</h2>
            <div
              className="prose prose-sm mt-2 max-w-none text-body text-emce-text-sec"
              dangerouslySetInnerHTML={{ __html: htmlOrFallback(job.responsibilities) }}
            />
          </Card>
        )}

        {job.requirements && (
          <Card className="mt-4 p-6">
            <h2 className="text-section text-emce-text">Requirements</h2>
            <div
              className="prose prose-sm mt-2 max-w-none text-body text-emce-text-sec"
              dangerouslySetInnerHTML={{ __html: htmlOrFallback(job.requirements) }}
            />
          </Card>
        )}

        {job.skills.length > 0 && (
          <Card className="mt-4 p-6">
            <h2 className="text-section text-emce-text">Required skills</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {job.skills.map((s) => (
                <Badge key={s.skill.id} variant="default">{s.skill.name}</Badge>
              ))}
            </div>
          </Card>
        )}
      </div>
    </EmployerShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-emce-light-soft p-3">
      <div className="text-xs uppercase tracking-wide text-emce-text-muted">{label}</div>
      <div className="text-base font-bold text-emce-text">{value}</div>
    </div>
  );
}
