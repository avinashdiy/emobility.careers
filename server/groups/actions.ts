"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { GroupNotifyMode } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";

/**
 * #5 Wave A — EV Community Groups join / leave / notify-mode actions.
 *
 * Groups are a thin layer over the existing HashtagSubscription /
 * hashtag-based feed. A group's slug doubles as a hashtag — posts
 * tagged `#<slug>` surface in the group feed automatically.
 *
 * Joining a group:
 *   1. Inserts a GroupMembership row (idempotent — unique on
 *      groupId + userId).
 *   2. Increments Group.memberCount.
 *   3. Also subscribes the user to the matching hashtag so their
 *      For-You feed picks up the group's posts. The user can later
 *      tune that subscription separately from group membership.
 *
 * Leaving reverses everything.
 */

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session!;
}

const joinSchema = z.object({
  slug: z.string().min(1),
  notify: z.nativeEnum(GroupNotifyMode).optional(),
});

export async function joinGroup(formData: FormData): Promise<void> {
  try {
    const session = await requireUser();
    const parsed = joinSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/groups?error=" + encodeURIComponent("Invalid group."));
    }
    const { slug, notify } = parsed.data;

    const group = await db.group.findUnique({ where: { slug } });
    if (!group || !group.isPublic) {
      redirect("/groups?error=" + encodeURIComponent("Group not found."));
    }

    // Idempotent — upsert handles "already a member" cleanly. We do
    // increment the counter only on insert; the upsert's update
    // branch only changes notify mode if the user revisits.
    const existing = await db.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    });

    if (!existing) {
      await db.$transaction([
        db.groupMembership.create({
          data: {
            groupId: group.id,
            userId: session.user.id,
            notify: notify ?? GroupNotifyMode.WEEKLY,
          },
        }),
        db.group.update({
          where: { id: group.id },
          data: { memberCount: { increment: 1 } },
        }),
        // Auto-subscribe to the matching hashtag so the user's
        // For-You feed reflects their group membership.
        db.hashtagSubscription.upsert({
          where: { userId_tag: { userId: session.user.id, tag: slug } },
          create: { userId: session.user.id, tag: slug },
          update: {},
        }),
      ]);
      try {
        await audit({
          actorId: session.user.id,
          action: "group.joined",
          entity: "Group",
          entityId: group.id,
        });
      } catch {/* best-effort */}
    } else if (notify && existing.notify !== notify) {
      await db.groupMembership.update({
        where: { id: existing.id },
        data: { notify },
      });
    }

    revalidatePath(`/groups/${slug}`);
    revalidatePath("/groups");
    redirect(`/groups/${slug}?notice=` + encodeURIComponent("Joined."));
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[groups.join] unexpected");
    redirect("/groups?error=" + encodeURIComponent("Couldn't join — try again."));
  }
}

const leaveSchema = z.object({ slug: z.string().min(1) });

export async function leaveGroup(formData: FormData): Promise<void> {
  try {
    const session = await requireUser();
    const parsed = leaveSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/groups?error=" + encodeURIComponent("Invalid group."));
    }
    const { slug } = parsed.data;

    const group = await db.group.findUnique({ where: { slug } });
    if (!group) redirect("/groups");

    const existing = await db.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    });
    if (!existing) {
      redirect(`/groups/${slug}`);
    }

    await db.$transaction([
      db.groupMembership.delete({ where: { id: existing.id } }),
      db.group.update({
        where: { id: group.id },
        data: { memberCount: { decrement: 1 } },
      }),
      // Don't auto-unsubscribe from the hashtag — the user might be
      // following the tag separately from group membership.
    ]);
    try {
      await audit({
        actorId: session.user.id,
        action: "group.left",
        entity: "Group",
        entityId: group.id,
      });
    } catch {/* best-effort */}

    revalidatePath(`/groups/${slug}`);
    revalidatePath("/groups");
    redirect(`/groups/${slug}?notice=` + encodeURIComponent("Left the group."));
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[groups.leave] unexpected");
    redirect("/groups?error=" + encodeURIComponent("Couldn't leave — try again."));
  }
}
