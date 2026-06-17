import "server-only";
import { db } from "@/lib/db";

/**
 * City helpers for the /jobs/[city] SEO facet pages.
 *
 * Job locations live as free text in JobPosting.locations (String[]),
 * so there's no City entity to key off. We derive the city set by
 * unnesting that array across OPEN jobs, slugify for clean URLs, and
 * merge case/spacing variants ("Bengaluru" / "bengaluru") under one
 * slug. v1 limitation: the facet query matches the single canonical
 * display name (the most common variant), so a job that typed a rarer
 * casing of the same city may not appear on that city's page — fine
 * for the top cities that carry the search volume; a Location master
 * table would tighten this later.
 */

export function cityToSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export interface CityFacet {
  slug: string;
  /** Canonical display name (the most common variant for this slug). */
  name: string;
  count: number;
}

/**
 * Distinct cities across OPEN jobs, with open-role counts, busiest
 * first. Cached implicitly via the route's revalidate where used.
 */
export async function listCities(): Promise<CityFacet[]> {
  const rows = await db.$queryRaw<{ loc: string; count: bigint }[]>`
    SELECT loc, count(*)::bigint AS count
    FROM (
      SELECT unnest(locations) AS loc
      FROM "JobPosting"
      WHERE status = 'OPEN'
    ) t
    WHERE trim(loc) <> '' AND lower(trim(loc)) <> 'remote'
    GROUP BY loc
    ORDER BY count DESC
  `.catch(() => []);

  // Merge variants by slug; the first occurrence (highest count, since
  // ordered desc) supplies the canonical display name.
  const bySlug = new Map<string, CityFacet>();
  for (const r of rows) {
    const slug = cityToSlug(r.loc);
    if (!slug) continue;
    const n = Number(r.count);
    const existing = bySlug.get(slug);
    if (existing) existing.count += n;
    else bySlug.set(slug, { slug, name: r.loc.trim(), count: n });
  }
  return Array.from(bySlug.values()).sort((a, b) => b.count - a.count);
}

/** Resolve a city slug to its canonical display name (or null). */
export async function resolveCity(slug: string): Promise<CityFacet | null> {
  const cities = await listCities();
  return cities.find((c) => c.slug === slug) ?? null;
}
