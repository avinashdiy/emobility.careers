import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { ArticleEditor } from "@/components/articles/ArticleEditor";
import {
  setArticleStatus as _setStatus,
  toggleArticleFeatured as _toggleFeatured,
} from "@/server/articles/actions";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit article" };
export const dynamic = "force-dynamic";

// Page-level form-action shims (FormState → void).
async function setArticleStatus(formData: FormData): Promise<void> {
  "use server";
  await _setStatus(formData);
}
async function toggleArticleFeatured(formData: FormData): Promise<void> {
  "use server";
  await _toggleFeatured(formData);
}

/**
 * Admin edit + lifecycle controls for a single article. Layout:
 *
 *   1. Header strip — title, status badge, featured pill, view counts.
 *   2. Lifecycle action row — Publish / Archive / Feature buttons.
 *      Visible state-machine: which transitions are legal.
 *   3. Editor form (ArticleEditor) — same component as /new but
 *      with `articleId` so submits dispatch updateArticle.
 */
export default async function AdminArticleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;

  const [article, categories] = await Promise.all([
    db.article.findUnique({
      where: { id },
      include: {
        category: { select: { name: true } },
        author: { select: { name: true, email: true } },
      },
    }),
    db.articleCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  if (!article) notFound();

  return (
    <AdminShell>
      <div className="container max-w-3xl space-y-5 py-8">
        <div>
          <Link href="/admin/articles" className="text-hint text-emce-dark hover:underline">
            ← All articles
          </Link>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <h1 className="text-dashboard text-emce-text">{article.title}</h1>
            <StatusBadge status={article.status} />
            {article.featuredAt && <Badge variant="success" size="sm">⭐ Featured</Badge>}
          </div>
          <p className="text-hint text-emce-text-sec">
            By {article.author.name ?? article.author.email}
            {article.category && <> · {article.category.name}</>}
            {" · "}⏱ {article.readingTimeMins} min · {article.viewCount.toLocaleString()} views
            {article.publishedAt && <> · published {relativeTime(article.publishedAt)}</>}
            {" · "}/articles/{article.slug}
          </p>
        </div>

        {/* Lifecycle actions */}
        <Card className="p-4">
          <h2 className="text-section text-emce-text">Lifecycle</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            DRAFT → PUBLISHED → ARCHIVED. Featured surfaces on /articles
            + the homepage rail.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {article.status === "DRAFT" && (
              <form action={setArticleStatus}>
                <input type="hidden" name="articleId" value={article.id} />
                <input type="hidden" name="status" value="PUBLISHED" />
                <Button type="submit" size="sm">
                  Publish →
                </Button>
              </form>
            )}
            {article.status === "PUBLISHED" && (
              <>
                <form action={setArticleStatus}>
                  <input type="hidden" name="articleId" value={article.id} />
                  <input type="hidden" name="status" value="DRAFT" />
                  <Button type="submit" variant="ghost" size="sm">
                    Move to draft
                  </Button>
                </form>
                <form action={setArticleStatus}>
                  <input type="hidden" name="articleId" value={article.id} />
                  <input type="hidden" name="status" value="ARCHIVED" />
                  <ConfirmSubmit
                    variant="ghost"
                    size="sm"
                    confirm="Archive this article? URL stays alive for SEO but it's removed from the /articles index."
                  >
                    Archive
                  </ConfirmSubmit>
                </form>
                <form action={toggleArticleFeatured}>
                  <input type="hidden" name="articleId" value={article.id} />
                  <Button type="submit" variant="outline" size="sm">
                    {article.featuredAt ? "Unfeature" : "Feature"}
                  </Button>
                </form>
              </>
            )}
            {article.status === "ARCHIVED" && (
              <form action={setArticleStatus}>
                <input type="hidden" name="articleId" value={article.id} />
                <input type="hidden" name="status" value="PUBLISHED" />
                <Button type="submit" size="sm">
                  Restore (publish)
                </Button>
              </form>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/articles/${article.slug}`}>
                {article.status === "DRAFT" ? "Preview →" : "View public →"}
              </Link>
            </Button>
          </div>
        </Card>

        <ArticleEditor
          articleId={article.id}
          initial={{
            title: article.title,
            excerpt: article.excerpt,
            body: article.body,
            coverImageUrl: article.coverImageUrl,
            categoryId: article.categoryId,
            tags: article.tags,
          }}
          categories={categories}
        />
      </div>
    </AdminShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PUBLISHED") return <Badge variant="success">Published</Badge>;
  if (status === "ARCHIVED") return <Badge variant="outline">Archived</Badge>;
  return <Badge variant="warning">Draft</Badge>;
}
