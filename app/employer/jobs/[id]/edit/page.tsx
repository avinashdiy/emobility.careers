import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { EmployerShell } from "@/components/layout/employer-shell";
import { EmployerJobForm } from "@/components/employer/EmployerJobForm";

export const metadata = { title: "Edit job" };

/**
 * Recruiter-facing "Edit job" page. Mirrors /employer/jobs/new but
 * pre-fills from the existing JobPosting record and dispatches the
 * updateJob server action on submit. Cross-company tampering is
 * blocked by the `companyId` check below and re-asserted in the
 * server action.
 */
export default async function EditJobPage({
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
      evDomains: { include: { evDomain: { select: { slug: true } } } },
      skills: { include: { skill: { select: { name: true } } } },
    },
  });
  if (!job || job.companyId !== employer.companyId) notFound();

  const evDomains = await db.eVDomain.findMany({
    orderBy: { order: "asc" },
    select: { id: true, slug: true, name: true },
  });

  return (
    <EmployerShell>
      <div className="container max-w-3xl py-10">
        <div className="mb-4">
          <Link
            href={`/employer/jobs/${job.id}`}
            className="text-sm font-bold text-emce-text-sec hover:text-emce-dark"
          >
            ← Back to job
          </Link>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-dashboard text-emce-text">Edit job</h1>
            <p className="mt-1 text-sm text-emce-text-sec">
              Changes go live as soon as you publish. URL stays the same — inbound
              links and Google&apos;s index keep working.
            </p>
          </div>
        </div>

        <Card className="mt-6 p-6">
          <EmployerJobForm
            evDomains={evDomains}
            jobId={job.id}
            initial={{
              title: job.title,
              description: job.description,
              responsibilities: job.responsibilities,
              requirements: job.requirements,
              benefits: job.benefits,
              profileMode: job.profileMode,
              seniorityLevel: job.seniorityLevel,
              employmentType: job.employmentType,
              workMode: job.workMode,
              audience: job.audience,
              locations: job.locations,
              experienceMin: job.experienceMin,
              experienceMax: job.experienceMax,
              salaryMin: job.salaryMin ? job.salaryMin.toString() : null,
              salaryMax: job.salaryMax ? job.salaryMax.toString() : null,
              salaryPeriod: job.salaryPeriod,
              salaryHidden: job.salaryHidden,
              evDomainSlugs: job.evDomains.map((d) => d.evDomain.slug),
              skillNames: job.skills.map((s) => s.skill.name),
              status: job.status,
            }}
          />
        </Card>
      </div>
    </EmployerShell>
  );
}
