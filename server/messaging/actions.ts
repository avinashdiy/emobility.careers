"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { realtime, channels, events } from "@/lib/realtime";
import { notificationsQueue } from "@/lib/queues";
import { rateLimitOrThrow } from "@/lib/rate-limit";

async function ensureThreadAccess(threadId: string, userId: string, role: string) {
  const thread = await db.messageThread.findUnique({
    where: { id: threadId },
    include: {
      application: {
        include: {
          candidate: { select: { userId: true } },
          job: { include: { company: { include: { team: true } } } },
        },
      },
    },
  });
  if (!thread) return null;
  if (role === "ADMIN") return thread;
  const allowed =
    thread.candidateUserId === userId ||
    thread.employerUserId === userId ||
    thread.application?.candidate.userId === userId ||
    thread.application?.job.company.team.some((t) => t.userId === userId);
  return allowed ? thread : null;
}

export async function startThreadFromApplication(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const applicationId = z.string().parse(formData.get("applicationId"));
  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      candidate: { select: { userId: true } },
      job: { include: { company: { include: { team: true } } } },
    },
  });
  if (!application) redirect("/employer");
  // Authorization
  const role = session.user.role;
  const isCand = application.candidate.userId === session.user.id;
  const isTeam = application.job.company.team.some((t) => t.userId === session.user.id);
  if (role !== "ADMIN" && !isCand && !isTeam) redirect("/403");

  const thread = await db.messageThread.upsert({
    where: { applicationId },
    create: {
      applicationId,
      candidateUserId: application.candidate.userId,
      employerUserId: isTeam ? session.user.id : undefined,
    },
    update: {},
  });

  redirect(role === "CANDIDATE" ? `/me/messages/${thread.id}` : `/employer/messages/${thread.id}`);
}

const sendSchema = z.object({
  threadId: z.string(),
  body: z.string().min(1).max(4000),
});

export async function sendMessage(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  await rateLimitOrThrow(`message:${session.user.id}`, "message");
  const parsed = sendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const thread = await ensureThreadAccess(parsed.data.threadId, session.user.id, session.user.role);
  if (!thread) redirect("/403");

  const message = await db.message.create({
    data: {
      threadId: thread.id,
      senderId: session.user.id,
      body: parsed.data.body,
    },
  });

  await db.messageThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  // Realtime push
  try {
    await realtime.trigger(channels.thread(thread.id), events.message, {
      id: message.id,
      threadId: thread.id,
      senderId: session.user.id,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    });
  } catch {
    // Soketi might not be running — in-app notification still fires below
  }

  // Notify the other side
  const recipientUserId =
    thread.candidateUserId && thread.candidateUserId !== session.user.id
      ? thread.candidateUserId
      : thread.employerUserId && thread.employerUserId !== session.user.id
      ? thread.employerUserId
      : null;
  if (recipientUserId) {
    await notificationsQueue.add("message", {
      userId: recipientUserId,
      type: "message.new",
      title: "New message",
      body: parsed.data.body.slice(0, 140),
      link: session.user.role === "CANDIDATE" ? `/employer/messages/${thread.id}` : `/me/messages/${thread.id}`,
      channels: ["IN_APP", "EMAIL"],
    });
  }

  revalidatePath(`/me/messages/${thread.id}`);
  revalidatePath(`/employer/messages/${thread.id}`);
}
