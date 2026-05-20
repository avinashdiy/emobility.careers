"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { isRouterControlError } from "@/lib/server-action-errors";
import { logger } from "@/lib/logger";
import { COMPLETENESS_THRESHOLDS } from "@/lib/profile-completeness";
import { evaluateFairEligibility } from "@/lib/fair-eligibility";
// Prisma is needed for both types (InputJsonValue) and runtime values
// (Prisma.JsonNull) so the value-import is mandatory here.
import { Prisma } from "@prisma/client";
import {
  parseApplicationQuestions,
  answersFromFormData,
} from "@/server/jobs/application-questions";
import { ApplicationSource, ApplicationStage } from "@prisma/client";

export async function applyToJob(formData: FormData) {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin?next=" + encodeURIComponent("/jobs/" + formData.get("jobId")));
  }
  // Owner gate, not role gate. Anyone with a CandidateProfile can
  // apply — applying is a self-action on YOUR personal page (the
  // application carries your CandidateProfile snapshot to the
  // recruiter). EMPLOYERs (recruiters) who are also job-seekers
  // need this path; the previous role===CANDIDATE check broke the
  // LinkedIn-style dual-persona flow and 403'd them silently.
  //
  // The actual ownership check is the `candidateId: profile.id`
  // clause on the unique constraint a few lines down — you can only
  // create an Application keyed to YOUR profile.
  const callerProfile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!callerProfile) {
    // No personal page yet — send through the onboarding flow which
    // lazy-creates one. Carry the job id forward so they land back
    // on the right page after completing onboarding.
    redirect(
      "/onboarding?next=" +
        encodeURIComponent("/job/" + (formData.get("jobId") ?? "")),
    );
  }

  // Recover the candidate's intended target before any throwable work
  // runs so the catch path below can land them somewhere sensible
  // (the originating /jobs/[id] page) instead of a generic 500.
  const jobIdRaw = formData.get("jobId");
  const fallbackHref =
    typeof jobIdRaw === "string" && jobIdRaw.length > 0
      ? `/jobs/${jobIdRaw}`
      : "/jobs";

  try {
    // `rateLimitOrThrow` raises a plain Error with `code: "RATE_LIMITED"`
    // when the limiter rejects. Without this catch the candidate would
    // see the global error page when they accidentally double-click
    // "Apply" or apply to >30 jobs in an hour — both common.
    await rateLimitOrThrow(`apply:${session.user.id}`, "apply");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    const retryAfter = (err as { retryAfter?: number }).retryAfter;
    redirect(
      `${fallbackHref}?error=` +
        encodeURIComponent(
          retryAfter
            ? `You're applying very quickly — try again in ${retryAfter}s.`
            : "Too many applications too fast — try again in a minute.",
        ),
    );
  }

  const jobIdParsed = z.string().min(1).safeParse(jobIdRaw);
  if (!jobIdParsed.success) {
    logger.warn(
      { userId: session.user.id, raw: jobIdRaw },
      "[applyToJob] missing/invalid jobId on submit",
    );
    redirect("/jobs?error=" + encodeURIComponent("Something went wrong picking that job — try again."));
  }
  const jobId = jobIdParsed.data;
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
    include: {
      // User-side phone is the SMS-OTP fallback for the fair
      // strict-eligibility check below.
      user: { select: { emailVerifiedAt: true, phone: true } },
    },
  });
  if (!profile) redirect("/onboarding");

  // Email verification gate — required to apply (plan: "Email verification mandatory before applying / posting").
  if (!profile.user.emailVerifiedAt) {
    redirect(`/jobs/${jobId}?error=` + encodeURIComponent("Verify your email before applying. Check /me for the link."));
  }

  // Strict gate for FAIR-attributed applications: 60% + CV +
  // phone + email. The carry-through `recruitmentDriveId` is the
  // signal "this application came through a fair page" — when
  // present, fair-eligibility rules apply. Direct /jobs/[id]
  // applications keep the existing 60% + email gate (no
  // back-compat break for the 50k existing users mid-flow).
  if (recruitmentDriveIdInput) {
    const eligibility = evaluateFairEligibility(
      {
        profileCompleteness: profile.profileCompleteness,
        resumeUrl: profile.resumeUrl,
        aiResumeUrl: profile.aiResumeUrl,
        phone: profile.phone,
      },
      profile.user,
    );
    if (!eligibility.ok) {
      const missingCsv = eligibility.missing.join(",");
      redirect(
        `/me/profile?incomplete=fair-apply&jobId=${jobId}` +
          `&pct=${eligibility.completeness}&missing=${encodeURIComponent(missingCsv)}`,
      );
    }
  } else if (profile.profileCompleteness < COMPLETENESS_THRESHOLDS.APPLY) {
    // Non-fair path: existing 60%-only gate stays.
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

  // #2 Structured application narrative — collect candidate answers
  // to the recruiter's job-specific prompts. Required questions
  // missing → bounce back to the job page with a clear error so the
  // candidate can answer and retry. Optional empties drop silently.
  const questions = parseApplicationQuestions(job.applicationQuestions);
  const { answers, missingRequired } = answersFromFormData(formData, questions);
  if (missingRequired.length > 0) {
    redirect(
      `/jobs/${jobId}?error=` +
        encodeURIComponent(
          `Please answer the required question${missingRequired.length === 1 ? "" : "s"} before applying.`,
        ),
    );
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
        // #2 — persist structured answers when the candidate gave at
        // least one. Empty object becomes null so ATS rendering
        // doesn't render a "(no answers)" placeholder unnecessarily.
        questionAnswers:
          Object.keys(answers).length > 0
            ? (answers as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
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

  // Notify the recruiter who posted the job. Use dispatchNotification
  // so the in-app row lands inline — recruiters reported "application
  // notifications don't work" when this depended on the BullMQ worker
  // round-trip.
  await dispatchNotification({
    userId: job.postedById,
    actorId: session.user.id,
    type: "application.received",
    title: `New application: ${job.title}`,
    body: `${profile.firstName} ${profile.lastName ?? ""} applied for ${job.title}.`,
    link: `/employer/jobs/${jobId}/ats`,
    channels: ["IN_APP", "EMAIL"],
    groupKey: `application.received:${jobId}`,
  });

  // Wave C #23 — fire automation rules. Best-effort: an automation
  // failure must NOT block the candidate's apply. Engine logs its own
  // errors per-rule.
  try {
    const { evaluateAutomations } = await import("@/server/automations/engine");
    await evaluateAutomations({
      applicationId: application.id,
      trigger: "APPLICATION_RECEIVED",
    });
  } catch (err) {
    logger.warn({ err, applicationId: application.id }, "[applyToJob] automation evaluation failed");
  }

  revalidatePath("/me/applications");
  redirect("/me/applications?notice=" + encodeURIComponent("Application submitted"));
}

export async function withdrawApplication(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const idParsed = z.string().min(1).safeParse(formData.get("id"));
  if (!idParsed.success) {
    redirect(
      "/me/applications?error=" +
        encodeURIComponent("Couldn't find that application — refresh and try again."),
    );
  }
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");
  await db.application.updateMany({
    where: { id: idParsed.data, candidateId: profile.id },
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
  try {
    await rateLimitOrThrow(`save:${session.user.id}`, "saveItem");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    redirect(
      "/jobs?error=" + encodeURIComponent("You're saving items very fast — slow down and try again."),
    );
  }
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");
  const jobIdParsed = z.string().min(1).safeParse(formData.get("jobId"));
  if (!jobIdParsed.success) {
    redirect("/jobs?error=" + encodeURIComponent("Couldn't find that job."));
  }
  const jobId = jobIdParsed.data;
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
  // #1 Mutual-interest auto-thread — fire-and-forget. If any
  // recruiter at this company has already saved this candidate,
  // mint a peer thread + notify both sides. Failures are logged
  // inside the helper and never bubble up to the save action.
  try {
    const { checkAndMintForCandidateSave } = await import(
      "@/server/messaging/mutual-interest"
    );
    await checkAndMintForCandidateSave({
      candidateProfileId: profile.id,
      jobId,
    });
  } catch (err) {
    logger.warn({ err }, "[saveJob] mutual-interest check failed");
  }
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
  const jobIdParsed = z.string().min(1).safeParse(formData.get("jobId"));
  if (!jobIdParsed.success) return;
  const jobId = jobIdParsed.data;
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
