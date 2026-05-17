import { env } from "@/lib/env";
import { renderSitemapIndex, xmlHeaders } from "@/lib/seo/sitemap-xml";

/**
 * Sitemap index — Google / Bing read this first and fan out to each
 * shard. Submitted to Search Console as the single sitemap entry.
 *
 * Sharding rules:
 *   • Each shard is its own route handler so it can have a tailored
 *     Cache-Control (jobs change frequently, institutions barely move).
 *   • Single shard caps at 50k URLs per the sitemap protocol. If
 *     candidates ever exceed 50k we should paginate (`-1`, `-2`,
 *     etc.) — see TODO in sitemap-candidates.xml.
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
    { loc: `${base}/sitemap-jd.xml`, lastmod: now },
    { loc: `${base}/sitemap-articles.xml`, lastmod: now },
    { loc: `${base}/sitemap-candidates.xml`, lastmod: now },
    { loc: `${base}/sitemap-posts.xml`, lastmod: now },
    { loc: `${base}/sitemap-tags.xml`, lastmod: now },
  ]);

  return new Response(xml, { status: 200, headers: xmlHeaders(3600) });
}
