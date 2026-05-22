import "server-only";

import { db } from "@/lib/db";
import { ApplicationStage } from "@prisma/client";

/**
 * Recruiter response-time stats. Drives the IIMjobs-style "Recruiter
 * typically responds in 2 days" pill on job listings + company pages.
 *
 * The signal is the time elapsed between an application's creation
 * (stage=APPLIED) and the FIRST recruiter-driven stage move (anything
 * other than WITHDRAWN, which is candidate-side). We compute median +
 * count from StageHistory rows for each company, scoped to the last
 * 90 days so a recruiter's recent behaviour drives the pill — old
 * neglected jobs don't pin the metric forever.
 *
 * Two-call design (one helper per surface):
 *   - getCompanyResponseStats(companyId) — for /company/[slug]
 *   - getJobResponseStats(jobId)         — for /jobs/[id]
 *
 * Both return null when there's not enough data to make a confident
 * statement (<5 samples). The UI shows nothing when null — better than
 * a misleading "responds in 7 days" inferred from one slow application.
 */

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const MIN_SAMPLES = 5;

export interface ResponseStats {
  /** Median hours from APPLIED → first recruiter move. */
  medianHours: number;
  /** Median in days, rounded to one decimal. UI prefers this. */
  medianDays: number;
  /** Sample size used. */
  sampleCount: number;
}

/**
 * Convert a list of millisecond gaps into a median, ignoring obvious
 * outliers (>30 days). Real response-times cluster within 14 days; a
 * single forgotten application sitting at 60 days drags the mean
 * heavily but contributes nothing to the recruiter's "typical" speed.
 */
function median(samples: number[]): number {
  const cap = 30 * 24 * 60 * 60 * 1000;
  const filtered = samples.filter((m) => m > 0 && m < cap).sort((a, b) => a - b);
  const n = filtered.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return filtered[Math.floor(n / 2)];
  return (filtered[n / 2 - 1] + filtered[n / 2]) / 2;
}

/**
 * Pull the first recruiter-driven stage move per application. We use
 * StageHistory rows where `fromStage = APPLIED` and `toStage` is any
 * non-WITHDRAWN stage. The `byUserId` field is non-null when an actual
 * recruiter clicked the move (not a system-driven move), which is what
 * we want to measure.
 */
async function firstResponseSamplesForApps(applicationIds: string[]): Promise<number[]> {
  if (applicationIds.length === 0) return [];

  const apps = await db.application.findMany({
    where: { id: { in: applicationIds } },
    select: { id: true, appliedAt: true },
  });
  const appliedAtById = new Map(apps.map((a) => [a.id, a.appliedAt]));

  // Earliest forward move per application.
  const moves = await db.stageHistory.findMany({
    where: {
      applicationId: { in: applicationIds },
      fromStage: ApplicationStage.APPLIED,
      // Drop WITHDRAWN — that's the candidate-driven path; we want the
      // recruiter's response, not the candidate's giving up.
      toStage: { not: ApplicationStage.WITHDRAWN },
      byUserId: { not: null },
    },
    select: { applicationId: true, at: true },
    orderBy: { at: "asc" },
  });
  // Keep only the first move per application.
  const firstByApp = new Map<string, Date>();
  for (const m of moves) {
    if (!firstByApp.has(m.applicationId)) firstByApp.set(m.applicationId, m.at);
  }
  const samples: number[] = [];
  for (const [appId, firstMove] of firstByApp) {
    const appliedAt = appliedAtById.get(appId);
    if (!appliedAt) continue;
    samples.push(firstMove.getTime() - appliedAt.getTime());
  }
  return samples;
}

export async function getCompanyResponseStats(companyId: string): Promise<ResponseStats | null> {
  const since = new Date(Date.now() - NINETY_DAYS_MS);
  const apps = await db.application.findMany({
    where: { job: { companyId }, appliedAt: { gte: since } },
    select: { id: true },
    take: 500,
  });
  const samples = await firstResponseSamplesForApps(apps.map((a) => a.id));
  if (samples.length < MIN_SAMPLES) return null;
  const ms = median(samples);
  const hours = ms / (60 * 60 * 1000);
  return {
    medianHours: Math.round(hours),
    medianDays: Math.round((hours / 24) * 10) / 10,
    sampleCount: samples.length,
  };
}

export async function getJobResponseStats(jobId: string): Promise<ResponseStats | null> {
  const since = new Date(Date.now() - NINETY_DAYS_MS);
  const apps = await db.application.findMany({
    where: { jobId, appliedAt: { gte: since } },
    select: { id: true },
    take: 500,
  });
  const samples = await firstResponseSamplesForApps(apps.map((a) => a.id));
  if (samples.length < MIN_SAMPLES) {
    // If the specific job is too new, fall back to the company-level
    // signal so a brand-new posting still surfaces a meaningful pill.
    const job = await db.jobPosting.findUnique({
      where: { id: jobId },
      select: { companyId: true },
    });
    if (!job) return null;
    return getCompanyResponseStats(job.companyId);
  }
  const ms = median(samples);
  const hours = ms / (60 * 60 * 1000);
  return {
    medianHours: Math.round(hours),
    medianDays: Math.round((hours / 24) * 10) / 10,
    sampleCount: samples.length,
  };
}

