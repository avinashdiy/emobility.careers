import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminShell } from "@/components/layout/admin-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { CategoryQuickAdd } from "@/components/articles/CategoryQuickAdd";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Articles — admin" };
export const dynamic = "force-dynamic";

const TABS = [
  { value: "DRAFT", label: "Drafts" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: Tab }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const tab: Tab = sp.status && TABS.some((t) => t.value === sp.status) ? sp.status : "DRAFT";

  const [articles, counts, categories] = await Promise.all([
    db.article.findMany({
      where: { status: tab },
      orderBy: tab === "DRAFT" ? { updatedAt: "desc" } : { publishedAt: "desc" },
      take: 100,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
        viewCount: true,
        readingTimeMins: true,
        featuredAt: true,
        category: { select: { name: true } },
        author: { select: { name: true, email: true } },
      },
    }),
    db.article.groupBy({
      by: ["status"],
      _count: true,
    }),
    db.articleCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { articles: true } },
      },
    }),
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return (
    <AdminShell>
      <div className="container max-w-5xl py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-dashboard text-emce-text">Editorial articles</h1>
            <p className="mt-1 text-hint text-emce-text-sec">
              Curated knowledge-base content. Publishes to /articles and is
              indexed by search engines for top-of-funnel SEO.
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/articles/new">+ New article</Link>
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={`/admin/articles?status=${t.value}`}
              aria-pressed={tab === t.value}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                tab === t.value
                  ? "bg-emce-dark text-emce-light"
                  : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
              }`}
            >
              {t.label} ({countMap[t.value] ?? 0})
            </Link>
          ))}
        </div>

        {articles.length === 0 ? (
          <EmptyState
            icon="📚"
            title={`No ${tab.toLowerCase()} articles`}
            body={
              tab === "DRAFT"
                ? "Click + New article to start writing."
                : "Check the other tabs."
            }
          />
        ) : (
          <ul className="mt-5 space-y-3">
            {articles.map((a) => (
              <li key={a.id}>
                <Link href={`/admin/articles/${a.id}`} className="block">
                  <Card className="p-4 hover:border-emce-mid hover:shadow-emce-hover">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-bold text-emce-text">{a.title}</span>
                      <StatusBadge status={a.status} />
                      {a.featuredAt && <Badge variant="success" size="sm">⭐ Featured</Badge>}
                      {a.category && (
                        <Badge variant="default" size="sm">{a.category.name}</Badge>
                      )}
                    </div>
                    {a.excerpt && (
                      <p className="mt-1 line-clamp-2 text-hint text-emce-text-sec">
                        {a.excerpt}
                      </p>
                    )}
                    <p className="mt-2 text-hint text-emce-text-muted">
                      {a.author.name ?? a.author.email}
                      {" · "}⏱ {a.readingTimeMins} min
                      {a.publishedAt && <> · published {relativeTime(a.publishedAt)}</>}
                      {a.status !== "PUBLISHED" && <> · last edited {relativeTime(a.updatedAt)}</>}
                      {a.viewCount > 0 && <> · {a.viewCount.toLocaleString()} views</>}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Categories — small admin surface for adding/managing */}
        <section className="mt-10">
          <h2 className="text-section text-emce-text">Categories</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Top-level taxonomy for /articles. Sort order drives display priority.
          </p>
          <Card className="mt-3 p-4">
            {categories.length === 0 ? (
              <p className="text-hint text-emce-text-muted">
                No categories yet. Add one below to start grouping articles.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {categories.map((c) => (
                  <li key={c.id} className="flex items-center justify-between">
                    <span>
                      <strong className="text-emce-text">{c.name}</strong>
                      <span className="text-emce-text-muted">
                        {" "}— /articles?category={c.slug} · {c._count.articles}{" "}
                        article{c._count.articles === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="text-hint text-emce-text-muted">
                      sort #{c.sortOrder}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 border-t border-emce-border pt-4">
              <CategoryQuickAdd />
            </div>
          </Card>
        </section>
      </div>
    </AdminShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PUBLISHED") return <Badge variant="success" size="sm">Published</Badge>;
  if (status === "ARCHIVED") return <Badge variant="outline" size="sm">Archived</Badge>;
  return <Badge variant="warning" size="sm">Draft</Badge>;
}
