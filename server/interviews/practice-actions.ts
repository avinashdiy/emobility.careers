"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import {
  openingQuestion,
  nextTurn,
  summarise,
  type InterviewTurn,
  type InterviewSessionContext,
} from "@/lib/ai/interview";
import {
  InterviewSessionKind,
  InterviewSessionStatus,
  type Prisma,
} from "@prisma/client";
import { isRouterControlError } from "@/lib/server-action-errors";

/**
 * Server actions for the AI Interview Practice tools (Mock Interview
 * + Interview Simulator). Signed-out visitors can run a single
 * session per IP (the rate-limit preset handles that); signed-in
 * users get unlimited sessions but each one is attached to their
 * userId so /me/interviews/practice can list them.
 */

const startSchema = z.object({
  kind: z.nativeEnum(InterviewSessionKind),
  targetRole: z.string().trim().min(2).max(120),
  seniorityLevel: z.string().trim().min(2).max(40).default("MID"),
  evDomainSlug: z.string().trim().max(60).optional().or(z.literal("")),
  targetCompany: z.string().trim().max(120).optional().or(z.literal("")),
  interviewerPersona: z.string().trim().max(120).optional().or(z.literal("")),
});

function buildCtx(row: {
  kind: InterviewSessionKind;
  targetRole: string;
  seniorityLevel: string;
  evDomainSlug: string | null;
  targetCompany: string | null;
  interviewerPersona: string | null;
}): InterviewSessionContext {
  return {
    kind: row.kind,
    targetRole: row.targetRole,
    seniorityLevel: row.seniorityLevel,
    evDomainSlug: row.evDomainSlug,
    targetCompany: row.targetCompany,
    interviewerPersona: row.interviewerPersona,
  };
}

function parseTranscript(value: Prisma.JsonValue): InterviewTurn[] {
  if (!Array.isArray(value)) return [];
  const out: InterviewTurn[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const obj = raw as Record<string, unknown>;
    const role = obj.role;
    const content = obj.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    out.push({
      role,
      content,
      ts: typeof obj.ts === "string" ? obj.ts : new Date().toISOString(),
    });
  }
  return out;
}

/**
 * Create a new session, generate the opening interviewer message,
 * persist it, and redirect into the chat page. The chat page reads
 * the row directly so the user lands on a fully-loaded transcript
 * with the first question already visible.
 */
export async function startInterviewSession(formData: FormData) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    // Anonymous rate-limit: 3 starts / hour per session cookie. The
    // existing `signupIp` preset is the closest "anonymous, low-volume"
    // bucket — reuse rather than add a new one. Signed-in users skip
    // this entirely (the action's cost is bounded by AI spend, which
    // /admin/ai-ops monitors).
    if (!userId) {
      await rateLimitOrThrow("interview-anon", "signupIp").catch(() => undefined);
    }

    const parsed = startSchema.safeParse({
      kind: formData.get("kind"),
      targetRole: formData.get("targetRole"),
      seniorityLevel: formData.get("seniorityLevel") || "MID",
      evDomainSlug: formData.get("evDomainSlug") || "",
      targetCompany: formData.get("targetCompany") || "",
      interviewerPersona: formData.get("interviewerPersona") || "",
    });
    if (!parsed.success) {
      logger.warn({ err: parsed.error.flatten() }, "[interview] start validation failed");
      // Read the kind directly from formData since parsed.data is
      // undefined on validation failure — we still want to bounce
      // the user back to the right setup screen.
      const rawKind = String(formData.get("kind") ?? "");
      redirect(
        rawKind === "SIMULATOR"
          ? "/ai-tools/interview-simulator?error=" +
              encodeURIComponent("Please fill the form correctly.")
          : "/ai-tools/mock-interview?error=" +
              encodeURIComponent("Please fill the form correctly."),
      );
    }
    const data = parsed.data;

    const created = await db.interviewSession.create({
      data: {
        userId,
        kind: data.kind,
        targetRole: data.targetRole,
        seniorityLevel: data.seniorityLevel || "MID",
        evDomainSlug: data.evDomainSlug || null,
        targetCompany: data.targetCompany || null,
        interviewerPersona: data.interviewerPersona || null,
        messages: [],
      },
      select: { id: true },
    });

    const ctx = buildCtx({
      kind: data.kind,
      targetRole: data.targetRole,
      seniorityLevel: data.seniorityLevel || "MID",
      evDomainSlug: data.evDomainSlug || null,
      targetCompany: data.targetCompany || null,
      interviewerPersona: data.interviewerPersona || null,
    });
    const opening = await openingQuestion(ctx);

    const firstTurn: InterviewTurn = {
      role: "assistant",
      content: opening.content,
      ts: new Date().toISOString(),
    };
    await db.interviewSession.update({
      where: { id: created.id },
      data: { messages: [firstTurn] as unknown as Prisma.InputJsonValue },
    });

    const path =
      data.kind === "SIMULATOR"
        ? `/ai-tools/interview-simulator/${created.id}`
        : `/ai-tools/mock-interview/${created.id}`;
    redirect(path);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[interview] startInterviewSession failed");
    redirect("/ai-tools?error=" + encodeURIComponent("Couldn't start the interview. Try again."));
  }
}

