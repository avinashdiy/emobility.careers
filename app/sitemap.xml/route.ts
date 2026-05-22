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
    // ─── Per-country jobs sitemaps ──
    // Submit each individually to its matching GSC subfolder
    // property (sitemap-jobs-uk.xml → `/uk/` property, etc.) so
    // Google attributes UK-specific crawl + impressions to the
    // UK GSC view. Listing them here in the root index keeps
    // the unfiltered crawlers (the rest of the web) discovering
    // them as well.
    { loc: `${base}/sitemap-jobs-in.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs-ae.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs-uk.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs-au.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs-us.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs-my.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs-bd.xml`, lastmod: now },
    { loc: `${base}/sitemap-jobs-np.xml`, lastmod: now },
    // ─── Per-country companies sitemaps (PR 5) ──
    // Same per-country GSC submission story as the jobs shards.
    // Country-attributed crawl-stat lens for the companies
    // directory + the `/[cc]/companies` routes that feed into
    // each per-country GSC property.
    { loc: `${base}/sitemap-companies-in.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies-ae.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies-uk.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies-au.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies-us.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies-my.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies-bd.xml`, lastmod: now },
    { loc: `${base}/sitemap-companies-np.xml`, lastmod: now },
    // ─── Per-country articles sitemaps (PR 9) ──
    // Filtered on `Article.targetCountries: { has: country }` so
    // multi-country articles surface in every relevant shard.
    // Each shard also leads with the country LANDING page URL so
    // the GSC property has a clean content-root signal.
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
