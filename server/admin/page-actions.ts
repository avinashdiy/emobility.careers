"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PageStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";

/**
 * Lifecycle actions for the new `Page` CMS table. Kept minimal in
 * v1 — publish, archive, delete. Editing the body / slug / SEO
 * fields uses a future /admin/pages/[id]/edit form once we have a
 * proper rich editor; for now the WordPress importer is the only
 * write path.
 */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

const idSchema = z.object({ pageId: z.string().min(1) });

export async function publishPage(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const { pageId } = idSchema.parse(Object.fromEntries(formData));
    await db.page.update({
      where: { id: pageId },
      data: { status: PageStatus.PUBLISHED, publishedAt: new Date() },
    });
    await audit({
      actorId: session.user.id,
      action: "page.published",
      entity: "Page",
      entityId: pageId,
    });
    revalidatePath("/admin/pages");
    revalidatePath(`/p/${pageId}`); // best-effort; revalidate by id-shaped path harmless
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[admin] publishPage failed");
  }
}

export async function unpublishPage(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const { pageId } = idSchema.parse(Object.fromEntries(formData));
    await db.page.update({
      where: { id: pageId },
      data: { status: PageStatus.DRAFT, publishedAt: null },
    });
    await audit({
      actorId: session.user.id,
      action: "page.unpublished",
      entity: "Page",
      entityId: pageId,
    });
    revalidatePath("/admin/pages");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[admin] unpublishPage failed");
  }
}

export async function archivePage(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const { pageId } = idSchema.parse(Object.fromEntries(formData));
    await db.page.update({
      where: { id: pageId },
      data: { status: PageStatus.ARCHIVED },
    });
    await audit({
      actorId: session.user.id,
      action: "page.archived",
      entity: "Page",
      entityId: pageId,
    });
    revalidatePath("/admin/pages");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[admin] archivePage failed");
  }
}

export async function deletePage(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const { pageId } = idSchema.parse(Object.fromEntries(formData));
    // Hard delete — there's no soft-delete on Page yet, and the
    // import batch FK uses SetNull so the audit trail (which batch
    // birthed this row) survives.
    await db.page.delete({ where: { id: pageId } });
    await audit({
      actorId: session.user.id,
      action: "page.deleted",
      entity: "Page",
      entityId: pageId,
    });
    revalidatePath("/admin/pages");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[admin] deletePage failed");
  }
}
