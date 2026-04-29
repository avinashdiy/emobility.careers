import { db } from "@/lib/db";
import { ApplicationStage } from "@prisma/client";

/**
 * Candidate-side application stats. Powers the LinkedIn-style
 * "Applied 14 · Interviewed 3 · Offers 1" tracker on the candidate's
 * own /me dashboard and their /me/applications page header.
 *
 * Counts are denormalised here — Application.stage is the live state,
 * StageHistory tells us whether the candidate ever *reached* a stage
 * even if they're now elsewhere (rejected after an interview still
 * counts as "interviewed once" for tracker purposes).
 */
export interface ApplicationStats {
  applied: number;
  interviewed: number;
  offers: number;
  hired: number;
  rejected: number;
  withdrawn: number;
  /** Applications still actively in flight (not in a terminal state). */
  active: number;
}

const TERMINAL_STAGES = new Set<ApplicationStage>([
  ApplicationStage.HIRED,
  ApplicationStage.REJECTED,
  ApplicationStage.WITHDRAWN,
]);

/** Stages that count toward "ever reached interview". */
const INTERVIEW_REACHED = new Set<ApplicationStage>([
  ApplicationStage.INTERVIEW,
  ApplicationStage.OFFER,
  ApplicationStage.HIRED,
]);

const OFFER_REACHED = new Set<ApplicationStage>([
  ApplicationStage.OFFER,
  ApplicationStage.HIRED,
]);

export async function getCandidateApplicationStats(candidateId: string): Promise<ApplicationStats> {
  // We only need three pulls:
  //   1. All applications for the candidate (cheap — a candidate has tens, not thousands)
  //   2. Their stage-history rows so we can compute "ever reached" buckets
  // Both are scoped to the candidate so the IO is bounded.
  const apps = await db.application.findMany({
    where: { candidateId },
    select: { id: true, stage: true },
  });
  const total = apps.length;
  if (total === 0) {
    return { applied: 0, interviewed: 0, offers: 0, hired: 0, rejected: 0, withdrawn: 0, active: 0 };
  }
  const appIds = apps.map((a) => a.id);

  const histories = await db.stageHistory.findMany({
    where: { applicationId: { in: appIds } },
    select: { applicationId: true, toStage: true },
  });

  // For each application, the *deepest* stage it ever reached. Iterating
  // through history once and remembering the highest-precedence stage
  // per app is faster than one DB query per app.
  const STAGE_RANK: Record<string, number> = {
    APPLIED: 0, SCREENED: 1, SHORTLISTED: 2, ASSESSMENT: 3,
    INTERVIEW: 4, OFFER: 5, HIRED: 6, REJECTED: -1, WITHDRAWN: -1,
  };
  const deepestByApp = new Map<string, ApplicationStage>();
  for (const a of apps) deepestByApp.set(a.id, a.stage);
  for (const h of histories) {
    const cur = deepestByApp.get(h.applicationId);
    if (!cur) continue;
    if ((STAGE_RANK[h.toStage] ?? -1) > (STAGE_RANK[cur] ?? -1)) {
      deepestByApp.set(h.applicationId, h.toStage);
    }
  }

  let interviewed = 0;
  let offers = 0;
  let hired = 0;
  let rejected = 0;
  let withdrawn = 0;
  let active = 0;
  for (const a of apps) {
    const deepest = deepestByApp.get(a.id) ?? a.stage;
    if (INTERVIEW_REACHED.has(deepest)) interviewed += 1;
    if (OFFER_REACHED.has(deepest)) offers += 1;
    if (a.stage === ApplicationStage.HIRED) hired += 1;
    if (a.stage === ApplicationStage.REJECTED) rejected += 1;
    if (a.stage === ApplicationStage.WITHDRAWN) withdrawn += 1;
    if (!TERMINAL_STAGES.has(a.stage)) active += 1;
  }

  return {
    applied: total,
    interviewed,
    offers,
    hired,
    rejected,
    withdrawn,
    active,
  };
}
