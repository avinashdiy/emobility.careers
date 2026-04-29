import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Dedicated jobs sitemap. Google's Jobs crawler ingests sitemaps separately
 * from regular search and prefers a smaller, jobs-only sitemap with `lastmod`
 * timestamps so it can re-crawl quickly when listings change.
 *
 * Cap of 50,000 URLs per sitemap (per the protocol). When the platform
 * exceeds that, this should be sharded behind a sitemap index.
 */

export const runtime = "nodejs";
// CDN-cached via Cache-Control; not pre-rendered (the build has no DB).
export const dynamic = "force-dynamic";

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const jobs = await db.jobPosting.findMany({
    where: { status: "OPEN", company: { verificationStatus: "VERIFIED" } },
    orderBy: { publishedAt: "desc" },
    take: 50_000,
    select: { slug: true, updatedAt: true, publishedAt: true },
  });

  const urls = jobs
    .map((j) => {
      const lastmod = (j.updatedAt ?? j.publishedAt ?? new Date()).toISOString();
      // Canonical URL is the slug-based route. The legacy `/jobs/{id}`
      // path 308-redirects here, but pointing search engines straight
      // at the canonical avoids a redirect chain on every crawl.
      return `  <url>
    <loc>${escape(`${base}/job/${j.slug}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300",
    },
  });
}
