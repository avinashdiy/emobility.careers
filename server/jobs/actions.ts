"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notificationsQueue } from "@/lib/queues";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { COMPLETENESS_THRESHOLDS } from "@/lib/profile-completeness";
import { ApplicationSource, ApplicationStage } from "@prisma/client";

export async function applyToJob(formData: FormData) {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin?next=" + encodeURIComponent("/jobs/" + formData.get("jobId")));
  }
  if (session.user.role !== "CANDIDATE" && session.user.role !== "ADMIN") {
    redirect("/403");
  }

  await rateLimitOrThrow(`apply:${session.user.id}`, "apply");

  const jobId = z.string().parse(formData.get("jobId"));
  const coverLetter = String(formData.get("coverLetter") ?? "").slice(0, 4000);
  // Optional fair attribution. When the candidate landed on the
  // job from a /fairs/[slug] page, the page passes the drive id
  // through a hidden input. We validate (must be a real drive
  // that this job is actually attached to) and silently drop a
  // bogus value rather than 4xx — the apply flow shouldn't break
  // if the URL was tampered with.
  const recruitmentDriveIdRaw = formData.get("recruitmentDriveId");
  const recruitmentDriveIdInput =
    typeof recruitmentDriveIdRaw === "string" && recruitmentDriveIdRaw.length > 0
      ? recruitmentDriveIdRaw
      : null;

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    include: { user: { select: { emailVerifiedAt: true } } },
  });
  if (!profile) redirect("/onboarding");

  // Email verification gate — required to apply (plan: "Email verification mandatory before applying / posting").
  if (!profile.user.emailVerifiedAt) {
    redirect(`/jobs/${jobId}?error=` + encodeURIComponent("Verify your email before applying. Check /me for the link."));
  }

  // Profile-completeness gate — applications require the threshold
  // defined in COMPLETENESS_THRESHOLDS.APPLY (60% as of 2026-05; was
  // 90% — see lib/profile-completeness.ts for the rationale). The
  // calculated value is denormalised on the row, kept fresh by every
  // profile-edit action via recalcCompleteness().
  if (profile.profileCompleteness < COMPLETENESS_THRESHOLDS.APPLY) {
    redirect(
      `/me/profile?incomplete=apply&pct=${profile.profileCompleteness}&jobId=${jobId}`,
    );
  }

  const job = await db.jobPosting.findUnique({
    where: { id: jobId },
    include: { company: true, postedBy: true },
  });
  if (!job || job.status !== "OPEN") {
    redirect(`/jobs/${jobId}?error=` + encodeURIComponent("This job is no longer accepting applications"));
  }

  // Audience gate — DIYGURU_ONLY jobs are blocked at apply time for
  // candidates without isDIYguruVerified. The job detail page also
  // hides DIYGURU_ONLY listings from non-students, so this is
  // belt-and-braces for direct URL hits.
  if (
    job.audience === "DIYGURU_ONLY" &&
    !profile.isDIYguruVerified &&
    session.user.role !== "ADMIN"
  ) {
    redirect(
      `/jobs/${jobId}?error=` +
        encodeURIComponent(
          "This role is reserved for DIYguru-verified students. Get verified at /diyguru and try again.",
        ),
    );
  }
  if (job.audience === "INVITE_ONLY") {
    // INVITE_ONLY needs an existing AI_INVITED application (created via
    // bulkInviteCandidates from the recruiter's matches list). If we
    // got here without one, reject.
    redirect(
      `/jobs/${jobId}?error=` +
        encodeURIComponent("This role is invite-only — recruiters reach out directly."),
    );
  }

  const existing = await db.application.findUnique({
    where: { jobId_candidateId: { jobId, candidateId: profile.id } },
  });
  if (existing) {
    redirect(`/me/applications?notice=` + encodeURIComponent("You've already applied to this job"));
  }

  // Validate the recruitment-drive attribution if the form claimed
  // one. The drive must (a) exist, (b) be in OPEN/IN_PROGRESS, and
  // (c) actually have this job attached. Otherwise treat as DIRECT.
  let resolvedDriveId: string | null = null;
  if (recruitmentDriveIdInput) {
    const driveJob = await db.recruitmentDriveJob.findUnique({
      where: {
        driveId_jobId: { driveId: recruitmentDriveIdInput, jobId },
      },
      select: { drive: { select: { id: true, status: true } } },
    });
    if (
      driveJob?.drive &&
      (driveJob.drive.status === "OPEN" || driveJob.drive.status === "IN_PROGRESS")
    ) {
      resolvedDriveId = driveJob.drive.id;
    }
  }

  const application = await db.$transaction(async (tx) => {
    const app = await tx.application.create({
      data: {
        jobId,
        candidateId: profile.id,
        stage: ApplicationStage.APPLIED,
        // CAMPUS source when fair-attributed, DIRECT otherwise. This
        // keeps the existing source-based analytics + the per-fair
        // ATS filter both work without us inventing a new source.
        source: resolvedDriveId ? ApplicationSource.CAMPUS : ApplicationSource.DIRECT,
        recruitmentDriveId: resolvedDriveId,
        coverLetter: coverLetter || null,
        resumeSnapshotUrl: profile.resumeUrl,
      },
    });
    await tx.jobPosting.update({
      where: { id: jobId },
      data: { appliesCount: { increment: 1 } },
    });
    if (resolvedDriveId) {
      await tx.recruitmentDrive.update({
        where: { id: resolvedDriveId },
        data: { applicationsCount: { increment: 1 } },
      });
    }
    await tx.stageHistory.create({
      data: {
        applicationId: app.id,
        toStage: ApplicationStage.APPLIED,
        byUserId: session.user.id,
      },
    });
    return app;
  });

  // Notify the recruiter who posted the job
  await notificationsQueue.add("application-received", {
    userId: job.postedById,
    type: "application.received",
    title: `New application: ${job.title}`,
    body: `${profile.firstName} ${profile.lastName ?? ""} applied for ${job.title}.`,
    link: `/employer/jobs/${jobId}/ats`,
    channels: ["IN_APP", "EMAIL"],
  });

  revalidatePath("/me/applications");
  redirect("/me/applications?notice=" + encodeURIComponent("Application submitted"));
}

