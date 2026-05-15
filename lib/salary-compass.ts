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
