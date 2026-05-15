"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import crypto from "node:crypto";
import { PageStatus, PageRenderMode } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import {
  sanitizeWordPressBody,
  fallbackSlug,
  deriveExcerpt,
} from "@/lib/cms/wordpress-import";
import { RESERVED_SLUGS, normalizeSlug } from "@/lib/reserved-slugs";
import type { FormState } from "@/lib/form-state";
import { optionalUrl } from "@/lib/forms/zod-url";

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

// ─── Manual page editor — create / update ────────────────────

export interface SavePageResult extends FormState {
  pageId?: string;
  slug?: string;
}

const pageInputSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().max(80).optional(),
  excerpt: z.string().max(500).optional(),
  body: z.string().min(1, "Paste some HTML to save."),
  coverImageUrl: optionalUrl,
  metaTitle: z.string().max(80).optional(),
  metaDescription: z.string().max(280).optional(),
  renderMode: z.nativeEnum(PageRenderMode).default(PageRenderMode.STANDALONE),
  allowScripts: z.coerce.boolean().default(false),
});

async function ensureUniqueSlug(desired: string, ownIdToIgnore?: string): Promise<string> {
  // Pages share top-level URL space with reserved platform routes
  // and candidate handles. Suffix with `-page` if the slug collides
  // with a reserved name; bump with `-2`, `-3`, ... if a Page or
  // CandidateProfile row already owns the slug.
  let slug = RESERVED_SLUGS.has(desired) ? `${desired}-page` : desired;
  let n = 2;
  while (n < 50) {
    const [p, c] = await Promise.all([
      db.page.findUnique({ where: { slug }, select: { id: true } }),
      db.candidateProfile.findUnique({ where: { slug }, select: { id: true } }),
    ]);
    if ((!p || p.id === ownIdToIgnore) && !c) return slug;
    slug = `${desired}-${n}`;
    n += 1;
  }
  return `${desired}-${crypto.randomBytes(3).toString("hex")}`;
}

/**
 * Create a hand-authored page from pasted HTML. The form sends:
 *   • title          (required)
 *   • slug           (optional — derived from title if blank)
 *   • body           (required, raw HTML — sanitised here)
 *   • renderMode     (STANDALONE / EMBEDDED, default STANDALONE)
 *   • allowScripts   (checkbox, default off)
 *   • SEO overrides  (metaTitle / metaDescription / coverImageUrl)
 *
 * Lands as DRAFT — admin must publish from /admin/pages.
 */
export async function createPage(
  _prev: SavePageResult,
  formData: FormData,
): Promise<SavePageResult> {
  try {
    const session = await requireAdmin();
    const raw = Object.fromEntries(formData);
    const parsed = pageInputSchema.safeParse(raw);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return {
        ok: false,
        message: flat.formErrors[0] ?? "Check the highlighted fields.",
        fieldErrors: Object.fromEntries(
          Object.entries(flat.fieldErrors).map(([k, v]) => [k, v?.[0] ?? ""]),
        ),
      };
    }
    const data = parsed.data;
    const desiredSlug =
      (data.slug && normalizeSlug(data.slug)) ||
      fallbackSlug(data.title, 0);
    const slug = await ensureUniqueSlug(desiredSlug);

    const sanitized = sanitizeWordPressBody(data.body, {
      allowScripts: data.allowScripts,
    });

    const created = await db.page.create({
      data: {
        slug,
        title: data.title,
        excerpt: data.excerpt || deriveExcerpt(data.body, ""),
        body: sanitized,
        coverImageUrl: data.coverImageUrl || null,
        renderMode: data.renderMode,
        sourceKind: "MANUAL",
        allowScripts: data.allowScripts,
        metaTitle: data.metaTitle || null,
        metaDescription: data.metaDescription || null,
        status: "DRAFT",
        publishedAt: null,
      },
      select: { id: true, slug: true },
    });
    await audit({
      actorId: session.user.id,
      action: "page.created",
      entity: "Page",
      entityId: created.id,
      meta: { slug: created.slug, allowScripts: data.allowScripts, renderMode: data.renderMode },
    });

    revalidatePath("/admin/pages");
    return {
      ok: true,
      pageId: created.id,
      slug: created.slug,
      message: `Saved as draft. Live at /${created.slug} once published.`,
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[admin] createPage failed");
    return { ok: false, message: "Couldn't save the page. Check server logs." };
  }
}

