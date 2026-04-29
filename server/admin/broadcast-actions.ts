"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { broadcastsQueue } from "@/lib/queues";
import { BroadcastTarget, NotificationChannel } from "@prisma/client";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

const broadcastSchema = z.object({
  title: z.string().min(2).max(140),
  body: z.string().min(2).max(2000),
  link: z.string().url().optional().or(z.literal("")),
  target: z.nativeEnum(BroadcastTarget),
  email: z.coerce.boolean().optional(),
  sms: z.coerce.boolean().optional(),
  whatsapp: z.coerce.boolean().optional(),
  sendNow: z.coerce.boolean().optional(),
});

export async function createBroadcast(formData: FormData) {
  const session = await requireAdmin();
  const parsed = broadcastSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/admin/broadcasts?error=" + encodeURIComponent("Invalid input"));
  }
  const channels: NotificationChannel[] = [NotificationChannel.IN_APP];
  if (parsed.data.email) channels.push(NotificationChannel.EMAIL);
  if (parsed.data.sms) channels.push(NotificationChannel.SMS);
  if (parsed.data.whatsapp) channels.push(NotificationChannel.WHATSAPP);

  const broadcast = await db.broadcast.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      link: parsed.data.link || null,
      target: parsed.data.target,
      channels,
      createdById: session.user.id,
      status: parsed.data.sendNow ? "SENDING" : "DRAFT",
      startedAt: parsed.data.sendNow ? new Date() : null,
    },
  });

  await audit({
    actorId: session.user.id,
    action: "broadcast.created",
    entity: "Broadcast",
    entityId: broadcast.id,
    meta: { target: broadcast.target, channels },
  });

  if (parsed.data.sendNow) {
    await broadcastsQueue.add("send", { broadcastId: broadcast.id });
  }

  revalidatePath("/admin/broadcasts");
  redirect("/admin/broadcasts?notice=" + encodeURIComponent(parsed.data.sendNow ? "Broadcast queued" : "Broadcast saved as draft"));
}

export async function sendBroadcast(formData: FormData) {
  const session = await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  const broadcast = await db.broadcast.findUnique({ where: { id } });
  if (!broadcast || broadcast.status !== "DRAFT") return;
  await db.broadcast.update({
    where: { id },
    data: { status: "SENDING", startedAt: new Date() },
  });
  await broadcastsQueue.add("send", { broadcastId: id });
  await audit({
    actorId: session.user.id,
    action: "broadcast.sent",
    entity: "Broadcast",
    entityId: id,
  });
  revalidatePath("/admin/broadcasts");
}

export async function deleteBroadcast(formData: FormData) {
  const session = await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  const broadcast = await db.broadcast.findUnique({ where: { id }, select: { status: true } });
  if (!broadcast) return;
  // Only allow deleting drafts and completed broadcasts (not in-flight SENDING)
  if (broadcast.status === "SENDING") return;
  await db.broadcast.delete({ where: { id } });
  await audit({
    actorId: session.user.id,
    action: "broadcast.deleted",
    entity: "Broadcast",
    entityId: id,
  });
  revalidatePath("/admin/broadcasts");
}
