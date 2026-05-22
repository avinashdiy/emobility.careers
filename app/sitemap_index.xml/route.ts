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
    // Per-country jobs shards — see sitemap.xml for the
    // submit-to-GSC-property mapping rationale.
    { loc: `${base}/sitemap-jobs-in.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs-ae.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs-uk.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs-au.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs-us.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs-my.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs-bd.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs-np.xml`, lastmod: now },
    // Per-country companies shards (PR 5).
    { loc: `${base}/sitemap-companies-in.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies-ae.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies-uk.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies-au.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies-us.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies-my.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies-bd.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies-np.xml`, lastmod: now },
    // Per-country articles shards (PR 9).
    { loc: `${base}/sitemap-articles-in.xml`, lastmod: now },
    { loc: `${base}/sitemap-articles-ae.xml`, lastmod: now },
    { loc: `${base}/sitemap-articles-uk.xml`, lastmod: now },
    { loc: `${base}/sitemap-articles-au.xml`, lastmod: now },
    { loc: `${base}/sitemap-articles-us.xml`, lastmod: now },
    { loc: `${base}/sitemap-articles-my.xml`, lastmod: now },
    { loc: `${base}/sitemap-articles-bd.xml`, lastmod: now },
    { loc: `${base}/sitemap-articles-np.xml`, lastmod: now },
  ]);

  return new Response(xml, { status: 200, headers: xmlHeaders(3600) });
}
