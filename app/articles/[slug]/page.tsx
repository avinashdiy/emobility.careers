import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ShareDropdown } from "@/components/social/ShareDropdown";
import { env } from "@/lib/env";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Public article detail. SEO-tuned: full OpenGraph + JSON-LD
 * Article schema, canonical URL, reading-time-aware title.
 *
 * DRAFT / ARCHIVED visibility:
 *   • DRAFT  — admin preview only (banner shown). Anyone else 404s.
 *   • ARCHIVED — URL alive (preserves SEO/inbound links) but
 *     marked as "archived" + suppressed from /articles index.
 *   • PUBLISHED — public.
 *
 * Related-articles section pulls 3 articles in the same category,
 * excluding the current article. Falls back to "latest" if there's
 * no category or no siblings.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await db.article.findUnique({
    where: { slug },
    select: {
      title: true,
      excerpt: true,
      coverImageUrl: true,
      status: true,
      publishedAt: true,
      author: { select: { name: true } },
      category: { select: { name: true } },
    },
  });
  if (!article || article.status === "DRAFT") {
    return { title: "Article not found", robots: { index: false, follow: false } };
  }
  const description =
    article.excerpt ?? `Read about ${article.title} on eMobility Careers.`;
  return {
    title: article.title,
    description,
    alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/articles/${slug}` },
    openGraph: {
      type: "article",
      url: `${env.NEXT_PUBLIC_APP_URL}/articles/${slug}`,
      title: article.title,
      description,
      images: article.coverImageUrl ? [article.coverImageUrl] : undefined,
      publishedTime: article.publishedAt?.toISOString(),
      authors: article.author?.name ? [article.author.name] : undefined,
      section: article.category?.name,
    },
    twitter: {
      card: article.coverImageUrl ? "summary_large_image" : "summary",
      title: article.title,
      description,
    },
    robots: article.status === "ARCHIVED"
      ? { index: false, follow: true }
      : { index: true, follow: true },
  };
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();

  const article = await db.article.findUnique({
    where: { slug },
    include: {
      category: { select: { slug: true, name: true } },
      author: {
        select: {
          name: true,
          candidateProfile: {
            select: { slug: true, profilePhotoUrl: true, headline: true },
          },
        },
      },
    },
  });
  if (!article) notFound();

  // Visibility gate. DRAFT 404s for non-admin; admin sees a preview
  // banner. ARCHIVED stays public so inbound links don't break.
  const isAdmin = session?.user?.role === "ADMIN";
  if (article.status === "DRAFT" && !isAdmin) notFound();
  const previewMode = article.status === "DRAFT" && isAdmin;

  // Fire-and-forget view tracking. Skipped in preview mode so admin
  // dry-runs don't inflate the counter.
  if (!previewMode) {
    db.article.update({
      where: { id: article.id },
      data: { viewCount: { increment: 1 } },
    }).catch(() => {});
  }

  // Related articles — same category, excluding self, latest 3.
  const related = article.categoryId
    ? await db.article.findMany({
        where: {
          status: "PUBLISHED",
          categoryId: article.categoryId,
          id: { not: article.id },
        },
        orderBy: { publishedAt: "desc" },
        take: 3,
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          coverImageUrl: true,
          readingTimeMins: true,
        },
      })
    : [];

  // Article JSON-LD for Google indexing.
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.excerpt ?? undefined,
    image: article.coverImageUrl ? [article.coverImageUrl] : undefined,
    datePublished: article.publishedAt?.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: article.author?.name
      ? { "@type": "Person", name: article.author.name }
      : undefined,
    publisher: {
      "@type": "Organization",
      name: "eMobility Careers",
      url: env.NEXT_PUBLIC_APP_URL,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${env.NEXT_PUBLIC_APP_URL}/articles/${slug}`,
    },
  };

  return (
    <>
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      {previewMode && (
        <div className="bg-emce-orange-light py-2 text-center text-sm text-emce-text">
          <strong>Draft preview</strong> — not visible to the public.{" "}
          <Link
            href={`/admin/articles/${article.id}`}
            className="font-bold text-emce-dark underline"
          >
            Open admin →
          </Link>
        </div>
      )}
      {article.status === "ARCHIVED" && !previewMode && (
        <div className="bg-emce-light-soft py-2 text-center text-hint text-emce-text-sec">
          📦 This article is archived but the link stays live.
        </div>
      )}

      <main className="min-h-screen bg-emce-light-bg">
        {/* Hero — full-bleed cover image when present, then the
            title + meta strip below it. Without an image we lean on
            the brand gradient to keep the page visually anchored. */}
        {article.coverImageUrl ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.coverImageUrl}
              alt=""
              className="aspect-[3/1] w-full object-cover"
            />
          </div>
        ) : (
          <div className="emce-hero-gradient aspect-[3/1] w-full" />
        )}

        <article className="container max-w-3xl py-8 md:py-12">
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            {article.category && (
              <Link
                href={`/articles?category=${article.category.slug}`}
                className="hover:underline"
              >
                <Badge variant="default" size="sm">
                  {article.category.name}
                </Badge>
              </Link>
            )}
            <span className="text-hint text-emce-text-muted">
              ⏱ {article.readingTimeMins} min read
              {article.publishedAt && <> · {relativeTime(article.publishedAt)}</>}
              {article.viewCount > 0 && <> · {article.viewCount.toLocaleString()} views</>}
            </span>
          </div>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-emce-text md:text-4xl">
            {article.title}
          </h1>
          {article.excerpt && (
            <p className="mt-3 text-lg text-emce-text-sec">{article.excerpt}</p>
          )}

          {/* Author + share row */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-emce-border py-3">
            <div className="flex items-center gap-2">
              <Avatar
                src={article.author?.candidateProfile?.profilePhotoUrl ?? null}
                name={article.author?.name ?? "Editor"}
                size="sm"
              />
              <div>
                <p className="font-bold text-emce-text">
                  {article.author?.candidateProfile?.slug ? (
                    <Link
                      href={`/${article.author.candidateProfile.slug}`}
                      className="hover:underline"
                    >
                      {article.author.name}
                    </Link>
                  ) : (
                    article.author?.name ?? "eMobility Editorial"
                  )}
                </p>
                {article.author?.candidateProfile?.headline && (
                  <p className="text-hint text-emce-text-sec line-clamp-1">
                    {article.author.candidateProfile.headline}
                  </p>
                )}
              </div>
            </div>
            <ShareDropdown
              url={`${env.NEXT_PUBLIC_APP_URL}/articles/${article.slug}`}
              title={article.title}
              description={article.excerpt ?? undefined}
              label="Share"
            />
          </div>

          {/* Body — preserves linebreaks; Markdown rendering can be
              swapped in here when the editor moves beyond plain
              text. The `prose` typography plugin gives us
              article-grade reading typography (drop caps, h2 sizing,
              link colour, blockquote indent) for free. */}
          <div className="prose prose-emce mt-8 max-w-none whitespace-pre-line text-body text-emce-text">
            {article.body}
          </div>

          {/* Tags */}
          {article.tags.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-1.5 border-t border-emce-border pt-6">
              {article.tags.map((t) => (
                <Link
                  key={t}
                  href={`/articles?q=${encodeURIComponent(t)}`}
                  className="rounded-full bg-emce-light-soft px-3 py-1 text-hint font-bold text-emce-dark hover:bg-emce-mid/30"
                >
                  #{t}
                </Link>
              ))}
            </div>
          )}
        </article>

        {/* Related — same category */}
        {related.length > 0 && (
          <section className="border-t border-emce-border bg-white">
            <div className="container max-w-5xl py-10">
              <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
                More in {article.category?.name ?? "EV knowledge"}
              </p>
              <ul className="mt-3 grid gap-3 md:grid-cols-3">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/articles/${r.slug}`} className="block">
                      <Card className="h-full overflow-hidden p-0 transition hover:border-emce-mid hover:shadow-emce-hover">
                        {r.coverImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.coverImageUrl}
                            alt=""
                            className="aspect-[3/2] w-full object-cover"
                          />
                        ) : (
                          <div className="emce-hero-gradient aspect-[3/2]" />
                        )}
                        <div className="p-4">
                          <h3 className="font-bold text-emce-text line-clamp-2">{r.title}</h3>
                          {r.excerpt && (
                            <p className="mt-1 text-hint text-emce-text-sec line-clamp-2">
                              {r.excerpt}
                            </p>
                          )}
                          <p className="mt-2 text-hint text-emce-text-muted">
                            ⏱ {r.readingTimeMins} min
                          </p>
                        </div>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
