"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { isRouterControlError } from "@/lib/server-action-errors";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * #28 Verified Skill Assessments — server actions for the standalone
 * EV-skill library flow.
 *
 * Reuses the existing Assessment + AssessmentAttempt tables (the MCQ
 * runner UI on the candidate side already grades MCQs). What's new is
 * the SkillAssessmentMeta sidecar + the VerifiedSkillBadge row that
 * the candidate earns on passing — which is the recruiter-visible
 * signal that powers the "Verified in X" filter.
 *
 * Flow:
 *   1. Candidate visits /skills, picks an assessment, clicks Take.
 *   2. We create an AssessmentAttempt row, redirect to the runner
 *      at /skills/[slug]/take/[attemptId].
 *   3. Candidate submits the MCQ form → server action grades it →
 *      if score >= meta.badgeThreshold, upsert a VerifiedSkillBadge.
 *   4. Profile + recruiter search surface the badge.
 */

// Synchronous parser + question shape moved to server/skills/parse.ts
// so this `"use server"` file only exports async server actions
// (Next.js enforces that constraint at build time).
import { parseSkillAssessmentQuestions } from "@/server/skills/parse";
export type { SkillAssessmentQuestion } from "@/server/skills/parse";

const startSchema = z.object({
  slug: z.string().trim().min(1).max(80),
});

async function requireCandidate() {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin?next=/skills");
  }
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, userId: true },
  });
  if (!profile) redirect("/onboarding");
  return { session, profile };
}

export async function startSkillAssessment(formData: FormData) {
  const { profile } = await requireCandidate();
  const parsed = startSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/skills?error=" + encodeURIComponent("Unknown assessment."));
  }

  try {
    await rateLimitOrThrow(`skills-start:${profile.userId}`, "ai");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    redirect(
      "/skills?error=" +
        encodeURIComponent("You're starting assessments very fast — try again in a minute."),
    );
  }

  const meta = await db.skillAssessmentMeta.findUnique({
    where: { slug: parsed.data.slug },
    include: { assessment: true },
  });
  if (!meta || !meta.isPublic) {
    redirect("/skills?error=" + encodeURIComponent("Assessment not found."));
  }

  // If the candidate already passed this assessment, send them to the
  // result page rather than letting them attempt again unbounded.
  const existing = await db.verifiedSkillBadge.findUnique({
    where: { candidateId_metaId: { candidateId: profile.id, metaId: meta.id } },
  });
  if (existing) {
    redirect(`/skills/${parsed.data.slug}?already=1`);
  }

  // Optional cooldown — if the candidate has an in-flight unsubmitted
  // attempt within the last hour, resume it instead of creating a new
  // one. Keeps a tab close + reopen flow honest.
  const inFlight = await db.assessmentAttempt.findFirst({
    where: {
      assessmentId: meta.assessmentId,
      candidateId: profile.id,
      submittedAt: null,
      startedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
    orderBy: { startedAt: "desc" },
  });
  if (inFlight) {
    redirect(`/skills/${parsed.data.slug}/take/${inFlight.id}`);
  }

  const attempt = await db.assessmentAttempt.create({
    data: {
      assessmentId: meta.assessmentId,
      candidateId: profile.id,
    },
  });
  redirect(`/skills/${parsed.data.slug}/take/${attempt.id}`);
}

const submitSchema = z.object({
  attemptId: z.string().min(1),
  answersJson: z.string().min(2),
});

/** Submit a skill assessment attempt. Grades MCQ, awards a badge if
 *  the score clears the meta's `badgeThreshold`, and redirects the
 *  candidate to a per-attempt result page (reuses existing pattern
 *  at /me/assessments/[id]/result). */
export async function submitSkillAssessment(formData: FormData) {
  const { session, profile } = await requireCandidate();
  const parsed = submitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/skills?error=" + encodeURIComponent("Bad submission — please retry."));
  }

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id: parsed.data.attemptId },
    include: {
      assessment: { include: { skillMeta: true } },
    },
  });
  if (!attempt || attempt.candidateId !== profile.id) redirect("/403");
  if (!attempt.assessment.skillMeta) {
    // Not a skill-library assessment — fall back to the existing
    // application-scoped submit flow.
    redirect("/me/assessments");
  }
  const meta = attempt.assessment.skillMeta;

  if (attempt.submittedAt) {
    // Already submitted — bounce to the result page.
    redirect(`/skills/${meta.slug}/result/${attempt.id}`);
  }

  let answers: Record<string, number>;
  try {
    answers = JSON.parse(parsed.data.answersJson) as Record<string, number>;
  } catch (err) {
    logger.warn({ err, attemptId: attempt.id }, "[skills.submit] bad answers json");
    redirect(
      `/skills/${meta.slug}/take/${attempt.id}?error=` +
        encodeURIComponent("Couldn't read your answers — refresh and try again."),
    );
  }

  const questions = parseSkillAssessmentQuestions(attempt.assessment.questions);
  let correct = 0;
  for (const q of questions) {
    if (answers[q.id] === q.correctOption) correct += 1;
  }
  const score = questions.length === 0 ? 0 : Math.round((correct / questions.length) * 100);
  const passed = score >= meta.badgeThreshold;

  await db.assessmentAttempt.update({
    where: { id: attempt.id },
    data: {
      submittedAt: new Date(),
      score,
      passed,
      answers: answers as unknown as Prisma.InputJsonValue,
    },
  });

  if (passed) {
    // Upsert badge — re-takes that score higher update the row;
    // re-takes that score lower keep the prior badge intact.
    const existing = await db.verifiedSkillBadge.findUnique({
      where: { candidateId_metaId: { candidateId: profile.id, metaId: meta.id } },
    });
    if (!existing || existing.score < score) {
      await db.verifiedSkillBadge.upsert({
        where: { candidateId_metaId: { candidateId: profile.id, metaId: meta.id } },
        create: {
          candidateId: profile.id,
          metaId: meta.id,
          attemptId: attempt.id,
          score,
        },
        update: {
          attemptId: attempt.id,
          score,
          earnedAt: new Date(),
        },
      });
      try {
        await audit({
          actorId: session.user!.id,
          action: "skill_badge.earned",
          entity: "VerifiedSkillBadge",
          entityId: meta.id,
          meta: { score, slug: meta.slug },
        });
      } catch {/* best-effort */}
      try {
        await dispatchNotification({
          userId: session.user!.id,
          type: "skill.badge_earned",
          title: `Badge unlocked: ${attempt.assessment.title}`,
          body: `You scored ${score}%. Your profile now shows the verified-skill badge.`,
          link: "/me/profile",
          channels: ["IN_APP"],
          groupKey: `skill-badge-${meta.id}`,
        });
      } catch {/* best-effort */}
    }
  }

  revalidatePath("/me/profile");
  revalidatePath("/skills");

  redirect(`/skills/${meta.slug}/result/${attempt.id}`);
}
