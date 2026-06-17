import "server-only";

import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";

/**
 * Cache-tag namespace for every Salary Compass aggregate. Mutations
 * that change what these helpers see (a new APPROVED submission, an
 * admin reject) should call `revalidateTag("salary-compass")` so
 * the next read recomputes. See server/salaries/actions.ts for the
 * approve/reject paths that wire the tag.
 */
const COMPASS_TAG = "salary-compass";

/**
 * Salary Compass — Levels.fyi for India's EV industry. The viral
 * mechanic is "submit anonymous salary → unlock the database for 30
 * days" (cookie-driven), so this lib provides:
 *
 *   • Aggregations that respect the unlock state — `medianFor` always
 *     works (it's the public teaser), but `unlockedDataFor` requires
 *     the cookie + admin-approved samples.
 *   • Sample-size thresholds — never expose a "median" computed from
 *     a single submission; that's not market data.
 *   • Bucketing helpers (years-of-experience tiers, location groups).
 */

export const UNLOCK_COOKIE = "emce_salary_unlocked";
const UNLOCK_DAYS = 30;
const ANON_COOKIE = "emce_salary_anon";

/** Minimum submissions before a stat is shown publicly. */
export const PUBLIC_MIN_SAMPLES = 5;
/** Minimum unlocked-tier samples before per-company tier shows. */
export const COMPANY_MIN_SAMPLES = 3;

export async function isUnlocked(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(UNLOCK_COOKIE)?.value === "1";
}

export async function setUnlocked() {
  const jar = await cookies();
  jar.set(UNLOCK_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: UNLOCK_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

/** Get the anon cookie, creating it if missing. Returns the value. */
export async function getOrSetAnonCookie(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(ANON_COOKIE)?.value;
  if (existing) return existing;
  const fresh = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  jar.set(ANON_COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 90 * 24 * 60 * 60, // 90 days
    path: "/",
  });
  return fresh;
}

// ─── Aggregations ──────────────────────────────────────────

export interface SalaryStat {
  count: number;
  medianLakhs: number;
  p25Lakhs: number;
  p75Lakhs: number;
}

function summarise(values: number[]): SalaryStat | null {
  if (values.length < PUBLIC_MIN_SAMPLES) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.floor((sorted.length - 1) * q)];
  return {
    count: values.length,
    medianLakhs: Math.round(at(0.5) * 10) / 10,
    p25Lakhs: Math.round(at(0.25) * 10) / 10,
    p75Lakhs: Math.round(at(0.75) * 10) / 10,
  };
}

/**
 * Top-paying roles based on approved submissions in the last 24
 * months. Returns null entries when sample size is below threshold so
 * the caller can show an honest "more samples needed".
 */
export interface TopRole {
  jobTitle: string;
  stat: SalaryStat;
}

export const getTopPayingRoles = unstable_cache(
  async (limit = 6): Promise<TopRole[]> => {
    const since = new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000);
    const rows = await db.salarySubmission.findMany({
      where: { status: "APPROVED", createdAt: { gte: since } },
      select: { jobTitle: true, ctcLakhs: true },
      take: 5000,
    });
    const byTitle = new Map<string, number[]>();
    for (const r of rows) {
      const k = r.jobTitle.trim();
      const arr = byTitle.get(k) ?? [];
      arr.push(r.ctcLakhs);
      byTitle.set(k, arr);
    }
    const out: TopRole[] = [];
    for (const [title, vals] of byTitle) {
      const stat = summarise(vals);
      if (stat) out.push({ jobTitle: title, stat });
    }
    return out
      .sort((a, b) => b.stat.medianLakhs - a.stat.medianLakhs)
      .slice(0, limit);
  },
  ["compass:top-paying-roles:v1"],
  // Medians over a 30-day window — 5 minutes of staleness is fine.
  { revalidate: 300, tags: [COMPASS_TAG] },
);

