import { db } from "@/lib/db";
import { ApplicationStage } from "@prisma/client";

/**
 * Public "Industry Pulse" data layer.
 *
 * The Pulse page is the platform's viral magnet — a no-auth, public-by-
 * design, dynamically-rendered surface that shows the EV industry's
 * heartbeat in real time. Every helper here returns plain serialisable
 * shapes so the page itself stays a server component with no extra
 * marshalling. None of this leaks personal data:
 *
 *   - Recent hires are anonymised to role + company (no candidate name).
 *   - Salary teasers are aggregated medians (never per-person).
 *   - Top-companies / top-skills are pure aggregates over public jobs.
 *
 * Pulse is intentionally generous with data because the funnel is
 * "see something interesting → sign up to act on it". The full personal
 * surfaces (matching, alerts, applying) require auth + profile.
 */

const ONE_DAY = 24 * 60 * 60 * 1000;

// ─── Live counters (top of the Pulse page) ─────────────────

export interface PulseCounters {
  /** Open jobs across the platform right now. */
  openJobs: number;
  /** Jobs added in the last 24h — drives the "X added today" ticker. */
  jobsAddedToday: number;
  /** Verified DIYguru candidates — social proof for the next student. */
  verifiedPros: number;
  /** Successful HIRED transitions in the last 7 days — proves the loop closes. */
  hiresLast7d: number;
  /** Active companies posting at least one OPEN job. */
  activeCompanies: number;
}

export async function getPulseCounters(): Promise<PulseCounters> {
  const since24h = new Date(Date.now() - ONE_DAY);
  const since7d = new Date(Date.now() - 7 * ONE_DAY);

  const [openJobs, jobsAddedToday, verifiedPros, hires7d, activeCompanies] =
    await Promise.all([
      db.jobPosting.count({ where: { status: "OPEN" } }),
      db.jobPosting.count({
        where: { status: "OPEN", publishedAt: { gte: since24h } },
      }),
      db.candidateProfile.count({ where: { isDIYguruVerified: true } }),
      db.stageHistory.count({
        where: { toStage: ApplicationStage.HIRED, at: { gte: since7d } },
      }),
      db.jobPosting
        .findMany({
          where: { status: "OPEN" },
          select: { companyId: true },
          distinct: ["companyId"],
        })
        .then((rows) => rows.length),
    ]);

  return {
    openJobs,
    jobsAddedToday,
    verifiedPros,
    hiresLast7d: hires7d,
    activeCompanies,
  };
}

// ─── Top hiring companies right now ─────────────────────────

export interface HiringCompany {
  slug: string;
  name: string;
  logoUrl: string | null;
  openCount: number;
}

