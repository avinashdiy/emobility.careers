import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { renderUrlSet, xmlHeaders } from "@/lib/seo/sitemap-xml";
import { listCities } from "@/lib/jobs/cities";

/**
 * Static marketing + landing pages — the hand-curated entry points
 * (home, /jobs, /companies, /institutions, /fairs, etc.). Splits out
 * the dynamic surfaces (jobs, companies, etc.) which live in their
 * own shards.
 */

export const runtime = "nodejs";
export const revalidate = 86400; // 24h — these URLs don't change.

export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const now = new Date();

  const paths: { path: string; priority?: number; changefreq?: "hourly" | "daily" | "weekly" }[] = [
    { path: "", priority: 1, changefreq: "daily" },
    { path: "/jobs", priority: 0.9, changefreq: "hourly" },
    { path: "/companies", priority: 0.9, changefreq: "daily" },
    // A–Z directory + every letter page. The 27 per-letter URLs
    // each carry their own canonical (see generateMetadata in
    // companies/a-z/page.tsx) so search engines treat them as
    // distinct content rather than dup variants.
    { path: "/companies/a-z", priority: 0.7, changefreq: "weekly" },
    ...["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","%23"].map(
      (l) => ({
        path: `/companies/a-z?letter=${l}`,
        priority: 0.5 as number,
        changefreq: "weekly" as const,
      }),
    ),
    { path: "/institutions", priority: 0.8, changefreq: "daily" },
    { path: "/colleges/register", priority: 0.8, changefreq: "weekly" },
    { path: "/fairs", priority: 0.8, changefreq: "daily" },
    { path: "/mentors", priority: 0.7, changefreq: "daily" },
    { path: "/feed", priority: 0.7, changefreq: "hourly" },
    { path: "/people", priority: 0.7, changefreq: "daily" },
    { path: "/competitions", priority: 0.7, changefreq: "weekly" },
    { path: "/pulse", priority: 0.7, changefreq: "hourly" },
    { path: "/salaries", priority: 0.7, changefreq: "weekly" },
    // SEO facet hubs — browse jobs by domain + the internships
    // landing. /jobs/[domain] facet URLs themselves are appended
    // below from the live EVDomain list.
    { path: "/domains", priority: 0.8, changefreq: "daily" },
    { path: "/internships", priority: 0.8, changefreq: "daily" },
    // Browse-by-city hub. /jobs/[city] facet URLs themselves are
    // appended below from the live (unnested) JobPosting.locations set.
    { path: "/cities", priority: 0.8, changefreq: "daily" },
    // Articles index — individual articles live in
    // sitemap-articles.xml, but the index page itself was missing
    // from the static shard. Bing flagged it as "Important pages
    // missing in sitemaps". Crawl daily — new articles publish
    // frequently and the index page reflects them.
    { path: "/articles", priority: 0.8, changefreq: "daily" },
    { path: "/about", priority: 0.5, changefreq: "weekly" },
    { path: "/signup", priority: 0.5, changefreq: "weekly" },
    { path: "/signin", priority: 0.5, changefreq: "weekly" },
    // Per-country landing pages — the SEO entry point for each
    // expansion market. High priority (0.9) so Google treats them
    // as primary surfaces, comparable to /jobs. Daily changefreq
    // because they pull live counts + recent jobs from the DB.
    // India ("/" / IN) is the root and already covered above with
    // priority 1.0; these are the additional country folders.
    { path: "/ae", priority: 0.9, changefreq: "daily" },
    { path: "/uk", priority: 0.9, changefreq: "daily" },
    { path: "/au", priority: 0.9, changefreq: "daily" },
    { path: "/us", priority: 0.9, changefreq: "daily" },
    { path: "/my", priority: 0.9, changefreq: "daily" },
    { path: "/bd", priority: 0.9, changefreq: "daily" },
    { path: "/np", priority: 0.9, changefreq: "daily" },
    // Country-prefixed jobs + companies routes (PR 3 + PR 5).
    // Slightly lower priority than the landing pages (each is
    // one of two surfaces under the country folder) but still
    // high (0.8) so they get crawl attention. Daily because
    // the underlying jobs / companies churn.
    { path: "/ae/jobs", priority: 0.8, changefreq: "daily" },
    { path: "/uk/jobs", priority: 0.8, changefreq: "daily" },
    { path: "/au/jobs", priority: 0.8, changefreq: "daily" },
    { path: "/us/jobs", priority: 0.8, changefreq: "daily" },
    { path: "/my/jobs", priority: 0.8, changefreq: "daily" },
    { path: "/bd/jobs", priority: 0.8, changefreq: "daily" },
    { path: "/np/jobs", priority: 0.8, changefreq: "daily" },
    { path: "/ae/companies", priority: 0.8, changefreq: "weekly" },
    { path: "/uk/companies", priority: 0.8, changefreq: "weekly" },
    { path: "/au/companies", priority: 0.8, changefreq: "weekly" },
    { path: "/us/companies", priority: 0.8, changefreq: "weekly" },
    { path: "/my/companies", priority: 0.8, changefreq: "weekly" },
    { path: "/bd/companies", priority: 0.8, changefreq: "weekly" },
    { path: "/np/companies", priority: 0.8, changefreq: "weekly" },
  ];

  // Per-domain job-facet pages (/jobs/battery-tech etc.) — one
  // indexable URL per active EV domain. Appended from the live table
  // so new domains auto-enter the sitemap.
  const domains = await db.eVDomain.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
    select: { slug: true },
  });
  for (const d of domains) {
    paths.push({ path: `/jobs/${d.slug}`, priority: 0.8, changefreq: "daily" });
  }

  // Per-city job-facet pages (/jobs/pune etc.) — one indexable URL per
  // city that currently has open jobs, derived from the live
  // (unnested) JobPosting.locations set. Cap at the busiest 60 so a
  // long tail of one-off location strings doesn't bloat the sitemap;
  // the /cities hub still links the full set for crawl discovery.
  const cities = (await listCities()).slice(0, 60);
  for (const c of cities) {
    paths.push({ path: `/jobs/${c.slug}`, priority: 0.7, changefreq: "daily" });
  }

  const xml = renderUrlSet(
    paths.map((p) => ({
      loc: `${base}${p.path}`,
      lastmod: now,
      changefreq: p.changefreq,
      priority: p.priority,
    })),
  );

  return new Response(xml, { status: 200, headers: xmlHeaders(86400) });
}
