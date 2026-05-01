"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

/**
 * Bulk-mark every unread IN_APP notification as read for the calling
 * user. Used by the "Mark all read" button on /me/notifications. The
 * client-side bell badge listens for the `notifications:reset` custom
 * event (dispatched on success) and zeros itself out without waiting
 * for a navigation.
 */
export async function markAllNotificationsRead() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  await db.notification.updateMany({
    where: {
      userId: session.user.id,
      channel: "IN_APP",
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  revalidatePath("/me/notifications");
}

/**
 * Mark a single notification as read. Less common entry point than
 * the auto-mark-on-view behaviour the inbox already does, but useful
 * for the dropdown variant we may add later (read-on-click without
 * marking everything visible).
 */
export async function markNotificationRead(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const id = z.string().parse(formData.get("id"));

  await db.notification.updateMany({
    where: { id, userId: session.user.id },
    data: { readAt: new Date() },
  });

  revalidatePath("/me/notifications");
}

/**
 * Delete a single notification. Convenience for the "X" affordance
 * on each row — the cleanup cron will remove it eventually anyway,
 * but users like clearing things by hand.
 */
export async function dismissNotification(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const id = z.string().parse(formData.get("id"));

  await db.notification.deleteMany({
    where: { id, userId: session.user.id },
  });

  revalidatePath("/me/notifications");
}