/**
 * Top-paying roles split by collar tier. Engineer = white-collar,
 * profileMode ∈ FRESHER/EXPERIENCED/LEADERSHIP. Technician = blue-collar,
 * profileMode = TECHNICIAN. Used by the home-page "Top EV salaries"
 * spotlight (Engineers vs Technicians tabs, à la levels.fyi).
 */
export type SalaryTier = "ENGINEER" | "TECHNICIAN";
export interface TopRoleByTier extends TopRole {
  tier: SalaryTier;
  topCompanyName: string | null;
}

export const getTopPayingRolesByTier = unstable_cache(
  async (
    tier: SalaryTier,
    limit = 5,
  ): Promise<TopRoleByTier[]> => {
    const since = new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000);
    const profileFilter =
      tier === "TECHNICIAN"
        ? { profileMode: "TECHNICIAN" as const }
        : { profileMode: { not: "TECHNICIAN" as const } };
    const rows = await db.salarySubmission.findMany({
      where: { status: "APPROVED", createdAt: { gte: since }, ...profileFilter },
      select: { jobTitle: true, ctcLakhs: true, companyName: true },
      take: 5000,
    });
    // Group submissions by jobTitle, tracking the most-frequent company
    // for each role so the row can name a representative employer.
    const byTitle = new Map<
      string,
      { vals: number[]; companies: Map<string, number> }
    >();
    for (const r of rows) {
      const k = r.jobTitle.trim();
      const slot =
        byTitle.get(k) ?? { vals: [] as number[], companies: new Map<string, number>() };
      slot.vals.push(r.ctcLakhs);
      slot.companies.set(
        r.companyName,
        (slot.companies.get(r.companyName) ?? 0) + 1,
      );
      byTitle.set(k, slot);
    }
    const out: TopRoleByTier[] = [];
    for (const [title, slot] of byTitle) {
      const stat = summarise(slot.vals);
      if (!stat) continue;
      let topCompanyName: string | null = null;
      let topCount = 0;
      for (const [name, count] of slot.companies) {
        if (count > topCount) {
          topCount = count;
          topCompanyName = name;
        }
      }
      out.push({ jobTitle: title, stat, tier, topCompanyName });
    }
    return out
      .sort((a, b) => b.stat.medianLakhs - a.stat.medianLakhs)
      .slice(0, limit);
  },
  ["compass:top-paying-roles-by-tier:v1"],
  // Per-tier slice — same staleness profile as getTopPayingRoles.
  // The cache key includes the `tier` argument automatically, so
  // ENGINEER and TECHNICIAN don't collide.
  { revalidate: 300, tags: [COMPASS_TAG] },
);

export interface TopCompany {
  companyId: string | null;
  companyName: string;
  companySlug: string | null;
  logoUrl: string | null;
  stat: SalaryStat;
}

export const getTopPayingCompanies = unstable_cache(
  async (limit = 6): Promise<TopCompany[]> => {
    const since = new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000);
    const rows = await db.salarySubmission.findMany({
      where: { status: "APPROVED", createdAt: { gte: since } },
      select: {
        companyId: true,
        companyName: true,
        ctcLakhs: true,
        company: { select: { slug: true, logoUrl: true } },
      },
      take: 5000,
    });
    const grouped = new Map<string, { name: string; slug: string | null; logo: string | null; vals: number[] }>();
    for (const r of rows) {
      const k = r.companyId ?? `text:${r.companyName.toLowerCase()}`;
      const slot = grouped.get(k) ?? {
        name: r.companyName,
        slug: r.company?.slug ?? null,
        logo: r.company?.logoUrl ?? null,
        vals: [],
      };
      slot.vals.push(r.ctcLakhs);
      grouped.set(k, slot);
    }
    const out: TopCompany[] = [];
    for (const [k, slot] of grouped) {
      const stat = summarise(slot.vals);
      if (stat) {
        out.push({
          companyId: k.startsWith("text:") ? null : k,
          companyName: slot.name,
          companySlug: slot.slug,
          logoUrl: slot.logo,
          stat,
        });
      }
    }
    return out
      .sort((a, b) => b.stat.medianLakhs - a.stat.medianLakhs)
      .slice(0, limit);
  },
  ["compass:top-paying-companies:v1"],
  { revalidate: 300, tags: [COMPASS_TAG] },
);

