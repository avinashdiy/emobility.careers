"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { structuredJsonCall, StructuredAIError } from "@/lib/ai/structured";
import { aiModels } from "@/lib/ai/openai";
import { jobEmbeddingText, profileEmbeddingText } from "@/lib/ai/embeddings";

/**
 * "Why this candidate" — focused GPT-4o explanation surfaced on the
 * application detail page (and, in future, the matches page).
 *
 * How this differs from `server/ai-summary/actions.ts`:
 *
 *   • The AI summary is the *triage verdict*. The prompt explicitly
 *     asks for strengths AND concerns AND a move/pass recommendation,
 *     so the recruiter has a balanced read for the stage-move
 *     decision. It runs lazily on first ATS-page view.
 *
 *   • This is the *make-the-case* explanation. The prompt produces
 *     3-4 sentences a recruiter would paste into Slack/email when
 *     pitching this candidate to the hiring manager. No "concerns"
 *     surface — that's the AI summary's job.
 *
 * Cache lives in its own table (`WhyCandidateExplanation`) keyed on
 * `(jobId, candidateId)` rather than `applicationId`, so the same
 * row works on the matches page (pre-application browsing) and on
 * the application detail page (post-application). Generation is
 * opt-in via a button click — we don't auto-fire on every ATS open
 * because that would double the OpenAI bill alongside the AI summary
 * even when the recruiter only wanted the verdict, not the pitch.
 */

interface WhyCandidatePayload {
  /** 3-4 sentence plain-text explanation, ~400-600 chars. */
  explanation: string;
}

const SYSTEM_PROMPT = `You are a senior EV-industry recruiter pitching one specific candidate to a hiring manager for one specific job. Produce a tight, 3-4 sentence explanation of why this candidate is worth the hiring manager's time.

Output strict JSON:
{ "explanation": "3-4 sentences, plain text, no markdown, no bullet points, 400-600 chars" }

Hard rules:
- Be SPECIFIC. Cite the candidate's actual skills, EV-domain experience, recent role titles, employers, credentials. Never invent.
- Lead with the strongest fit signal (e.g. "5 years at Ola Electric on BMS firmware" beats "experienced engineer").
- Connect candidate signals to job needs explicitly ("the JD asks for CAN bus diagnostics; she shipped a CAN bus tool at her last role").
- Do NOT hedge ("might be", "potentially"). Either it fits or you skip the sentence.
- Do NOT list concerns or gaps — that's a different feature. This is the pro side only.
- India context where relevant (₹ LPA, OEM vs Tier-1, ARAI/iCAT exposure, etc.).
- If the candidate's profile is too thin to make a real case, return one honest sentence saying so — never pad.`;

const responseSchema = z.object({
  explanation: z.string().min(40).max(2000),
});

/**
 * Cache-only read. Returns `null` if no explanation has been
 * generated yet. Cheap (single indexed lookup) so it's safe to call
 * from server components rendering the application detail page.
 */
export async function getWhyExplanation(
  jobId: string,
  candidateId: string,
): Promise<{ explanation: string; generatedAt: Date; model: string } | null> {
  const row = await db.whyCandidateExplanation.findUnique({
    where: { jobId_candidateId: { jobId, candidateId } },
    select: { explanation: true, generatedAt: true, model: true },
  });
  return row;
}

/**
 * Internal — fetches the job + candidate, builds the prompt, calls
 * GPT-4o via `structuredJsonCall` (cost-tracked), and upserts the
 * cache row. Caller is responsible for auth + rate limiting.
 *
 * Returns the upserted row on success, or `null` on any failure
 * (AI error, schema validation failure, missing entities). Errors
 * are logged but never thrown — the calling action redirects with
 * an `?error=` toast rather than 500-ing the page.
 */
