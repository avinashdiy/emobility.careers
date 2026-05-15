"use server";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import {
  generateCoverLetter,
  type CoverLetterResult,
  type CoverLetterTone,
} from "@/lib/ai/cover-letter";
import { type FormState, snapshotFormData } from "@/lib/form-state";
import { isRouterControlError } from "@/lib/server-action-errors";

export interface CoverLetterState extends FormState {
  result?: CoverLetterResult;
}

const TONES: CoverLetterTone[] = [
  "formal",
  "enthusiastic",
  "concise",
  "warm",
  "confident",
];

const schema = z.object({
  targetRole: z.string().trim().min(2).max(120),
  targetCompany: z.string().trim().min(1).max(120),
  background: z.string().trim().min(20).max(4000),
  tone: z.enum(TONES as [CoverLetterTone, ...CoverLetterTone[]]).default("warm"),
  hook: z.string().trim().max(300).optional().or(z.literal("")),
  managerName: z.string().trim().max(60).optional().or(z.literal("")),
});

export async function runCoverLetter(
  _prev: CoverLetterState,
  formData: FormData,
): Promise<CoverLetterState> {
  try {
    const session = await auth();
    if (!session?.user) {
      await rateLimitOrThrow("cover-letter-anon", "signupIp").catch(() => undefined);
    }
    const parsed = schema.safeParse({
      targetRole: formData.get("targetRole"),
      targetCompany: formData.get("targetCompany"),
      background: formData.get("background"),
      tone: formData.get("tone") || "warm",
      hook: formData.get("hook") || "",
      managerName: formData.get("managerName") || "",
    });
    if (!parsed.success) {
      return {
        ok: false,
        message:
          parsed.error.issues[0]?.message ??
          "Add a target role, company, and a short background paragraph.",
        prevValues: snapshotFormData(formData),
      };
    }
    const result = await generateCoverLetter({
      targetRole: parsed.data.targetRole,
      targetCompany: parsed.data.targetCompany,
      background: parsed.data.background,
      tone: parsed.data.tone,
      hook: parsed.data.hook || null,
      managerName: parsed.data.managerName || null,
    });
    return { ok: true, result, prevValues: snapshotFormData(formData) };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[cover-letter] action failed");
    return {
      ok: false,
      message: "Couldn't generate the letter right now. Try again in a moment.",
      prevValues: snapshotFormData(formData),
    };
  }
}
