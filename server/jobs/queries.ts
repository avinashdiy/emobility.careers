import { db } from "@/lib/db";
import { Prisma, JobStatus, JobAudience } from "@prisma/client";
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
  page?: number;
  pageSize?: number;
}

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
      const matches = await db.$queryRaw<{ id: string }[]>`
        SELECT j.id
        FROM "JobPosting" j
        LEFT JOIN "Company" c ON j."companyId" = c.id
        WHERE (j."searchTsv" @@ to_tsquery('simple', ${tsq})
            OR c."searchTsv" @@ to_tsquery('simple', ${tsq}))
        LIMIT 1000
      `;
      // Empty-result short-circuit: if the FTS pass found nothing,
      // skip Prisma entirely and return an empty page. Otherwise we'd
      // run a `WHERE id IN ()` which Postgres optimises but is wasted
      // round-trip.
      if (matches.length === 0) {
        return { jobs: [], total: 0, page, pageSize, pages: 0 };
      }
      where.id = { in: matches.map((r) => r.id) };
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
