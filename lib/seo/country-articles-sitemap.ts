import type { Country } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { renderUrlSet, xmlHeaders } from "@/lib/seo/sitemap-xml";
import { countryUrl } from "@/lib/seo/hreflang";

/**
 * Shared per-country articles-sitemap renderer. Each
 * `app/sitemap-articles-{cc}.xml/route.ts` is a one-line wrapper
 * that calls `renderCountryArticlesSitemap("XX")`.
 *
 * Mirrors the per-country jobs (PR 3) + companies (PR 5)
 * sitemap pattern. GSC submission story:
 *   • `sitemap-articles-uk.xml` → submit to the UK GSC property
 *   • `sitemap-articles-ae.xml` → submit to the UAE GSC property
 *   • etc.
 *
 * The article URLs are global (`/{slug}`, the same canonical
 * regardless of country), so the per-country shard's value is
 * purely the country-attributed crawl-stat lens in GSC — Google
 * tells us "UK property indexed N articles this week" instead of
 * the lumped "all 47 articles got indexed" view we'd have with
 * the single legacy `/sitemap-articles.xml`.
 *
 * Country filter: `targetCountries: { has: country }` — picks up
 * EVERY article that lists this country in its targets array.
 * Multi-country articles (a "Top 10 EV employers globally"
 * listicle tagged [IN, GB, US, AE]) appear in all four shards.
 * Single-country articles (the default [IN]) appear only in the
 * IN shard. PR 5's union-match semantics applied to articles.
 *
 * Includes the country LANDING page (`/uk`, `/ae`, etc.) at the
 * top of each shard so the GSC property sees a clean "this
 * country's content roots here" signal alongside the article
 * URLs.
 */
export async function renderCountryArticlesSitemap(
  country: Country,
): Promise<Response> {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const articles = await db.article.findMany({
    where: {
      status: "PUBLISHED",
      targetCountries: { has: country },
    },
    orderBy: { updatedAt: "desc" },
    take: 50_000,
    select: { slug: true, updatedAt: true },
  });

  const xml = renderUrlSet([
    // Country landing page itself — root of the country's content
    // cluster in this GSC property. Daily changefreq because the
    // landing page pulls live counts.
    {
      loc: countryUrl(country),
      lastmod: new Date(),
      changefreq: "daily",
      priority: 0.9,
    },
    ...articles.map((a) => ({
      loc: `${base}/${a.slug}`,
      lastmod: a.updatedAt,
      changefreq: "monthly" as const,
      priority: 0.7,
    })),
  ]);

  return new Response(xml, { status: 200, headers: xmlHeaders(3600) });
}
