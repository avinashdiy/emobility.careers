"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { withUniqueSlug } from "@/lib/slug";
import { isRouterControlError } from "@/lib/server-action-errors";
import {
  plainTextLength,
  sanitizeRichTextHtml,
} from "@/lib/cms/job-sanitize";
import type { FormState } from "@/lib/form-state";
import { optionalUrl } from "@/lib/forms/zod-url";

/**
 * Server actions for the editorial Article CMS. Admin-only on every
 * mutation — articles are platform-curated (knowledge base, SEO
 * pillars), not user-generated content. User long-form goes through
 * `Post.kind = ARTICLE` on the social side; this module is the
 * separate editorial layer.
 *
 * Single-author for v1 (`authorId` on Article). Multi-author + a
 * dedicated editorial queue (request review, schedule publish) are
 * v2 work — for now, the admin who creates the article IS the
 * author by default; admin can override via the form.
 */

// ─── Helpers ────────────────────────────────────────────────────────

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

/**
 * Reading-time estimate. Standard ~220 wpm for an engaged reader.
 * Floor at 1 min so even tiny snippets aren't reported as 0.
 *
 * Strips HTML tags first so that a body authored in the rich-text
 * editor (lots of `<p>`/`<strong>`/`<a>` markup) reports the same
 * minutes-to-read as the equivalent plain text — otherwise the
 * editor switch silently doubled the count for the same content.
 */
function estimateReadingTime(body: string): number {
  const text = body.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

// ─── Article create ────────────────────────────────────────────────

const ArticleSchema = z.object({
  title: z.string().trim().min(8).max(200),
  excerpt: z.string().trim().max(280).optional().or(z.literal("")),
  // Body now comes from the rich-text editor as HTML. Zod can't
  // measure readable-character length on raw HTML (a `<p>` wrapper
  // alone is 7 chars of markup), so we only enforce non-empty here
  // and apply the real "≥ 100 readable chars" gate AFTER sanitise
  // using `plainTextLength`.
  body: z.string().min(1, "Article body is required."),
  coverImageUrl: optionalUrl,
  categoryId: z.string().optional().or(z.literal("")),
  authorId: z.string().optional().or(z.literal("")),
  /// Comma- or newline-separated. We split + trim + dedupe + limit.
  tagsRaw: z.string().max(500).optional().or(z.literal("")),
});

const ARTICLE_BODY_MIN_READABLE = 100;

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw.split(/[,\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.slice(0, 10);
}

export interface CreateArticleResult extends FormState {
  articleId?: string;
  slug?: string;
}

export async function createArticle(
  _prev: CreateArticleResult,
  formData: FormData,
): Promise<CreateArticleResult> {
  try {
    const session = await requireAdmin();
    const parsed = ArticleSchema.safeParse({
      title: formData.get("title"),
      excerpt: formData.get("excerpt") || "",
      body: formData.get("body"),
      coverImageUrl: formData.get("coverImageUrl") || "",
      categoryId: formData.get("categoryId") || "",
      authorId: formData.get("authorId") || "",
      tagsRaw: formData.get("tagsRaw") || "",
    });
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Check the form.",
      };
    }

    const bodyHtml = sanitizeRichTextHtml(parsed.data.body);
    if (plainTextLength(bodyHtml) < ARTICLE_BODY_MIN_READABLE) {
      return {
        ok: false,
        message: `Article body should be at least ${ARTICLE_BODY_MIN_READABLE} characters of readable text.`,
      };
    }

    // Validate optional FK references upfront so the create doesn't
    // fail with an opaque Prisma error message.
    if (parsed.data.categoryId) {
      const cat = await db.articleCategory.findUnique({
        where: { id: parsed.data.categoryId },
        select: { id: true },
      });
      if (!cat) return { ok: false, message: "Category not found." };
    }
    if (parsed.data.authorId) {
      const author = await db.user.findUnique({
        where: { id: parsed.data.authorId },
        select: { id: true },
      });
      if (!author) return { ok: false, message: "Author not found." };
    }

    const article = await withUniqueSlug(parsed.data.title, (slug) =>
      db.article.create({
        data: {
          slug,
          title: parsed.data.title,
          excerpt: parsed.data.excerpt || null,
          body: bodyHtml,
          coverImageUrl: parsed.data.coverImageUrl || null,
          categoryId: parsed.data.categoryId || null,
          // Default the author to the creating admin if they didn't
          // pick one — saves a click in the common case.
          authorId: parsed.data.authorId || session.user.id,
          tags: parseTags(parsed.data.tagsRaw ?? ""),
          readingTimeMins: estimateReadingTime(bodyHtml),
          // Created as DRAFT; admin publishes via setArticleStatus.
          status: "DRAFT",
        },
      }),
    );

    await audit({
      actorId: session.user.id,
      action: "article.created",
      entity: "Article",
      entityId: article.id,
      meta: { title: parsed.data.title },
    });

    revalidatePath("/admin/articles");
    return { ok: true, articleId: article.id, slug: article.slug };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[article] create failed");
    return { ok: false, message: "Couldn't create the article. Try again." };
  }
}

// ─── Article update ───────────────────────────────────────────────

const UpdateArticleSchema = ArticleSchema.extend({
  articleId: z.string(),
});

