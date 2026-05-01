import { db } from "@/lib/db";
import { Prisma, JobStatus, JobAudience } from "@prisma/client";

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

  if (filter.q) {
    where.OR = [
      { title: { contains: filter.q, mode: "insensitive" } },
      { description: { contains: filter.q, mode: "insensitive" } },
      { company: { name: { contains: filter.q, mode: "insensitive" } } },
    ];
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
