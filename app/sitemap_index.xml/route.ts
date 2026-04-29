import { env } from "@/lib/env";

/**
 * Sitemap index — points Google / Bing at the jobs-only sitemap, the
 * default Next-generated sitemap (pages, companies, profiles), and any
 * future shards. Submit this URL to Search Console as the sitemap entry.
 */

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const lastmod = new Date().toISOString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${base}/sitemap.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${base}/sitemap-jobs.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
</sitemapindex>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600",
    },
  });
}