/** Headline counters for the landing page. */
export interface CompassCounters {
  totalApproved: number;
  newThisWeek: number;
  companiesCovered: number;
  rolesCovered: number;
}

export const getCompassCounters = unstable_cache(
  async (): Promise<CompassCounters> => {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [total, weekly] = await Promise.all([
      db.salarySubmission.findMany({
        where: { status: "APPROVED" },
        select: { companyId: true, companyName: true, jobTitle: true, createdAt: true },
        take: 5000,
      }),
      db.salarySubmission.count({ where: { status: "APPROVED", createdAt: { gte: since7d } } }),
    ]);
    const companies = new Set(total.map((r) => r.companyId ?? `text:${r.companyName.toLowerCase()}`));
    const roles = new Set(total.map((r) => r.jobTitle.toLowerCase().trim()));
    return {
      totalApproved: total.length,
      newThisWeek: weekly,
      companiesCovered: companies.size,
      rolesCovered: roles.size,
    };
  },
  ["compass:counters:v1"],
  { revalidate: 60, tags: [COMPASS_TAG] },
);

/**
 * Per-experience-tier breakdown for an unlocked viewer. Buckets:
 * 0-2y "Junior", 3-5y "Mid", 6-9y "Senior", 10+ "Lead".
 */
export interface TierBreakdown {
  label: string;
  bucket: "JUNIOR" | "MID" | "SENIOR" | "LEAD";
  stat: SalaryStat | null;
}

export function bucketFor(years: number): TierBreakdown["bucket"] {
  if (years < 3) return "JUNIOR";
  if (years < 6) return "MID";
  if (years < 10) return "SENIOR";
  return "LEAD";
}

const BUCKET_LABELS: Record<TierBreakdown["bucket"], string> = {
  JUNIOR: "Junior · 0-2 yrs",
  MID: "Mid · 3-5 yrs",
  SENIOR: "Senior · 6-9 yrs",
  LEAD: "Lead · 10+ yrs",
};

export const getTierBreakdown = unstable_cache(
  async (opts: { jobTitle?: string; companyId?: string | null }): Promise<TierBreakdown[]> => {
    const where: { status: "APPROVED"; jobTitle?: string; companyId?: string | null } = { status: "APPROVED" };
    if (opts.jobTitle) where.jobTitle = opts.jobTitle;
    if (opts.companyId !== undefined) where.companyId = opts.companyId;

    const rows = await db.salarySubmission.findMany({
      where,
      select: { yearsExp: true, ctcLakhs: true },
    });
    const byBucket = new Map<TierBreakdown["bucket"], number[]>();
    for (const r of rows) {
      const b = bucketFor(r.yearsExp);
      const arr = byBucket.get(b) ?? [];
      arr.push(r.ctcLakhs);
      byBucket.set(b, arr);
    }
    return (["JUNIOR", "MID", "SENIOR", "LEAD"] as const).map((bucket) => ({
      label: BUCKET_LABELS[bucket],
      bucket,
      stat: summarise(byBucket.get(bucket) ?? []),
    }));
  },
  ["compass:tier-breakdown:v1"],
  // Cache key includes the opts object (jobTitle / companyId) so the
  // per-role / per-company drilldowns each get their own entry.
  { revalidate: 300, tags: [COMPASS_TAG] },
);

export function formatLakhs(value: number): string {
  if (value >= 100) return `₹${(value / 100).toFixed(1)}Cr`;
  return `₹${value.toFixed(1)}L`;
}

