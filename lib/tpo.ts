import { db } from "@/lib/db";
import { ApplicationStage } from "@prisma/client";

/**
 * Placement-coordinator (TPO) query helpers.
 *
 * Centralised here so the TPO dashboard pages stay declarative and the
 * stage-funnel maths is unit-testable. Every helper returns plain
 * JS-serialisable shapes (Date → number, Decimal → number) so the
 * server-component pages can hand them to client charts without any
 * extra marshalling.
 */

// Order matters — drives the funnel chart and the drop-off computation.
// `WITHDRAWN` is excluded from the active funnel: a candidate who pulls
// out wasn't dropped at a stage, they opted out, and lumping them into
// REJECTED muddies the placement signal. They're surfaced separately
// where relevant.
export const FUNNEL_STAGES: ApplicationStage[] = [
  ApplicationStage.APPLIED,
  ApplicationStage.SCREENED,
  ApplicationStage.SHORTLISTED,
  ApplicationStage.ASSESSMENT,
  ApplicationStage.INTERVIEW,
  ApplicationStage.OFFER,
  ApplicationStage.HIRED,
];

export interface FunnelRow {
  stage: ApplicationStage;
  /** Live count at the stage. */
  current: number;
  /** Cumulative count that *reached* this stage at any point in time. */
  reached: number;
  /** Drop-off pct from the previous stage's `reached`. 0 for APPLIED. */
  dropoffPct: number;
}

export interface CohortKpi {
  cohortId: string | null;
  cohortName: string;
  rosterTotal: number;
  claimed: number;
  unclaimed: number;
  applicationsTotal: number;
  hired: number;
  inProcess: number;
  rejected: number;
  /** placementRate = hired / claimed (or 0 when claimed=0). */
  placementRate: number;
}

/**
 * Compute the application-stage funnel for a cohort, optionally scoped
 * to a date window. The "reached" column counts every application that
 * ever passed through the stage (live + historical via StageHistory),
 * which is the number TPOs care about — "did they make it past the
 * shortlist?" rather than "are they currently sitting there?"
 */
export async function getCohortFunnel(
  cohortId: string | null,
  opts?: { since?: Date },
): Promise<FunnelRow[]> {
  // Candidates in the cohort. cohortId === null = "all DIYguru-tagged"
  // bucket — useful for the top-level dashboard before a cohort is picked.
  const candidateWhere = cohortId
    ? { cohortId }
    : { isDIYguruVerified: true };

  const candidateIds = await db.candidateProfile
    .findMany({ where: candidateWhere, select: { id: true } })
    .then((rows) => rows.map((r) => r.id));
  if (candidateIds.length === 0) {
    return FUNNEL_STAGES.map((stage) => ({ stage, current: 0, reached: 0, dropoffPct: 0 }));
  }

  // Live counts — group by current stage.
  const live = await db.application.groupBy({
    by: ["stage"],
    where: {
      candidateId: { in: candidateIds },
      ...(opts?.since && { appliedAt: { gte: opts.since } }),
    },
    _count: { _all: true },
  });
  const liveByStage = new Map<ApplicationStage, number>();
  for (const r of live) liveByStage.set(r.stage, r._count._all);

  // Reached counts — derived from StageHistory.toStage. We count distinct
  // (applicationId, stage) pairs because a row could re-enter a stage
  // (rare but possible).
  const stageHistoryRows = await db.stageHistory.findMany({
    where: {
      application: {
        candidateId: { in: candidateIds },
        ...(opts?.since && { appliedAt: { gte: opts.since } }),
      },
    },
    select: { applicationId: true, toStage: true },
  });
  const reachedByStage = new Map<ApplicationStage, Set<string>>();
  for (const stage of FUNNEL_STAGES) reachedByStage.set(stage, new Set());
  for (const r of stageHistoryRows) {
    reachedByStage.get(r.toStage)?.add(r.applicationId);
  }
  // Every application also implicitly "reached" APPLIED on creation, so
  // backfill from the live counts where StageHistory is absent.
  const appliedAppRows = await db.application.findMany({
    where: {
      candidateId: { in: candidateIds },
      ...(opts?.since && { appliedAt: { gte: opts.since } }),
    },
    select: { id: true },
  });
  for (const r of appliedAppRows) reachedByStage.get(ApplicationStage.APPLIED)?.add(r.id);

  let prevReached: number | null = null;
  return FUNNEL_STAGES.map((stage) => {
    const reached = reachedByStage.get(stage)?.size ?? 0;
    const dropoffPct = prevReached && prevReached > 0
      ? Math.max(0, Math.round(((prevReached - reached) / prevReached) * 100))
      : 0;
    prevReached = reached;
    return {
      stage,
      current: liveByStage.get(stage) ?? 0,
      reached,
      dropoffPct,
    };
  });
}