const updateSchema = pageInputSchema.extend({ pageId: z.string().min(1) });

/**
 * Update an existing page. Same input shape as create + a `pageId`.
 * Slug renames are honoured — this re-runs the uniqueness check so
 * an admin can rename a slug to a free one without colliding.
 */
export async function updatePage(
  _prev: SavePageResult,
  formData: FormData,
): Promise<SavePageResult> {
  try {
    const session = await requireAdmin();
    const raw = Object.fromEntries(formData);
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return {
        ok: false,
        message: flat.formErrors[0] ?? "Check the highlighted fields.",
        fieldErrors: Object.fromEntries(
          Object.entries(flat.fieldErrors).map(([k, v]) => [k, v?.[0] ?? ""]),
        ),
      };
    }
    const data = parsed.data;
    const desiredSlug = (data.slug && normalizeSlug(data.slug)) || fallbackSlug(data.title, 0);
    const slug = await ensureUniqueSlug(desiredSlug, data.pageId);

    const sanitized = sanitizeWordPressBody(data.body, {
      allowScripts: data.allowScripts,
    });

    await db.page.update({
      where: { id: data.pageId },
      data: {
        slug,
        title: data.title,
        excerpt: data.excerpt || deriveExcerpt(data.body, ""),
        body: sanitized,
        coverImageUrl: data.coverImageUrl || null,
        renderMode: data.renderMode,
        allowScripts: data.allowScripts,
        metaTitle: data.metaTitle || null,
        metaDescription: data.metaDescription || null,
      },
    });
    await audit({
      actorId: session.user.id,
      action: "page.updated",
      entity: "Page",
      entityId: data.pageId,
      meta: { slug, allowScripts: data.allowScripts, renderMode: data.renderMode },
    });

    revalidatePath("/admin/pages");
    revalidatePath(`/${slug}`);
    return { ok: true, pageId: data.pageId, slug, message: "Saved." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[admin] updatePage failed");
    return { ok: false, message: "Couldn't save the page. Check server logs." };
  }
}

/**
 * Toggle `allowScripts` on an existing page — separate from the
 * full update form so admins can flip trust mode without re-pasting
 * the whole body. Reflects on the audit log so trust changes are
 * traceable.
 */
const toggleSchema = z.object({
  pageId: z.string().min(1),
  allowScripts: z.coerce.boolean(),
});

export async function setAllowScripts(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const { pageId, allowScripts } = toggleSchema.parse(Object.fromEntries(formData));
    const page = await db.page.findUnique({
      where: { id: pageId },
      select: { body: true, slug: true, allowScripts: true },
    });
    if (!page) return;
    if (page.allowScripts === allowScripts) return;

    // Re-sanitise on toggle. Going OFF → ON re-runs the sanitiser
    // with `allowScripts: true` so any <script> blocks that were
    // previously stripped are kept (only matters if the body still
    // had inert <script> markers; usually a no-op). Going ON → OFF
    // re-runs strict sanitiser to scrub scripts out of the stored body.
    // This keeps the DB body always in sync with the trust flag.
    const sanitized = sanitizeWordPressBody(page.body, { allowScripts });

    await db.page.update({
      where: { id: pageId },
      data: { allowScripts, body: sanitized },
    });
    await audit({
      actorId: session.user.id,
      action: "page.allow_scripts_set",
      entity: "Page",
      entityId: pageId,
      meta: { allowScripts },
    });
    revalidatePath("/admin/pages");
    revalidatePath(`/${page.slug}`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[admin] setAllowScripts failed");
  }
}
