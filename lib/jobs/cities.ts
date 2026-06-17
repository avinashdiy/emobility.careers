import "server-only";
import { db } from "@/lib/db";

/**
 * City helpers for the /jobs/[city] SEO facet pages.
 *
 * Job locations live as free text in JobPosting.locations (String[]),
 * so there's no City entity to key off. We derive the city set by
 * unnesting that array across OPEN jobs and slugifying for clean URLs,
 * merging case/spacing variants ("Bengaluru" / "bengaluru") under one
 * slug. Each CityFacet carries EVERY raw variant string that slugifies
 * to it (`names`), so the facet page can match all of them via
 * `hasSome` — a job that typed a rarer casing of the same city still
 * shows up on that city's page. `count` is the number of DISTINCT
 * PUBLIC-visible jobs in the city: it applies the SAME gates the
 * anonymous facet page applies (status OPEN + audience PUBLIC + company
 * not REJECTED), so the `count` we render in the <title>/meta and the
 * /cities badge matches what an anonymous crawler/visitor actually sees
 * on the page (whose total comes from searchJobs). A Location master
 * table would let us tighten spelling normalisation later, but
 * variant-complete matching + matched gates remove the original v1 gap.
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
  /** Every raw location string (trimmed) that slugifies to this slug. */
  names: string[];
  /** Distinct OPEN jobs located in this city. */
  count: number;
}

/**
 * Distinct cities across OPEN jobs, with distinct-job counts, busiest
 * first. Cached implicitly via the route's revalidate where used.
 */
export async function listCities(): Promise<CityFacet[]> {
  // (jobId, location) pairs so we can count distinct jobs per slug and
  // collect every raw variant. Gated to the anonymous-visible set —
  // mirrors the default where-clause searchJobs builds (server/jobs/
  // queries.ts): status OPEN + audience PUBLIC + company not REJECTED —
  // so the derived count equals the public facet total. companyId is
  // required on JobPosting, so an INNER JOIN drops nothing.
  const rows = await db.$queryRaw<{ id: string; loc: string }[]>`
    SELECT j.id, unnest(j.locations) AS loc
    FROM "JobPosting" j
    JOIN "Company" c ON c.id = j."companyId"
    WHERE j.status = 'OPEN'
      AND j.audience = 'PUBLIC'
      AND c."verificationStatus" <> 'REJECTED'
  `.catch((err) => {
    console.warn("[listCities] query failed", err instanceof Error ? err.message : String(err));
    return [];
  });

  const bySlug = new Map<
    string,
    { variants: Map<string, number>; jobs: Set<string> }
  >();
  for (const r of rows) {
    const t = (r.loc ?? "").trim();
    if (!t || t.toLowerCase() === "remote") continue;
    const slug = cityToSlug(t);
    if (!slug) continue;
    const slot = bySlug.get(slug) ?? { variants: new Map<string, number>(), jobs: new Set<string>() };
    slot.variants.set(t, (slot.variants.get(t) ?? 0) + 1);
    slot.jobs.add(r.id);
    bySlug.set(slug, slot);
  }

  const out: CityFacet[] = [];
  for (const [slug, slot] of bySlug) {
    // Canonical display name = most frequent variant.
    let name = "";
    let top = -1;
    for (const [variant, n] of slot.variants) {
      if (n > top) { top = n; name = variant; }
    }
    out.push({ slug, name, names: [...slot.variants.keys()].sort(), count: slot.jobs.size });
  }
  // Busiest first; slug tie-break keeps ordering stable across renders
  // (matters for the sitemap's slice(0, 60) boundary).
  return out.sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

/** Resolve a city slug to its facet (canonical name + all variants). */
export async function resolveCity(slug: string): Promise<CityFacet | null> {
  const cities = await listCities();
  return cities.find((c) => c.slug === slug) ?? null;
}
