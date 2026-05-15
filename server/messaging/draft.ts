"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { isRouterControlError } from "@/lib/server-action-errors";
import { structuredJsonCall, StructuredAIError } from "@/lib/ai/structured";
import { aiModels } from "@/lib/ai/openai";

/**
 * #18 AI InMail Draft — server action callable from the recruiter's
 * chat composer. Returns a drafted first-touch message body the
 * recruiter can review + tweak before sending.
 *
 * Returns a structured payload `{ ok, body, subject?, error? }`.
 * Client component sets the textarea to `body`. Never sends the
 * message directly — the recruiter is always the human in the loop
 * for outbound DMs.
 */

const draftSchema = z.object({
  threadId: z.string().min(1),
  tone: z.enum(["FORMAL", "WARM", "CASUAL"]).optional(),
});

export interface InMailDraftResult {
  ok: boolean;
  body?: string;
  subject?: string;
  /** Why we couldn't draft — surfaced to the user as a small inline
   *  error so they know to fall back to writing it themselves. */
  error?: string;
}

const SYSTEM_PROMPT = `You are a recruiter's writing assistant for the Indian EV industry. Given a job + candidate, draft a SHORT first-touch message (80-140 words) the recruiter will send to the candidate.

The tone:
  - FORMAL = polished business English, no emojis, "Mr/Ms".
  - WARM (default) = friendly first-name, light contractions, no slang.
  - CASUAL = first-name + a single conversational opener.

Output strict JSON:
{ "subject": "short line, optional", "body": "the message" }

Rules:
  - Open by first name. Don't say "Dear [name]".
  - Cite ONE specific thing from the candidate's profile (a skill, a verified badge, a recent role, a credential). Never invent details.
  - Mention the role + company by name.
  - Soft ask at the end: "Would you be open to a 15-minute chat next week?"
  - Don't promise interviews, salaries, visa support, or relocation.
  - No markdown, no bullet lists, no emoji unless the tone is CASUAL.`;

export async function draftInMail(formData: FormData): Promise<InMailDraftResult> {
  try {
    const parsed = draftSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Bad request." };

    const session = await auth();
    if (!session?.user) return { ok: false, error: "Sign in first." };

    try {
      await rateLimitOrThrow(`inmail-draft:${session.user.id}`, "ai");
    } catch (err) {
      if (isRouterControlError(err)) throw err;
      return { ok: false, error: "Slow down — try again in a minute." };
    }

    const thread = await db.messageThread.findUnique({
      where: { id: parsed.data.threadId },
      include: {
        application: {
          include: {
            job: {
              select: {
                id: true,
                title: true,
                companyId: true,
                company: { select: { name: true } },
                postedBy: { select: { name: true } },
                description: true,
              },
            },
            candidate: {
              select: {
                firstName: true,
                lastName: true,
                headline: true,
                summary: true,
                city: true,
                totalExperienceMonths: true,
                isDIYguruVerified: true,
                experiences: {
                  orderBy: { startDate: "desc" },
                  take: 2,
                  select: { title: true, company: true, description: true },
                },
                skills: { include: { skill: { select: { name: true } } }, take: 6 },
                verifiedSkillBadges: {
                  include: { meta: { select: { assessment: { select: { title: true } } } } },
                },
                credentialsHeld: {
                  include: { credential: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!thread || !thread.application) {
      return { ok: false, error: "Thread isn't linked to an application — write the first message yourself." };
    }

    // Auth — the recruiter must be on this company's team (or admin).
    if (session.user.role !== "ADMIN") {
      const employer = await db.employerProfile.findUnique({
        where: { userId: session.user.id },
      });
      if (!employer || employer.companyId !== thread.application.job.companyId) {
        return { ok: false, error: "Not your thread." };
      }
    }

    const app = thread.application;
    const c = app.candidate;
    const fullName = `${c.firstName} ${c.lastName ?? ""}`.trim();
    const experiences = c.experiences
      .map((e) => `${e.title} @ ${e.company}${e.description ? ` — ${e.description.slice(0, 200)}` : ""}`)
      .join(" · ") || "(no recent experience listed)";
    const skills = c.skills.map((s) => s.skill.name).join(", ") || "(none listed)";
    const badges = c.verifiedSkillBadges.map((b) => b.meta.assessment.title).join(", ") || "(none)";
    const credentials = c.credentialsHeld.map((cc) => cc.credential.name).join(", ") || "(none)";

    const userPrompt = `Tone: ${parsed.data.tone ?? "WARM"}.
Recruiter name: ${app.job.postedBy.name ?? "the recruiter"}.
Role: ${app.job.title} at ${app.job.company.name}.
Job description (first 800 chars): ${(app.job.description ?? "").slice(0, 800)}

Candidate first name: ${c.firstName}.
Full name: ${fullName}.
Headline: ${c.headline ?? "(none)"}.
Location: ${c.city ?? "(unknown)"}.
Experience: ${Math.round(c.totalExperienceMonths / 12 * 10) / 10} years.
DIYguru verified: ${c.isDIYguruVerified ? "yes" : "no"}.
Recent experience: ${experiences}.
Skills: ${skills}.
Verified EV-skill badges: ${badges}.
Credentials: ${credentials}.`;

    try {
      const { data } = await structuredJsonCall<{ subject?: string; body: string }>({
        feature: "waveb.inmail-draft",
        model: aiModels.rerank ?? "gpt-4o",
        system: SYSTEM_PROMPT,
        user: userPrompt,
        entityType: "MessageThread",
        entityId: thread.id,
        temperature: 0.6,
        maxOutputTokens: 600,
      });
      if (!data.body || data.body.length < 30) {
        return { ok: false, error: "Draft came back too short — try again or write it yourself." };
      }
      return { ok: true, body: data.body.trim(), subject: data.subject?.trim() };
    } catch (err) {
      const cause = err instanceof StructuredAIError ? err.cause : "API_ERROR";
      logger.warn({ err, threadId: thread.id, cause }, "[waveb.inmail-draft] failed");
      return { ok: false, error: "AI didn't respond — try again." };
    }
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[waveb.inmail-draft] unexpected");
    return { ok: false, error: "Couldn't draft — try again." };
  }
}