// ─── SEO facet pages (/salaries/[role], /salaries/company/[slug]) ───
//
// One indexable page per role + per company that clears the public
// sample threshold. These rank for the highest-intent salary queries
// ("battery engineer salary india", "ather energy salary"). Each page
// shows the real median + p25-p75 band (the public teaser that earns
// the ranking) and emits Occupation JSON-LD for Google's estimated-
// salary rich result. The per-experience-tier breakdown stays behind
// the existing submit-to-unlock mechanic.

/** URL-safe slug from a free-text role / company name. */
export function salarySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export interface RoleFacet {
  slug: string;
  /** Canonical display title (most common variant for this slug). */
  title: string;
  /** Every raw jobTitle variant that slugifies to this slug. */
  titles: string[];
  count: number;
  stat: SalaryStat;
}

/**
 * Every role with enough approved submissions to show a public stat,
 * busiest first. Case/spacing variants of the same title merge under
 * one slug (the most common variant supplies the display title).
 */
export const getSalaryRoles = unstable_cache(
  async (): Promise<RoleFacet[]> => {
    const rows = await db.salarySubmission.findMany({
      where: { status: "APPROVED" },
      select: { jobTitle: true, ctcLakhs: true },
      take: 10000,
    });
    // slug → { variant title → frequency, values }
    const bySlug = new Map<
      string,
      { titles: Map<string, number>; vals: number[] }
    >();
    for (const r of rows) {
      const t = r.jobTitle.trim();
      const slug = salarySlug(t);
      if (!slug) continue;
      const slot = bySlug.get(slug) ?? { titles: new Map<string, number>(), vals: [] };
      slot.titles.set(t, (slot.titles.get(t) ?? 0) + 1);
      slot.vals.push(r.ctcLakhs);
      bySlug.set(slug, slot);
    }
    const out: RoleFacet[] = [];
    for (const [slug, slot] of bySlug) {
      const stat = summarise(slot.vals);
      if (!stat) continue;
      // Canonical title = most frequent variant.
      let title = "";
      let top = -1;
      for (const [t, n] of slot.titles) {
        if (n > top) { top = n; title = t; }
      }
      out.push({ slug, title, titles: [...slot.titles.keys()].sort(), count: slot.vals.length, stat });
    }
    // Busiest first; slug tie-break for stable ordering across renders.
    return out.sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
  },
  ["compass:salary-roles:v1"],
  { revalidate: 300, tags: [COMPASS_TAG] },
);

export interface RoleSalaryDetail extends RoleFacet {
  tiers: TierBreakdown[];
}

/** Resolve a role slug to its full salary detail (or null). */
export async function getSalaryRole(slug: string): Promise<RoleSalaryDetail | null> {
  const facet = (await getSalaryRoles()).find((r) => r.slug === slug);
  if (!facet) return null;
  const tiers = await getTierBreakdownForTitles(facet.titles);
  return { ...facet, tiers };
}

/** Tier breakdown across a set of title variants (a slug's variants). */
const getTierBreakdownForTitles = unstable_cache(
  async (titles: string[]): Promise<TierBreakdown[]> => {
    const rows = await db.salarySubmission.findMany({
      where: { status: "APPROVED", jobTitle: { in: titles } },
      select: { yearsExp: true, ctcLakhs: true },
    });
    const byBucket = new Map<TierBreakdown["bucket"], number[]>();
    for (const r of rows) {
      const b = bucketFor(r.yearsExp);
      const arr = byBucket.get(b) ?? [];
      arr.push(r.ctcLakhs);
      byBucket.set(b, arr);
    }
    return (["JUNIOR", "MID", "SENIOR", "LEAD"] as const).map((bucket) => ({
      label: BUCKET_LABELS[bucket],
      bucket,
      stat: summarise(byBucket.get(bucket) ?? []),
    }));
  },
  ["compass:tier-breakdown-titles:v1"],
  { revalidate: 300, tags: [COMPASS_TAG] },
);

export interface CompanyFacet {
  slug: string;
  companyId: string | null;
  name: string;
  /** Every raw companyName variant for a text-only employer (matched by
   *  `in`). For DB-linked companies this is just [name] — those are
   *  matched by companyId, not name. */
  names: string[];
  /** The Company.slug for verified DB companies (links to profile). */
  companySlug: string | null;
  logoUrl: string | null;
  count: number;
  stat: SalaryStat;
}