/**
 * High-level KPIs for one cohort (or the whole DIYguru pool when
 * `cohortId === null`). Used by the TPO dashboard's KPI strip.
 */
export async function getCohortKpi(cohortId: string | null): Promise<CohortKpi> {
  const cohort = cohortId
    ? await db.cohort.findUnique({ where: { id: cohortId }, select: { name: true } })
    : null;
  const rosterWhere = cohortId ? { cohortId } : {};
  const candidateWhere = cohortId ? { cohortId } : { isDIYguruVerified: true };

  const [rosterTotal, claimed, applications] = await Promise.all([
    db.dIYguruRoster.count({ where: rosterWhere }),
    db.candidateProfile.count({ where: candidateWhere }),
    db.application.findMany({
      where: { candidate: candidateWhere },
      select: { id: true, stage: true },
    }),
  ]);
  const hired = applications.filter((a) => a.stage === ApplicationStage.HIRED).length;
  const rejected = applications.filter((a) => a.stage === ApplicationStage.REJECTED).length;
  const withdrawn = applications.filter((a) => a.stage === ApplicationStage.WITHDRAWN).length;
  const inProcess = applications.length - hired - rejected - withdrawn;

  return {
    cohortId,
    cohortName: cohort?.name ?? "All DIYguru-verified",
    rosterTotal,
    claimed,
    unclaimed: Math.max(0, rosterTotal - claimed),
    applicationsTotal: applications.length,
    hired,
    inProcess,
    rejected,
    placementRate: claimed > 0 ? Math.round((hired / claimed) * 100) : 0,
  };
}

export interface UnplacedStudent {
  candidateId: string;
  slug: string;
  fullName: string;
  email: string | null;
  headline: string | null;
  profilePhotoUrl: string | null;
  cohortName: string | null;
  applicationsCount: number;
  lastAppliedAt: number | null;
  profileCompleteness: number;
}

/**
 * "Still unplaced" — claimed students with no HIRED application. The
 * single most important list on the TPO dashboard: it's the work queue.
 *
 * Sorted by:
 *   1. Profiles below 90% (TPO can nudge them to fill out)
 *   2. Then by `lastAppliedAt` ascending (haven't applied lately first)
 */
export async function getUnplacedStudents(
  cohortId: string | null,
  limit = 50,
): Promise<UnplacedStudent[]> {
  const candidateWhere = cohortId ? { cohortId } : { isDIYguruVerified: true };
  const candidates = await db.candidateProfile.findMany({
    where: {
      ...candidateWhere,
      // Filter out anyone who's been hired anywhere — a HIRED application
      // means they're placed regardless of further job activity.
      applications: { none: { stage: ApplicationStage.HIRED } },
    },
    take: limit,
    orderBy: [{ profileCompleteness: "asc" }, { updatedAt: "asc" }],
    include: {
      cohort: { select: { name: true } },
      _count: { select: { applications: true } },
      applications: {
        select: { appliedAt: true },
        orderBy: { appliedAt: "desc" },
        take: 1,
      },
    },
  });
  return candidates.map((c) => ({
    candidateId: c.id,
    slug: c.slug,
    fullName: [c.firstName, c.lastName].filter(Boolean).join(" "),
    email: c.email,
    headline: c.headline,
    profilePhotoUrl: c.profilePhotoUrl,
    cohortName: c.cohort?.name ?? null,
    applicationsCount: c._count.applications,
    lastAppliedAt: c.applications[0]?.appliedAt.getTime() ?? null,
    profileCompleteness: c.profileCompleteness,
  }));
}

/**
 * Fresh-job-requirements counter — how many JD requests landed in the
 * last 24h that DIYguru students could apply to. Surfaced on the TPO
 * dashboard so the coordinator can match them to unplaced students.
 */
export async function getRecentRequirementsCount(): Promise<{
  last24h: number;
  last7d: number;
}> {
  const day = 24 * 60 * 60 * 1000;
  const since24 = new Date(Date.now() - day);
  const since7d = new Date(Date.now() - 7 * day);
  const [last24h, last7d] = await Promise.all([
    db.jobPosting.count({
      where: { status: "OPEN", publishedAt: { gte: since24 } },
    }),
    db.jobPosting.count({
      where: { status: "OPEN", publishedAt: { gte: since7d } },
    }),
  ]);
  return { last24h, last7d };
}
