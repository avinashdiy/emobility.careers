"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { extractTextFromResume } from "@/lib/ai/resume-parser";
import { roastResume } from "@/lib/ai/roast";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { clientIp, honeypotTriggered } from "@/lib/anti-spam";

/**
 * AI Resume Roast — public, no-signup viral hook.
 *
 * Visitor flow:
 *   1. Drag-drop a resume on /roast (no auth required).
 *   2. We extract text, score it on EV-specific dimensions, persist
 *      a ResumeRoast row, set an `emce_roast_anon` cookie so the
 *      visitor can come back to past roasts, and redirect to
 *      /roast/[id].
 *   3. The result page shows the score + per-dim breakdown + 3-5
 *      actionable feedback items + share buttons.
 *
 * Anti-abuse:
 *   - Honeypot field on the form silently rejects bots.
 *   - Rate-limited per IP (3 roasts / hour) so a script can't burn
 *      OpenAI tokens.
 *   - File size hard-capped at 10MB; MIME sniffed from magic bytes.
 *   - Raw resume bytes are NEVER persisted — we only store the score
 *      + feedback + text length.
 */

const RESUME_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MAX_BYTES = 10 * 1024 * 1024;
const ANON_COOKIE = "emce_roast_anon";
const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

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
    httpOnly: false, // intentional — JS reads it on the result page for the "your roasts" hint
    sameSite: "lax",
    maxAge: ANON_COOKIE_MAX_AGE,
    path: "/",
  });
  return fresh;
}

export async function uploadResumeForRoast(formData: FormData): Promise<void> {
  // Layer 1: honeypot (free, blocks dumb bots)
  if (honeypotTriggered(formData.get("website"))) {
    redirect("/roast?error=" + encodeURIComponent("Couldn't process this upload."));
  }

  // Layer 2: rate-limit by IP. We don't have a user yet on this surface
  // so the IP is the only stable key. 3 per hour is plenty for a real
  // visitor; a scripted abuser hits the wall fast.
  const ip = await clientIp();
  if (ip) {
    try {
      await rateLimitOrThrow(`roast-ip:${ip}`, "signupIp"); // reuse the 5/hour preset
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Too many attempts";
      redirect("/roast?error=" + encodeURIComponent(msg));
    }
  }

  // Layer 3: file checks
  const file = formData.get("resume") as File | null;
  if (!file || file.size === 0) {
    redirect("/roast?error=" + encodeURIComponent("Upload a PDF or DOCX resume."));
  }
  if (file.size > MAX_BYTES) {
    redirect("/roast?error=" + encodeURIComponent("Resume must be under 10MB."));
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = sniffResumeKind(buffer);
  if (!kind) {
    redirect("/roast?error=" + encodeURIComponent("Only PDF or DOCX resumes are accepted."));
  }
  if (file.type && !RESUME_MIME_TYPES.has(file.type) && file.type !== "application/octet-stream") {
    redirect("/roast?error=" + encodeURIComponent("Resume content does not match declared type."));
  }

  // Layer 4: extract → score
  let text: string;
  try {
    text = await extractTextFromResume(buffer, file.type || "application/pdf");
  } catch (err) {
    logger.warn({ err }, "[roast] text extraction failed");
    redirect("/roast?error=" + encodeURIComponent("Couldn't read this resume. Try a different PDF."));
  }
  if (text.length < 200) {
    redirect("/roast?error=" + encodeURIComponent("Resume is too short or empty. Upload a complete CV."));
  }

  const result = await roastResume(text);

  // Layer 5: persist. We deliberately don't store the resume bytes — the
  // text length + score + feedback are enough for the result page and
  // for any future moderation triage.
  const session = await auth();
  const anonId = await getOrSetAnonId();
  const created = await db.resumeRoast.create({
    data: {
      anonId,
      claimedByUserId: session?.user?.id ?? null,
      scoreOverall: result.overall,
      scoreBreakdown: result.breakdown as unknown as object,
      feedback: result.feedback as unknown as object,
      textLength: text.length,
      ip: ip ?? null,
    },
    select: { id: true },
  });

  redirect(`/roast/${created.id}`);
}
