"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import {
  parseWordPressXml,
  sanitizeWordPressBody,
  fallbackSlug,
  deriveExcerpt,
  readingTimeMins,
  type WordPressItem,
} from "@/lib/cms/wordpress-import";
import { RESERVED_SLUGS } from "@/lib/reserved-slugs";
import type { FormState } from "@/lib/form-state";

/**
 * Server action behind /admin/import/content.
 *
 * Flow:
 *   1. Admin uploads a WordPress WXR (XML) file via the form.
 *   2. We hash the file (sha256). If a batch with the same hash
 *      already exists, refuse — that protects against accidental
 *      double-imports of the same export.
 *   3. Parse → list of items.
 *   4. For each `page` item → upsert into `Page`. For each `post`
 *      item → upsert into `Article`. Match key: `wpPostId` (stable
 *      across re-exports) — slugs can be renamed in WP without
 *      warning so we don't trust them as dedup keys.
 *   5. Every imported row lands as DRAFT regardless of WP status.
 *      The admin reviews + publishes individually from the
 *      respective admin index pages. This is the single most
 *      important defence against junk content (template demo
 *      posts, lorem-ipsum filler, half-finished drafts) leaking
 *      onto the live site.
 *   6. Attachments are counted but not rehosted in v1. The body
 *      HTML still references the legacy WP host's media URLs —
 *      they keep working until that host disappears.
 */

const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30 MB

export interface ImportResult extends FormState {
  batchId?: string;
  pagesImported?: number;
  postsImported?: number;
  itemsSkipped?: number;
  attachmentsSeen?: number;
}

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