const respondSchema = z.object({
  sessionId: z.string().min(1),
  answer: z.string().trim().min(1).max(4000),
});

export interface InterviewActionResult {
  ok: boolean;
  message?: string;
  /** Echoed back so the client can append + render without a refetch. */
  assistant?: InterviewTurn;
  done?: boolean;
}

/**
 * Append the candidate's reply, ask the AI for the next interviewer
 * turn, persist both. Returns the assistant turn so the client can
 * append it locally without re-querying. `done: true` means the AI
 * is signalling end-of-interview; the client switches its primary
 * CTA from "Send" to "End for feedback".
 */
export async function sendInterviewResponse(input: {
  sessionId: string;
  answer: string;
}): Promise<InterviewActionResult> {
  try {
    const parsed = respondSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: "Please type a response before sending." };
    }
    const { sessionId, answer } = parsed.data;
    const session = await auth();
    const viewerUserId = session?.user?.id ?? null;

    const row = await db.interviewSession.findUnique({ where: { id: sessionId } });
    if (!row) return { ok: false, message: "Session not found." };
    // Authorization: anyone can interact with an anonymous (userId =
    // null) session because we can't tie it to a viewer; signed-in
    // sessions are scoped to their owner so a stray link share
    // can't be hijacked.
    if (row.userId && row.userId !== viewerUserId) {
      return { ok: false, message: "Not your session." };
    }
    if (row.status !== InterviewSessionStatus.ACTIVE) {
      return { ok: false, message: "This session has already ended." };
    }

    const history = parseTranscript(row.messages);
    const userTurn: InterviewTurn = {
      role: "user",
      content: answer,
      ts: new Date().toISOString(),
    };
    const ctx = buildCtx(row);
    const next = await nextTurn(ctx, [...history, userTurn]);
    const assistantTurn: InterviewTurn = {
      role: "assistant",
      content: next.content,
      ts: new Date().toISOString(),
    };

    await db.interviewSession.update({
      where: { id: row.id },
      data: {
        messages: [...history, userTurn, assistantTurn] as unknown as Prisma.InputJsonValue,
      },
    });

    return { ok: true, assistant: assistantTurn, done: next.done };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[interview] sendInterviewResponse failed");
    return { ok: false, message: "Something went wrong. Try again in a moment." };
  }
}

/**
 * Wrap up the session: ask the model to score the transcript, write
 * the summary fields, flip status to COMPLETED. The caller (the
 * client End button) then navigates to the result page, which reads
 * the same row.
 */
export async function endInterviewSession(input: { sessionId: string }) {
  try {
    const sessionId = z.string().min(1).parse(input.sessionId);
    const session = await auth();
    const viewerUserId = session?.user?.id ?? null;

    const row = await db.interviewSession.findUnique({ where: { id: sessionId } });
    if (!row) return { ok: false as const, message: "Session not found." };
    if (row.userId && row.userId !== viewerUserId) {
      return { ok: false as const, message: "Not your session." };
    }
    if (row.status === InterviewSessionStatus.COMPLETED) {
      return { ok: true as const }; // idempotent — the result page renders the existing scores
    }

    const history = parseTranscript(row.messages);
    if (history.filter((t) => t.role === "user").length === 0) {
      // Mark abandoned rather than score an empty session — the
      // model would just hallucinate a fake transcript score.
      await db.interviewSession.update({
        where: { id: row.id },
        data: {
          status: InterviewSessionStatus.ABANDONED,
          completedAt: new Date(),
        },
      });
      return { ok: false as const, message: "You haven't answered any questions yet." };
    }

    const ctx = buildCtx(row);
    const summary = await summarise(ctx, history);

    await db.interviewSession.update({
      where: { id: row.id },
      data: {
        status: InterviewSessionStatus.COMPLETED,
        completedAt: new Date(),
        scoreOverall: summary.overall,
        scoreBreakdown: summary.breakdown as unknown as Prisma.InputJsonValue,
        feedback: summary.feedback as unknown as Prisma.InputJsonValue,
        summary: summary.summary,
      },
    });

    revalidatePath(`/ai-tools/mock-interview/${row.id}`);
    revalidatePath(`/ai-tools/interview-simulator/${row.id}`);
    return { ok: true as const };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[interview] endInterviewSession failed");
    return { ok: false as const, message: "Couldn't finalise this session. Try again." };
  }
}
