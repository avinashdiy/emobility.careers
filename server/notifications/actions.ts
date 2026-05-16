"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { isRouterControlError } from "@/lib/server-action-errors";

/**
 * Returns true if the user is over the notification-mutation rate
 * limit (clearAll / dismiss / mark-read are all gated by this).
 * Without the gate, a stuck client retry or a hostile/bored user
 * can drive the Notification table's write rate sky-high —
 * `clearAllNotifications` is a single unbounded `deleteMany`.
 * "saveItem" preset (~30/min/user) is plenty for these UX-driven
 * flows.
 *
 * Returns true (over-limit) instead of throwing so each action can
 * bail cleanly without surfacing an error toast — a rate-limited
 * dismiss-click should silently no-op, not show "something went
 * wrong" to a user who just tapped × five times in a row.
 */
async function isOverNotifLimit(userId: string): Promise<boolean> {
  try {
    await rateLimitOrThrow(`notif-mut:${userId}`, "saveItem");
    return false;
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    return true;
  }
}

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
  if (await isOverNotifLimit(session.user.id)) return;

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
  if (await isOverNotifLimit(session.user.id)) return;
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
  if (await isOverNotifLimit(session.user.id)) return;
  const id = z.string().parse(formData.get("id"));

  await db.notification.deleteMany({
    where: { id, userId: session.user.id },
  });

  revalidatePath("/me/notifications");
}

/**
 * Bulk-delete every IN_APP notification for the calling user. Wired
 * to the "Clear all" button on /me/notifications. Destructive — the
 * client wraps the call in a confirm dialog. Scoped to the IN_APP
 * channel so we don't accidentally wipe email/SMS audit rows that
 * share the same table.
 */
export async function clearAllNotifications() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (await isOverNotifLimit(session.user.id)) return;

  // Batch the delete in chunks of 500 so a power-user with 10k+
  // notifications doesn't wrap the whole sweep in one giant
  // transaction. Each chunk is small enough that autovacuum can
  // keep pace and other writers see only brief lock holds.
  const CHUNK = 500;
  for (;;) {
    const batch = await db.notification.findMany({
      where: { userId: session.user.id, channel: "IN_APP" },
      select: { id: true },
      take: CHUNK,
    });
    if (batch.length === 0) break;
    await db.notification.deleteMany({
      where: { id: { in: batch.map((b) => b.id) } },
    });
    if (batch.length < CHUNK) break;
  }

  revalidatePath("/me/notifications");
}
