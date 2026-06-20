import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ShareDropdown } from "@/components/social/ShareDropdown";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { env } from "@/lib/env";
import { relativeTime } from "@/lib/utils";
import { htmlOrFallback } from "@/lib/cms/job-sanitize";

/**
 * Shared renderer for the public Article detail surface.
 *
 * Originally lived inline in app/articles/[slug]/page.tsx. Extracted
 * because Articles now have a root-level permalink at /<slug>
 * (served via the [username] catch-all) and we want one source of
 * truth for the rendering — header chrome, hero, body, share row,
 * related rail, footer.
 *
 * `canonicalUrl` is passed in because the caller knows whether the
 * page is being served at /<slug> (the new canonical home) or at
 * /articles/<slug> (now a 308 redirect, kept for legacy links).
 */

export interface ArticleDetailBodyArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  coverImageUrl: string | null;
  tags: string[];
  status: string;
  publishedAt: Date | null;
  readingTimeMins: number;
  viewCount: number;
  categoryId: string | null;
  category: { slug: string; name: string } | null;
  author: {
    name: string | null;
    candidateProfile: {
      slug: string;
      profilePhotoUrl: string | null;
      headline: string | null;
    } | null;
  } | null;
}

export interface RelatedArticleCard {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  readingTimeMins: number;
}

interface Props {
  article: ArticleDetailBodyArticle;
  related: RelatedArticleCard[];
  previewMode?: boolean;
  /// Canonical URL for this article. Used by the share button so the
  /// shared URL is the canonical one, not whatever path the user
  /// happens to be on.
  canonicalUrl: string;
}

