"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notificationsQueue } from "@/lib/queues";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { ApplicationStage, NoteVisibility } from "@prisma/client";

async function requireEmployerForApplication(applicationId: string) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") redirect("/403");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");
  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      job: { select: { companyId: true, title: true, id: true } },
      candidate: { select: { userId: true, firstName: true, lastName: true } },
    },
  });
  if (!application) redirect("/employer");
  if (session.user.role !== "ADMIN" && application.job.companyId !== employer.companyId) {
    redirect("/403");
  }
  return { session, employer, application };
}

export async function moveStage(formData: FormData) {
  const id = z.string().parse(formData.get("applicationId"));
  const toStage = z.nativeEnum(ApplicationStage).parse(formData.get("toStage"));
  const reason = String(formData.get("reason") ?? "");

  const { session, application } = await requireEmployerForApplication(id);
  await rateLimitOrThrow(`ats:${session.user.id}`, "ats");

  if (application.stage === toStage) return;

  await db.$transaction([
    db.application.update({
      where: { id },
      data: {
        stage: toStage,
        rejectedReason: toStage === ApplicationStage.REJECTED ? reason : null,
      },
    }),
    db.stageHistory.create({
      data: {
        applicationId: id,
        fromStage: application.stage,
        toStage,
        byUserId: session.user.id,
        reason: reason || null,
      },
    }),
  ]);

  // Notify candidate
  await notificationsQueue.add("stage-change", {
    userId: application.candidate.userId,
    type: "application.stage_change",
    title: stageMessage(application.job.title, toStage),
    body: stageBody(toStage, reason),
    link: "/me/applications",
    channels: ["IN_APP", "EMAIL"],
  });

  revalidatePath(`/employer/jobs/${application.job.id}/ats`);
  revalidatePath(`/employer/applications/${id}`);
}

function stageMessage(title: string, stage: ApplicationStage): string {
  switch (stage) {
    case "SHORTLISTED":
      return `🎉 Shortlisted for ${title}`;
    case "INTERVIEW":
      return `📞 Interview scheduled — ${title}`;
    case "OFFER":
      return `💼 Offer received — ${title}`;
    case "HIRED":
      return `🚀 You're hired! — ${title}`;
    case "REJECTED":
      return `Update on your application — ${title}`;
    default:
      return `Update on your application — ${title}`;
  }
}
function stageBody(stage: ApplicationStage, reason: string): string {
  if (stage === ApplicationStage.REJECTED) {
    return reason ? `The recruiter shared this feedback: ${reason}` : "Unfortunately you weren't selected. Keep applying — your next role is out there.";
  }
  return `Your application moved to ${stage.toLowerCase()}. Open your dashboard for details.`;
}

export async function rateApplication(formData: FormData) {
  const id = z.string().parse(formData.get("applicationId"));
  const rating = z.coerce.number().int().min(1).max(5).parse(formData.get("rating"));
  const { application } = await requireEmployerForApplication(id);
  await db.application.update({ where: { id }, data: { rating } });
  revalidatePath(`/employer/jobs/${application.job.id}/ats`);
  revalidatePath(`/employer/applications/${id}`);
}

export async function addNote(formData: FormData) {
  const id = z.string().parse(formData.get("applicationId"));
  const body = z.string().min(1).max(4000).parse(formData.get("body"));
  const visibility = z.nativeEnum(NoteVisibility).parse(formData.get("visibility") ?? "TEAM");
  const { session, application } = await requireEmployerForApplication(id);
  await rateLimitOrThrow(`ats:${session.user.id}`, "ats");
  await db.applicationNote.create({
    data: {
      applicationId: id,
      authorId: session.user.id,
      body,
      visibility,
    },
  });
  revalidatePath(`/employer/applications/${id}`);
  revalidatePath(`/employer/jobs/${application.job.id}/ats`);
}

export async function bulkMoveStage(formData: FormData) {
  const ids = formData.getAll("ids").map(String);
  const toStage = z.nativeEnum(ApplicationStage).parse(formData.get("toStage"));
  if (ids.length === 0) return;

  for (const id of ids) {
    try {
      const fakeData = new FormData();
      fakeData.append("applicationId", id);
      fakeData.append("toStage", toStage);
      await moveStage(fakeData);
    } catch {
      // continue on per-row errors
    }
  }
}
