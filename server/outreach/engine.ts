import type { Prisma, NotificationChannel } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * #21 Sequenced outreach — cadence engine.
 *
 * Called by:
 *   1. The daily worker tick — processes every ACTIVE
 *      OutreachEnrollment whose `nextStepIndex` is due according to
 *      its cadence's step delayDays.
 *   2. The "Run cadence now" admin/recruiter button for manual
 *      kicks.
 *
 * Each enrollment fires at most one step per tick. After firing,
 * `nextStepIndex` increments + `lastSentAt` updates. When the next
 * index exceeds the cadence's step count, status flips to
 * COMPLETED.
 *
 * If a candidate has replied on the thread since the last step
 * fired, status flips to RESPONDED and the cadence pauses. The
 * "has the candidate replied" check is the engine's load-bearing
 * politeness signal — it's what stops a sequence from chasing
 * someone who already said yes / no.
 */

interface FireResult {
  enrollmentId: string;
  stepIndex: number;
  outcome: "FIRED" | "WAITING" | "RESPONDED" | "COMPLETED" | "FAILED" | "CADENCE_DISABLED";
  reason?: string;
}

const TOKEN_PATTERNS: { token: RegExp; build: (ctx: TokenContext) => string }[] = [
  {
    token: /\{\{\s*candidateFirstName\s*\}\}/gi,
    build: (c) => c.candidateFirstName,
  },
  {
    token: /\{\{\s*candidateName\s*\}\}/gi,
    build: (c) => c.candidateName,
  },
  {
    token: /\{\{\s*jobTitle\s*\}\}/gi,
    build: (c) => c.jobTitle ?? "",
  },
  {
    token: /\{\{\s*companyName\s*\}\}/gi,
    build: (c) => c.companyName ?? "",
  },
  {
    token: /\{\{\s*recruiterName\s*\}\}/gi,
    build: (c) => c.recruiterName ?? "the recruiter",
  },
  {
    token: /\{\{\s*location\s*\}\}/gi,
    build: (c) => c.location ?? "",
  },
];

interface TokenContext {
  candidateFirstName: string;
  candidateName: string;
  jobTitle?: string;
  companyName?: string;
  recruiterName?: string;
  location?: string;
}

function renderTemplate(template: string, ctx: TokenContext): string {
  let out = template;
  for (const { token, build } of TOKEN_PATTERNS) {
    out = out.replace(token, build(ctx));
  }
  return out;
}

/**
 * Process due enrollments. `now` defaults to the current time; tests
 * pass a fixed clock. Returns one FireResult per enrollment touched
 * so the caller can log + audit.
 */