export async function updateArticle(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await requireAdmin();
    const parsed = UpdateArticleSchema.safeParse({
      articleId: formData.get("articleId"),
      title: formData.get("title"),
      excerpt: formData.get("excerpt") || "",
      body: formData.get("body"),
      coverImageUrl: formData.get("coverImageUrl") || "",
      categoryId: formData.get("categoryId") || "",
      authorId: formData.get("authorId") || "",
      tagsRaw: formData.get("tagsRaw") || "",
    });
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Check the form.",
      };
    }

    const bodyHtml = sanitizeRichTextHtml(parsed.data.body);
    if (plainTextLength(bodyHtml) < ARTICLE_BODY_MIN_READABLE) {
      return {
        ok: false,
        message: `Article body should be at least ${ARTICLE_BODY_MIN_READABLE} characters of readable text.`,
      };
    }

    if (parsed.data.categoryId) {
      const cat = await db.articleCategory.findUnique({
        where: { id: parsed.data.categoryId },
        select: { id: true },
      });
      if (!cat) return { ok: false, message: "Category not found." };
    }
    if (parsed.data.authorId) {
      const author = await db.user.findUnique({
        where: { id: parsed.data.authorId },
        select: { id: true },
      });
      if (!author) return { ok: false, message: "Author not found." };
    }

    const article = await db.article.update({
      where: { id: parsed.data.articleId },
      data: {
        title: parsed.data.title,
        excerpt: parsed.data.excerpt || null,
        body: bodyHtml,
        coverImageUrl: parsed.data.coverImageUrl || null,
        categoryId: parsed.data.categoryId || null,
        // Keep the existing author if the form didn't override.
        ...(parsed.data.authorId ? { authorId: parsed.data.authorId } : {}),
        tags: parseTags(parsed.data.tagsRaw ?? ""),
        readingTimeMins: estimateReadingTime(bodyHtml),
      },
    });

    await audit({
      actorId: session.user.id,
      action: "article.updated",
      entity: "Article",
      entityId: article.id,
    });

    revalidatePath("/admin/articles");
    revalidatePath(`/admin/articles/${article.id}`);
    revalidatePath(`/articles/${article.slug}`);
    revalidatePath("/articles");
    return { ok: true, message: "Saved." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[article] update failed");
    return { ok: false, message: "Couldn't save." };
  }
}

// ─── Article status transitions ───────────────────────────────────

export async function setArticleStatus(formData: FormData): Promise<FormState> {
  try {
    const session = await requireAdmin();
    const articleId = z.string().parse(formData.get("articleId"));
    const target = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).parse(formData.get("status"));

    const article = await db.article.findUnique({
      where: { id: articleId },
      select: { id: true, slug: true, status: true, publishedAt: true },
    });
    if (!article) return { ok: false, message: "Article not found." };

    await db.article.update({
      where: { id: article.id },
      data: {
        status: target,
        // publishedAt is set on first PUBLISH transition and preserved
        // afterwards (so the article URL keeps a stable date for SEO).
        // ARCHIVED doesn't clear it — the URL stays alive at the
        // original publish date.
        ...(target === "PUBLISHED" && !article.publishedAt
          ? { publishedAt: new Date() }
          : {}),
      },
    });

    await audit({
      actorId: session.user.id,
      action: "article.status_changed",
      entity: "Article",
      entityId: article.id,
      meta: { from: article.status, to: target },
    });

    revalidatePath("/admin/articles");
    revalidatePath(`/admin/articles/${article.id}`);
    revalidatePath(`/articles/${article.slug}`);
    revalidatePath("/articles");
    return { ok: true, message: `Article ${target.toLowerCase()}.` };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[article] status change failed");
    return { ok: false, message: "Couldn't update status." };
  }
}

export async function toggleArticleFeatured(formData: FormData): Promise<FormState> {
  try {
    const session = await requireAdmin();
    const articleId = z.string().parse(formData.get("articleId"));
    const article = await db.article.findUnique({
      where: { id: articleId },
      select: { id: true, slug: true, featuredAt: true, status: true },
    });
    if (!article) return { ok: false, message: "Article not found." };
    // Only PUBLISHED articles can be featured — featuring a DRAFT
    // would surface it on the homepage despite the URL 404'ing.
    if (article.status !== "PUBLISHED" && !article.featuredAt) {
      return { ok: false, message: "Publish the article before featuring it." };
    }
    const next = article.featuredAt ? null : new Date();
    await db.article.update({
      where: { id: article.id },
      data: { featuredAt: next },
    });
    await audit({
      actorId: session.user.id,
      action: next ? "article.featured" : "article.unfeatured",
      entity: "Article",
      entityId: article.id,
    });
    revalidatePath("/admin/articles");
    revalidatePath(`/admin/articles/${article.id}`);
    revalidatePath(`/articles/${article.slug}`);
    revalidatePath("/articles");
    revalidatePath("/");
    return { ok: true, message: next ? "Featured." : "Unfeatured." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[article] toggle featured failed");
    return { ok: false, message: "Couldn't update." };
  }
}

// ─── Category CRUD ────────────────────────────────────────────────

const CategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(999).default(100),
});

export async function createArticleCategory(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await requireAdmin();
    const parsed = CategorySchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description") || "",
      sortOrder: formData.get("sortOrder") || 100,
    });
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Check the form.",
      };
    }
    const cat = await withUniqueSlug(parsed.data.name, (slug) =>
      db.articleCategory.create({
        data: {
          slug,
          name: parsed.data.name,
          description: parsed.data.description || null,
          sortOrder: parsed.data.sortOrder,
        },
      }),
    );
    await audit({
      actorId: session.user.id,
      action: "article_category.created",
      entity: "ArticleCategory",
      entityId: cat.id,
      meta: { name: parsed.data.name },
    });
    revalidatePath("/admin/articles");
    revalidatePath("/articles");
    return { ok: true, message: `Created "${cat.name}".` };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[article-category] create failed");
    return { ok: false, message: "Couldn't create category." };
  }
}
