import { db } from "@/lib/db";
import { Prisma, JobStatus, JobAudience, PowertrainArea, CompanyTier, type Country } from "@prisma/client";
import { buildTsQuery } from "@/lib/search-fts";

export interface JobsFilter {
  q?: string;
  location?: string;
  domain?: string;     // EV domain slug
  workMode?: string;
  profileMode?: string;
  diyguruOnly?: boolean;
  /** Whether the viewing candidate is DIYguru-verified — drives the
      audience filter so DIYGURU_ONLY jobs only surface for verified
      students. Pass `null` (default) for anonymous browsing. */
  viewerIsDIYguru?: boolean;
  // ─── #29 EV facet filters ─────────────────────────────────────
  /** Powertrain area facet — slugged version of the PowertrainArea
      enum so the URL stays readable (`?powertrain=battery`). The
      query maps to enum values when present; unrecognised slugs are
      silently dropped so a bookmarked URL doesn't 500 after we
      rename an enum value. */
  powertrain?: string;
  /** Company tier — OEM / TIER1 / STARTUP / etc. Same slug pattern. */
  companyTier?: string;
  /** Credential slug — filters to jobs that REQUIRE this credential.
      Lets a candidate who holds ARAI surface every job that asks
      for it. Soft (non-required) credential links are not filtered
      here — those still surface, just lower in matching. */
  credential?: string;
  /** Minimum battery-pack size (kWh) the role works with. */
  packKwhMin?: number;
  /** Minimum charger output (kW) the role designs / installs. */
  chargerKwMin?: number;
  /**
   * Country filter. Drives the per-country listings (/uk/jobs,
   * /ae/jobs) AND the country chip on /jobs. When set, restricts
   * results to jobs whose `country` matches; when combined with
   * `includeRelocation: true`, ALSO surfaces openToRelocation
   * jobs from OTHER countries (cross-border discovery — a UK
   * candidate browsing /jobs?country=GB&includeRelocation=true
   * sees UK jobs + every other-country job marked open-to-
   * relocation).
   */
  country?: Country;
  /**
   * Pairs with `country` — when true and country is set, broadens
   * the result set with cross-border relocation-flagged jobs. No
   * effect when country is unset (the unfiltered view already
   * includes everything).
   */
  includeRelocation?: boolean;
  page?: number;
  pageSize?: number;
}

/** Slug → enum lookups for the powertrain facet. Anything not in the
 *  map is silently ignored — keeps the URL contract loose for
 *  forward-compat as we add more areas. */
const POWERTRAIN_SLUGS: Record<string, PowertrainArea> = {
  battery: PowertrainArea.BATTERY,
  bms: PowertrainArea.BMS,
  motor: PowertrainArea.MOTOR,
  charging: PowertrainArea.CHARGING,
  "power-electronics": PowertrainArea.POWER_ELECTRONICS,
  "vehicle-integration": PowertrainArea.VEHICLE_INTEGRATION,
  software: PowertrainArea.SOFTWARE,
  manufacturing: PowertrainArea.MANUFACTURING,
  "after-sales": PowertrainArea.AFTER_SALES,
};

const COMPANY_TIER_SLUGS: Record<string, CompanyTier> = {
  oem: CompanyTier.OEM,
  "tier-1": CompanyTier.TIER1_SUPPLIER,
  "tier-2": CompanyTier.TIER2_SUPPLIER,
  startup: CompanyTier.STARTUP,
  "charging-operator": CompanyTier.CHARGING_OPERATOR,
  research: CompanyTier.RESEARCH_INSTITUTE,
  consulting: CompanyTier.CONSULTING,
};

