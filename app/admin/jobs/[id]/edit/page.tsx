import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminJobForm } from "@/components/admin/AdminJobForm";

export const metadata = { title: "Edit job — admin" };

/**
 * Admin "Edit this job" page. Shares the AdminJobForm with the
 * /admin/jobs/new path — same fields, same useActionState plumbing,
 * same rich-text editors. The form's `existingJob` prop puts it
 * into UPDATE mode (calls adminUpdateJob, hides the publishNow
 * buttons, locks the parent company).
 *
 * Status changes (Pause / Close / Open) deliberately do NOT live
 * here — they're on the moderation list's row buttons so a single
 * click flips state without round-tripping through the full form.
 */
export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;

  const [job, companies, evDomains] = await Promise.all([
    db.jobPosting.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        evDomains: { include: { evDomain: { select: { slug: true } } } },
        skills: { include: { skill: { select: { name: true } } } },
      },
    }),
    db.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    db.eVDomain.findMany({
      orderBy: { order: "asc" },
      select: { id: true, slug: true, name: true },
    }),
  ]);
  if (!job) notFound();

  const existingJob = {
    id: job.id,
    companyId: job.companyId,
    title: job.title,
    description: job.description,
    responsibilities: job.responsibilities,
    requirements: job.requirements,
    benefits: job.benefits,
    profileMode: job.profileMode,
    employmentType: job.employmentType,
    workMode: job.workMode,
    seniorityLevel: job.seniorityLevel,
    locations: job.locations,
    audience: job.audience,
    experienceMin: job.experienceMin,
    experienceMax: job.experienceMax,
    salaryMin: job.salaryMin?.toString() ?? null,
    salaryMax: job.salaryMax?.toString() ?? null,
    salaryHidden: job.salaryHidden,
    applicationUrl: job.applicationUrl,
    applicationEmail: job.applicationEmail,
    evDomainSlugs: job.evDomains.map((x) => x.evDomain.slug),
    skillNames: job.skills.map((x) => x.skill.name),
  };

  return (
    <AdminShell>
      <div className="container max-w-3xl py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-dashboard text-emce-text">Edit job</h1>
              <Badge variant={job.status === "OPEN" ? "default" : "outline"} size="sm">
                {job.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-emce-text-sec">
              {job.title} ·{" "}
              <Link
                href={`/job/${job.slug}`}
                target="_blank"
                rel="noopener"
                className="font-bold text-emce-dark hover:underline"
              >
                View public page ↗
              </Link>
            </p>
          </div>
          <Link
            href="/admin/jobs"
            className="shrink-0 text-sm font-bold text-emce-dark hover:underline"
          >
            ← Back to job moderation
          </Link>
        </div>

        <Card className="p-6">
          <AdminJobForm
            companies={companies}
            evDomains={evDomains}
            existingJob={existingJob}
          />
        </Card>

        <p className="mt-3 text-hint text-emce-text-sec">
          To change the job&apos;s status (pause / close / re-open), use the buttons on the
          moderation list — that change is independent of the edit form.
        </p>
      </div>
    </AdminShell>
  );
}
