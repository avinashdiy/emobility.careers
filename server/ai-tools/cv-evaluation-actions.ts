"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { extractTextFromResume } from "@/lib/ai/resume-parser";
import { evaluateCv } from "@/lib/ai/cv-evaluation";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { clientIp, honeypotTriggered } from "@/lib/anti-spam";
import { isRouterControlError } from "@/lib/server-action-errors";
import type { Prisma } from "@prisma/client";

/**
 * Expert CV Evaluation server action — file-upload flow.
 *
 * Same defence-in-depth as the Roast tool: honeypot, IP rate-limit,
 * MIME sniff, byte cap. Diverges in two places:
 *   - The candidate can optionally tell us a target role + EV domain,
 *     piped into the prompt so the evaluation pitches to that bar.
 *   - We don't set a separate `emce_cv_anon` cookie because the
 *     evaluation persists less context (no anonymous "your evaluations"
 *     dashboard yet); we use the existing roast anon cookie when
 *     present so a returning visitor keeps a consistent anon id.
 */

const RESUME_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MAX_BYTES = 10 * 1024 * 1024;
const ANON_COOKIE = "emce_roast_anon";

function sniffResumeKind(buffer: Buffer): "pdf" | "docx" | "doc" | null {
  if (buffer.length < 8) return null;
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return "pdf";
  if (
    buffer[0] === 0x50 && buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06)
  ) return "docx";
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return "doc";
  return null;
}

async function getOrSetAnonId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(ANON_COOKIE)?.value;
  if (existing && existing.length >= 16) return existing;
  const fresh = randomUUID();
  jar.set(ANON_COOKIE, fresh, {
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });
  return fresh;
}

export async function uploadResumeForEvaluation(formData: FormData): Promise<void> {
  try {
    if (honeypotTriggered(formData.get("website"))) {
      redirect("/ai-tools/cv-evaluation?error=" + encodeURIComponent("Couldn't process this upload."));
    }
    const ip = await clientIp();
    if (ip) {
      try {
        await rateLimitOrThrow(`cv-eval-ip:${ip}`, "signupIp");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Too many attempts";
        redirect("/ai-tools/cv-evaluation?error=" + encodeURIComponent(msg));
      }
    }

    const file = formData.get("resume") as File | null;
    if (!file || file.size === 0) {
      redirect("/ai-tools/cv-evaluation?error=" + encodeURIComponent("Upload a PDF or DOCX resume."));
    }
    if (file.size > MAX_BYTES) {
      redirect("/ai-tools/cv-evaluation?error=" + encodeURIComponent("Resume must be under 10MB."));
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const kind = sniffResumeKind(buffer);
    if (!kind) {
      redirect("/ai-tools/cv-evaluation?error=" + encodeURIComponent("Only PDF or DOCX resumes are accepted."));
    }
    if (file.type && !RESUME_MIME_TYPES.has(file.type) && file.type !== "application/octet-stream") {
      redirect("/ai-tools/cv-evaluation?error=" + encodeURIComponent("Resume content does not match declared type."));
    }

    let text: string;
    try {
      text = await extractTextFromResume(buffer, file.type || "application/pdf");
    } catch (err) {
      logger.warn({ err }, "[cv-evaluation] text extraction failed");
      redirect("/ai-tools/cv-evaluation?error=" + encodeURIComponent("Couldn't read this resume. Try a different PDF."));
    }
    if (text.length < 200) {
      redirect("/ai-tools/cv-evaluation?error=" + encodeURIComponent("Resume too short or empty. Upload a complete CV."));
    }

    const targetRole = String(formData.get("targetRole") ?? "").trim().slice(0, 120) || null;
    const evDomainSlug = String(formData.get("evDomainSlug") ?? "").trim().slice(0, 60) || null;

    const result = await evaluateCv({ resumeText: text, targetRole, evDomainSlug });

    const session = await auth();
    const anonId = await getOrSetAnonId();
    const created = await db.cvEvaluation.create({
      data: {
        userId: session?.user?.id ?? null,
        anonId,
        scoreOverall: result.overall,
        sectionAnalysis: result.sections as unknown as Prisma.InputJsonValue,
        topFixes: result.topFixes as unknown as Prisma.InputJsonValue,
        textLength: text.length,
        targetRole,
        evDomainSlug,
        ip: ip ?? null,
      },
      select: { id: true },
    });

    redirect(`/ai-tools/cv-evaluation/${created.id}`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[cv-evaluation] action failed");
    redirect("/ai-tools/cv-evaluation?error=" + encodeURIComponent("Couldn't evaluate this CV. Try again."));
  }
}
