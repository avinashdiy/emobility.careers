import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
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
  if (!session?.user) redirect(await signinNextUrl());

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
    // Hard cap on the per-page payload. Pre-cap this query loaded
    // every Application row for the job + a 6-field candidate join
    // per row + a nested `_count` subquery — viable at ~50 applicants,
    // OOMs at 5k+ on a viral job. 500 fits 7 stages of ~70 cards
    // each comfortably; recruiters who genuinely have more than that
    // should narrow via stage filter (paginating across pages would
    // break the drag-and-drop UX). Order by appliedAt-desc means the
    // 500 newest are the ones loaded.
    take: 500,
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
          phone: true,
          contactVisibility: true,
          // Wave A #1 — Open-to-Work / Hiring ring in the ATS card.
          openToWork: true,
          hiringNow: true,
          // Wave B #19 — trust pill row
          idVerificationStatus: true,
          _count: { select: { verifiedSkillBadges: true } },
          user: {
            select: {
              phone: true,
              emailVerifiedAt: true,
              phoneVerifiedAt: true,
              // Wave B #27 — last-active pill
              lastLoginAt: true,
            },
          },
        },
      },
    },
  });

  const board: PipelineApp[] = applications.map((a) => {
    // ATS contact-privacy gate. Every row here is an application to
    // a job at THIS recruiter's company (auth-gated above), so the
    // application relationship — the "legitimate need" signal —
    // exists for every candidate on this board.
    //
    // Updated 2026-05 to match the platform-wide policy floor: an
    // employer with an application relationship sees the candidate's
    // contact. The candidate's `contactVisibility` setting is no
    // longer consulted here because applying is itself the consent
    // signal. (Candidates who don't want their phone shared with the
    // employer simply shouldn't apply through the platform.) The old
    // logic that hid PRIVATE / CONNECTIONS in the ATS was a stricter
    // posture than the user-facing privacy policy promised, so it
    // confused recruiters into chasing contact via DMs unnecessarily.
    const phoneVisible = true;
    return {
      id: a.id,
      stage: a.stage,
      rating: a.rating,
      matchScore: a.matchScore,
      source: a.source,
      appliedAt: a.appliedAt.toISOString(),
      // Wave B #17 — preview the AI summary on the kanban card.
      // We slice to 160 chars; the full summary lives on the
      // application detail page. Null until the summariser fires.
      aiSummaryPreview:
        a.aiSummary && a.aiSummary.length > 0
          ? a.aiSummary.slice(0, 160) + (a.aiSummary.length > 160 ? "…" : "")
          : null,
      candidate: {
        id: a.candidate.id,
        slug: a.candidate.slug,
        firstName: a.candidate.firstName,
        lastName: a.candidate.lastName,
        headline: a.candidate.headline,
        profilePhotoUrl: a.candidate.profilePhotoUrl,
        isDIYguruVerified: a.candidate.isDIYguruVerified,
        phone: phoneVisible ? a.candidate.phone ?? a.candidate.user.phone ?? null : null,
        openToWork: a.candidate.openToWork,
        hiringNow: a.candidate.hiringNow,
        // Wave B #19 — trust pills
        idVerified: a.candidate.idVerificationStatus === "VERIFIED",
        emailVerified: !!a.candidate.user.emailVerifiedAt,
        phoneVerified: !!a.candidate.user.phoneVerifiedAt,
        verifiedSkillCount: a.candidate._count.verifiedSkillBadges,
        // Wave B #27 — last-active feed-in
        lastActiveAt: a.candidate.user.lastLoginAt
          ? a.candidate.user.lastLoginAt.toISOString()
          : null,
      },
    };
  });

  return (
    <EmployerShell>
      <div className="container max-w-7xl py-6">
        <div className="mb-4 flex flex-col gap-3 animate-fade-up sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link href={`/employer/jobs/${id}`} className="text-hint font-bold text-emce-text-sec hover:text-emce-dark">
              ← Job detail
            </Link>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
              📥 Applicant tracking
            </p>
            <h1 className="mt-0.5 text-2xl font-extrabold leading-tight tracking-tight text-emce-text md:text-[28px]">
              {job.title}
            </h1>
            <p className="mt-1 text-hint text-emce-text-sec">
              {job._count.applications} applications · drag cards across stages on desktop, or use the checkbox + bulk-move bar on mobile.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/employer/jobs/${id}/matches`}>AI matches</Link>
            </Button>
            <Badge variant={job.status === "OPEN" ? "live" : "outline"}>{job.status}</Badge>
          </div>
        </div>

        {applications.length === 0 ? (
          <Card variant="glow" className="p-10 text-center">
            <div className="text-4xl animate-float">📭</div>
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