export async function processDueEnrollments(now: Date = new Date()): Promise<FireResult[]> {
  // Pull only enrollments that COULD fire — ACTIVE status, on an
  // enabled cadence. The "is this step due" check happens in JS
  // because the per-step delayDays is on OutreachStep, not the
  // enrollment row.
  const enrollments = await db.outreachEnrollment.findMany({
    where: { status: "ACTIVE" },
    include: {
      cadence: {
        include: {
          steps: { orderBy: { order: "asc" } },
          company: { select: { id: true, name: true } },
          job: { select: { id: true, title: true, locations: true, postedBy: { select: { name: true } } } },
        },
      },
      candidate: {
        select: { id: true, firstName: true, lastName: true, userId: true, city: true },
      },
      application: { select: { id: true, jobId: true } },
    },
    take: 200, // hard cap per tick
  });

  const results: FireResult[] = [];

  for (const e of enrollments) {
    if (!e.cadence.enabled) {
      // Recruiter paused the cadence after enrolling — auto-pause
      // the enrollment too. Caller can re-enable via a separate UI.
      await db.outreachEnrollment.update({
        where: { id: e.id },
        data: { status: "CANCELLED", cancelReason: "Cadence disabled" },
      });
      results.push({
        enrollmentId: e.id,
        stepIndex: e.nextStepIndex,
        outcome: "CADENCE_DISABLED",
      });
      continue;
    }

    const step = e.cadence.steps[e.nextStepIndex];
    if (!step) {
      // Past the last step — mark COMPLETED.
      await db.outreachEnrollment.update({
        where: { id: e.id },
        data: { status: "COMPLETED" },
      });
      results.push({
        enrollmentId: e.id,
        stepIndex: e.nextStepIndex,
        outcome: "COMPLETED",
      });
      continue;
    }

    const dueAt = new Date(e.enrolledAt.getTime() + step.delayDays * 24 * 60 * 60 * 1000);
    if (dueAt > now) {
      results.push({
        enrollmentId: e.id,
        stepIndex: e.nextStepIndex,
        outcome: "WAITING",
        reason: `Due ${dueAt.toISOString()}`,
      });
      continue;
    }

    // Has the candidate responded? Check the MessageThread for any
    // message authored by the candidate after the enrollment date.
    // We look at the cadence's company threads with this candidate.
    const responded = await db.message.findFirst({
      where: {
        senderId: e.candidate.userId,
        createdAt: { gte: e.enrolledAt },
        thread: e.application
          ? { applicationId: e.application.id }
          : {
              candidateUserId: e.candidate.userId,
              employerUserId: e.enrolledById,
            },
      },
      select: { id: true },
    });
    if (responded) {
      await db.outreachEnrollment.update({
        where: { id: e.id },
        data: { status: "RESPONDED", respondedAt: new Date() },
      });
      results.push({
        enrollmentId: e.id,
        stepIndex: e.nextStepIndex,
        outcome: "RESPONDED",
      });
      continue;
    }

    // Fire the step. Build the personalised body + dispatch.
    const ctx: TokenContext = {
      candidateFirstName: e.candidate.firstName,
      candidateName: `${e.candidate.firstName} ${e.candidate.lastName ?? ""}`.trim(),
      jobTitle: e.cadence.job?.title,
      companyName: e.cadence.company.name,
      recruiterName: e.cadence.job?.postedBy?.name ?? undefined,
      location: e.candidate.city ?? e.cadence.job?.locations?.[0] ?? undefined,
    };
    const body = renderTemplate(step.body, ctx);
    const subject = step.subject ? renderTemplate(step.subject, ctx) : undefined;

    try {
      // Resolve / create the thread to host the cadence message.
      // Application-scoped enrollments use the application's existing
      // thread; peer-to-peer enrollments use the recruiter ↔ candidate
      // direct thread.
      let threadId: string;
      if (e.application) {
        const t = await db.messageThread.upsert({
          where: { applicationId: e.application.id },
          create: {
            applicationId: e.application.id,
            candidateUserId: e.candidate.userId,
            employerUserId: e.enrolledById,
            lastMessageAt: new Date(),
          },
          update: { lastMessageAt: new Date() },
        });
        threadId = t.id;
      } else {
        let existing = await db.messageThread.findFirst({
          where: {
            employerUserId: e.enrolledById,
            candidateUserId: e.candidate.userId,
            applicationId: null,
          },
          select: { id: true },
        });
        if (!existing) {
          existing = await db.messageThread.create({
            data: {
              employerUserId: e.enrolledById,
              candidateUserId: e.candidate.userId,
              lastMessageAt: new Date(),
            },
            select: { id: true },
          });
        }
        threadId = existing.id;
      }

      await db.message.create({
        data: {
          threadId,
          senderId: e.enrolledById,
          body,
        },
      });
      await db.messageThread.update({
        where: { id: threadId },
        data: { lastMessageAt: new Date() },
      });

      try {
        await dispatchNotification({
          userId: e.candidate.userId,
          actorId: e.enrolledById,
          type: "outreach.cadence_step",
          title: subject ?? `Message from ${ctx.companyName}`,
          body: body.slice(0, 200),
          link: `/me/messages/${threadId}`,
          channels: step.channels.filter((c): c is NotificationChannel =>
            ["IN_APP", "EMAIL", "SMS", "WHATSAPP", "PUSH"].includes(c),
          ),
          groupKey: `outreach-cadence:${e.id}:${e.nextStepIndex}`,
        });
      } catch (err) {
        logger.warn({ err, enrollmentId: e.id }, "[outreach] notification dispatch failed");
      }

      const nextIndex = e.nextStepIndex + 1;
      const completed = nextIndex >= e.cadence.steps.length;
      await db.outreachEnrollment.update({
        where: { id: e.id },
        data: {
          nextStepIndex: nextIndex,
          lastSentAt: new Date(),
          status: completed ? "COMPLETED" : "ACTIVE",
        },
      });

      results.push({
        enrollmentId: e.id,
        stepIndex: e.nextStepIndex,
        outcome: completed ? "COMPLETED" : "FIRED",
      });
    } catch (err) {
      logger.error({ err, enrollmentId: e.id }, "[outreach] step fire failed");
      // Single-step failure shouldn't kill the cadence. Mark FAILED;
      // recruiter can manually re-enable if it was a transient issue.
      await db.outreachEnrollment.update({
        where: { id: e.id },
        data: {
          status: "FAILED",
          cancelReason: err instanceof Error ? err.message.slice(0, 500) : "Unknown failure",
        },
      });
      results.push({
        enrollmentId: e.id,
        stepIndex: e.nextStepIndex,
        outcome: "FAILED",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info({ touched: results.length }, "[outreach] tick complete");
  return results;
}

void renderTemplate; // kept exported for tests if needed later
void ({} as Prisma.InputJsonValue); // satisfy unused import warning
