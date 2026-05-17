import { env } from "@/lib/env";
import { renderSitemapIndex, xmlHeaders } from "@/lib/seo/sitemap-xml";

/**
 * Legacy alias for `/sitemap_index.xml`. Search engines that
 * discovered `/sitemap.xml` before sharding landed (or that probe
 * the conventional path) get the same sitemap-index document.
 *
 * Returning the index here rather than redirecting avoids an extra
 * round-trip on every crawl + keeps Search Console from flagging
 * the old URL as a "redirect" type instead of a sitemap.
 */

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const now = new Date();

  const xml = renderSitemapIndex([
    { loc: `${base}/sitemap-static.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies.xml`, lastmod: now },
    { loc: `${base}/sitemap-institutions.xml`, lastmod: now },
    { loc: `${base}/sitemap-candidates.xml`, lastmod: now },
    { loc: `${base}/sitemap-posts.xml`, lastmod: now },
    { loc: `${base}/sitemap-tags.xml`, lastmod: now },
  ]);

  return new Response(xml, { status: 200, headers: xmlHeaders(3600) });
}
