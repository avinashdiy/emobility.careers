"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notificationsQueue } from "@/lib/queues";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { ApplicationStage, NoteVisibility } from "@prisma/client";

/**
 * Stages that are "past the assessment". Forward transitions into any
 * of these are blocked until every gating Assessment for the job has a
 * passing AssessmentAttempt for the candidate. The gate doesn't apply to
 * REJECTED / WITHDRAWN — recruiters still need to drop unfit candidates
 * regardless of whether they took the test.
 */
const POST_ASSESSMENT_STAGES: ApplicationStage[] = [
  ApplicationStage.INTERVIEW,
  ApplicationStage.OFFER,
  ApplicationStage.HIRED,
];

/**
 * Returns the pre-placement gate status for an application:
 *   - `gated: false`             → no assessments require a pass.
 *   - `gated: true, passed: T`   → at least one gating assessment exists,
 *                                  and `T` is whether all of them have
 *                                  passed attempts.
 *   - `missing` lists the assessment titles the candidate still owes a
 *                                  passing score on, for the recruiter
 *                                  error message.
 */
async function getAssessmentGateStatus(applicationId: string): Promise<
  | { gated: false }
  | { gated: true; passed: boolean; missing: string[] }
> {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    select: {
      candidateId: true,
      job: {
        select: {
          assessments: {
            where: { gateAdvance: true },
            select: { id: true, title: true, passingScore: true },
          },
        },
      },
    },
  });
  if (!app) return { gated: false };
  const gating = app.job.assessments;
  if (gating.length === 0) return { gated: false };

  // Best attempt per assessment for this application's candidate.
  const attempts = await db.assessmentAttempt.findMany({
    where: {
      assessmentId: { in: gating.map((a) => a.id) },
      candidateId: app.candidateId,
      score: { not: null },
    },
    select: { assessmentId: true, score: true },
  });
  const bestByAssessment = new Map<string, number>();
  for (const a of attempts) {
    const prev = bestByAssessment.get(a.assessmentId) ?? -1;
    if ((a.score ?? -1) > prev) bestByAssessment.set(a.assessmentId, a.score ?? -1);
  }

  const missing: string[] = [];
  for (const g of gating) {
    const best = bestByAssessment.get(g.id) ?? -1;
    if (best < g.passingScore) missing.push(g.title);
  }
  return { gated: true, passed: missing.length === 0, missing };
}

async function requireEmployerForApplication(applicationId: string) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") redirect("/403");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");
  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      job: { select: { companyId: true, title: true, id: true } },
      candidate: { select: { userId: true, firstName: true, lastName: true } },
    },
  });
  if (!application) redirect("/employer");
  if (session.user.role !== "ADMIN" && application.job.companyId !== employer.companyId) {
    redirect("/403");
  }
  return { session, employer, application };
}

export async function moveStage(formData: FormData) {
  const id = z.string().parse(formData.get("applicationId"));
  const toStage = z.nativeEnum(ApplicationStage).parse(formData.get("toStage"));
  const reason = String(formData.get("reason") ?? "");

  const { session, application } = await requireEmployerForApplication(id);
  await rateLimitOrThrow(`ats:${session.user.id}`, "ats");

  if (application.stage === toStage) return;

  // Pre-placement test gate. If the job has any gating Assessments and
  // the recruiter is moving forward past ASSESSMENT, the candidate must
  // have a passing attempt for each. We bounce the recruiter back to the
  // application detail page with a specific error so they can see which
  // assessment is unmet (instead of failing silently).
  if (POST_ASSESSMENT_STAGES.includes(toStage)) {
    const gate = await getAssessmentGateStatus(id);
    if (gate.gated && !gate.passed) {
      const list = gate.missing.slice(0, 2).join(", ");
      const more = gate.missing.length > 2 ? ` (+${gate.missing.length - 2} more)` : "";
      redirect(
        `/employer/applications/${id}?error=` +
          encodeURIComponent(
            `Pre-placement test required: ${list}${more}. Wait for the candidate to pass before advancing.`,
          ),
      );
    }
  }

  await db.$transaction([
    db.application.update({
      where: { id },
      data: {
        stage: toStage,
        rejectedReason: toStage === ApplicationStage.REJECTED ? reason : null,
      },
    }),
    db.stageHistory.create({
      data: {
        applicationId: id,
        fromStage: application.stage,
        toStage,
        byUserId: session.user.id,
        reason: reason || null,
      },
    }),
  ]);

  // Notify candidate
  await notificationsQueue.add("stage-change", {
    userId: application.candidate.userId,
    type: "application.stage_change",
    title: stageMessage(application.job.title, toStage),
    body: stageBody(toStage, reason),
    link: "/me/applications",
    channels: ["IN_APP", "EMAIL"],
  });

  revalidatePath(`/employer/jobs/${application.job.id}/ats`);
  revalidatePath(`/employer/applications/${id}`);
}

function stageMessage(title: string, stage: ApplicationStage): string {
  switch (stage) {
    case "SHORTLISTED":
      return `🎉 Shortlisted for ${title}`;
    case "INTERVIEW":
      return `📞 Interview scheduled — ${title}`;
    case "OFFER":
      return `💼 Offer received — ${title}`;
    case "HIRED":
      return `🚀 You're hired! — ${title}`;
    case "REJECTED":
      return `Update on your application — ${title}`;
    default:
      return `Update on your application — ${title}`;
  }
}
function stageBody(stage: ApplicationStage, reason: string): string {
  if (stage === ApplicationStage.REJECTED) {
    return reason ? `The recruiter shared this feedback: ${reason}` : "Unfortunately you weren't selected. Keep applying — your next role is out there.";
  }
  return `Your application moved to ${stage.toLowerCase()}. Open your dashboard for details.`;
}

export async function rateApplication(formData: FormData) {
  const id = z.string().parse(formData.get("applicationId"));
  const rating = z.coerce.number().int().min(1).max(5).parse(formData.get("rating"));
  const { application } = await requireEmployerForApplication(id);
  await db.application.update({ where: { id }, data: { rating } });
  revalidatePath(`/employer/jobs/${application.job.id}/ats`);
  revalidatePath(`/employer/applications/${id}`);
}

export async function addNote(formData: FormData) {
  const id = z.string().parse(formData.get("applicationId"));
  const body = z.string().min(1).max(4000).parse(formData.get("body"));
  const visibility = z.nativeEnum(NoteVisibility).parse(formData.get("visibility") ?? "TEAM");
  const { session, application } = await requireEmployerForApplication(id);
  await rateLimitOrThrow(`ats:${session.user.id}`, "ats");
  await db.applicationNote.create({
    data: {
      applicationId: id,
      authorId: session.user.id,
      body,
      visibility,
    },
  });
  revalidatePath(`/employer/applications/${id}`);
  revalidatePath(`/employer/jobs/${application.job.id}/ats`);
}

export async function bulkMoveStage(formData: FormData) {
  const ids = formData.getAll("ids").map(String);
  const toStage = z.nativeEnum(ApplicationStage).parse(formData.get("toStage"));
  if (ids.length === 0) return;

  for (const id of ids) {
    try {
      const fakeData = new FormData();
      fakeData.append("applicationId", id);
      fakeData.append("toStage", toStage);
      await moveStage(fakeData);
    } catch {
      // continue on per-row errors
    }
  }
}
