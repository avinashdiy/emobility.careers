import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployerShell } from "@/components/layout/employer-shell";
import { PipelineBoard, type PipelineApp } from "@/components/ats/PipelineBoard";

export default async function ATSPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const job = await db.jobPosting.findUnique({
    where: { id },
    include: { _count: { select: { applications: true } } },
  });
  if (!job) notFound();
  if (session.user.role !== "ADMIN" && job.companyId !== employer.companyId) redirect("/403");

  const applications = await db.application.findMany({
    where: { jobId: id },
    orderBy: { appliedAt: "desc" },
    include: {
      candidate: {
        select: {
          id: true,
          slug: true,
          firstName: true,
          lastName: true,
          headline: true,
          profilePhotoUrl: true,
          isDIYguruVerified: true,
        },
      },
    },
  });

  const board: PipelineApp[] = applications.map((a) => ({
    id: a.id,
    stage: a.stage,
    rating: a.rating,
    matchScore: a.matchScore,
    source: a.source,
    appliedAt: a.appliedAt.toISOString(),
    candidate: a.candidate,
  }));

  return (
    <EmployerShell>
      <div className="container max-w-7xl py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Link href={`/employer/jobs/${id}`} className="text-hint font-bold text-emce-text-sec hover:text-emce-dark">
              ← Job detail
            </Link>
            <h1 className="mt-1 text-dashboard text-emce-text">{job.title} — ATS</h1>
            <p className="text-hint text-emce-text-sec">
              {job._count.applications} applications · drag cards across stages to move them.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/employer/jobs/${id}/matches`}>AI matches</Link>
            </Button>
            <Badge variant={job.status === "OPEN" ? "success" : "outline"}>{job.status}</Badge>
          </div>
        </div>

        {applications.length === 0 ? (
          <Card className="p-10 text-center">
            <div className="text-4xl">📭</div>
            <h2 className="mt-3 text-section text-emce-text">No applications yet</h2>
            <p className="mt-1 text-hint text-emce-text-sec">
              Once candidates apply, they&apos;ll show up here. Use AI matches to invite candidates manually.
            </p>
            <Button asChild className="mt-4">
              <Link href={`/employer/jobs/${id}/matches`}>Find candidates →</Link>
            </Button>
          </Card>
        ) : (
          <PipelineBoard applications={board} jobId={id} />
        )}
      </div>
    </EmployerShell>
  );
}
