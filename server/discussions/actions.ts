"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  EntityDiscussionTarget,
  EntityDiscussionStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { withUniqueSlug } from "@/lib/slug";

/**
 * Reddit-style discussion threads + nested replies attached to
 * Company or Institution. Polymorphic via (entityType, entityId).
 *
 * Public URL patterns:
 *   /company/<companySlug>/discuss/<threadSlug>
 *   /institutions/<institutionSlug>/discuss/<threadSlug>
 *
 * Threads + replies land PUBLISHED immediately (low friction) but
 * carry a report counter so admin can hide / remove via the
 * /admin/discussions queue once the report count crosses a
 * threshold or admin reviews directly.
 */

const targetEnum = z.nativeEnum(EntityDiscussionTarget);

// ─── Threads ──────────────────────────────────────────────────

const createThreadSchema = z.object({
  entityType: targetEnum,
  entityId: z.string().min(1),
  title: z.string().trim().min(8).max(200),
  body: z.string().trim().min(20).max(8000),
});

/**
 * Resolve the public URL prefix for a target entity. Looking up
 * `slug` here once means the calling route doesn't need to know
 * the entity-specific URL convention.
 */
async function entityPrefix(
  entityType: EntityDiscussionTarget,
  entityId: string,
): Promise<{ prefix: string; slug: string } | null> {
  if (entityType === "COMPANY") {
    const row = await db.company.findUnique({
      where: { id: entityId },
      select: { slug: true },
    });
    return row ? { prefix: "/company", slug: row.slug } : null;
  }
  const row = await db.institution.findUnique({
    where: { id: entityId },
    select: { slug: true },
  });
  return row ? { prefix: "/institutions", slug: row.slug } : null;
}

export async function createDiscussionThread(formData: FormData): Promise<void> {
  let backTo: string | null = null;
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin");
    await rateLimitOrThrow(`disc-thread:${session.user.id}`, "invite").catch(() => undefined);

    const parsed = createThreadSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/?error=" + encodeURIComponent("Invalid thread"));
    }
    const data = parsed.data;
    const entity = await entityPrefix(data.entityType, data.entityId);
    if (!entity) redirect("/?error=Entity not found");
    backTo = `${entity!.prefix}/${entity!.slug}?tab=discuss`;

    // Slug allocation is per-entity unique — same title under two
    // entities can both live at "questions-about-bms" without
    // collision. `withUniqueSlug` retries on P2002 unique-violation
    // via numeric suffix.
    const thread = await withUniqueSlug(data.title, async (slug) =>
      db.entityDiscussionThread.create({
        data: {
          entityType: data.entityType,
          entityId: data.entityId,
          slug,
          title: data.title,
          body: data.body,
          authorUserId: session.user.id,
          status: EntityDiscussionStatus.PUBLISHED,
        },
        select: { id: true, slug: true },
      }),
    );

    try {
      await audit({
        actorId: session.user.id,
        action: "discussion.thread.create",
        entity: data.entityType === "COMPANY" ? "Company" : "Institution",
        entityId: data.entityId,
        meta: { threadId: thread.id, threadSlug: thread.slug },
      });
    } catch {/* best-effort */}

    revalidatePath(backTo);
    redirect(`${entity!.prefix}/${entity!.slug}/discuss/${thread.slug}`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[createDiscussionThread] failed");
    redirect((backTo ?? "/") + "&error=" + encodeURIComponent("Thread create failed"));
  }
}

// ─── Replies ──────────────────────────────────────────────────

const createReplySchema = z.object({
  threadId: z.string().min(1),
  parentReplyId: z.string().optional(),
  body: z.string().trim().min(2).max(8000),
});

export async function postDiscussionReply(formData: FormData): Promise<void> {
  let backTo: string | null = null;
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin");
    await rateLimitOrThrow(`disc-reply:${session.user.id}`, "invite").catch(() => undefined);

    const parsed = createReplySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) redirect("/?error=" + encodeURIComponent("Invalid reply"));
    const data = parsed.data;

    const thread = await db.entityDiscussionThread.findUnique({
      where: { id: data.threadId },
      select: { id: true, slug: true, entityType: true, entityId: true },
    });
    if (!thread) redirect("/?error=Thread not found");
    const entity = await entityPrefix(thread!.entityType, thread!.entityId);
    backTo = entity
      ? `${entity.prefix}/${entity.slug}/discuss/${thread!.slug}`
      : "/";

    await db.$transaction([
      db.entityDiscussionReply.create({
        data: {
          threadId: thread!.id,
          parentReplyId: data.parentReplyId || null,
          body: data.body,
          authorUserId: session.user.id,
          status: EntityDiscussionStatus.PUBLISHED,
        },
      }),
      // Bump reply count + lastActivity in the same tx so the
      // listing surface stays sorted correctly even under load.
      db.entityDiscussionThread.update({
        where: { id: thread!.id },
        data: {
          replyCount: { increment: 1 },
          lastActivity: new Date(),
        },
      }),
    ]);

    try {
      await audit({
        actorId: session.user.id,
        action: "discussion.reply.create",
        entity: "EntityDiscussionThread",
        entityId: thread!.id,
      });
    } catch {/* best-effort */}

    revalidatePath(backTo);
    redirect(backTo);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[postDiscussionReply] failed");
    redirect((backTo ?? "/") + "?error=" + encodeURIComponent("Reply failed"));
  }
}

// ─── Moderation (admin) ───────────────────────────────────────

const moderateSchema = z.object({
  kind: z.enum(["THREAD", "REPLY"]),
  id: z.string().min(1),
  action: z.enum(["HIDE", "REMOVE", "PUBLISH"]),
});

export async function moderateDiscussionItem(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") redirect("/403");
    const parsed = moderateSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) redirect("/admin/discussions?error=Invalid request");

    const newStatus: EntityDiscussionStatus = {
      HIDE: EntityDiscussionStatus.HIDDEN,
      REMOVE: EntityDiscussionStatus.REMOVED,
      PUBLISH: EntityDiscussionStatus.PUBLISHED,
    }[parsed.data.action];

    if (parsed.data.kind === "THREAD") {
      await db.entityDiscussionThread.update({
        where: { id: parsed.data.id },
        data: { status: newStatus },
      });
    } else {
      await db.entityDiscussionReply.update({
        where: { id: parsed.data.id },
        data: { status: newStatus },
      });
    }

    try {
      await audit({
        actorId: session.user.id,
        action: `discussion.${parsed.data.kind.toLowerCase()}.${parsed.data.action.toLowerCase()}`,
        entity: parsed.data.kind === "THREAD" ? "EntityDiscussionThread" : "EntityDiscussionReply",
        entityId: parsed.data.id,
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/discussions");
    redirect("/admin/discussions?notice=Moderated");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[moderateDiscussionItem] failed");
    redirect("/admin/discussions?error=Moderation failed");
  }
}
