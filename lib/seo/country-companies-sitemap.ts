import "server-only";

import type { Country } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { renderUrlSet, xmlHeaders } from "@/lib/seo/sitemap-xml";

/**
 * Shared per-country companies-sitemap renderer. Each
 * `app/sitemap-companies-{cc}.xml/route.ts` is a one-line wrapper
 * that calls `renderCountryCompaniesSitemap("XX")`.
 *
 * Mirrors the per-country jobs sitemap pattern (PR 3) so the
 * GSC submission story is identical:
 *   • `sitemap-companies-uk.xml` → submit to the UK GSC property
 *   • `sitemap-companies-ae.xml` → submit to the UAE GSC property
 *   • etc.
 *
 * Canonical URL stays the global `/company/{slug}` (one
 * authoritative page per company regardless of country) — the
 * per-country shards just give Google a country-attributed
 * discovery + crawl-stat lens via GSC.
 *
 * Cap of 50,000 URLs per shard (sitemap protocol). The platform
 * has ~528 verified companies today; a single shard fits
 * comfortably even at 10x scale.
 */
export async function renderCountryCompaniesSitemap(
  country: Country,
): Promise<Response> {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  // Union match — includes companies HQ'd in this country PLUS
  // companies that operate here (operatesInCountries array, PR 8).
  // Mirrors the listing-page query so the sitemap shard never
  // misses an employer the directory shows.
  const companies = await db.company.findMany({
    where: {
      verificationStatus: "VERIFIED",
      OR: [
        { hqCountry: country },
        { operatesInCountries: { has: country } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 50_000,
    select: { slug: true, updatedAt: true },
  });

  const xml = renderUrlSet(
    companies.map((c) => ({
      loc: `${base}/company/${c.slug}`,
      lastmod: c.updatedAt,
      changefreq: "weekly",
      priority: 0.6,
    })),
  );

  return new Response(xml, { status: 200, headers: xmlHeaders(3600) });
}