export async function searchJobs(filter: JobsFilter) {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  // Audience gate. PUBLIC is always visible; DIYGURU_ONLY only surfaces
  // when the viewer is a verified DIYguru student (or admin / employer
  // viewing in preview); INVITE_ONLY never appears in browse.
  const audienceClause: Prisma.JobPostingWhereInput = filter.viewerIsDIYguru
    ? { audience: { in: [JobAudience.PUBLIC, JobAudience.DIYGURU_ONLY] } }
    : { audience: JobAudience.PUBLIC };

  const where: Prisma.JobPostingWhereInput = {
    status: JobStatus.OPEN,
    // Suppress jobs from REJECTED companies — they're admin-banned
    // (duplicates / spam / off-topic). The company page itself 404s
    // for REJECTED, so its jobs shouldn't be discoverable here either.
    company: { verificationStatus: { not: "REJECTED" } },
    ...audienceClause,
  };

  // Text search via Postgres FTS. We do a hybrid: a raw SQL pass to
  // collect matching job IDs (joining JobPosting.searchTsv with
  // Company.searchTsv so a query like "Tata battery engineer"
  // matches both the job-side fields AND the company name), then
  // hand the ID set to Prisma for the rest of the filter
  // combinatorics + relations.
  //
  // Why hybrid: FTS-aware ordering (ts_rank) is great for a single-
  // axis query but the jobs list also wants `publishedAt DESC` for
  // freshness, and Prisma is much easier to compose all the filters
  // (location, workMode, profileMode, domain) in. The 1000-row ID
  // cap keeps the IN clause sane; if we ever have a query that
  // matches 1000+ rows we'd rather show the freshest 1000 than
  // truncate arbitrarily — and 1000 jobs in one search is already
  // way past the point where the user pages via filters.
  if (filter.q) {
    const tsq = buildTsQuery(filter.q);
    if (tsq) {
      // Wrap FTS in try/catch — if `searchTsv` doesn't exist on
      // JobPosting OR Company (setup-fts.sql not run), the join
      // throws and crashes /jobs for any text query. Falling
      // through to "no text filter applied" is a graceful
      // degradation: the page renders the unfiltered list, the
      // other facet filters (location, workMode, etc.) still work,
      // and the user sees results rather than a 500.
      let matches: { id: string }[] | null = null;
      try {
        matches = await db.$queryRaw<{ id: string }[]>`
          SELECT j.id
          FROM "JobPosting" j
          LEFT JOIN "Company" c ON j."companyId" = c.id
          WHERE (j."searchTsv" @@ to_tsquery('simple', ${tsq})
              OR c."searchTsv" @@ to_tsquery('simple', ${tsq}))
          LIMIT 1000
        `;
      } catch (err) {
        console.warn(
          "[searchJobs] FTS path failed, ignoring text filter. Run scripts/setup-fts.sql on the DB.",
          err instanceof Error ? err.message : String(err),
        );
      }
      if (matches !== null) {
        // Empty-result short-circuit: if the FTS pass found nothing,
        // skip Prisma entirely and return an empty page. Otherwise we'd
        // run a `WHERE id IN ()` which Postgres optimises but is wasted
        // round-trip. (Only short-circuits on a SUCCESSFUL FTS query
        // that returned 0 rows — not on a thrown error, which we
        // already handled above by leaving the filter off.)
        if (matches.length === 0) {
          return { jobs: [], total: 0, page, pageSize, pages: 0 };
        }
        where.id = { in: matches.map((r) => r.id) };
      }
      // matches === null → FTS broken; let the rest of the filters
      // narrow the result naturally. User gets "best-effort" results
      // for their query rather than a server error.
    } else {
      // tsq null = empty/sanitised-away input. Treat as no filter.
    }
  }
  if (filter.location && filter.location.toLowerCase() !== "remote") {
    where.locations = { has: filter.location };
  }
  if (filter.location?.toLowerCase() === "remote") {
    where.workMode = "REMOTE";
  }
  if (filter.workMode) {
    where.workMode = filter.workMode as Prisma.JobPostingWhereInput["workMode"];
  }
  if (filter.profileMode) {
    where.profileMode = filter.profileMode as Prisma.JobPostingWhereInput["profileMode"];
  }
  if (filter.domain) {
    where.evDomains = { some: { evDomain: { slug: filter.domain } } };
  }

  // Country filter. Strict match by default — `?country=GB` shows
  // UK-tagged jobs only. With `includeRelocation: true` we widen
  // to ALSO include cross-border relocation-flagged jobs from
  // other countries, so a UK candidate looking for "UK roles +
  // anything visa-sponsored anywhere" gets both in one query.
  if (filter.country) {
    if (filter.includeRelocation) {
      where.OR = [
        { country: filter.country },
        { openToRelocation: true },
      ];
    } else {
      where.country = filter.country;
    }
  }

  // ─── #29 EV facet filters ─────────────────────────────────────
  if (filter.powertrain && POWERTRAIN_SLUGS[filter.powertrain]) {
    where.powertrainArea = POWERTRAIN_SLUGS[filter.powertrain];
  }
  if (filter.companyTier && COMPANY_TIER_SLUGS[filter.companyTier]) {
    // The CompanyTier filter goes through the relation since the column
    // lives on Company, not JobPosting. Merging with the existing
    // `company` constraint above keeps the verificationStatus check.
    where.company = {
      ...(where.company as Prisma.CompanyWhereInput),
      companyTier: COMPANY_TIER_SLUGS[filter.companyTier],
    };
  }
  if (filter.credential) {
    // We deliberately filter on REQUIRED credentials only — soft "nice
    // to have" credentials inform the match score, not the filter.
    where.credentials = {
      some: { credential: { slug: filter.credential }, required: true },
    };
  }
  if (filter.packKwhMin !== undefined && filter.packKwhMin > 0) {
    where.packSizeKwh = { gte: filter.packKwhMin };
  }
  if (filter.chargerKwMin !== undefined && filter.chargerKwMin > 0) {
    where.chargerKw = { gte: filter.chargerKwMin };
  }

  const [jobs, total] = await Promise.all([
    db.jobPosting.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip,
      take: pageSize,
      include: {
        company: { select: { name: true, slug: true, logoUrl: true } },
      },
    }),
    db.jobPosting.count({ where }),
  ]);

  return { jobs, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
