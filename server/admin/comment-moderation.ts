"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

export async function hideComment(formData: FormData) {
  const session = await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  const reason = String(formData.get("reason") ?? "").slice(0, 500) || null;
  await db.postComment.update({
    where: { id },
    data: {
      hiddenAt: new Date(),
      hiddenById: session.user.id,
      hiddenReason: reason,
    },
  });
  await audit({
    actorId: session.user.id,
    action: "comment.hidden",
    entity: "PostComment",
    entityId: id,
    meta: { reason },
  });
  revalidatePath("/admin/content");
  revalidatePath("/feed");
}

export async function restoreComment(formData: FormData) {
  const session = await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  await db.postComment.update({
    where: { id },
    data: {
      hiddenAt: null,
      hiddenById: null,
      hiddenReason: null,
    },
  });
  await audit({
    actorId: session.user.id,
    action: "comment.restored",
    entity: "PostComment",
    entityId: id,
  });
  revalidatePath("/admin/content");
  revalidatePath("/feed");
}

export async function setShadowBan(formData: FormData) {
  const session = await requireAdmin();
  const userId = z.string().parse(formData.get("userId"));
  const enable = formData.get("enable") === "true";
  const reason = String(formData.get("reason") ?? "").slice(0, 1000) || null;
  await db.user.update({
    where: { id: userId },
    data: {
      shadowBannedAt: enable ? new Date() : null,
      shadowBannedById: enable ? session.user.id : null,
      shadowBanReason: enable ? reason : null,
    },
  });
  await audit({
    actorId: session.user.id,
    action: enable ? "user.shadow_banned" : "user.shadow_unbanned",
    entity: "User",
    entityId: userId,
    meta: { reason },
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}
