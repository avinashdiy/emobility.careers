import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmployerShell } from "@/components/layout/employer-shell";
import { VerifyEmailBanner } from "@/components/auth/VerifyEmailBanner";

export const metadata = { title: "Employer dashboard" };

export default async function EmployerHome() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/employer");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      company: { include: { _count: { select: { jobs: true } } } },
      user: { select: { email: true, emailVerifiedAt: true } },
    },
  });
  if (!employer) redirect("/employer/onboarding");

  const openJobs = await db.jobPosting.count({
    where: { companyId: employer.companyId, status: "OPEN" },
  });
  const totalApplications = await db.application.count({
    where: { job: { companyId: employer.companyId } },
  });
  const newThisWeek = await db.application.count({
    where: {
      job: { companyId: employer.companyId },
      appliedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  return (
    <EmployerShell>
      <div className="container max-w-6xl py-10">
        {!employer.user.emailVerifiedAt && <VerifyEmailBanner email={employer.user.email} />}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-dashboard text-emce-text">Welcome to {employer.company.name}</h1>
            <p className="mt-1 text-sm text-emce-text-sec">
              {employer.designation}
              {employer.company.verificationStatus !== "VERIFIED" && (
                <Badge variant="warning" className="ml-3">{employer.company.verificationStatus} verification</Badge>
              )}
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/employer/jobs/new">+ Post a job</Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Stat value={openJobs} label="Open jobs" />
          <Stat value={totalApplications} label="Total applications" />
          <Stat value={newThisWeek} label="New this week" />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 p-6">
            <h2 className="text-section text-emce-text">Recent jobs</h2>
            <RecentJobs companyId={employer.companyId} />
          </Card>
          <Card className="p-6">
            <h2 className="text-section text-emce-text">Quick actions</h2>
            <div className="mt-3 space-y-2">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/employer/jobs/new">📝 Post a new job</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/employer/candidates">🔍 Search candidates</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href="/employer/company">🏢 Edit company page</Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </EmployerShell>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Card className="p-5">
      <div className="text-3xl font-extrabold text-emce-dark">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-emce-text-muted">{label}</div>
    </Card>
  );
}

async function RecentJobs({ companyId }: { companyId: string }) {
  const jobs = await db.jobPosting.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { _count: { select: { applications: true } } },
  });
  if (jobs.length === 0) {
    return (
      <p className="mt-4 rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
        No jobs yet. Post your first job to start receiving applications.
      </p>
    );
  }
  return (
    <ul className="mt-4 divide-y divide-emce-border">
      {jobs.map((j) => (
        <li key={j.id} className="flex items-center justify-between py-3">
          <div>
            <Link href={`/employer/jobs/${j.id}`} className="font-bold text-emce-text hover:underline">
              {j.title}
            </Link>
            <div className="text-hint text-emce-text-sec">
              <Badge variant={j.status === "OPEN" ? "success" : "outline"} className="mr-2">{j.status}</Badge>
              {j._count.applications} applications · {j.workMode}
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/employer/jobs/${j.id}/ats`}>Open ATS</Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}
