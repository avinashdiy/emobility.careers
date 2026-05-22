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

// ─── Per-program (RecruitmentDrive) participation reports ────────────
//
// Built for the "TPO needs to know how their cohort is doing in the
// Summer Internship Program" use case. The platform models programs as
// RecruitmentDrives (the same entity that powers the public fairs page,
// the Recruitathon flow, etc.). For a given TPO + a given drive, we want:
//
//   • How many of their cohort REGISTERED for the drive (via
//     RecruitmentDriveRegistration)
//   • How many APPLIED to jobs that are part of the drive
//     (RecruitmentDriveJob)
//   • Stage breakdown of those applications (APPLIED / SCREENED /
//     SHORTLISTED / INTERVIEW / OFFER / HIRED)
//
// Returns plain-JS shapes so the page can hand them to the (server-
// rendered) table + CSV export without extra marshalling.

export interface DriveParticipationSummary {
  driveId: string;
  driveSlug: string;
  driveTitle: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  /// Cohort students who registered for THIS drive.
  registeredCount: number;
  /// Cohort students who applied to at least one job that's part of
  /// THIS drive (RecruitmentDriveJob.jobId).
  appliedCount: number;
  /// Live stage counts — APPLIED / SCREENED / … / HIRED — for the
  /// cohort's applications to this drive's jobs. Keyed by enum value.
  stageCounts: Partial<Record<ApplicationStage, number>>;
  /// Convenience — number HIRED via this drive.
  hiredCount: number;
}

/**
 * List every active drive (OPEN or IN_PROGRESS) with the participation
 * summary for the given cohort. When `cohortId === null`, falls back to
 * the platform-wide DIYguru-verified pool (matches the rest of the TPO
 * helpers). Used by `/tpo/programs` to render the program list.
 */
export async function listCohortDriveParticipation(
  cohortId: string | null,
): Promise<DriveParticipationSummary[]> {
  // Active + recently-closed drives in display order — newest first.
  // We include CLOSED so TPOs can still pull last-month's recap +
  // CSV; CANCELLED + DRAFT are correctly hidden.
  const drives = await db.recruitmentDrive.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS", "CLOSED"] } },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      startsAt: true,
      endsAt: true,
    },
    take: 25,
  });
  if (drives.length === 0) return [];

  // Resolve the cohort's candidate IDs once — every drive's stats
  // filter on this set. Same scope rule as `getCohortFunnel`.
  const candidateWhere = cohortId
    ? { cohortId }
    : { isDIYguruVerified: true };
  const candidateRows = await db.candidateProfile.findMany({
    where: candidateWhere,
    select: { id: true },
  });
  const candidateIds = candidateRows.map((c) => c.id);
  if (candidateIds.length === 0) {
    return drives.map((d) => ({
      driveId: d.id,
      driveSlug: d.slug,
      driveTitle: d.title,
      status: d.status,
      startsAt: d.startsAt,
      endsAt: d.endsAt,
      registeredCount: 0,
      appliedCount: 0,
      stageCounts: {},
      hiredCount: 0,
    }));
  }

  // For each drive in parallel: registered count + applied count +
  // stage breakdown. Three cheap aggregate queries per drive; 25
  // drives × 3 = ~75 queries. The findMany + Map pattern below would
  // be one query but produces a larger payload to filter in app. For
  // the TPO console traffic this is fine; revisit if drive count
  // grows past 100.
  return Promise.all(
    drives.map(async (d) => {
      // Drive's job IDs — for application filtering.
      const driveJobs = await db.recruitmentDriveJob.findMany({
        where: { driveId: d.id },
        select: { jobId: true },
      });
      const jobIds = driveJobs.map((j) => j.jobId);

      const [registeredCount, applications] = await Promise.all([
        db.recruitmentDriveRegistration.count({
          where: {
            driveId: d.id,
            candidateId: { in: candidateIds },
            status: { in: ["REGISTERED", "CHECKED_IN"] },
          },
        }),
        jobIds.length === 0
          ? Promise.resolve([] as { stage: ApplicationStage; candidateId: string }[])
          : db.application.findMany({
              where: {
                jobId: { in: jobIds },
                candidateId: { in: candidateIds },
              },
              select: { stage: true, candidateId: true },
            }),
      ]);

      // applied = DISTINCT candidates with ≥1 application to drive's jobs.
      // stage breakdown = count of APPLICATIONS (not candidates) at each
      // stage — gives TPOs a feel for whether their students are stuck
      // at APPLIED vs progressing.
      const uniqueApplicants = new Set(applications.map((a) => a.candidateId));
      const stageCounts: Partial<Record<ApplicationStage, number>> = {};
      let hiredCount = 0;
      for (const a of applications) {
        stageCounts[a.stage] = (stageCounts[a.stage] ?? 0) + 1;
        if (a.stage === ApplicationStage.HIRED) hiredCount += 1;
      }
      return {
        driveId: d.id,
        driveSlug: d.slug,
        driveTitle: d.title,
        status: d.status,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        registeredCount,
        appliedCount: uniqueApplicants.size,
        stageCounts,
        hiredCount,
      };
    }),
  );
}

