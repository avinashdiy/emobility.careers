"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { broadcastsQueue } from "@/lib/queues";
import { BroadcastTarget, NotificationChannel, RecruitathonAvailability } from "@prisma/client";
import { optionalUrl } from "@/lib/forms/zod-url";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

const broadcastSchema = z.object({
  title: z.string().min(2).max(140),
  body: z.string().min(2).max(2000),
  link: optionalUrl,
  target: z.nativeEnum(BroadcastTarget),
  /// Required when target is one of the FAIR_* values; null otherwise.
  /// Empty string ("") is coerced to null at action level since the
  /// form select defaults to "" when no fair is picked.
  targetDriveId: z.string().optional().or(z.literal("")),
  /// Phase 2 hybrid — optional fairMode filter on a FAIR_* target.
  /// Empty string ("") means "no filter — every mode" and is coerced
  /// to null below; otherwise OFFLINE / ONLINE / HYBRID narrows the
  /// audience to that single attendance segment.
  targetFairMode: z.union([z.nativeEnum(RecruitathonAvailability), z.literal("")]).optional(),
  email: z.coerce.boolean().optional(),
  sms: z.coerce.boolean().optional(),
  whatsapp: z.coerce.boolean().optional(),
  sendNow: z.coerce.boolean().optional(),
});

// Targets that NEED a targetDriveId to make sense. If admin picks one
// of these without selecting a fair, the audience would resolve to
// "everyone" — we reject up-front instead.
const FAIR_SCOPED_TARGETS = new Set<BroadcastTarget>([
  BroadcastTarget.FAIR_REGISTERED_CANDIDATES,
  BroadcastTarget.FAIR_REGISTERED_EMPLOYERS,
  BroadcastTarget.FAIR_REGISTERED_TPOS,
  BroadcastTarget.FAIR_ALL_REGISTRANTS,
]);

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

  // Validate fair-scoped target carries a drive id. Refusing here
  // beats letting the worker resolve to "everyone" by accident.
  const targetDriveId =
    parsed.data.targetDriveId && parsed.data.targetDriveId.length > 0
      ? parsed.data.targetDriveId
      : null;
  if (FAIR_SCOPED_TARGETS.has(parsed.data.target) && !targetDriveId) {
    redirect("/admin/broadcasts?error=" + encodeURIComponent("Pick a fair when targeting fair registrants."));
  }

  // Phase 2 hybrid — fairMode filter only applies when the target
  // is fair-scoped AND filters by candidate fairMode (currently
  // FAIR_REGISTERED_CANDIDATES + FAIR_ALL_REGISTRANTS — the
  // employer / TPO targets don't expose fairMode). For other
  // targets we forcibly null it out so it can't accidentally
  // affect anything downstream.
  const targetFairMode =
    (parsed.data.target === BroadcastTarget.FAIR_REGISTERED_CANDIDATES ||
      parsed.data.target === BroadcastTarget.FAIR_ALL_REGISTRANTS) &&
    parsed.data.targetFairMode &&
    parsed.data.targetFairMode.length > 0
      ? (parsed.data.targetFairMode as RecruitathonAvailability)
      : null;

  const broadcast = await db.broadcast.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      link: parsed.data.link || null,
      target: parsed.data.target,
      targetDriveId,
      targetFairMode,
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
