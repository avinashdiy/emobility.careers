"use server";

/**
 * Recruitathon proctored-exam server actions.
 *
 * Rides on the existing Assessment / AssessmentAttempt models (the same
 * MCQ engine the job-challenges + skill-badges use), but adds the
 * hardened, server-authoritative layer the Recruitathon test needs:
 *
 *   • Server owns the clock. The deadline = attempt.startedAt +
 *     assessment.durationMins. The browser countdown is cosmetic; the
 *     server discards work past the deadline and can auto-submit.
 *   • Server owns grading. The client never receives correctIndex (see
 *     the take page's question projection) and never computes a score.
 *   • Proctoring. `recordProctorEvent` logs focus-loss / fullscreen-exit
 *     / paste attempts into `proctorMeta`; enough flags auto-submits the
 *     attempt as terminated (the "detect → warn → flag → cancel" model).
 *
 * These are isolated from server/assessments/actions.ts on purpose so
 * the existing challenge flows are untouched.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import type { MCQQuestion } from "@/server/assessments/actions";
import { PROCTOR_FLAG_LIMIT, DEADLINE_GRACE_MS } from "@/lib/recruitathon/exam-config";

type ProctorEventType =
  | "focus_loss"
  | "fullscreen_exit"
  | "paste_blocked"
  | "copy_blocked"
  | "devtools_suspected"
  | "reload";

interface ProctorMeta {
  flags: number;
  events: { type: string; at: string }[];
  terminated?: boolean;
  reason?: string;
}

function readProctorMeta(raw: unknown): ProctorMeta {
  const m = (raw ?? {}) as Partial<ProctorMeta>;
  return {
    flags: typeof m.flags === "number" ? m.flags : 0,
    events: Array.isArray(m.events) ? m.events : [],
    terminated: m.terminated,
    reason: m.reason,
  };
}

/** Deadline for an attempt from its start + the assessment duration. */
function deadlineFor(startedAt: Date, durationMins: number | null): Date {
  return new Date(startedAt.getTime() + (durationMins ?? 30) * 60_000);
}

/**
 * Load an in-progress attempt that belongs to the signed-in candidate,
 * or return null. Central guard for every mutating action below.
 */
async function loadOwnedAttempt(attemptId: string) {
  const session = await auth();
  if (!session?.user) return null;
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) return null;
  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: true },
  });
  if (!attempt || attempt.candidateId !== profile.id) return null;
  return attempt;
}

/** Grade an answers map against the assessment's questions (server-only). */
function grade(questions: MCQQuestion[], answers: Record<number, number>) {
  let total = 0;
  let earned = 0;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const weight = q.weight ?? 1;
    total += weight;
    if (answers[i] === q.correctIndex) earned += weight;
  }
  const percent = total === 0 ? 0 : Math.round((earned / total) * 100);
  return { earned, total, percent };
}

/**
 * Start (or resume) the single attempt a candidate gets for an
 * assessment. Blocks a re-take once submitted. (Batch 2 adds the
 * ≥50%-profile + CV gate before this is reachable.)
 */
export async function startRecruitathonExam(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const slug = z.string().parse(formData.get("assessmentSlug"));

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) redirect("/signin");

  const assessment = await db.assessment.findFirst({
    where: { skillMeta: { slug } },
    select: { id: true, isLibrary: true },
  });
  if (!assessment) redirect("/recruitathon/test");

  const existing = await db.assessmentAttempt.findFirst({
    where: { assessmentId: assessment.id, candidateId: profile.id },
    orderBy: { startedAt: "desc" },
    select: { id: true, submittedAt: true },
  });
  if (existing?.submittedAt) redirect(`/recruitathon/exam/${existing.id}/result`);
  if (existing) redirect(`/recruitathon/exam/${existing.id}`);

  const attempt = await db.assessmentAttempt.create({
    data: { assessmentId: assessment.id, candidateId: profile.id },
    select: { id: true },
  });
  redirect(`/recruitathon/exam/${attempt.id}`);
}

const answersSchema = z.record(z.coerce.number().int(), z.number().int());

/**
 * Autosave partial answers so a refresh / disconnect doesn't lose work.
 * No grading here. Rejects writes past the deadline or after submit.
 */
