import "server-only";

import { db } from "@/lib/db";

/**
 * Server-side analytics for a recruitment drive. Three queries —
 * runs in parallel for the admin detail widget. None of these are
 * candidate-level; the widget shows aggregate counts only, so this
 * library is admin-safe by construction.
 */

export interface FairAnalytics {
  /// Stage funnel — count of Applications at each stage. Includes
  /// the full ATS pipeline so the admin sees drop-offs end-to-end.
  funnel: { stage: string; count: number }[];
  /// Daily applies for the last 30 days. Zero-filled so the
  /// sparkline always renders 30 points.
  daily: { date: string; count: number }[];
  /// Top role by application count. Useful answer to "which job
  /// pulled the crowd at this fair?"
  topRoles: { jobId: string; jobTitle: string; companyName: string; count: number }[];
  /// Total apps + uniq candidates (one candidate may apply to
  /// multiple roles at the same fair).
  totalApplications: number;
  uniqueCandidates: number;
}

const STAGE_ORDER = [
  "APPLIED",
  "SCREENED",
  "ASSESSMENT",
  "SHORTLISTED",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
];

export async function getFairAnalytics(driveId: string): Promise<FairAnalytics> {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Single roundtrip through Promise.all. The funnel uses groupBy
  // (cheap aggregate); daily uses a raw query for the date_trunc;
  // top roles uses a take=10 group with join.
  const [funnelRows, dailyRows, topRoleRows, uniqueRow] = await Promise.all([
    db.application.groupBy({
      by: ["stage"],
      where: { recruitmentDriveId: driveId },
      _count: true,
    }),
    // Daily applies — Postgres date_trunc keeps day boundaries
    // honest across DST without us having to bucket in JS. Bind
    // the driveId via Prisma's tag template so we don't hand-build
    // SQL that an attacker could inject (driveId comes from the
    // route param, server-validated upstream, but layered defence
    // is cheap here).
    db.$queryRaw<{ d: Date; c: bigint }[]>`
      SELECT date_trunc('day', "appliedAt")::date AS d, count(*)::bigint AS c
      FROM "Application"
      WHERE "recruitmentDriveId" = ${driveId}
        AND "appliedAt" >= ${thirtyDaysAgo}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    db.application.groupBy({
      by: ["jobId"],
      where: { recruitmentDriveId: driveId },
      _count: true,
      orderBy: { _count: { jobId: "desc" } },
      take: 5,
    }),
    db.application.findMany({
      where: { recruitmentDriveId: driveId },
      distinct: ["candidateId"],
      select: { candidateId: true },
    }),
  ]);

  // Build the funnel in our canonical stage order so the chart
  // renders from APPLIED → ... → HIRED left-to-right. Pad with 0
  // for stages that have no rows yet.
  const funnelMap = new Map(funnelRows.map((r) => [r.stage, r._count]));
  const funnel = STAGE_ORDER.map((stage) => ({
    stage,
    count: funnelMap.get(stage as never) ?? 0,
  }));

  // Zero-fill the daily series.
  const dailyMap = new Map(
    dailyRows.map((r) => [r.d.toISOString().slice(0, 10), Number(r.c)]),
  );
  const daily: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    daily.push({ date: key, count: dailyMap.get(key) ?? 0 });
  }

  // Resolve job + company names for the top-role list. Single
  // round-trip with `where: { id: { in: ... } }`.
  const topJobIds = topRoleRows.map((r) => r.jobId);
  const jobs = topJobIds.length
    ? await db.jobPosting.findMany({
        where: { id: { in: topJobIds } },
        select: {
          id: true,
          title: true,
          company: { select: { name: true } },
        },
      })
    : [];
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const topRoles = topRoleRows
    .map((r) => {
      const j = jobById.get(r.jobId);
      if (!j) return null;
      return {
        jobId: r.jobId,
        jobTitle: j.title,
        companyName: j.company.name,
        count: r._count,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const totalApplications = funnelRows.reduce((acc, r) => acc + r._count, 0);

  return {
    funnel,
    daily,
    topRoles,
    totalApplications,
    uniqueCandidates: uniqueRow.length,
  };
}
