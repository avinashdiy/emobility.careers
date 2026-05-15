"use server";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import {
  generateInterviewPrep,
  type InterviewPrepResult,
} from "@/lib/ai/interview-prep";
import {
  type FormState,
  snapshotFormData,
} from "@/lib/form-state";
import { isRouterControlError } from "@/lib/server-action-errors";

export interface InterviewPrepState extends FormState {
  result?: InterviewPrepResult;
}

const schema = z.object({
  targetRole: z.string().trim().min(2).max(120),
  targetCompany: z.string().trim().max(120).optional().or(z.literal("")),
  seniorityLevel: z.string().trim().max(40).default("MID"),
  evDomainSlug: z.string().trim().max(60).optional().or(z.literal("")),
  daysUntil: z.coerce.number().int().min(0).max(60).default(7),
  focus: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function runInterviewPrep(
  _prev: InterviewPrepState,
  formData: FormData,
): Promise<InterviewPrepState> {
  try {
    const session = await auth();
    if (!session?.user) {
      await rateLimitOrThrow("interview-prep-anon", "signupIp").catch(() => undefined);
    }

    const parsed = schema.safeParse({
      targetRole: formData.get("targetRole"),
      targetCompany: formData.get("targetCompany") || "",
      seniorityLevel: formData.get("seniorityLevel") || "MID",
      evDomainSlug: formData.get("evDomainSlug") || "",
      daysUntil: formData.get("daysUntil") || 7,
      focus: formData.get("focus") || "",
    });
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Please fill the form.",
        prevValues: snapshotFormData(formData),
      };
    }

    const result = await generateInterviewPrep({
      targetRole: parsed.data.targetRole,
      targetCompany: parsed.data.targetCompany || null,
      seniorityLevel: parsed.data.seniorityLevel,
      evDomainSlug: parsed.data.evDomainSlug || null,
      daysUntil: parsed.data.daysUntil,
      focus: parsed.data.focus || null,
    });

    return { ok: true, result, prevValues: snapshotFormData(formData) };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[interview-prep] action failed");
    return {
      ok: false,
      message: "Couldn't generate the plan right now. Try again in a moment.",
      prevValues: snapshotFormData(formData),
    };
  }
}
