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

/**
 * #17 AI Applicant Summary — one-paragraph "why this candidate
 * matches" surfaced on the ATS card + the application detail page.
 *
 * Cached on Application.aiSummary so the ATS doesn't re-prompt
 * OpenAI on every render. Two triggers:
 *
 *   1. Lazy generation — when the recruiter opens an application
 *      whose summary is null, we fire `ensureApplicationSummary`
 *      inline. Bounded latency budget (we use gpt-4o-mini which
 *      typically returns in ~800ms for this prompt size).
 *
 *   2. Manual refresh — a "Refresh summary" button on the detail
 *      page; useful after the candidate updates their profile or
 *      after the recruiter moves the candidate through stages and
 *      wants a fresh take.
 *
 * The summary is plain text (no markdown), 80-140 words target,
 * factual-not-promotional. Prompt instructs the model to call out
 * mismatches as well as fits — a neutral verdict is more useful
 * than a polite middling one.
 */

interface SummaryPayload {
  /** ~100-word paragraph the recruiter sees on the card. */
  summary: string;
  /** 2-4 short bullets — strongest fit signals. */
  strengths: string[];
  /** 1-3 short bullets — gaps / risks. */
  concerns: string[];
  /** A one-line recruiter recommendation:
   *  "Move to interview", "Move to assessment", "Pass — gaps too wide", "Park for now". */
  recommendation: string;
}

const SYSTEM_PROMPT = `You are a recruiter's screening assistant for the Indian EV industry. Given a candidate's profile + a job, produce a tight, factual summary the recruiter can read in 10 seconds.

Output strict JSON:
{
  "summary": "80-140 word paragraph, plain text, no markdown",
  "strengths": ["2-4 short bullets — concrete fit signals"],
  "concerns": ["1-3 short bullets — concrete gaps"],
  "recommendation": "one of: 'Move to interview', 'Move to assessment', 'Pass — gaps too wide', 'Park for now'"
}

Be specific. Cite the candidate's actual experiences, skills, badges, credentials — never invent. If the candidate's profile is thin, say so in 'concerns'. Don't be polite — a neutral verdict is more useful than a wrong-optimistic one. India-context salary/seniority signals are expected (₹ LPA, "OEM vs Tier-1 supplier", etc.).`;

export async function ensureApplicationSummary(applicationId: string): Promise<{
  summary: string | null;
  freshlyGenerated: boolean;
}> {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    select: { id: true, aiSummary: true, aiSummaryAt: true, job: { select: { companyId: true } } },
  });
  if (!app) return { summary: null, freshlyGenerated: false };
  // Cache-hit indicator is `aiSummaryAt`, not the truthiness of
  // `aiSummary`. A pre-fix code path that wrote an empty string on
  // a degenerate AI response would otherwise re-fire generation on
  // every ATS page render — burning OpenAI tokens until a successful
  // response landed. Treat any row where `aiSummaryAt` is set as
  // "already attempted"; if the summary itself is empty/short the
  // caller sees null and renders nothing, but we don't re-prompt.
  if (app.aiSummaryAt) {
    const cached = (app.aiSummary ?? "").trim();
    // Only return the cached value when it's actually meaningful
    // text (≥30 chars). Below that, return null but DON'T regenerate
    // — the original generation failed in a way our prompt couldn't
    // fix. Manual "Refresh" button still works to force a retry.
    return {
      summary: cached.length >= 30 ? cached : null,
      freshlyGenerated: false,
    };
  }
  return generateApplicationSummary(applicationId);
}