/** Every company with enough approved submissions to show a stat. */
export const getSalaryCompanies = unstable_cache(
  async (): Promise<CompanyFacet[]> => {
    const rows = await db.salarySubmission.findMany({
      where: { status: "APPROVED" },
      select: {
        companyId: true,
        companyName: true,
        ctcLakhs: true,
        company: { select: { slug: true, logoUrl: true } },
      },
      take: 10000,
    });
    const grouped = new Map<
      string,
      { id: string | null; names: Map<string, number>; companySlug: string | null; logo: string | null; vals: number[] }
    >();
    for (const r of rows) {
      const key = r.companyId ?? `text:${r.companyName.trim().toLowerCase()}`;
      const slot = grouped.get(key) ?? {
        id: r.companyId ?? null,
        names: new Map<string, number>(),
        companySlug: r.company?.slug ?? null,
        logo: r.company?.logoUrl ?? null,
        vals: [],
      };
      const nm = r.companyName.trim();
      slot.names.set(nm, (slot.names.get(nm) ?? 0) + 1);
      slot.vals.push(r.ctcLakhs);
      grouped.set(key, slot);
    }

    // Build entries first, in a DETERMINISTIC order (count desc, then
    // the unique group key) so the same data always yields the same
    // slugs — resolution + the sitemap depend on slug stability.
    const entries = [...grouped.entries()]
      .map(([key, slot]) => {
        const stat = summarise(slot.vals);
        if (!stat) return null;
        // Canonical display name = most frequent variant.
        let name = "";
        let top = -1;
        for (const [variant, n] of slot.names) {
          if (n > top) { top = n; name = variant; }
        }
        return {
          key,
          id: slot.id,
          name,
          names: [...slot.names.keys()].sort(),
          companySlug: slot.companySlug,
          logo: slot.logo,
          count: slot.vals.length,
          stat,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

    type Entry = (typeof entries)[number];
    const toFacet = (e: Entry, slug: string): CompanyFacet => ({
      slug,
      companyId: e.id,
      name: e.name,
      names: e.names,
      companySlug: e.companySlug,
      logoUrl: e.logo,
      count: e.count,
      stat: e.stat,
    });

    // Two-pass slug assignment. Pass 1: verified DB-linked companies
    // claim their canonical Company.slug, so a link built from
    // companySlug elsewhere (the /salaries landing) always resolves to
    // THAT company — never a same-named text employer. Pass 2: text-only
    // employers slugify their name and yield to any reserved slug with a
    // numeric suffix (…-2, …-3). The bare slug goes to the higher-count
    // entry (entries are pre-sorted), keeping URLs stable.
    const out: CompanyFacet[] = [];
    const usedSlugs = new Set<string>();
    for (const e of entries) {
      if (!e.companySlug) continue;
      let slug = e.companySlug;
      let n = 2;
      while (usedSlugs.has(slug)) slug = `${e.companySlug}-${n++}`;
      usedSlugs.add(slug);
      out.push(toFacet(e, slug));
    }
    for (const e of entries) {
      if (e.companySlug) continue;
      const base = salarySlug(e.name);
      if (!base) continue;
      let slug = base;
      let n = 2;
      while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
      usedSlugs.add(slug);
      out.push(toFacet(e, slug));
    }
    // Busiest first for hubs + sitemap; slug tie-break for stability.
    return out.sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
  },
  ["compass:salary-companies:v1"],
  { revalidate: 300, tags: [COMPASS_TAG] },
);

export interface CompanySalaryDetail extends CompanyFacet {
  tiers: TierBreakdown[];
  topRoles: { title: string; stat: SalaryStat }[];
}

/** Resolve a company slug to its full salary detail (or null). */
export async function getSalaryCompany(slug: string): Promise<CompanySalaryDetail | null> {
  const companies = await getSalaryCompanies();
  // Exact registered slug first (DB companies always keep their
  // companySlug via pass-1 assignment, so this is the resolving path for
  // every landing-page link). The base-slug fallback is a graceful net
  // for the rare case where a text employer's name-slug was suffixed
  // away — it still lands on the company that owns that base slug rather
  // than 404-ing.
  const facet =
    companies.find((c) => c.slug === slug) ??
    companies.find((c) => (c.companySlug ?? salarySlug(c.name)) === slug) ??
    null;
  if (!facet) return null;
  const [tiers, topRoles] = await Promise.all([
    facet.companyId
      ? getTierBreakdown({ companyId: facet.companyId })
      : getTierBreakdownForCompanyNames(facet.names),
    getCompanyTopRoles(facet.companyId, facet.names),
  ]);
  return { ...facet, tiers, topRoles };
}

/** Tier breakdown for a text-only company (matched by name variants). */
const getTierBreakdownForCompanyNames = unstable_cache(
  async (companyNames: string[]): Promise<TierBreakdown[]> => {
    const rows = await db.salarySubmission.findMany({
      where: { status: "APPROVED", companyName: { in: companyNames } },
      select: { yearsExp: true, ctcLakhs: true },
    });
    const byBucket = new Map<TierBreakdown["bucket"], number[]>();
    for (const r of rows) {
      const b = bucketFor(r.yearsExp);
      const arr = byBucket.get(b) ?? [];
      arr.push(r.ctcLakhs);
      byBucket.set(b, arr);
    }
    return (["JUNIOR", "MID", "SENIOR", "LEAD"] as const).map((bucket) => ({
      label: BUCKET_LABELS[bucket],
      bucket,
      stat: summarise(byBucket.get(bucket) ?? []),
    }));
  },
  ["compass:tier-breakdown-company-names:v1"],
  { revalidate: 300, tags: [COMPASS_TAG] },
);

/** Top-paying roles within one company (≥PUBLIC_MIN_SAMPLES each). */
const getCompanyTopRoles = unstable_cache(
  async (companyId: string | null, companyNames: string[]): Promise<{ title: string; stat: SalaryStat }[]> => {
    const rows = await db.salarySubmission.findMany({
      where: { status: "APPROVED", ...(companyId ? { companyId } : { companyName: { in: companyNames } }) },
      select: { jobTitle: true, ctcLakhs: true },
    });
    const byTitle = new Map<string, number[]>();
    for (const r of rows) {
      const t = r.jobTitle.trim();
      const arr = byTitle.get(t) ?? [];
      arr.push(r.ctcLakhs);
      byTitle.set(t, arr);
    }
    const out: { title: string; stat: SalaryStat }[] = [];
    for (const [title, vals] of byTitle) {
      const stat = summarise(vals);
      if (stat) out.push({ title, stat });
    }
    return out.sort((a, b) => b.stat.medianLakhs - a.stat.medianLakhs);
  },
  ["compass:company-top-roles:v1"],
  { revalidate: 300, tags: [COMPASS_TAG] },
);

/**
 * Occupation JSON-LD with an estimated-salary distribution — Google's
 * structured-data type for salary rich results. ctcLakhs values are in
 * lakhs of INR, so multiply by 100,000 for the absolute amount.
 */
export function salaryOccupationJsonLd(opts: {
  name: string;
  url: string;
  description: string;
  stat: SalaryStat;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Occupation",
    name: opts.name,
    description: opts.description,
    occupationLocation: { "@type": "Country", name: "India" },
    estimatedSalary: [
      {
        "@type": "MonetaryAmountDistribution",
        name: "base",
        currency: "INR",
        duration: "P1Y",
        percentile25: Math.round(opts.stat.p25Lakhs * 100_000),
        median: Math.round(opts.stat.medianLakhs * 100_000),
        percentile75: Math.round(opts.stat.p75Lakhs * 100_000),
      },
    ],
  };
}
