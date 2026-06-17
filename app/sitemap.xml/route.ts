import { env } from "@/lib/env";
import { renderSitemapIndex, sitemapIndexShards, xmlHeaders } from "@/lib/seo/sitemap-xml";

/**
 * Legacy alias for `/sitemap_index.xml`. Search engines that
 * discovered `/sitemap.xml` before sharding landed (or that probe
 * the conventional path) get the same sitemap-index document — both
 * routes render the shared `sitemapIndexShards()` list so they can't
 * drift (a past hand-maintained drift dropped the JD + articles
 * shards from this alias).
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

  const xml = renderSitemapIndex(sitemapIndexShards(base, now));

  return new Response(xml, { status: 200, headers: xmlHeaders(3600) });
}
