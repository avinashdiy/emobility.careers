"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { CallingLanguage } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import {
  getCallingProvider,
  CALLING_LANGUAGE_NAMES,
} from "@/lib/calling/provider";
import { structuredJsonCall, StructuredAIError } from "@/lib/ai/structured";
import { aiModels } from "@/lib/ai/openai";
import { env } from "@/lib/env";

/**
 * #16 Vernacular AI Calling Agent — server actions.
 *
 * Three flows:
 *
 *   1. queueScreenCall — recruiter clicks "Call this candidate" on an
 *      application card. We create a CallingSession in QUEUED state,
 *      auto-derive a 5-question script from the job description (or
 *      use a recruiter-customised one), then call the provider's
 *      dialCandidate(). Provider returns the call SID, we save it on
 *      the row.
 *
 *   2. (webhook in app/api/calling/webhook — TODO) the provider posts
 *      call-status events. We update CallingSession.status as DIALING
 *      → IN_PROGRESS → COMPLETED, and when COMPLETED, fetch the audio
 *      + ASR transcript and trigger scoreCallingSession.
 *
 *   3. scoreCallingSession — once a transcript exists, OpenAI scores
 *      the call vs the job description. The result lands on
 *      session.fitScore + session.summary, surfacing in the ATS for
 *      the recruiter.
 *
 * The webhook is a TODO — needs the EXOTEL_WEBHOOK_BASE public URL +
 * provider-specific signature verification. For now, queueScreenCall
 * is callable and the scoring path runs on a manually-uploaded
 * transcript via the admin tester (also TODO). Schema, provider
 * abstraction, and AI scoring are the gnarly bits; the webhook itself
 * is plumbing.
 */

async function requireJobOwner(jobId: string | null) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");
  if (jobId) {
    const job = await db.jobPosting.findUnique({
      where: { id: jobId },
      select: { id: true, companyId: true },
    });
    if (!job || job.companyId !== employer.companyId) redirect("/403");
  }
  return { session: session!, employer };
}

const queueSchema = z.object({
  applicationId: z.string().min(1),
  language: z.nativeEnum(CallingLanguage),
  /// Recruiter can paste a custom 3-7 question script. If empty, we
  /// auto-derive from the job description.
  scriptJson: z.string().optional(),
});

interface ScriptQuestion {
  id: string;
  text: string;
}

const FALLBACK_QUESTIONS: ScriptQuestion[] = [
  { id: "q1", text: "Tell me briefly about your most recent EV-industry role." },
  { id: "q2", text: "What's your hands-on experience with the EV stack — battery, motor, charging?" },
  { id: "q3", text: "Are you open to relocating, and to what cities?" },
  { id: "q4", text: "What's your notice period, and your expected CTC?" },
  { id: "q5", text: "Why this role at this company?" },
];

