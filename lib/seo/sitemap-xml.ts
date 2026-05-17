/**
 * Shared helpers for the sharded sitemap routes. Each shard renders
 * a `<urlset>`; the index renders a `<sitemapindex>`. Both must be
 * XML-escaped because slugs / titles can contain `&`, `<`, etc.
 *
 * Why per-shard route handlers (not Next's `generateSitemaps`)?
 *   • The robots.txt has stable `sitemap-X.xml` URLs already
 *     submitted to Search Console — Next's default `/sitemap/0.xml`
 *     scheme would break those entries on deploy.
 *   • Each domain (jobs / companies / institutions / candidates /
 *     posts / tags) has its own DB cache + Cache-Control profile.
 *     A monolithic generateSitemaps couldn't differentiate.
 */

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface SitemapUrl {
  loc: string;
  lastmod?: Date | null;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number; // 0.0 – 1.0
}

/** Render a `<urlset>` document. Per protocol, max 50,000 URLs. */
export function renderUrlSet(urls: SitemapUrl[]): string {
  const body = urls
    .map((u) => {
      const lastmod = u.lastmod
        ? `\n    <lastmod>${u.lastmod.toISOString()}</lastmod>`
        : "";
      const changefreq = u.changefreq
        ? `\n    <changefreq>${u.changefreq}</changefreq>`
        : "";
      const priority =
        u.priority !== undefined
          ? `\n    <priority>${u.priority.toFixed(1)}</priority>`
          : "";
      return `  <url>
    <loc>${escapeXml(u.loc)}</loc>${lastmod}${changefreq}${priority}
  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

/** Render a `<sitemapindex>` document. */
export function renderSitemapIndex(
  sitemaps: { loc: string; lastmod?: Date }[],
): string {
  const body = sitemaps
    .map((s) => {
      const lastmod = s.lastmod
        ? `\n    <lastmod>${s.lastmod.toISOString()}</lastmod>`
        : "";
      return `  <sitemap>
    <loc>${escapeXml(s.loc)}</loc>${lastmod}
  </sitemap>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>`;
}

/** Standard headers for all sitemap responses. */
export function xmlHeaders(cacheSeconds = 3600): Record<string, string> {
  return {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${Math.floor(cacheSeconds / 2)}`,
  };
}
