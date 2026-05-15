import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { findFtsIds } from "@/lib/search-fts";
import { env } from "@/lib/env";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "EV industry knowledge — explainers, deep dives, careers",
  description:
    "Curated explainers and deep dives on battery, charging, motor, software, and careers in the EV industry — written for people building electric mobility.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/articles` },
  openGraph: {
    type: "website",
    url: `${env.NEXT_PUBLIC_APP_URL}/articles`,
    title: "EV knowledge · eMobility Careers",
    description: "Explainers, deep dives, and career guides for the EV industry.",
  },
};

const PAGE_SIZE = 12;

/**
 * Public Article index. Three filters compose:
 *   • `?q=...` — FTS over title/excerpt/body/tags
 *   • `?category=<slug>` — single-category filter
 *   • `?page=N` — pagination (12 per page)
 *
 * Default ordering: PUBLISHED desc by publishedAt. Featured rail
 * appears at the top when no filters are active (so the curated set
 * remains visible on the bare /articles landing).
 */
export default async function ArticlesIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const categorySlug = sp.category;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;

  // Resolve the category id from slug (single round-trip; cheap).
  const category = categorySlug
    ? await db.articleCategory.findUnique({
        where: { slug: categorySlug },
        select: { id: true, slug: true, name: true, description: true },
      })
    : null;

  // FTS pre-pass — same hybrid pattern we use elsewhere. When q
  // matches nothing, short-circuit to an empty page.
  let ftsIdFilter: { id: { in: string[] } } | undefined;
  if (q) {
    const ids = await findFtsIds("Article", q, 1000);
    if (ids === null || ids.length === 0) {
      // null = empty input (treat as no filter); [] = matched
      // nothing (render empty state). Differentiate.
      if (ids !== null) ftsIdFilter = { id: { in: [] } };
    } else {
      ftsIdFilter = { id: { in: ids } };
    }
  }

  const where = {
    status: "PUBLISHED" as const,
    ...(category ? { categoryId: category.id } : {}),
    ...ftsIdFilter,
  };

  const [articles, total, categories, featured] = await Promise.all([
    db.article.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }],
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        coverImageUrl: true,
        readingTimeMins: true,
        publishedAt: true,
        tags: true,
        viewCount: true,
        category: { select: { slug: true, name: true } },
        author: {
          select: {
            name: true,
            candidateProfile: { select: { profilePhotoUrl: true } },
          },
        },
      },
    }),
    db.article.count({ where }),
    db.articleCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    // Featured rail — render only on the bare landing (no filters)
    // and on page 1, so deeper paginated views aren't dominated by
    // it. We pull 3 featured articles separately so they aren't
    // double-counted into the main grid.
    !q && !category && page === 1
      ? db.article.findMany({
          where: { status: "PUBLISHED", featuredAt: { not: null } },
          orderBy: { featuredAt: "desc" },
          take: 3,
          select: {
            id: true,
            slug: true,
            title: true,
            excerpt: true,
            coverImageUrl: true,
            readingTimeMins: true,
            publishedAt: true,
            category: { select: { slug: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <section className="emce-mesh-hero relative text-white">
          <span
            aria-hidden
            className="pointer-events-none absolute -left-10 top-10 hidden h-48 w-48 rounded-full bg-emce-mid/30 blur-3xl animate-float md:block"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 bottom-2 hidden h-56 w-56 rounded-full bg-emce-light/20 blur-3xl animate-float md:block"
            style={{ animationDelay: "1.6s" }}
          />
          <div
            aria-hidden
            className="emce-dot-grid pointer-events-none absolute inset-0 opacity-25"
          />
          <div className="container relative max-w-5xl py-10 md:py-14">
            <div className="emce-pill mb-3 animate-fade-up">
              <span aria-hidden>📚</span>
              <span>EV knowledge</span>
            </div>
            <h1
              className="animate-fade-up text-2xl font-extrabold leading-tight tracking-tight md:text-4xl"
              style={{ animationDelay: "80ms" }}
            >
              Explainers, deep dives, and{" "}
              <span className="emce-text-gradient">career guides for EV.</span>
            </h1>
            <p
              className="animate-fade-up mt-3 max-w-2xl text-white/85 md:text-lg"
              style={{ animationDelay: "160ms" }}
            >
              Curated reading on battery, charging, motor, software, and the
              people making electric mobility happen.
            </p>
          </div>
        </section>

        <div className="container max-w-5xl space-y-6 py-8 md:py-10">
          {/* Search + category filter row */}
          <Card className="p-4">
            <form className="grid gap-3 sm:grid-cols-12">
              {category && (
                <input type="hidden" name="category" value={category.slug} />
              )}
              <Input
                name="q"
                defaultValue={q}
                placeholder="Search by title, topic, or tag — e.g. 'BMS', 'CCS connector'"
                className="sm:col-span-9"
              />
              <Button type="submit" className="sm:col-span-3">
                Search
              </Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/articles"
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  !category
                    ? "bg-emce-dark text-emce-light"
                    : "bg-emce-light-soft text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
                }`}
              >
                All
              </Link>
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/articles?category=${c.slug}`}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    category?.slug === c.slug
                      ? "bg-emce-dark text-emce-light"
                      : "bg-emce-light-soft text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
                  }`}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </Card>

          {/* Featured rail — only on default landing */}
          {featured.length > 0 && (
            <section>
              <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
                Featured
              </p>
              <div className="emce-stagger mt-2 grid gap-3 md:grid-cols-3">
                {featured.map((a) => (
                  <Link key={a.id} href={`/articles/${a.slug}`} className="block">
                    <Card className="h-full overflow-hidden p-0 transition hover:border-emce-mid hover:shadow-emce-hover">
                      {a.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.coverImageUrl}
                          alt=""
                          className="aspect-[3/2] w-full object-cover"
                        />
                      ) : (
                        <div className="emce-hero-gradient aspect-[3/2]" />
                      )}
                      <div className="p-4">
                        {a.category && (
                          <Badge variant="default" size="sm">
                            {a.category.name}
                          </Badge>
                        )}
                        <h3 className="mt-2 font-bold text-emce-text line-clamp-2">{a.title}</h3>
                        {a.excerpt && (
                          <p className="mt-1 text-hint text-emce-text-sec line-clamp-2">
                            {a.excerpt}
                          </p>
                        )}
                        <p className="mt-2 text-hint text-emce-text-muted">
                          ⏱ {a.readingTimeMins} min read
                        </p>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Main grid */}
          <section>
            {category && (
              <div className="mb-3">
                <h2 className="text-section text-emce-text">{category.name}</h2>
                {category.description && (
                  <p className="text-hint text-emce-text-sec">{category.description}</p>
                )}
              </div>
            )}
            {articles.length === 0 ? (
              <EmptyState
                icon="📚"
                title={q ? `No articles match "${q}"` : "No articles yet"}
                body={
                  q
                    ? "Try a broader keyword, or browse by category."
                    : "Check back soon — the editorial team is curating the first set."
                }
              />
            ) : (
              <ul className="emce-stagger grid gap-3 md:grid-cols-2">
                {articles.map((a) => (
                  <li key={a.id}>
                    <Link href={`/articles/${a.slug}`} className="block">
                      <Card className="h-full overflow-hidden p-0 transition hover:border-emce-mid hover:shadow-emce-hover">
                        {a.coverImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.coverImageUrl}
                            alt=""
                            className="aspect-[3/1] w-full object-cover"
                          />
                        ) : (
                          <div className="emce-hero-gradient aspect-[3/1]" />
                        )}
                        <div className="p-4">
                          <div className="flex flex-wrap items-baseline gap-2">
                            {a.category && (
                              <Badge variant="default" size="sm">
                                {a.category.name}
                              </Badge>
                            )}
                            <span className="text-hint text-emce-text-muted">
                              ⏱ {a.readingTimeMins} min · {a.publishedAt && relativeTime(a.publishedAt)}
                            </span>
                          </div>
                          <h3 className="mt-2 font-bold text-emce-text line-clamp-2">{a.title}</h3>
                          {a.excerpt && (
                            <p className="mt-1 text-hint text-emce-text-sec line-clamp-3">
                              {a.excerpt}
                            </p>
                          )}
                          {a.author?.name && (
                            <p className="mt-2 text-hint text-emce-text-muted">
                              by {a.author.name}
                            </p>
                          )}
                        </div>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              {page > 1 && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/articles?${new URLSearchParams({
                      ...(q && { q }),
                      ...(category && { category: category.slug }),
                      page: String(page - 1),
                    }).toString()}`}
                  >
                    ← Prev
                  </Link>
                </Button>
              )}
              <span className="text-sm text-emce-text-sec">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/articles?${new URLSearchParams({
                      ...(q && { q }),
                      ...(category && { category: category.slug }),
                      page: String(page + 1),
                    }).toString()}`}
                  >
                    Next →
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