async function generateWhyExplanation(
  jobId: string,
  candidateId: string,
  opts: { entityId?: string } = {},
): Promise<{ explanation: string; generatedAt: Date; model: string } | null> {
  const [job, candidate] = await Promise.all([
    db.jobPosting.findUnique({
      where: { id: jobId },
      include: {
        company: { select: { name: true } },
        skills: { include: { skill: { select: { name: true } } } },
        evDomains: { include: { evDomain: { select: { name: true } } } },
      },
    }),
    db.candidateProfile.findUnique({
      where: { id: candidateId },
      include: {
        skills: { include: { skill: { select: { name: true } } } },
        experiences: {
          orderBy: { startDate: "desc" },
          take: 4,
          select: {
            title: true,
            company: true,
            description: true,
            startDate: true,
            endDate: true,
          },
        },
        evDomains: { include: { evDomain: { select: { name: true } } } },
      },
    }),
  ]);
  if (!job || !candidate) {
    logger.warn({ jobId, candidateId, jobFound: !!job, candidateFound: !!candidate }, "[why-candidate] entity missing");
    return null;
  }

  const jobText = jobEmbeddingText(job);
  const candidateBrief = profileEmbeddingText(candidate);
  const model = aiModels.rerank ?? "gpt-4o";

  const userPrompt = `JOB
${jobText}

CANDIDATE
${candidateBrief}`;

  try {
    const { data } = await structuredJsonCall<WhyCandidatePayload>({
      feature: "why-candidate.explain",
      model,
      system: SYSTEM_PROMPT,
      user: userPrompt,
      entityType: "Application",
      entityId: opts.entityId,
      temperature: 0.3,
      maxOutputTokens: 400,
    });

    const parsed = responseSchema.safeParse(data);
    if (!parsed.success) {
      logger.warn({ jobId, candidateId, data, issues: parsed.error.issues }, "[why-candidate] schema validation failed");
      return null;
    }

    const explanation = parsed.data.explanation.trim();

    const upserted = await db.whyCandidateExplanation.upsert({
      where: { jobId_candidateId: { jobId, candidateId } },
      create: { jobId, candidateId, explanation, model },
      update: { explanation, model, generatedAt: new Date() },
      select: { explanation: true, generatedAt: true, model: true },
    });
    return upserted;
  } catch (err) {
    if (err instanceof StructuredAIError) {
      logger.warn({ err, jobId, candidateId, cause: err.cause }, "[why-candidate] structured call failed");
    } else {
      logger.error({ err, jobId, candidateId }, "[why-candidate] generate unexpected");
    }
    return null;
  }
}

/**
 * Cache-first helper. Returns existing explanation if present;
 * otherwise generates, caches, and returns the fresh one. Used by
 * direct server-component calls when we want to show whatever's
 * cached without forcing a fresh generation.
 *
 * Note we do NOT use this in the application detail page's first
 * render — generation is opt-in via the button to avoid doubling
 * the AI bill alongside the AI summary. This helper exists for
 * future surfaces (e.g. bulk-export of candidate explanations) that
 * may want lazy-generation semantics.
 */
export async function ensureWhyExplanation(
  jobId: string,
  candidateId: string,
  opts: { entityId?: string } = {},
) {
  const cached = await getWhyExplanation(jobId, candidateId);
  if (cached) return cached;
  return generateWhyExplanation(jobId, candidateId, opts);
}

const generateFormSchema = z.object({
  jobId: z.string().min(1),
  candidateId: z.string().min(1),
  // applicationId is optional because the future matches-page surface
  // won't have one — but when present, we use it for the success
  // redirect and for AICostLog entity attribution.
  applicationId: z.string().min(1).optional(),
});

/**
 * Form action — bound to the "✨ Why this candidate?" / "Refresh"
 * button on the application detail page. Auth + rate-limit gated.
 * Uses the same redirect-back-with-toast pattern as
 * `refreshApplicationSummary` so the surface is fully server-
 * rendered (no client state required).
 */
export async function generateWhyExplanationAction(formData: FormData): Promise<void> {
  try {
    const parsed = generateFormSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/employer?error=" + encodeURIComponent("Bad request."));
    }
    const { jobId, candidateId, applicationId } = parsed.data;
    const backUrl = applicationId
      ? `/employer/applications/${applicationId}`
      : "/employer";

    const session = await auth();
    if (!session?.user) redirect("/signin");
    const employer = await db.employerProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (!employer && session.user.role !== "ADMIN") redirect("/employer/onboarding");

    // Auth: caller must work at the company that owns this job, or
    // be a platform admin. Mirrors the gate in
    // `refreshApplicationSummary` so the two AI actions on this page
    // behave identically on permission failure.
    const job = await db.jobPosting.findUnique({
      where: { id: jobId },
      select: { companyId: true },
    });
    if (!job) {
      redirect(`${backUrl}?error=` + encodeURIComponent("Job not found."));
    }
    if (
      session.user.role !== "ADMIN" &&
      job.companyId !== employer?.companyId
    ) {
      redirect("/403");
    }

    try {
      await rateLimitOrThrow(`why-candidate:${session.user.id}`, "ai");
    } catch (err) {
      if (isRouterControlError(err)) throw err;
      redirect(
        `${backUrl}?error=` +
          encodeURIComponent("Slow down — try again in a minute."),
      );
    }

    const result = await generateWhyExplanation(jobId, candidateId, {
      entityId: applicationId,
    });
    revalidatePath(backUrl);
    if (!result) {
      redirect(
        `${backUrl}?error=` +
          encodeURIComponent("Couldn't generate the explanation — try again."),
      );
    }
    redirect(`${backUrl}?notice=` + encodeURIComponent("Why-fit explanation ready."));
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[why-candidate] action unexpected");
    redirect("/employer?error=" + encodeURIComponent("Couldn't generate — try again."));
  }
}
