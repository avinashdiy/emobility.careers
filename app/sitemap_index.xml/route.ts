import { env } from "@/lib/env";
import { renderSitemapIndex, sitemapIndexShards, xmlHeaders } from "@/lib/seo/sitemap-xml";

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

  const xml = renderSitemapIndex(sitemapIndexShards(base, now));

  return new Response(xml, { status: 200, headers: xmlHeaders(3600) });
}