export async function withdrawApplication(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const id = z.string().parse(formData.get("id"));
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");
  await db.application.updateMany({
    where: { id, candidateId: profile.id },
    data: {
      withdrawnAt: new Date(),
      stage: ApplicationStage.WITHDRAWN,
    },
  });
  revalidatePath("/me/applications");
  redirect("/me/applications?notice=" + encodeURIComponent("Application withdrawn"));
}

export async function saveJob(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  await rateLimitOrThrow(`save:${session.user.id}`, "saveItem");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");
  const jobId = z.string().parse(formData.get("jobId"));
  const job = await db.jobPosting.findUnique({
    where: { id: jobId },
    select: { slug: true },
  });
  if (!job) redirect("/jobs?error=" + encodeURIComponent("Job not found"));
  await db.savedJob.upsert({
    where: { candidateId_jobId: { candidateId: profile.id, jobId } },
    create: { candidateId: profile.id, jobId },
    update: {},
  });
  // Revalidate the canonical slug URL — `/jobs/{id}` no longer renders
  // its own content (it 308-redirects), so its cache key is irrelevant.
  revalidatePath(`/job/${job.slug}`);
  revalidatePath("/me/saved");
  redirect(`/job/${job.slug}?notice=` + encodeURIComponent("Saved to your list"));
}

export async function unsaveJob(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");
  const jobId = z.string().parse(formData.get("jobId"));
  const job = await db.jobPosting.findUnique({
    where: { id: jobId },
    select: { slug: true },
  });
  await db.savedJob.deleteMany({
    where: { candidateId: profile.id, jobId },
  });
  revalidatePath("/me/saved");
  if (job) revalidatePath(`/job/${job.slug}`);
}