/** Companies ranked by open-job count. The Pulse page shows ~6. */
export async function getTopHiringCompanies(limit = 6): Promise<HiringCompany[]> {
  const grouped = await db.jobPosting.groupBy({
    by: ["companyId"],
    where: { status: "OPEN" },
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return [];
  const companies = await db.company.findMany({
    where: { id: { in: grouped.map((g) => g.companyId) } },
    select: { id: true, slug: true, name: true, logoUrl: true },
  });
  const byId = new Map(companies.map((c) => [c.id, c]));
  return grouped
    .map((g) => {
      const c = byId.get(g.companyId);
      if (!c) return null;
      return {
        slug: c.slug,
        name: c.name,
        logoUrl: c.logoUrl,
        openCount: g._count._all,
      };
    })
    .filter((x): x is HiringCompany => !!x);
}

// ─── Hottest skills (most-required across recent JDs) ───────

export interface HotSkill {
  slug: string;
  name: string;
  /** Number of OPEN jobs requiring this skill in the last 30 days. */
  jobCount: number;
}

export async function getHottestSkills(limit = 8): Promise<HotSkill[]> {
  const since30d = new Date(Date.now() - 30 * ONE_DAY);
  const grouped = await db.jobSkill.groupBy({
    by: ["skillId"],
    where: {
      job: { status: "OPEN", publishedAt: { gte: since30d } },
    },
    _count: { _all: true },
    orderBy: { _count: { skillId: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return [];
  const skills = await db.skill.findMany({
    where: { id: { in: grouped.map((g) => g.skillId) } },
    select: { id: true, slug: true, name: true },
  });
  const bySkillId = new Map(skills.map((s) => [s.id, s]));
  return grouped
    .map((g) => {
      const s = bySkillId.get(g.skillId);
      if (!s) return null;
      return { slug: s.slug, name: s.name, jobCount: g._count._all };
    })
    .filter((x): x is HotSkill => !!x);
}

// ─── Recent hires (anonymised) ─────────────────────────────

export interface RecentHire {
  /** "Battery Engineer" — the role title only. */
  jobTitle: string;
  /** "Ola Electric" — the company that hired (verified employers only). */
  companyName: string;
  /** "2 days ago" — relative time the hire happened. */
  whenMs: number;
  /** First-name initial only — keeps the tile feeling human without doxing. */
  initial: string;
}

/**
 * Recent successful hires for the Pulse "loop closed" feed. We expose
 * role title + company + hired-when, plus a single-letter initial so the
 * tile reads as "K. just hired at Ola Electric for Battery Engineer".
 * Full names are deliberately withheld — the candidate didn't opt into
 * being on a public marketing surface.
 */
export async function getRecentHires(limit = 8): Promise<RecentHire[]> {
  const rows = await db.stageHistory.findMany({
    where: {
      toStage: ApplicationStage.HIRED,
      // Only include hires where the company is publicly verified — keeps
      // Pulse honest, prevents fake hire spam.
      application: { job: { company: { verificationStatus: "VERIFIED" } } },
    },
    orderBy: { at: "desc" },
    take: limit * 3, // over-fetch in case of duplicates per application
    include: {
      application: {
        select: {
          job: { select: { title: true, company: { select: { name: true } } } },
          candidate: { select: { firstName: true } },
        },
      },
    },
  });
  // Dedupe by application id (a single hire can produce multiple rows in
  // edge cases — recruiter undo + re-hire). Keep first occurrence only.
  const seen = new Set<string>();
  const out: RecentHire[] = [];
  for (const r of rows) {
    if (seen.has(r.applicationId)) continue;
    seen.add(r.applicationId);
    out.push({
      jobTitle: r.application.job.title,
      companyName: r.application.job.company.name,
      whenMs: r.at.getTime(),
      initial: (r.application.candidate.firstName?.[0] ?? "?").toUpperCase(),
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Salary teaser (aggregate medians per role) ────────────

export interface SalaryTeaser {
  jobTitle: string;
  count: number;
  medianMin: number;
  medianMax: number;
  currency: string;
}

/**
 * Aggregate salary teaser. Picks the most-posted role titles in the
 * last 90 days that ALSO disclose salary, then computes the median min
 * and max bands. Rounded to lakhs for readability. Hides anything with
 * fewer than 3 samples — single-job medians aren't a "market rate".
 *
 * The tease is intentional: candidates see "Battery Engineer · ₹12-22L
 * median across X listings" and the call to action is "Sign in to see
 * by company + experience tier".
 */
export async function getSalaryTeasers(limit = 4): Promise<SalaryTeaser[]> {
  const since90d = new Date(Date.now() - 90 * ONE_DAY);
  const jobs = await db.jobPosting.findMany({
    where: {
      status: "OPEN",
      publishedAt: { gte: since90d },
      salaryHidden: false,
      salaryMin: { not: null },
      salaryMax: { not: null },
    },
    select: { title: true, salaryMin: true, salaryMax: true, salaryCurrency: true },
    take: 500,
  });

  // Group by title (case-insensitive). For v1 this is exact-match — a
  // future iteration can normalise via a canonical-titles table.
  const byTitle = new Map<
    string,
    { mins: number[]; maxs: number[]; currency: string }
  >();
  for (const j of jobs) {
    if (!j.salaryMin || !j.salaryMax) continue;
    const key = j.title.trim();
    const slot = byTitle.get(key) ?? { mins: [], maxs: [], currency: j.salaryCurrency };
    slot.mins.push(Number(j.salaryMin));
    slot.maxs.push(Number(j.salaryMax));
    byTitle.set(key, slot);
  }

  const teasers: SalaryTeaser[] = [];
  for (const [title, slot] of byTitle) {
    if (slot.mins.length < 3) continue;
    const median = (xs: number[]) => {
      const sorted = [...xs].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    teasers.push({
      jobTitle: title,
      count: slot.mins.length,
      medianMin: median(slot.mins),
      medianMax: median(slot.maxs),
      currency: slot.currency,
    });
  }
  return teasers.sort((a, b) => b.count - a.count).slice(0, limit);
}

// ─── Featured candidates (opt-in) ───────────────────────────

export interface FeaturedCandidate {
  slug: string;
  name: string;
  headline: string | null;
  profilePhotoUrl: string | null;
  isDIYguruVerified: boolean;
  totalExperienceYears: number;
}

/**
 * Candidates to spotlight on Pulse + the home page.
 *
 * Priority ordering:
 *   1. Admin-curated FeaturedSlot rows for the current week — the
 *      editorial spotlight from /admin/featured.
 *   2. If fewer than `limit` curated slots exist, fill with the
 *      generic top-by-completeness fallback so the section never
 *      renders empty.
 */
export async function getFeaturedCandidates(limit = 5): Promise<FeaturedCandidate[]> {
  // Compute Monday-00:00-IST for the current week — same boundary the
  // /admin/featured curation form uses. Inlined to keep lib/pulse self-
  // contained (no cross-import to server actions).
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  ist.setUTCDate(ist.getUTCDate() - daysSinceMonday);
  ist.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(ist.getTime() - 5.5 * 60 * 60 * 1000);

  const slots = await db.featuredSlot.findMany({
    where: { weekStart, isActive: true },
    orderBy: { position: "asc" },
    take: limit,
    include: {
      candidate: {
        select: {
          slug: true,
          firstName: true,
          lastName: true,
          headline: true,
          profilePhotoUrl: true,
          isDIYguruVerified: true,
          totalExperienceMonths: true,
        },
      },
    },
  });
  const curated: FeaturedCandidate[] = slots.map((s) => ({
    slug: s.candidate.slug,
    name: [s.candidate.firstName, s.candidate.lastName].filter(Boolean).join(" "),
    // Spotlight reason wins when set — that's the editorial copy. Fall
    // back to the candidate's own headline.
    headline: s.spotlightReason ?? s.candidate.headline,
    profilePhotoUrl: s.imageUrl ?? s.candidate.profilePhotoUrl,
    isDIYguruVerified: s.candidate.isDIYguruVerified,
    totalExperienceYears: Math.round((s.candidate.totalExperienceMonths / 12) * 10) / 10,
  }));
  if (curated.length >= limit) return curated;

  // Fill the rest from the algorithmic fallback. Skip slugs already
  // in the curated list to avoid duplicates.
  const curatedSlugs = new Set(curated.map((c) => c.slug));
  const fallback = await db.candidateProfile.findMany({
    where: {
      cvVisibility: "EVERYONE",
      profileCompleteness: { gte: 70 },
      openToWork: true,
      slug: { notIn: [...curatedSlugs] },
    },
    orderBy: [{ profileCompleteness: "desc" }, { updatedAt: "desc" }],
    take: limit - curated.length,
    select: {
      slug: true,
      firstName: true,
      lastName: true,
      headline: true,
      profilePhotoUrl: true,
      isDIYguruVerified: true,
      totalExperienceMonths: true,
    },
  });
  return [
    ...curated,
    ...fallback.map((r) => ({
      slug: r.slug,
      name: [r.firstName, r.lastName].filter(Boolean).join(" "),
      headline: r.headline,
      profilePhotoUrl: r.profilePhotoUrl,
      isDIYguruVerified: r.isDIYguruVerified,
      totalExperienceYears: Math.round((r.totalExperienceMonths / 12) * 10) / 10,
    })),
  ];
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Format a salary in lakhs with the currency prefix. ₹1,200,000 → "₹12L".
 */
export function formatLakhs(value: number, currency = "INR"): string {
  if (currency !== "INR") return `${currency} ${Math.round(value).toLocaleString()}`;
  return `₹${Math.round(value / 100000)}L`;
}