export interface DriveStudentRow {
  candidateId: string;
  slug: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  course: string | null;
  registered: boolean;
  checkedIn: boolean;
  applicationsCount: number;
  /// Most-advanced stage the student reached across this drive's jobs.
  /// HIRED > OFFER > INTERVIEW > ASSESSMENT > SHORTLISTED > SCREENED >
  /// APPLIED > "Not applied". Used to summarise the row at a glance.
  furthestStage: ApplicationStage | null;
  /// Per-job summary — one row per (job, stage) so a student appearing
  /// for 3 of the drive's jobs lists 3 entries.
  perJob: { jobTitle: string; companyName: string; stage: ApplicationStage }[];
}

/**
 * Per-student participation in ONE drive, for the cohort's roster.
 * Used by the per-drive detail page + the CSV export endpoint. Lists
 * every cohort student, whether they registered, applied, and how far
 * they got. Includes students who registered but didn't apply (useful
 * signal) AND students who applied without registering (the platform
 * doesn't strictly require registration before applying).
 */
export async function getDriveStudentReport(
  cohortId: string | null,
  driveSlug: string,
): Promise<{
  drive: { id: string; slug: string; title: string; status: string };
  students: DriveStudentRow[];
} | null> {
  const drive = await db.recruitmentDrive.findUnique({
    where: { slug: driveSlug },
    select: { id: true, slug: true, title: true, status: true },
  });
  if (!drive) return null;

  const candidateWhere = cohortId
    ? { cohortId }
    : { isDIYguruVerified: true };
  const candidates = await db.candidateProfile.findMany({
    where: candidateWhere,
    select: {
      id: true,
      slug: true,
      firstName: true,
      lastName: true,
      email: true,
      cohort: { select: { courseName: true } },
    },
    orderBy: { firstName: "asc" },
  });
  if (candidates.length === 0) {
    return { drive, students: [] };
  }

  const candidateIds = candidates.map((c) => c.id);
  const [regs, driveJobs] = await Promise.all([
    db.recruitmentDriveRegistration.findMany({
      where: {
        driveId: drive.id,
        candidateId: { in: candidateIds },
      },
      select: { candidateId: true, status: true },
    }),
    db.recruitmentDriveJob.findMany({
      where: { driveId: drive.id },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            company: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  const regByCandidate = new Map(regs.map((r) => [r.candidateId, r.status]));
  const jobIds = driveJobs.map((j) => j.jobId);
  const jobMeta = new Map(
    driveJobs.map((j) => [
      j.jobId,
      { title: j.job.title, companyName: j.job.company.name },
    ]),
  );

  const applications =
    jobIds.length === 0
      ? []
      : await db.application.findMany({
          where: {
            jobId: { in: jobIds },
            candidateId: { in: candidateIds },
          },
          select: { candidateId: true, jobId: true, stage: true },
        });
  // Group applications per candidate.
  const appsByCandidate = new Map<
    string,
    { jobTitle: string; companyName: string; stage: ApplicationStage }[]
  >();
  for (const a of applications) {
    const meta = jobMeta.get(a.jobId);
    if (!meta) continue;
    const arr = appsByCandidate.get(a.candidateId) ?? [];
    arr.push({ jobTitle: meta.title, companyName: meta.companyName, stage: a.stage });
    appsByCandidate.set(a.candidateId, arr);
  }

  // Stage ordering for "furthest stage" — HIRED highest, APPLIED lowest.
  const stageOrder: Record<ApplicationStage, number> = {
    [ApplicationStage.HIRED]: 7,
    [ApplicationStage.OFFER]: 6,
    [ApplicationStage.INTERVIEW]: 5,
    [ApplicationStage.ASSESSMENT]: 4,
    [ApplicationStage.SHORTLISTED]: 3,
    [ApplicationStage.SCREENED]: 2,
    [ApplicationStage.APPLIED]: 1,
    [ApplicationStage.REJECTED]: 0,
    [ApplicationStage.WITHDRAWN]: 0,
  };

  const students: DriveStudentRow[] = candidates.map((c) => {
    const perJob = appsByCandidate.get(c.id) ?? [];
    const regStatus = regByCandidate.get(c.id) ?? null;
    const furthestStage = perJob.length > 0
      ? perJob.reduce<ApplicationStage>((acc, a) => {
          return stageOrder[a.stage] > stageOrder[acc] ? a.stage : acc;
        }, perJob[0].stage)
      : null;
    return {
      candidateId: c.id,
      slug: c.slug,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      course: c.cohort?.courseName ?? null,
      registered: regStatus !== null,
      checkedIn: regStatus === "CHECKED_IN",
      applicationsCount: perJob.length,
      furthestStage,
      perJob,
    };
  });

  return { drive, students };
}
