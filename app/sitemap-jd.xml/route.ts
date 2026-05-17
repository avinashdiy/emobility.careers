import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { renderUrlSet, xmlHeaders } from "@/lib/seo/sitemap-xml";

/**
 * JD-templates sitemap — one entry per PUBLISHED row at /jd/<slug>.
 * Hosted at a stable URL so Google can crawl the 200-entry library
 * without scraping the directory page itself. Capped at 50k per the
 * sitemap protocol; we're at ~200 in steady state so a single shard
 * fits comfortably.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const templates = await db.jobDescriptionTemplate.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { updatedAt: "desc" },
    take: 50_000,
    select: { slug: true, updatedAt: true },
  });

  const xml = renderUrlSet([
    // Directory page itself first — higher priority than individual
    // JDs so it ranks for the broad "EV job descriptions" query.
    {
      loc: `${base}/jd`,
      lastmod: new Date(),
      changefreq: "daily",
      priority: 0.8,
    },
    ...templates.map((t) => ({
      loc: `${base}/jd/${t.slug}`,
      lastmod: t.updatedAt,
      changefreq: "weekly" as const,
      priority: 0.7,
    })),
  ]);

  return new Response(xml, { status: 200, headers: xmlHeaders(3600) });
}
