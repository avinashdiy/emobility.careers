"use server";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import {
  optimizeLinkedIn,
  type LinkedInOptimizerResult,
} from "@/lib/ai/linkedin-optimizer";
import { type FormState, snapshotFormData } from "@/lib/form-state";
import { isRouterControlError } from "@/lib/server-action-errors";

export interface LinkedInOptimizerState extends FormState {
  result?: LinkedInOptimizerResult;
}

const schema = z.object({
  currentHeadline: z.string().trim().min(2).max(400),
  currentAbout: z.string().trim().max(3000).optional().or(z.literal("")),
  experienceSummary: z.string().trim().min(20).max(3000),
  targetRole: z.string().trim().min(2).max(120),
  evDomainSlug: z.string().trim().max(60).optional().or(z.literal("")),
});

export async function runLinkedInOptimizer(
  _prev: LinkedInOptimizerState,
  formData: FormData,
): Promise<LinkedInOptimizerState> {
  try {
    const session = await auth();
    if (!session?.user) {
      await rateLimitOrThrow("linkedin-opt-anon", "signupIp").catch(() => undefined);
    }
    const parsed = schema.safeParse({
      currentHeadline: formData.get("currentHeadline"),
      currentAbout: formData.get("currentAbout") || "",
      experienceSummary: formData.get("experienceSummary"),
      targetRole: formData.get("targetRole"),
      evDomainSlug: formData.get("evDomainSlug") || "",
    });
    if (!parsed.success) {
      return {
        ok: false,
        message:
          parsed.error.issues[0]?.message ??
          "Paste your current headline + a short experience summary.",
        prevValues: snapshotFormData(formData),
      };
    }
    const result = await optimizeLinkedIn({
      currentHeadline: parsed.data.currentHeadline,
      currentAbout: parsed.data.currentAbout || "",
      experienceSummary: parsed.data.experienceSummary,
      targetRole: parsed.data.targetRole,
      evDomainSlug: parsed.data.evDomainSlug || null,
    });
    return { ok: true, result, prevValues: snapshotFormData(formData) };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[linkedin-optimizer] action failed");
    return {
      ok: false,
      message: "Couldn't optimise right now. Try again in a moment.",
      prevValues: snapshotFormData(formData),
    };
  }
}