export async function importWordPressContentXml(
  _prev: ImportResult,
  formData: FormData,
): Promise<ImportResult> {
  try {
    const session = await requireAdminSession();
    const file = formData.get("xml");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "Pick an XML file before submitting." };
    }
    if (file.size > MAX_FILE_BYTES) {
      return {
        ok: false,
        message: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Limit is 30 MB.`,
      };
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const fileSha256 = crypto.createHash("sha256").update(buf).digest("hex");

    // Force flag — when ticked on the form, skip the SHA-256 dupe
    // check. Used when the importer code itself has changed
    // (sanitizer fix, render-mode change) and we want the same XML
    // re-processed against the new pipeline. Safe because upsertPage
    // / upsertArticle match on wpPostId and update rows in place;
    // PUBLISHED rows keep their status.
    const force = formData.get("force") === "on" || formData.get("force") === "true";
    if (!force) {
      const dupe = await db.wordPressImportBatch.findFirst({
        where: { fileSha256 },
        select: { id: true, createdAt: true },
      });
      if (dupe) {
        return {
          ok: false,
          message: `This exact file has already been imported (batch ${dupe.id.slice(0, 8)} on ${dupe.createdAt.toISOString().slice(0, 10)}). Tick "Re-import even if uploaded before" if you want to re-process it through the current pipeline.`,
        };
      }
    }

    let parsed;
    try {
      parsed = parseWordPressXml(buf.toString("utf8"));
    } catch (err) {
      logger.warn({ err }, "[wp-import] parse failed");
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Couldn't parse the XML.",
      };
    }

    const pages = parsed.items.filter((i) => i.kind === "page");
    const posts = parsed.items.filter((i) => i.kind === "post");
    const attachments = parsed.items.filter((i) => i.kind === "attachment");
    const skipped = parsed.items.length - pages.length - posts.length - attachments.length;

    // Create the batch row first so the FK on every Page/Article we
    // upsert points at it. If the import errors mid-loop, the batch
    // row stays as a partial-import marker — the admin can see in
    // the history that this batch only landed N items.
    const batch = await db.wordPressImportBatch.create({
      data: {
        fileName: file.name,
        fileSha256,
        uploadedById: session.user.id,
        itemsTotal: parsed.items.length,
        itemsImported: 0,
        itemsSkipped: skipped,
        notes:
          `Pages: ${pages.length}, Posts: ${posts.length}, Attachments: ${attachments.length}, Other: ${skipped}.` +
          (force ? " [forced re-import — sha256 dupe check bypassed]" : ""),
      },
    });

    let pagesImported = 0;
    let postsImported = 0;

    for (const item of pages) {
      try {
        await upsertPage(item, batch.id);
        pagesImported += 1;
      } catch (err) {
        logger.warn({ err, slug: item.slug, wpPostId: item.wpPostId }, "[wp-import] page upsert failed");
      }
    }
    for (const item of posts) {
      try {
        await upsertArticle(item, batch.id, session.user.id);
        postsImported += 1;
      } catch (err) {
        logger.warn({ err, slug: item.slug, wpPostId: item.wpPostId }, "[wp-import] article upsert failed");
      }
    }

    await db.wordPressImportBatch.update({
      where: { id: batch.id },
      data: { itemsImported: pagesImported + postsImported },
    });
    await audit({
      actorId: session.user.id,
      action: "wp-import.complete",
      entity: "WordPressImportBatch",
      entityId: batch.id,
      meta: {
        fileName: file.name,
        pagesImported,
        postsImported,
        attachmentsSeen: attachments.length,
        skipped,
      },
    });

    revalidatePath("/admin/import/content");
    revalidatePath("/admin/articles");
    return {
      ok: true,
      batchId: batch.id,
      pagesImported,
      postsImported,
      attachmentsSeen: attachments.length,
      itemsSkipped: skipped,
      message: `Imported ${pagesImported} pages and ${postsImported} posts as drafts. Review and publish from the admin sections.`,
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[wp-import] failed");
    return {
      ok: false,
      message: "Import failed. Check the server logs for the row that broke it.",
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────

async function ensureUniqueSlug<T extends { id: string }>(
  desired: string,
  finder: (slug: string) => Promise<T | null>,
  ownIdToIgnore?: string,
): Promise<string> {
  // Reserved-slug guard. Pages share the flat top-level URL space
  // with platform routes (`/jobs`, `/feed`, `/admin`, ...) and
  // candidate handles. If the desired slug collides with a reserved
  // platform route, suffix with `-page` and let the unique-search
  // loop disambiguate from there.
  let slug = RESERVED_SLUGS.has(desired) ? `${desired}-page` : desired;
  let n = 2;
  // Cap at 50 attempts so a misconfigured loop can't spin forever.
  while (n < 50) {
    const existing = await finder(slug);
    if (!existing || existing.id === ownIdToIgnore) return slug;
    slug = `${desired}-${n}`;
    n += 1;
  }
  // Last resort — append a short random suffix.
  return `${desired}-${crypto.randomBytes(3).toString("hex")}`;
}

async function upsertPage(item: WordPressItem, batchId: string): Promise<void> {
  if (!item.title) return; // Skip empty-titled rows; nothing to render.
  const sanitized = sanitizeWordPressBody(item.bodyRaw);
  const desiredSlug = item.slug || fallbackSlug(item.title, item.wpPostId);

  // Match by (wpPostId) first — stable across slug renames in WP.
  // Fall back to slug match for items the WP exporter elided the
  // post ID for (rare, but the export spec allows it).
  const existing = await db.page.findFirst({
    where: {
      OR: [
        item.wpPostId ? { wpPostId: item.wpPostId } : undefined,
        { slug: desiredSlug },
      ].filter((w): w is NonNullable<typeof w> => w !== undefined),
    },
    select: { id: true, slug: true, status: true },
  });

  // Don't clobber a published page back to draft. If an admin has
  // already gone in, polished, and published a previously-imported
  // page, a re-import should refresh the body but preserve status +
  // publishedAt. (DRAFT pages get overwritten freely.)
  const preservePublished = existing?.status === "PUBLISHED";

  // Pages share top-level URL space with candidate handles too —
  // /ev-jobs-ai-tools and /avinash-singh both render through the
  // same dispatcher in app/[username]/page.tsx. Reject slugs taken
  // by either table.
  const slug =
    existing?.slug ?? // re-use existing slug to preserve URLs
    (await ensureUniqueSlug(desiredSlug, async (s) => {
      const p = await db.page.findUnique({ where: { slug: s }, select: { id: true } });
      if (p) return p;
      const c = await db.candidateProfile.findUnique({ where: { slug: s }, select: { id: true } });
      return c ?? null;
    }));

  await db.page.upsert({
    where: { id: existing?.id ?? "__nope__" },
    create: {
      slug,
      title: item.title,
      excerpt: deriveExcerpt(item.bodyRaw, item.excerpt),
      body: sanitized,
      coverImageUrl: item.firstImageUrl,
      status: "DRAFT",
      publishedAt: null,
      importBatchId: batchId,
      wpPostId: item.wpPostId || null,
    },
    update: {
      title: item.title,
      excerpt: deriveExcerpt(item.bodyRaw, item.excerpt),
      body: sanitized,
      coverImageUrl: item.firstImageUrl,
      ...(preservePublished
        ? {} // keep status + publishedAt
        : { status: "DRAFT", publishedAt: null }),
      importBatchId: batchId,
      wpPostId: item.wpPostId || null,
    },
  });
}

async function upsertArticle(
  item: WordPressItem,
  batchId: string,
  authorId: string,
): Promise<void> {
  if (!item.title) return;
  const sanitized = sanitizeWordPressBody(item.bodyRaw);
  const desiredSlug = item.slug || fallbackSlug(item.title, item.wpPostId);
  const excerpt = deriveExcerpt(item.bodyRaw, item.excerpt);

  // Article doesn't have a wpPostId column (pre-existing model — we
  // don't want to widen it for this one importer). Use the slug as
  // the dedup key. Re-importing renames in WP would create a second
  // row; that's an acceptable trade for not migrating Article.
  const existing = await db.article.findUnique({
    where: { slug: desiredSlug },
    select: { id: true, slug: true, status: true },
  });
  const preservePublished = existing?.status === "PUBLISHED";

  const slug =
    existing?.slug ??
    (await ensureUniqueSlug(desiredSlug, (s) =>
      db.article.findUnique({ where: { slug: s }, select: { id: true } }),
    ));

  // Strip tags for the reading-time calculation — we don't want CSS
  // <style> blocks counted as 4000 words of body.
  const plain = sanitized.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  await db.article.upsert({
    where: { id: existing?.id ?? "__nope__" },
    create: {
      slug,
      title: item.title,
      excerpt,
      body: sanitized,
      coverImageUrl: item.firstImageUrl,
      status: "DRAFT",
      publishedAt: null,
      authorId,
      readingTimeMins: readingTimeMins(plain),
      // Tag every imported article so the admin can filter the
      // /admin/articles list by `wp-import` and review them in one
      // pass. Articles uses `tags String[]`.
      tags: ["wp-import"],
    },
    update: {
      title: item.title,
      excerpt,
      body: sanitized,
      coverImageUrl: item.firstImageUrl,
      ...(preservePublished ? {} : { status: "DRAFT", publishedAt: null }),
      readingTimeMins: readingTimeMins(plain),
    },
  });
  // Use batchId to silence "unused" until we widen Article with a
  // batch FK. Logged so admins can grep the import audit later.
  void batchId;
}
