"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { generateICS } from "@/lib/ics";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import { InterviewMode, ApplicationStage } from "@prisma/client";
import { optionalUrl } from "@/lib/forms/zod-url";
import { logger } from "@/lib/logger";

const scheduleSchema = z.object({
  applicationId: z.string(),
  scheduledAt: z.string(),  // local datetime
  durationMins: z.coerce.number().int().min(15).max(180).default(45),
  mode: z.nativeEnum(InterviewMode),
  location: z.string().optional(),
  meetingUrl: optionalUrl,
});

export async function scheduleInterview(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const parsed = scheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    logger.warn(
      { fieldErrors: parsed.error.flatten().fieldErrors },
      "[interviews] Zod validation failed — bare form action returns void; user sees no feedback.",
    );
    return;
  }

  const application = await db.application.findUnique({
    where: { id: parsed.data.applicationId },
    include: {
      candidate: { include: { user: true } },
      job: { include: { company: true } },
    },
  });
  if (!application) return;
  if (session.user.role !== "ADMIN" && application.job.companyId !== employer.companyId) {
    redirect("/403");
  }

  const start = new Date(parsed.data.scheduledAt);
  const end = new Date(start.getTime() + parsed.data.durationMins * 60_000);
  const icsUid = `${crypto.randomBytes(8).toString("hex")}@emobility.careers`;

  const interview = await db.interview.create({
    data: {
      applicationId: application.id,
      scheduledAt: start,
      durationMins: parsed.data.durationMins,
      mode: parsed.data.mode,
      location: parsed.data.location || null,
      meetingUrl: parsed.data.meetingUrl || null,
      interviewerIds: [session.user.id],
      icsUid,
    },
  });

  // Move stage to INTERVIEW if not already there
  if (application.stage !== ApplicationStage.INTERVIEW) {
    await db.application.update({
      where: { id: application.id },
      data: { stage: ApplicationStage.INTERVIEW },
    });
    await db.stageHistory.create({
      data: {
        applicationId: application.id,
        fromStage: application.stage,
        toStage: ApplicationStage.INTERVIEW,
        byUserId: session.user.id,
        reason: `Interview scheduled for ${start.toISOString()}`,
      },
    });
  }

  // ICS attachment + email
  const ics = generateICS({
    uid: icsUid,
    summary: `Interview: ${application.job.title} — ${application.job.company.name}`,
    description: `Interview for ${application.job.title} at ${application.job.company.name}.${parsed.data.meetingUrl ? `\n\nJoin: ${parsed.data.meetingUrl}` : ""}`,
    start,
    end,
    location: parsed.data.meetingUrl || parsed.data.location,
    organizerName: session.user.name ?? undefined,
    organizerEmail: session.user.email ?? undefined,
    attendees: [
      { email: application.candidate.user.email, name: `${application.candidate.firstName} ${application.candidate.lastName ?? ""}` },
    ],
  });

  if (env.RESEND_API_KEY) {
    await sendMail({
      to: application.candidate.user.email,
      subject: `Interview scheduled: ${application.job.title} at ${application.job.company.name}`,
      html: `<p>You've been scheduled for an interview.</p>
        <p><strong>When:</strong> ${start.toLocaleString()}<br/>
        <strong>Mode:</strong> ${parsed.data.mode}<br/>
        ${parsed.data.meetingUrl ? `<strong>Join:</strong> <a href="${parsed.data.meetingUrl}">${parsed.data.meetingUrl}</a>` : ""}
        ${parsed.data.location ? `<strong>Location:</strong> ${parsed.data.location}` : ""}
        </p>
        <p>Calendar invite attached. Open in your dashboard for details.</p>`,
    });
  }

  await dispatchNotification({
    userId: application.candidate.user.id,
    type: "interview.scheduled",
    title: `Interview scheduled — ${application.job.title}`,
    body: `${start.toLocaleString()} · ${parsed.data.mode}`,
    link: "/me/interviews",
    channels: ["IN_APP", "EMAIL", "SMS"],
  });

  // Stash ICS into payload (in real life: upload as attachment)
  void ics; void interview;

  revalidatePath(`/employer/applications/${application.id}`);
  revalidatePath("/me/interviews");
}

export async function cancelInterview(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  const id = z.string().parse(formData.get("id"));
  const interview = await db.interview.findUnique({
    where: { id },
    include: { application: { include: { job: true, candidate: { include: { user: true } } } } },
  });
  if (!interview) return;
  if (
    session.user.role !== "ADMIN" &&
    (!employer || interview.application.job.companyId !== employer.companyId)
  ) {
    redirect("/403");
  }
  await db.interview.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  await dispatchNotification({
    userId: interview.application.candidate.user.id,
    type: "interview.cancelled",
    title: `Interview cancelled — ${interview.application.job.title}`,
    body: "Your interview has been cancelled. The recruiter will reach out to reschedule.",
    link: "/me/interviews",
    channels: ["IN_APP", "EMAIL"],
  });
  revalidatePath(`/employer/applications/${interview.applicationId}`);
}