export async function queueScreenCall(formData: FormData): Promise<void> {
  try {
    const parsed = queueSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/employer?error=" + encodeURIComponent("Invalid call request."));
    }
    const { applicationId, language, scriptJson } = parsed.data;

    const application = await db.application.findUnique({
      where: { id: applicationId },
      include: {
        job: { select: { id: true, companyId: true, title: true, description: true } },
        candidate: { select: { id: true, userId: true, phone: true, firstName: true, lastName: true } },
      },
    });
    if (!application) redirect("/employer?error=" + encodeURIComponent("Application not found."));

    const { session: authSession } = await requireJobOwner(application.job.id);

    if (!application.candidate.phone) {
      redirect(
        `/employer/applications/${applicationId}?error=` +
          encodeURIComponent("Candidate hasn't shared their phone yet."),
      );
    }

    // Parse / fall back the script.
    let script: ScriptQuestion[] = FALLBACK_QUESTIONS;
    if (scriptJson) {
      try {
        const arr = JSON.parse(scriptJson) as ScriptQuestion[];
        if (Array.isArray(arr) && arr.length >= 3) {
          script = arr.slice(0, 7);
        }
      } catch {
        // ignore — fall back is fine
      }
    }

    // Translate the script into the candidate's language. This is a
    // single inexpensive OpenAI call — gpt-4o-mini is plenty for
    // translation. We do it here so the provider doesn't have to handle
    // multilingual TTS choreography; it just speaks the strings we
    // hand it.
    const languageName = CALLING_LANGUAGE_NAMES[language] ?? "English (Indian)";
    let translatedScript = script;
    if (language !== "EN_IN") {
      try {
        const { data } = await structuredJsonCall<{ items: { id: string; text: string }[] }>({
          feature: "wavec.calling-agent.translate-script",
          model: aiModels.parser ?? "gpt-4o-mini",
          system: `You translate short English question prompts to ${languageName} for an automated phone screen. Keep each translation short and natural. Output strict JSON: { "items": [{ "id": "...", "text": "..." }] }`,
          user: JSON.stringify({ items: script }),
          temperature: 0.2,
          maxOutputTokens: 1200,
        });
        if (Array.isArray(data.items) && data.items.length === script.length) {
          translatedScript = data.items;
        }
      } catch (err) {
        logger.warn({ err }, "[calling] translation failed, falling back to English");
      }
    }

    const session = await db.callingSession.create({
      data: {
        applicationId,
        candidateId: application.candidate.id,
        jobId: application.job.id,
        triggeredById: authSession.user.id,
        language,
        script: translatedScript as unknown as Prisma.InputJsonValue,
        status: "QUEUED",
      },
    });

    // Try to dial. Provider returns a synchronous SID we attach to
    // the row. A failure flips the session to FAILED — the recruiter
    // sees the reason on the calling-sessions admin page.
    const provider = getCallingProvider();
    const webhookUrl = `${env.EXOTEL_WEBHOOK_BASE ?? env.NEXT_PUBLIC_APP_URL}/api/calling/webhook/${provider.name}`;
    const dial = await provider.dialCandidate({
      toPhoneE164: application.candidate.phone!,
      fromCallerId: env.EXOTEL_CALLER_ID ?? "",
      webhookUrl,
      metadata: { sessionId: session.id },
      script: translatedScript.map((q) => ({ id: q.id, textInLanguage: q.text })),
      languageCode: language,
    });

    if (!dial.ok) {
      await db.callingSession.update({
        where: { id: session.id },
        data: {
          status: "FAILED",
          errorMessage: `${dial.reason}: ${dial.detail ?? ""}`,
        },
      });
      redirect(
        `/employer/applications/${applicationId}?error=` +
          encodeURIComponent(
            dial.reason === "PROVIDER_NOT_CONFIGURED"
              ? "Calling provider not configured. Ask your admin to set EXOTEL_SID + EXOTEL_TOKEN."
              : `Couldn't dial: ${dial.reason}`,
          ),
      );
    }

    await db.callingSession.update({
      where: { id: session.id },
      data: {
        status: "DIALING",
        providerCallSid: dial.providerCallSid,
        providerName: dial.providerName,
        startedAt: new Date(),
      },
    });

    try {
      await audit({
        actorId: authSession.user.id,
        action: "calling.queued",
        entity: "CallingSession",
        entityId: session.id,
        meta: { language, applicationId },
      });
    } catch {/* best-effort */}

    revalidatePath(`/employer/applications/${applicationId}`);
    redirect(
      `/employer/applications/${applicationId}?notice=` +
        encodeURIComponent("Call queued — we'll update the ATS once the candidate picks up."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[calling.queue] unexpected");
    redirect("/employer?error=" + encodeURIComponent("Couldn't queue the call — try again."));
  }
}

const scoreSchema = z.object({
  sessionId: z.string().min(1),
  rawTranscript: z.string().min(50).max(50_000),
});

/** Score a completed call's transcript. Called by the webhook handler
 *  once ASR is done, or manually by an admin from the calling sessions
 *  page. */
export async function scoreCallingSession(formData: FormData): Promise<void> {
  try {
    const parsed = scoreSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/employer?error=" + encodeURIComponent("Invalid score request."));
    }
    const { sessionId, rawTranscript } = parsed.data;

    const session = await db.callingSession.findUnique({
      where: { id: sessionId },
      include: { job: { select: { id: true, title: true, description: true, companyId: true } } },
    });
    if (!session) redirect("/employer?error=" + encodeURIComponent("Session not found."));

    await requireJobOwner(session.jobId);

    // Score the transcript vs the job description.
    try {
      const { data } = await structuredJsonCall<{
        fitScore: number;
        summary: string;
        strengths: string[];
        concerns: string[];
      }>({
        feature: "wavec.calling-agent.score",
        model: aiModels.rerank ?? "gpt-4o",
        system: `You are a recruiter's phone-screen evaluator. Given a candidate's spoken
phone-screen transcript and the role description, score fit 0-100 and produce a
recruiter-facing summary.

Output strict JSON:
{
  "fitScore": 0..100,
  "summary": "1-2 sentence verdict for the ATS card",
  "strengths": ["2-4 short bullets — strongest fit signals"],
  "concerns": ["1-3 short bullets — gaps / risks"]
}

Be honest. Don't invent skills the candidate didn't mention. A low score with
a clear reason is more useful than a polite middling number.`,
        user: `Role: ${session.job?.title ?? "(role)"}.
Job description: ${session.job?.description?.slice(0, 2000) ?? ""}.

Candidate phone-screen transcript:
${rawTranscript}`,
        entityType: "CallingSession",
        entityId: session.id,
        temperature: 0.3,
        maxOutputTokens: 1000,
      });

      await db.callingSession.update({
        where: { id: session.id },
        data: {
          rawTranscript,
          fitScore: Math.max(0, Math.min(100, Math.round(data.fitScore))),
          summary: data.summary,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
    } catch (err) {
      const cause = err instanceof StructuredAIError ? err.cause : "API_ERROR";
      logger.error({ err, sessionId }, "[calling.score] AI scoring failed");
      await db.callingSession.update({
        where: { id: session.id },
        data: {
          rawTranscript,
          status: "COMPLETED",
          completedAt: new Date(),
          errorMessage: `Scoring failed: ${cause}`,
        },
      });
    }

    revalidatePath(`/employer/applications/${session.applicationId ?? ""}`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[calling.score] unexpected");
  }
}