export function ArticleDetailBody({
  article,
  related,
  previewMode = false,
  canonicalUrl,
}: Props) {
  return (
    <>
      <SiteHeader />
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
        {/* Compact header — the title + meta live HERE in white, set
            over the cover image (with a dark scrim for legibility) or
            the brand gradient. Replaces the old full-bleed 3:1 hero
            that left a big empty band above a black title. Height is
            driven by the content padding, so the header hugs the title
            instead of reserving a fixed tall block. */}
        <header className="relative overflow-hidden">
          {article.coverImageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={article.coverImageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/55 to-black/40" />
            </>
          ) : (
            <div className="emce-hero-gradient absolute inset-0" />
          )}

          <div className="relative container max-w-3xl py-9 md:py-12">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {article.category && (
                <Link
                  href={`/articles?category=${article.category.slug}`}
                  className="transition hover:opacity-90"
                >
                  <Badge variant="default" size="sm">
                    {article.category.name}
                  </Badge>
                </Link>
              )}
              <span className="text-hint text-white/75">
                ⏱ {article.readingTimeMins} min read
                {article.publishedAt && <> · {relativeTime(article.publishedAt)}</>}
                {article.viewCount > 0 && (
                  <> · {article.viewCount.toLocaleString()} views</>
                )}
              </span>
            </div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white md:text-4xl">
              {article.title}
            </h1>
            {article.excerpt && (
              <p className="mt-3 max-w-2xl text-lg text-white/85">{article.excerpt}</p>
            )}
          </div>
        </header>

        <article className="container max-w-3xl py-8 md:py-10">
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
              url={canonicalUrl}
              title={article.title}
              description={article.excerpt ?? undefined}
              label="Share"
            />
          </div>

          {/* Body — sanitised HTML from the rich-text editor */}
          <div
            className="prose prose-emce mt-8 max-w-none text-body text-emce-text"
            dangerouslySetInnerHTML={{ __html: htmlOrFallback(article.body) }}
          />

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

          {/* Standing CTA — every article reaches the bottom with a
              call to action that drives the platform's two business
              outcomes: sign-ups (broad funnel) and DIYguru course
              enrolment (revenue funnel). Inline placement after the
              tags + before the related-articles rail keeps it inside
              the article's attention space. */}
          <aside className="mt-10 rounded-xl bg-emce-light-soft p-5">
            <p className="text-section font-extrabold text-emce-darkest">
              📈 Take your EV career further
            </p>
            <p className="mt-2 text-body text-emce-text-sec">
              Sign up free on emobility.careers — match with EV jobs, browse
              200+ JD templates, and unlock the salary database. Already on
              the platform? Explore DIYguru&apos;s AICTE-approved EV
              certification programs.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/signup"
                className="inline-flex h-10 items-center justify-center rounded-md bg-emce-dark px-5 text-sm font-bold text-white hover:bg-emce-darkest"
              >
                Create free account →
              </Link>
              <a
                href="https://diyguru.org"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-md border border-emce-border bg-white px-5 text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
              >
                Enrol in DIYguru ↗
              </a>
            </div>
          </aside>
        </article>

        {/* Related rail — same category, newest 3 */}
        {related.length > 0 && (
          <section className="border-t border-emce-border bg-white">
            <div className="container max-w-5xl py-10">
              <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
                More in {article.category?.name ?? "EV knowledge"}
              </p>
              <ul className="mt-3 grid gap-3 md:grid-cols-3">
                {related.map((r) => (
                  <li key={r.id}>
                    {/* Related articles link to the root permalink — the
                        new canonical home. /articles/<slug> 308s to here. */}
                    <Link href={`/${r.slug}`} className="block">
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

/**
 * Build the JSON-LD `Article` schema object for an article. Returned
 * as a plain object so the caller stringifies + injects it inside a
 * <script type="application/ld+json"> tag. Centralised here so
 * /[slug] and the legacy /articles/[slug] redirect produce identical
 * structured data.
 */
export function buildArticleJsonLd({
  article,
  canonicalUrl,
}: {
  article: ArticleDetailBodyArticle & { updatedAt?: Date };
  canonicalUrl: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.excerpt ?? undefined,
    image: article.coverImageUrl ? [article.coverImageUrl] : undefined,
    datePublished: article.publishedAt?.toISOString(),
    dateModified: article.updatedAt?.toISOString(),
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
      "@id": canonicalUrl,
    },
  };
}

// ─── FAQ rich result ───────────────────────────────────────────────

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanText(s: string): string {
  return decodeEntities(stripTags(s)).trim();
}

/**
 * Extract Question/Answer pairs from an article body for FAQPage
 * structured data. Matches the Q&A pattern our interview articles use:
 * an `<h3>` question heading followed by one or more `<p>` answer
 * paragraphs, up to the next heading. Articles that don't follow this
 * shape (e.g. question lists with no answers) yield 0 pairs and get no
 * FAQ schema — keeping the markup honest (every Question must have a
 * visible answer per Google's FAQ guidelines).
 */
export function extractQaPairs(html: string): { question: string; answer: string }[] {
  const pairs: { question: string; answer: string }[] = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h2|<h3|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let q = cleanText(m[1])
      // drop a leading "Q12." / "12)" numbering prefix
      .replace(/^Q?\s*\d+\s*[.)]\s*/i, "")
      // drop a trailing difficulty tag like "(Basic)"
      .replace(/\s*\((?:Basic|Intermediate|Advanced)\)\s*$/i, "")
      .trim();
    const answer = Array.from(m[2].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
      .map((x) => cleanText(x[1]))
      .filter(Boolean)
      .join(" ")
      .trim();
    if (q.length >= 8 && answer.length >= 20) pairs.push({ question: q, answer });
  }
  return pairs;
}

/**
 * Build FAQPage JSON-LD for Q&A / interview articles so they're
 * eligible for Google's FAQ rich result (and parsed cleanly by AI
 * crawlers). Gated to interview-prep content where we can extract real
 * Q+A pairs, so we never emit a hollow FAQPage. Returns null when not
 * applicable — the caller skips the <script> entirely.
 */
export function buildFaqJsonLd({
  article,
}: {
  article: Pick<ArticleDetailBodyArticle, "body" | "title"> & {
    category: { slug: string } | null;
  };
}): object | null {
  const isQa =
    article.category?.slug === "ev-interview-prep" ||
    /interview question/i.test(article.title);
  if (!isQa) return null;

  const pairs = extractQaPairs(article.body);
  if (pairs.length < 5) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pairs.slice(0, 100).map((p) => ({
      "@type": "Question",
      name: p.question,
      acceptedAnswer: { "@type": "Answer", text: p.answer },
    })),
  };
}
