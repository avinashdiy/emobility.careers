"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notificationsQueue } from "@/lib/queues";
import { rateLimitOrThrow } from "@/lib/rate-limit";
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

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    include: { user: { select: { emailVerifiedAt: true } } },
  });
  if (!profile) redirect("/onboarding");

  // Email verification gate — required to apply (plan: "Email verification mandatory before applying / posting").
  if (!profile.user.emailVerifiedAt) {
    redirect(`/jobs/${jobId}?error=` + encodeURIComponent("Verify your email before applying. Check /me for the link."));
  }

  const job = await db.jobPosting.findUnique({
    where: { id: jobId },
    include: { company: true, postedBy: true },
  });
  if (!job || job.status !== "OPEN") {
    redirect(`/jobs/${jobId}?error=` + encodeURIComponent("This job is no longer accepting applications"));
  }

  const existing = await db.application.findUnique({
    where: { jobId_candidateId: { jobId, candidateId: profile.id } },
  });
  if (existing) {
    redirect(`/me/applications?notice=` + encodeURIComponent("You've already applied to this job"));
  }

  const application = await db.$transaction(async (tx) => {
    const app = await tx.application.create({
      data: {
        jobId,
        candidateId: profile.id,
        stage: ApplicationStage.APPLIED,
        source: ApplicationSource.DIRECT,
        coverLetter: coverLetter || null,
        resumeSnapshotUrl: profile.resumeUrl,
      },
    });
    await tx.jobPosting.update({
      where: { id: jobId },
      data: { appliesCount: { increment: 1 } },
    });
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
  await db.savedJob.upsert({
    where: { candidateId_jobId: { candidateId: profile.id, jobId } },
    create: { candidateId: profile.id, jobId },
    update: {},
  });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/me/saved");
  redirect(`/jobs/${jobId}?notice=` + encodeURIComponent("Saved to your list"));
}

export async function unsaveJob(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");
  const jobId = z.string().parse(formData.get("jobId"));
  await db.savedJob.deleteMany({
    where: { candidateId: profile.id, jobId },
  });
  revalidatePath("/me/saved");
  revalidatePath(`/jobs/${jobId}`);
}
