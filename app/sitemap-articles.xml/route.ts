import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { renderUrlSet, xmlHeaders } from "@/lib/seo/sitemap-xml";

/**
 * Articles sitemap — every PUBLISHED Article surfaced at its
 * root-level permalink `/<slug>`. Distinct from sitemap-posts.xml
 * (social Post table) and sitemap-static.xml (hand-curated routes).
 *
 * Capped at 50k per the sitemap protocol. We're at ~50 published
 * articles in steady state — one shard is plenty for years.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const articles = await db.article.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { updatedAt: "desc" },
    take: 50_000,
    select: { slug: true, updatedAt: true },
  });

  const xml = renderUrlSet([
    // The /articles index itself — broad listing page, high priority
    // because it ranks for "EV career articles" / "EV blog" queries.
    {
      loc: `${base}/articles`,
      lastmod: new Date(),
      changefreq: "daily",
      priority: 0.8,
    },
    ...articles.map((a) => ({
      loc: `${base}/${a.slug}`,
      lastmod: a.updatedAt,
      changefreq: "monthly" as const,
      priority: 0.7,
    })),
  ]);

  return new Response(xml, { status: 200, headers: xmlHeaders(3600) });
}
