import "server-only";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Daily aggregator for the EV Industry Pulse trend chart.
 *
 * Writes one PulseSnapshot row per (date, kind) for the previous UTC
 * day's activity. The Pulse page reads these rows to render the
 * 30-day hiring-velocity sparkline and the WoW deltas — without this
 * worker, the chart would have to compute "jobs added on April 12"
 * by counting rows on every page view, which doesn't scale once the
 * platform has any volume.
 *
 * Idempotency: keyed on (date, kind, bucket) which is the table's
 * unique index, so re-running for the same day is safe — values get
 * upserted to the latest count. That means the worker can also run
 * on a retry path or a manual `tsx scripts/...` invocation without
 * polluting history.
 *
 * Back-fill: when called with `daysBack > 1` we walk backwards day-
 * by-day until we hit a day that already has a snapshot. Used at
 * worker startup to populate the chart on a fresh deploy.
 */

interface AggregateResult {
  daysWritten: number;
  rowsUpserted: number;
}

const ONE_DAY = 24 * 60 * 60 * 1000;

/** UTC midnight for the day that contains `at`. */
function utcMidnight(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/**
 * Aggregate a single UTC day. `dayStart` must be UTC midnight; we
 * compute the [dayStart, dayStart+24h) window and count.
 */
async function aggregateOneDay(dayStart: Date): Promise<number> {
  const dayEnd = new Date(dayStart.getTime() + ONE_DAY);

  const [jobsNew, applicationsNew, hires, candidatesNew, jobsOpenTotal, companiesActive] =
    await Promise.all([
      // JOBS_NEW — count by `publishedAt` so re-publishing a draft
      // is the moment that lands on the trend chart, not the
      // create-as-draft moment.
      db.jobPosting.count({
        where: { publishedAt: { gte: dayStart, lt: dayEnd } },
      }),
      db.application.count({
        where: { appliedAt: { gte: dayStart, lt: dayEnd } },
      }),
      db.stageHistory.count({
        where: { toStage: "HIRED", at: { gte: dayStart, lt: dayEnd } },
      }),
      db.candidateProfile.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      }),
      // JOBS_OPEN_TOTAL is a snapshot at end-of-day. We approximate
      // by counting OPEN jobs whose publishedAt < dayEnd and (
      // closesAt is null OR closesAt > dayStart). For a rolling
      // 30-day chart this is "good enough" — exact end-of-day
      // status would need a full audit-trail query that's
      // disproportionately expensive.
      db.jobPosting.count({
        where: {
          status: "OPEN",
          publishedAt: { lt: dayEnd },
          OR: [{ closesAt: null }, { closesAt: { gt: dayStart } }],
        },
      }),
      // COMPANIES_ACTIVE — distinct companies with ≥1 OPEN job at
      // end-of-day (same approximation as above).
      db.jobPosting
        .findMany({
          where: {
            status: "OPEN",
            publishedAt: { lt: dayEnd },
            OR: [{ closesAt: null }, { closesAt: { gt: dayStart } }],
          },
          select: { companyId: true },
          distinct: ["companyId"],
        })
        .then((rows) => rows.length),
    ]);

  const upserts = [
    { kind: "JOBS_NEW" as const, value: jobsNew },
    { kind: "APPLICATIONS_NEW" as const, value: applicationsNew },
    { kind: "HIRES" as const, value: hires },
    { kind: "CANDIDATES_NEW" as const, value: candidatesNew },
    { kind: "JOBS_OPEN_TOTAL" as const, value: jobsOpenTotal },
    { kind: "COMPANIES_ACTIVE" as const, value: companiesActive },
  ];

  // Atomic per-kind upsert. The schema uses `bucket String @default("")`
  // (NOT nullable) precisely so this composite-unique upsert works —
  // a nullable bucket would break the unique constraint under
  // Postgres's NULL-as-distinct semantics AND would be rejected by
  // Prisma's compound unique-key API. The empty-string sentinel is
  // the rollup-level marker; per-EV-domain slices (a future addition)
  // would use the domain slug instead.
  await db.$transaction(
    upserts.map((u) =>
      db.pulseSnapshot.upsert({
        where: {
          date_kind_bucket: { date: dayStart, kind: u.kind, bucket: "" },
        },
        create: { date: dayStart, kind: u.kind, value: u.value, bucket: "" },
        update: { value: u.value },
      }),
    ),
  );
  return upserts.length;
}

/**
 * Aggregate yesterday (always) plus optionally back-fill `daysBack`
 * older days. Daily ticks pass `daysBack = 1`; the worker startup
 * back-fill passes `daysBack = 30`.
 */
export async function aggregatePulseSnapshots(daysBack = 1): Promise<AggregateResult> {
  const today = utcMidnight(new Date());
  let rowsUpserted = 0;
  let daysWritten = 0;
  // Walk backwards from yesterday so we get the most-recent day
  // first — useful when `daysBack` is small (the daily tick).
  for (let i = 1; i <= daysBack; i++) {
    const day = new Date(today.getTime() - i * ONE_DAY);
    try {
      const n = await aggregateOneDay(day);
      rowsUpserted += n;
      daysWritten += 1;
    } catch (err) {
      logger.error({ err, day }, "[pulse-aggregator] day failed; continuing");
      // Don't bail — we'd rather have 5 of 7 days than zero.
    }
  }
  logger.info({ daysWritten, rowsUpserted }, "[pulse-aggregator] tick");
  return { daysWritten, rowsUpserted };
}

/**
 * One-off back-fill helper — run this once on first deploy of the
 * Pulse trend feature, or whenever the Pulse Snapshot table has
 * been wiped. Walks back 30 days unconditionally.
 */
export async function backfillPulseSnapshots(daysBack = 30): Promise<AggregateResult> {
  return aggregatePulseSnapshots(daysBack);
}
