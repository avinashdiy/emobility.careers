// POST /api/webhooks/academy-placement
//
// Academy (emobility.academy) fires this when a candidate is placed
// at a corporate-sponsor company via the B5b flow. We try to match
// the placement back to a careers `Application` row and, if we find
// one that isn't already terminal, flip it to HIRED.
//
// Adapted to careers' schema:
//   - The spec mentions `JobApplication.status='HIRED'`. Careers'
//     equivalent is `Application.stage = ApplicationStage.HIRED`.
//   - The spec mentions `userId` directly on the application. Careers'
//     Application has `candidateId` (→ CandidateProfile.userId), so
//     the lookup is `where: { candidate: { userId } }`.
//   - The spec mentions `companyId = careersCompanyId OR job's
//     companyId = careersCompanyId`. Careers' Application has NO
//     direct companyId — only via `job.companyId`. So the OR collapses
//     to one branch (the job-relation one).
//   - The spec mentions a `hiredAt` timestamp. Careers' Application
//     has NO `hiredAt` column; `updatedAt` on the row is the closest
//     truthful signal (Prisma updates it automatically). The placement
//     metadata (ctcInr, role, joiningDate) is stored in the AuditLog
//     meta blob — that's the single authoritative record of where
//     this hire was sourced from.
//
// Multi-match heuristic: a candidate can have multiple non-terminal
// applications at the same company (different roles). We prefer the
// one already in OFFER (recruiter explicitly extended) and fall back
// to the most recent non-terminal application by appliedAt. The
// chosen row + match count is logged so a recruiter can audit if the
// wrong one was flipped.
//
// Idempotency: if a matched application is already HIRED, no update
// runs and the response is `{ matched: true, updated: false }`. Same
// shape lets academy treat retries as ack'd without re-firing.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { ApplicationStage } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  userId: z.string().min(1),
  careersCompanyId: z.string().min(1),
  // Optional placement metadata — recorded in AuditLog.meta for the
  // operational record, not persisted on the Application row (no
  // schema additions per the integration constraint).
  ctcInr: z.number().int().nonnegative().optional(),
  role: z.string().trim().min(1).max(200).optional(),
  joiningDate: z.string().min(1).optional(), // ISO date string from academy
});

export async function POST(req: Request) {
  // 1. Shared-secret auth — constant-time compare so signature length
  //    + contents don't leak via timing.
  const headerSecret = req.headers.get("x-webhook-secret") ?? "";
  const expectedBuf = Buffer.from(env.ACADEMY_PLACEMENT_WEBHOOK_SECRET);
  const actualBuf = Buffer.from(headerSecret);
  if (
    expectedBuf.length === 0 ||
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    logger.warn(
      { path: "/api/webhooks/academy-placement" },
      "[academy-placement] bad or missing secret",
    );
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Parse + validate.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "malformed json" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { userId, careersCompanyId, ctcInr, role, joiningDate } = parsed.data;

  // 3. Find non-terminal applications for (this candidate, this
  //    company). REJECTED + WITHDRAWN are excluded — flipping a
  //    rejected/withdrawn app to HIRED would silently overwrite a
  //    recruiter decision. (A HIRED row IS allowed through so we can
  //    detect the idempotent-retry case.)
  const matches = await db.application.findMany({
    where: {
      candidate: { userId },
      job: { companyId: careersCompanyId },
      stage: {
        notIn: [ApplicationStage.REJECTED, ApplicationStage.WITHDRAWN],
      },
    },
    select: { id: true, stage: true, appliedAt: true },
    orderBy: { appliedAt: "desc" },
  });

  // 3a. No match. Either the hire was sourced outside careers (the
  //     candidate never applied here), or it pre-dates the integration.
  //     Audit the event for traceability ("yes, we received this
  //     webhook, no, we didn't act") and return 200 so academy stops
  //     retrying.
  if (matches.length === 0) {
    await audit({
      action: "application.hired.webhook",
      entity: "Application",
      meta: {
        outcome: "no_match",
        userId,
        careersCompanyId,
        ctcInr,
        role,
        joiningDate,
      },
    });
    return NextResponse.json({ matched: false, updated: false });
  }

  // 3b. Already HIRED — webhook retry / replay. Idempotent no-op.
  const alreadyHired = matches.find((m) => m.stage === ApplicationStage.HIRED);
  if (alreadyHired) {
    await audit({
      action: "application.hired.webhook",
      entity: "Application",
      entityId: alreadyHired.id,
      meta: {
        outcome: "already_hired",
        userId,
        careersCompanyId,
        ctcInr,
        role,
        joiningDate,
      },
    });
    return NextResponse.json({ matched: true, updated: false });
  }

  // 4. Pick a target. Prefer the application in OFFER stage — the
  //    recruiter has already extended a written offer for THAT role,
  //    so that's the most likely one academy is closing out. Fall
  //    back to the most-recently-applied (matches[0] thanks to the
  //    orderBy above).
  const target =
    matches.find((m) => m.stage === ApplicationStage.OFFER) ?? matches[0];

  await db.application.update({
    where: { id: target.id },
    data: { stage: ApplicationStage.HIRED },
  });

  // 5. Audit — the permanent record of where this hire was sourced
  //    from, including the placement metadata academy sent that we
  //    have no schema column for.
  await audit({
    action: "application.hired.webhook",
    entity: "Application",
    entityId: target.id,
    meta: {
      outcome: "updated",
      previousStage: target.stage,
      userId,
      careersCompanyId,
      ctcInr,
      role,
      joiningDate,
      matchCount: matches.length,
      ambiguousMatch: matches.length > 1,
    },
  });

  // Surface the ambiguous case in ops logs too — multi-match means a
  // recruiter may need to manually verify we flipped the right one.
  if (matches.length > 1) {
    logger.warn(
      {
        userId,
        careersCompanyId,
        matchCount: matches.length,
        chosenId: target.id,
        chosenStage: target.stage,
      },
      "[academy-placement] multiple matching applications; chose OFFER-stage or most recent",
    );
  }

  return NextResponse.json({ matched: true, updated: true });
}
