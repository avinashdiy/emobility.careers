import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export interface CompetitionFilters {
  q?: string;
  type?: string;        // CompetitionType
  domain?: string;      // EVDomain slug
  status?: "live" | "upcoming" | "results" | "all";
  hasPrize?: boolean;
}

export const COMPETITION_LIST_INCLUDE = {
  hostCompany: { select: { id: true, slug: true, name: true, logoUrl: true } },
  prizes: { orderBy: { rank: "asc" } },
  _count: { select: { registrations: true, perks: true } },
} satisfies Prisma.CompetitionInclude;

export async function listCompetitions(filters: CompetitionFilters) {
  const now = new Date();
  const where: Prisma.CompetitionWhereInput = {
    status: { in: ["LIVE", "JUDGING", "RESULTS"] },
  };
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: "insensitive" } },
      { description: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.type) where.type = filters.type as Prisma.CompetitionWhereInput["type"];
  if (filters.domain) where.evDomainSlugs = { has: filters.domain };
  if (filters.status === "live") {
    where.status = "LIVE";
    where.startsAt = { lte: now };
    where.endsAt = { gte: now };
  } else if (filters.status === "upcoming") {
    where.status = "LIVE";
    where.startsAt = { gt: now };
  } else if (filters.status === "results") {
    where.status = "RESULTS";
  }
  if (filters.hasPrize) where.totalPrizePoolMinor = { gt: 0 };

  return db.competition.findMany({
    where,
    orderBy: [{ isFeatured: "desc" }, { startsAt: "asc" }, { createdAt: "desc" }],
    take: 60,
    include: COMPETITION_LIST_INCLUDE,
  });
}

export const COMPETITION_DETAIL_INCLUDE = {
  hostCompany: true,
  postedBy: { select: { id: true, candidateProfile: { select: { firstName: true, lastName: true, slug: true, profilePhotoUrl: true } } } },
  stages: { orderBy: { order: "asc" } },
  prizes: { orderBy: { rank: "asc" } },
  perks: { include: { job: { select: { id: true, slug: true, title: true } } } },
  announcements: { orderBy: { createdAt: "desc" }, take: 20 },
  _count: { select: { registrations: true } },
} satisfies Prisma.CompetitionInclude;

export async function getCompetitionBySlug(slug: string) {
  return db.competition.findUnique({ where: { slug }, include: COMPETITION_DETAIL_INCLUDE });
}

export async function getCompetitionForHost(competitionId: string, viewerUserId: string) {
  // Used by /employer/competitions/[id]/* — must verify the viewer represents
  // the hosting company (owner OR a team member with admin/recruiter role).
  return db.competition.findFirst({
    where: {
      id: competitionId,
      OR: [
        { postedById: viewerUserId },
        { hostCompany: { ownerUserId: viewerUserId } },
        { hostCompany: { team: { some: { userId: viewerUserId } } } },
      ],
    },
    include: COMPETITION_DETAIL_INCLUDE,
  });
}

export async function getMyRegistration(competitionId: string, userId: string) {
  return db.competitionRegistration.findFirst({
    where: {
      competitionId,
      OR: [
        { leaderUserId: userId },
        { members: { some: { userId } } },
      ],
    },
    include: {
      members: { include: { user: { select: { id: true, email: true, candidateProfile: { select: { firstName: true, lastName: true, slug: true, profilePhotoUrl: true } } } } } },
      submissions: true,
    },
  });
}

export async function getRegistrationsForHost(competitionId: string) {
  return db.competitionRegistration.findMany({
    where: { competitionId },
    orderBy: [{ finalRank: "asc" }, { registeredAt: "desc" }],
    include: {
      leader: {
        select: {
          id: true, email: true,
          candidateProfile: { select: { firstName: true, lastName: true, slug: true, profilePhotoUrl: true, headline: true } },
        },
      },
      members: { include: { user: { select: { email: true, candidateProfile: { select: { firstName: true, lastName: true } } } } } },
      submissions: { orderBy: { submittedAt: "desc" } },
      scores: true,
    },
  });
}

export async function getModerationQueue(status: "PENDING_REVIEW" | "CHANGES_REQUESTED" | "REJECTED" | "ALL" = "PENDING_REVIEW") {
  const where: Prisma.CompetitionWhereInput =
    status === "ALL"
      ? { status: { in: ["PENDING_REVIEW", "CHANGES_REQUESTED", "REJECTED"] } }
      : { status: status as Prisma.CompetitionWhereInput["status"] };
  return db.competition.findMany({
    where,
    orderBy: { submittedAt: "desc" },
    take: 100,
    include: COMPETITION_LIST_INCLUDE,
  });
}

export async function listMyCompetitions(userId: string) {
  return db.competitionRegistration.findMany({
    where: {
      OR: [
        { leaderUserId: userId },
        { members: { some: { userId } } },
      ],
    },
    orderBy: { registeredAt: "desc" },
    include: {
      competition: { include: COMPETITION_LIST_INCLUDE },
    },
  });
}

export async function getJudgingAssignments(judgeUserId: string) {
  return db.competitionJudge.findMany({
    where: { judgeUserId },
    include: {
      competition: { include: { hostCompany: { select: { name: true, logoUrl: true } } } },
    },
  });
}

export async function getSubmissionsForJudge(competitionId: string, judgeUserId: string) {
  // Stage scoping: if the judge has stageIds set, only those stages.
  const judgeRow = await db.competitionJudge.findFirst({
    where: { competitionId, judgeUserId },
  });
  if (!judgeRow) return [];
  const stageFilter = judgeRow.stageIds.length ? { in: judgeRow.stageIds } : undefined;
  return db.competitionSubmission.findMany({
    where: {
      stage: { competitionId, ...(stageFilter ? { id: stageFilter } : {}) },
    },
    orderBy: { submittedAt: "asc" },
    include: {
      registration: {
        select: {
          id: true,
          teamName: true,
          leader: { select: { candidateProfile: { select: { firstName: true, lastName: true, slug: true, profilePhotoUrl: true } } } },
        },
      },
      stage: true,
      scores: { where: { judgeUserId } },
    },
  });
}
