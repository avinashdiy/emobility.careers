import "server-only";

import type { Country } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { renderUrlSet, xmlHeaders } from "@/lib/seo/sitemap-xml";

/**
 * Shared per-country jobs-sitemap renderer. Each
 * `app/sitemap-jobs-{cc}.xml/route.ts` is a one-line wrapper that
 * calls `renderCountryJobsSitemap("XX")` — keeps the actual query
 * + URL-building logic in one place so a change to job-URL
 * canonicalisation propagates to every country shard at once.
 *
 * Why per-country shards (not one big sitemap):
 *   • Google Search Console attributes sitemap submissions to the
 *     property they're submitted to. Submit `sitemap-jobs-uk.xml`
 *     to the `/uk/` GSC property and it counts toward UK-only
 *     crawl-budget + UK index coverage stats. One global sitemap
 *     muddles the attribution.
 *   • Google for Jobs prefers smaller jobs-only sitemaps with
 *     fresh `lastmod` stamps so it can incrementally re-crawl.
 *   • The 50,000-URL-per-sitemap protocol cap is per-shard, so
 *     splitting buys us future headroom.
 *
 * The sitemap-index file (sitemap.xml) references all shards.
 */
export async function renderCountryJobsSitemap(country: Country): Promise<Response> {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const jobs = await db.jobPosting.findMany({
    where: {
      status: "OPEN",
      country,
      company: { verificationStatus: "VERIFIED" },
    },
    orderBy: { publishedAt: "desc" },
    take: 50_000,
    select: { slug: true, updatedAt: true, publishedAt: true },
  });

  // Canonical URL stays the global `/job/{slug}` — there's one
  // canonical per job, regardless of country. The country attribution
  // is in the JSON-LD `applicantLocationRequirements` on the job
  // detail page (see lib/seo/job-schema.ts) so Google for Jobs reads
  // the right market without us forking the URL space per country.
  const xml = renderUrlSet(
    jobs.map((j) => ({
      loc: `${base}/job/${j.slug}`,
      lastmod: j.updatedAt ?? j.publishedAt ?? new Date(),
      changefreq: "daily",
      priority: 0.8,
    })),
  );

  return new Response(xml, { status: 200, headers: xmlHeaders(600) });
}
