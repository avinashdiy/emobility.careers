"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { AssessmentType } from "@prisma/client";
import { logger } from "@/lib/logger";

const mcqQuestionSchema = z.object({
  q: z.string().min(1),
  options: z.array(z.string()).min(2).max(6),
  correctIndex: z.number().int(),
  weight: z.number().default(1),
});
export type MCQQuestion = z.infer<typeof mcqQuestionSchema>;

const assessmentCreateSchema = z.object({
  jobId: z.string().optional(),
  title: z.string().min(2).max(140),
  type: z.nativeEnum(AssessmentType),
  passingScore: z.coerce.number().min(0).max(100).default(60),
  durationMins: z.coerce.number().int().min(1).max(180).optional(),
  questionsJson: z.string(),
  // When true, this assessment becomes a *gating* test — the ATS blocks
  // forward stage transitions (INTERVIEW / OFFER / HIRED) until the
  // candidate has a passing AssessmentAttempt. Enforced in
  // server/ats/actions.ts → moveStage.
  gateAdvance: z.coerce.boolean().optional(),
});

// TODO: migrate to useActionState pattern. Particularly painful here
// because of the questionsJson field — losing a hand-built MCQ paste
// on validation failure forces the recruiter to redo it. Same playbook
// as CreateCompanyForm: convert action signature to (prev, FormData) →
// FormState, return state with snapshotFormData prevValues on Zod /
// JSON-parse failure, wrap form in a client component using
// useActionState.
export async function createAssessment(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const parsed = assessmentCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/employer/jobs/${formData.get("jobId")}/assessments?error=Invalid+input`);
  }

  let questions: unknown;
  try {
    questions = JSON.parse(parsed.data.questionsJson);
  } catch {
    redirect(`/employer/jobs/${parsed.data.jobId}/assessments?error=Invalid+JSON`);
  }

  // Validate MCQ questions if applicable
  if (parsed.data.type === "MCQ") {
    z.array(mcqQuestionSchema).parse(questions);
  }

  if (parsed.data.jobId) {
    const job = await db.jobPosting.findUnique({ where: { id: parsed.data.jobId } });
    if (!job || (session.user.role !== "ADMIN" && job.companyId !== employer.companyId)) redirect("/403");
  }

  await db.assessment.create({
    data: {
      jobId: parsed.data.jobId || null,
      title: parsed.data.title,
      type: parsed.data.type,
      passingScore: parsed.data.passingScore,
      durationMins: parsed.data.durationMins,
      questions: questions as Prisma.InputJsonValue,
      gateAdvance: Boolean(parsed.data.gateAdvance),
    },
  });

  revalidatePath(`/employer/jobs/${parsed.data.jobId}/assessments`);
  redirect(`/employer/jobs/${parsed.data.jobId}/assessments`);
}

// Employer triggers assignment of an assessment to a candidate.
// Creates an attempt record and notifies the candidate to take it.
export async function assignAssessment(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") redirect("/403");

  const applicationId = z.string().parse(formData.get("applicationId"));
  const assessmentId = z.string().parse(formData.get("assessmentId"));

  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    select: { companyId: true },
  });
  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      candidate: { include: { user: true } },
      job: { select: { companyId: true, title: true, id: true } },
    },
  });
  if (!application) redirect("/employer");
  if (
    session.user.role !== "ADMIN" &&
    application.job.companyId !== employer?.companyId
  ) {
    redirect("/403");
  }

  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, title: true, jobId: true },
  });
  if (!assessment) return;
  // Belongs to this job (or library)
  if (assessment.jobId && assessment.jobId !== application.job.id) {
    redirect("/403");
  }

  // Don't duplicate an open attempt
  const existing = await db.assessmentAttempt.findFirst({
    where: { assessmentId, candidateId: application.candidateId, submittedAt: null },
    select: { id: true },
  });
  if (!existing) {
    await db.assessmentAttempt.create({
      data: {
        assessmentId,
        candidateId: application.candidateId,
        applicationId: application.id,
      },
    });
  }

  // Move stage to ASSESSMENT if currently earlier
  const earlier = ["APPLIED", "SCREENED", "SHORTLISTED"];
  if (earlier.includes(application.stage)) {
    await db.application.update({
      where: { id: application.id },
      data: { stage: "ASSESSMENT" },
    });
    await db.stageHistory.create({
      data: {
        applicationId: application.id,
        fromStage: application.stage,
        toStage: "ASSESSMENT",
        byUserId: session.user.id,
        reason: `Assessment "${assessment.title}" assigned`,
      },
    });
  }

  const { dispatchNotification } = await import("@/lib/notifications/dispatch");
  await dispatchNotification({
    userId: application.candidate.user.id,
    type: "application.assessment_assigned",
    title: `Assessment for ${application.job.title}`,
    body: `Take "${assessment.title}" to move forward in your application.`,
    link: "/me/applications",
    channels: ["IN_APP", "EMAIL"],
  });

  revalidatePath(`/employer/applications/${applicationId}`);
}

export async function startAssessmentAttempt(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");

  const assessmentId = z.string().parse(formData.get("assessmentId"));
  const applicationId = formData.get("applicationId")
    ? z.string().parse(formData.get("applicationId"))
    : null;

  // If an active attempt exists, return it
  const existing = await db.assessmentAttempt.findFirst({
    where: { assessmentId, candidateId: profile.id, submittedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (existing) redirect(`/me/assessments/${existing.id}`);

  const attempt = await db.assessmentAttempt.create({
    data: {
      assessmentId,
      candidateId: profile.id,
      applicationId,
    },
  });

  redirect(`/me/assessments/${attempt.id}`);
}

const submitSchema = z.object({
  attemptId: z.string(),
  answersJson: z.string(),
});

export async function submitAssessment(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");

  const attemptIdRaw = formData.get("attemptId");
  const parsed = submitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    logger.warn(
      { userId: session.user.id, fieldErrors: parsed.error.flatten().fieldErrors },
      "[submitAssessment] validation failed",
    );
    const back =
      typeof attemptIdRaw === "string" && attemptIdRaw
        ? `/me/assessments/${attemptIdRaw}`
        : "/me/assessments";
    redirect(
      `${back}?error=` +
        encodeURIComponent("Couldn't submit your answers — please try again."),
    );
  }

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: parsed.data.attemptId },
    include: { assessment: true },
  });
  if (!attempt || attempt.candidateId !== profile.id) redirect("/403");

  // The hidden field is built by the client from a serialised state.
  // A corrupt payload would otherwise throw a JSON.parse SyntaxError
  // and bubble to the 500 page instead of giving the candidate a
  // chance to retry.
  let answers: Record<number, number>;
  try {
    answers = JSON.parse(parsed.data.answersJson) as Record<number, number>;
  } catch (err) {
    logger.warn(
      { err, attemptId: parsed.data.attemptId, userId: session.user.id },
      "[submitAssessment] answers JSON parse failed",
    );
    redirect(
      `/me/assessments/${parsed.data.attemptId}?error=` +
        encodeURIComponent("Couldn't read your answers — refresh and try again."),
    );
  }

  // Auto-grade MCQ
  let score = 0;
  let passed: boolean | null = null;
  if (attempt.assessment.type === "MCQ") {
    const questions = attempt.assessment.questions as unknown as MCQQuestion[];
    let total = 0;
    let earned = 0;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      total += q.weight ?? 1;
      if (answers[i] === q.correctIndex) earned += q.weight ?? 1;
    }
    score = total === 0 ? 0 : Math.round((earned / total) * 100);
    passed = score >= attempt.assessment.passingScore;
  }

  await db.assessmentAttempt.update({
    where: { id: attempt.id },
    data: {
      submittedAt: new Date(),
      score,
      passed,
      answers: answers as Prisma.InputJsonValue,
    },
  });

  // Optional: auto-move application to next stage if passed
  if (passed && attempt.applicationId) {
    await db.application.update({
      where: { id: attempt.applicationId },
      data: { stage: "INTERVIEW" },
    });
    await db.stageHistory.create({
      data: {
        applicationId: attempt.applicationId,
        toStage: "INTERVIEW",
        reason: `Passed assessment "${attempt.assessment.title}" with ${score}%`,
      },
    });
  }

  revalidatePath("/me/applications");
  redirect(`/me/assessments/${attempt.id}/result`);
}
