import { permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Legacy article URL — every article now lives at the root-level
 * permalink `/<slug>` (served by app/[username]/page.tsx). This
 * route exists only to 308-redirect old /articles/<slug> links so
 * inbound shares, search-engine snippets and bookmarks keep working
 * and pass link equity to the new canonical home.
 *
 * The route stays here permanently — removing it would break every
 * historical link. The redirect is cheap (a single DB lookup to
 * resolve the slug → existence; the actual content lives at /<slug>).
 *
 * If the slug doesn't resolve we still redirect — the root catch-all
 * will then 404 with its own (better) "page not found" surface that
 * also handles candidate-profile + CMS-page lookups.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // Even on the legacy URL, declare the root permalink as canonical
  // so any crawler that lands here (before following the 308) sees
  // where the real home is.
  return {
    title: "Redirecting…",
    alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/${slug}` },
    robots: { index: false, follow: true },
  };
}

export const dynamic = "force-dynamic";

export default async function LegacyArticleRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Single touch on the DB so we can log a useful 404 in the calling
  // surface — but we redirect even when the slug is unknown, because
  // the [username] catch-all is the right place to render "not found"
  // anyway (it knows about Page, Article and CandidateProfile).
  await db.article.findUnique({
    where: { slug },
    select: { id: true },
  }).catch(() => null);

  permanentRedirect(`/${slug}`);
}