/**
 * Format the stats for the pill — chooses the right unit (hours / days)
 * based on magnitude and appends a "Fast"/"Typical"/"Slow" hint so the
 * candidate doesn't have to interpret raw numbers. Returns null when the
 * stats themselves are null (caller should hide the pill).
 */
export function formatResponse(stats: ResponseStats | null): {
  label: string;
  tone: "fast" | "typical" | "slow";
} | null {
  if (!stats) return null;
  let label: string;
  if (stats.medianHours < 24) label = `Responds in ~${Math.max(1, stats.medianHours)}h`;
  else if (stats.medianDays < 1.5) label = `Responds in ~1 day`;
  else if (stats.medianDays < 14) label = `Responds in ~${Math.round(stats.medianDays)} days`;
  else label = `Slow responder · ~${Math.round(stats.medianDays)} days`;

  const tone: "fast" | "typical" | "slow" =
    stats.medianDays < 2 ? "fast"
    : stats.medianDays < 7 ? "typical"
    : "slow";
  return { label, tone };
}

// ─── Recruiter responsiveness rating ──────────────────────

export interface RecruiterRating {
  /** 1.0 to 5.0 in 0.5 increments. */
  stars: number;
  /** "Excellent" / "Great" / "Good" / "Slow" / "Poor" — paired with stars. */
  label: string;
  /** Total applications used to compute the rating. */
  sampleCount: number;
  /** % of applications that breached an SLA in the window. */
  breachRate: number;
  /** Same median-days the response-time pill uses, surfaced for the
      tooltip so candidates see both halves of the score. */
  medianDays: number | null;
}

/**
 * IIMjobs-style recruiter rating for the company page hero. Combines
 * two signals from the last 90 days:
 *
 *   - **Median response time** (StageHistory: APPLIED → first move).
 *     Faster = better. Mapped to a 0-3 base score.
 *   - **SLA breach rate** (count of `SLABreach` rows / total apps).
 *     More breaches = penalty. Mapped to a -2 to 0 modifier.
 *
 * Sum lands in [0, 3], then we add a 2-point baseline so the rating
 * scale matches "1-5 stars" candidate expectations. Returns null when
 * sample size is below MIN_SAMPLES so we never invent a number from
 * thin data.
 *
 * Rating bands:
 *   ≥ 4.5 → "Excellent" (responds <1 day, near-zero breaches)
 *   ≥ 4.0 → "Great"
 *   ≥ 3.0 → "Good"
 *   ≥ 2.0 → "Slow"
 *   <  2  → "Poor"
 */
export async function getRecruiterRating(companyId: string): Promise<RecruiterRating | null> {
  const since = new Date(Date.now() - NINETY_DAYS_MS);
  const apps = await db.application.findMany({
    where: { job: { companyId }, appliedAt: { gte: since } },
    select: { id: true },
    take: 500,
  });
  if (apps.length < MIN_SAMPLES) return null;
  const appIds = apps.map((a) => a.id);

  const [samples, breachCount] = await Promise.all([
    firstResponseSamplesForApps(appIds),
    db.sLABreach.count({
      where: {
        applicationId: { in: appIds },
        breachedAt: { gte: since },
      },
    }),
  ]);

  const ms = median(samples);
  const hours = ms / (60 * 60 * 1000);
  const days = hours / 24;
  const breachRate = breachCount / apps.length;

  // Response-time component (0..3). Sub-day responses get the full
  // three points; week-plus drops to zero.
  const respScore =
    days < 1 ? 3
    : days < 2 ? 2.5
    : days < 4 ? 2
    : days < 7 ? 1
    : 0;

  // Breach-rate penalty (-2..0). Half the apps breaching costs the
  // recruiter the full 2 points; clean track-record adds nothing.
  const breachPenalty = -Math.min(2, breachRate * 4);

  const raw = 2 + respScore + breachPenalty; // 0..5 nominal
  const clamped = Math.max(1, Math.min(5, raw));
  // Round to nearest 0.5 — same granularity LinkedIn uses for company
  // ratings; sub-half precision implies more confidence than we have.
  const stars = Math.round(clamped * 2) / 2;

  const label =
    stars >= 4.5 ? "Excellent"
    : stars >= 4 ? "Great"
    : stars >= 3 ? "Good"
    : stars >= 2 ? "Slow"
    : "Poor";

  return {
    stars,
    label,
    sampleCount: apps.length,
    breachRate: Math.round(breachRate * 100),
    medianDays: samples.length > 0 ? Math.round(days * 10) / 10 : null,
  };
}