export async function saveExamProgress(input: {
  attemptId: string;
  answers: Record<number, number>;
}): Promise<{ ok: boolean; reason?: string }> {
  const attempt = await loadOwnedAttempt(input.attemptId);
  if (!attempt) return { ok: false, reason: "not_found" };
  if (attempt.submittedAt) return { ok: false, reason: "already_submitted" };
  const deadline = deadlineFor(attempt.startedAt, attempt.assessment.durationMins);
  if (Date.now() > deadline.getTime() + DEADLINE_GRACE_MS) return { ok: false, reason: "expired" };

  const answers = answersSchema.parse(input.answers);
  await db.assessmentAttempt.update({
    where: { id: attempt.id },
    data: { answers: answers as object },
  });
  return { ok: true };
}

/**
 * Record a proctoring event. Appends to proctorMeta + bumps the flag
 * count. When the limit is crossed, the attempt is auto-submitted and
 * marked terminated — the returned `terminated` tells the client to
 * bounce to the result screen.
 */
export async function recordProctorEvent(input: {
  attemptId: string;
  type: ProctorEventType;
}): Promise<{ ok: boolean; flags: number; terminated: boolean }> {
  const attempt = await loadOwnedAttempt(input.attemptId);
  if (!attempt) return { ok: false, flags: 0, terminated: false };
  if (attempt.submittedAt) return { ok: true, flags: 0, terminated: true };

  const meta = readProctorMeta(attempt.proctorMeta);
  meta.flags += 1;
  meta.events.push({ type: input.type, at: new Date().toISOString() });
  // Cap the log so a pathological client can't bloat the row.
  if (meta.events.length > 200) meta.events = meta.events.slice(-200);

  const terminate = meta.flags >= PROCTOR_FLAG_LIMIT;

  if (terminate) {
    meta.terminated = true;
    meta.reason = "proctor_flag_limit";
    const questions = attempt.assessment.questions as unknown as MCQQuestion[];
    const answers = (attempt.answers ?? {}) as Record<number, number>;
    const { percent } = grade(questions, answers);
    await db.assessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        submittedAt: new Date(),
        score: percent,
        passed: percent >= attempt.assessment.passingScore,
        proctorMeta: meta as object,
      },
    });
    logger.warn({ attemptId: attempt.id, flags: meta.flags }, "[recruitathon-exam] auto-terminated on proctor flags");
    return { ok: true, flags: meta.flags, terminated: true };
  }

  await db.assessmentAttempt.update({
    where: { id: attempt.id },
    data: { proctorMeta: meta as object },
  });
  return { ok: true, flags: meta.flags, terminated: false };
}

/**
 * Finalise + grade the attempt. Called on manual submit AND on the
 * client's deadline auto-submit. Idempotent-ish: a second call after
 * submit just redirects to the result.
 */
export async function submitExam(formData: FormData) {
  const attemptId = z.string().parse(formData.get("attemptId"));
  const reason = (formData.get("reason") as string | null) ?? "manual";
  const attempt = await loadOwnedAttempt(attemptId);
  if (!attempt) redirect("/recruitathon/test");
  if (attempt.submittedAt) redirect(`/recruitathon/exam/${attempt.id}/result`);

  let answers: Record<number, number> = (attempt.answers ?? {}) as Record<number, number>;
  const raw = formData.get("answersJson");
  if (typeof raw === "string" && raw.length) {
    try {
      answers = answersSchema.parse(JSON.parse(raw));
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[recruitathon-exam] bad answers JSON — grading last autosave");
    }
  }

  const questions = attempt.assessment.questions as unknown as MCQQuestion[];
  const { percent } = grade(questions, answers);
  const meta = readProctorMeta(attempt.proctorMeta);
  if (reason === "expired") meta.reason = "expired";

  await db.assessmentAttempt.update({
    where: { id: attempt.id },
    data: {
      submittedAt: new Date(),
      score: percent,
      passed: percent >= attempt.assessment.passingScore,
      answers: answers as object,
      proctorMeta: meta as object,
    },
  });

  revalidatePath(`/recruitathon/exam/${attempt.id}/result`);
  redirect(`/recruitathon/exam/${attempt.id}/result`);
}
