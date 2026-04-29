import { db } from "@/lib/db";
import { Prisma, JobStatus } from "@prisma/client";

export interface JobsFilter {
  q?: string;
  location?: string;
  domain?: string;     // EV domain slug
  workMode?: string;
  profileMode?: string;
  diyguruOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export async function searchJobs(filter: JobsFilter) {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.JobPostingWhereInput = {
    status: JobStatus.OPEN,
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