async function generateApplicationSummary(applicationId: string): Promise<{
  summary: string | null;
  freshlyGenerated: boolean;
}> {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          description: true,
          requirements: true,
          experienceMin: true,
          experienceMax: true,
          locations: true,
          workMode: true,
        },
      },
      candidate: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          headline: true,
          summary: true,
          city: true,
          totalExperienceMonths: true,
          isDIYguruVerified: true,
          openToWork: true,
          experiences: {
            orderBy: { startDate: "desc" },
            take: 4,
            select: { title: true, company: true, startDate: true, endDate: true, description: true },
          },
          skills: { include: { skill: { select: { name: true } } }, take: 12 },
          verifiedSkillBadges: {
            include: { meta: { select: { slug: true, assessment: { select: { title: true } } } } },
          },
          credentialsHeld: {
            include: { credential: { select: { slug: true, name: true } } },
          },
        },
      },
    },
  });
  if (!app) return { summary: null, freshlyGenerated: false };

  const fullName = `${app.candidate.firstName} ${app.candidate.lastName ?? ""}`.trim();
  const experiences = app.candidate.experiences
    .map((e) => {
      const start = e.startDate ? new Date(e.startDate).getFullYear() : "?";
      const end = e.endDate ? new Date(e.endDate).getFullYear() : "present";
      const desc = e.description ? ` — ${e.description.slice(0, 240)}` : "";
      return `  - ${e.title} @ ${e.company} (${start} → ${end})${desc}`;
    })
    .join("\n") || "  (no experiences listed)";
  const skills = app.candidate.skills.map((s) => s.skill.name).join(", ") || "(none listed)";
  const badges = app.candidate.verifiedSkillBadges.map((b) => b.meta.assessment.title).join(", ") || "(none)";
  const credentials = app.candidate.credentialsHeld.map((c) => c.credential.name).join(", ") || "(none)";

  const userPrompt = `JOB
Title: ${app.job.title}
Experience: ${app.job.experienceMin ?? "?"}–${app.job.experienceMax ?? "?"} years.
Locations: ${app.job.locations.join(", ") || "(unspecified)"}.
Work mode: ${app.job.workMode}.
Description: ${(app.job.description ?? "").slice(0, 1200)}
Requirements: ${(app.job.requirements ?? "").slice(0, 600)}

CANDIDATE
Name: ${fullName}.
Headline: ${app.candidate.headline ?? "(none)"}.
Location: ${app.candidate.city ?? "(unknown)"}.
Total experience: ${Math.round(app.candidate.totalExperienceMonths / 12 * 10) / 10} years.
DIYguru verified: ${app.candidate.isDIYguruVerified ? "yes" : "no"}.
Open to work: ${app.candidate.openToWork ? "yes" : "no"}.
Skills: ${skills}.
Verified EV-skill badges: ${badges}.
Credentials: ${credentials}.
Recent experiences:
${experiences}
Profile summary: ${app.candidate.summary?.slice(0, 800) ?? "(none)"}`;

  try {
    const { data } = await structuredJsonCall<SummaryPayload>({
      feature: "waveb.applicant-summary",
      model: aiModels.parser ?? "gpt-4o-mini",
      system: SYSTEM_PROMPT,
      user: userPrompt,
      entityType: "Application",
      entityId: applicationId,
      temperature: 0.3,
      maxOutputTokens: 700,
    });
    // Compose a single short summary text for the cached column.
    // Strengths/concerns/recommendation go into the matchExplanation
    // JSON if it isn't already set, so the existing match-score
    // breakdown UI gains them for free.
    const summary = (data.summary ?? "").trim();
    // Persist `aiSummaryAt` either way — that's the "we attempted"
    // marker the cache-hit branch uses. But only persist a non-empty
    // `aiSummary` when it cleared the 30-char meaningful threshold;
    // a degenerate AI response (trimmed to empty / "Cannot
    // determine") would otherwise pollute the cache and the recruiter
    // sees a sad blank inset on every load. Below threshold → store
    // empty + the timestamp, and the ensureApplicationSummary
    // cache-hit branch returns null without re-prompting.
    const cacheable = summary.length >= 30 ? summary : "";
    await db.application.update({
      where: { id: applicationId },
      data: {
        aiSummary: cacheable,
        aiSummaryAt: new Date(),
      },
    });
    return {
      summary: cacheable || null,
      freshlyGenerated: true,
    };
  } catch (err) {
    const cause = err instanceof StructuredAIError ? err.cause : "API_ERROR";
    logger.warn({ err, applicationId, cause }, "[waveb.applicant-summary] generate failed");
    return { summary: null, freshlyGenerated: false };
  }
}

const refreshSchema = z.object({ applicationId: z.string().min(1) });

/** Server action — "Refresh summary" button. Re-prompts OpenAI and
 *  overwrites the cached row. Rate-limited per recruiter so a bored
 *  user can't burn through the AI budget by mashing refresh. */
export async function refreshApplicationSummary(formData: FormData): Promise<void> {
  try {
    const parsed = refreshSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) redirect("/employer?error=" + encodeURIComponent("Bad request."));

    const session = await auth();
    if (!session?.user) redirect("/signin");
    const employer = await db.employerProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (!employer) redirect("/employer/onboarding");

    const app = await db.application.findUnique({
      where: { id: parsed.data.applicationId },
      select: { job: { select: { companyId: true } } },
    });
    if (!app) redirect("/employer?error=" + encodeURIComponent("Application not found."));
    if (app.job.companyId !== employer.companyId && session.user.role !== "ADMIN") redirect("/403");

    try {
      await rateLimitOrThrow(`ai-summary:${session.user.id}`, "ai");
    } catch (err) {
      if (isRouterControlError(err)) throw err;
      redirect(
        `/employer/applications/${parsed.data.applicationId}?error=` +
          encodeURIComponent("Slow down — try again in a minute."),
      );
    }

    await generateApplicationSummary(parsed.data.applicationId);
    revalidatePath(`/employer/applications/${parsed.data.applicationId}`);
    redirect(
      `/employer/applications/${parsed.data.applicationId}?notice=` +
        encodeURIComponent("Summary refreshed."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[waveb.applicant-summary] refresh unexpected");
    redirect("/employer?error=" + encodeURIComponent("Couldn't refresh — try again."));
  }
}
