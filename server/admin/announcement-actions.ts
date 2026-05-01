"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { AnnouncementAudience, AnnouncementSeverity } from "@prisma/client";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

const upsertSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  ctaLabel: z.string().max(40).optional(),
  ctaUrl: z.string().max(500).optional(),
  audience: z.enum(["EVERYONE", "CANDIDATES", "EMPLOYERS", "ADMINS"]),
  severity: z.enum(["INFO", "SUCCESS", "WARNING", "CRITICAL"]),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  dismissible: z.coerce.boolean().optional(),
});

export async function upsertAnnouncement(formData: FormData) {
  const session = await requireAdmin();
  const parsed = upsertSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      "/admin/announcements?error=" +
        encodeURIComponent("Invalid announcement"),
    );
  }
  const { id, startsAt, endsAt, audience, severity, ctaLabel, ctaUrl, ...rest } = parsed.data;
  const data = {
    ...rest,
    audience: audience as AnnouncementAudience,
    severity: severity as AnnouncementSeverity,
    ctaLabel: ctaLabel?.trim() || null,
    ctaUrl: ctaUrl?.trim() || null,
    startsAt: startsAt ? new Date(startsAt) : null,
    endsAt: endsAt ? new Date(endsAt) : null,
    isActive: rest.isActive ?? true,
    dismissible: rest.dismissible ?? true,
  };
  if (id) {
    await db.announcement.update({ where: { id }, data });
    await audit({
      actorId: session.user.id,
      action: "announcement.updated",
      entity: "Announcement",
      entityId: id,
    });
  } else {
    const created = await db.announcement.create({
      data: { ...data, createdById: session.user.id },
    });
    await audit({
      actorId: session.user.id,
      action: "announcement.created",
      entity: "Announcement",
      entityId: created.id,
      meta: { audience: created.audience, severity: created.severity },
    });
  }
  revalidatePath("/admin/announcements");
  revalidatePath("/", "layout"); // banner is mounted in root layout
}

export async function deleteAnnouncement(formData: FormData) {
  const session = await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  await db.announcement.delete({ where: { id } });
  await audit({
    actorId: session.user.id,
    action: "announcement.deleted",
    entity: "Announcement",
    entityId: id,
  });
  revalidatePath("/admin/announcements");
  revalidatePath("/", "layout");
}

export async function toggleAnnouncementActive(formData: FormData) {
  const session = await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  const current = await db.announcement.findUnique({
    where: { id },
    select: { isActive: true },
  });
  if (!current) return;
  await db.announcement.update({
    where: { id },
    data: { isActive: !current.isActive },
  });
  await audit({
    actorId: session.user.id,
    action: current.isActive ? "announcement.deactivated" : "announcement.activated",
    entity: "Announcement",
    entityId: id,
  });
  revalidatePath("/admin/announcements");
  revalidatePath("/", "layout");
}
