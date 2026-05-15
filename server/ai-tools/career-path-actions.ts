"use server";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import {
  generateCareerPath,
  type CareerPathResult,
} from "@/lib/ai/career-path";
import { type FormState, snapshotFormData } from "@/lib/form-state";
import { isRouterControlError } from "@/lib/server-action-errors";

export interface CareerPathState extends FormState {
  result?: CareerPathResult;
}

const schema = z.object({
  currentSituation: z.string().trim().min(10).max(2000),
  targetRole: z.string().trim().min(2).max(400),
  horizonYears: z.coerce.number().int().min(1).max(10).default(3),
  evDomainSlug: z.string().trim().max(60).optional().or(z.literal("")),
  constraints: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function runCareerPath(
  _prev: CareerPathState,
  formData: FormData,
): Promise<CareerPathState> {
  try {
    const session = await auth();
    if (!session?.user) {
      await rateLimitOrThrow("career-path-anon", "signupIp").catch(() => undefined);
    }
    const parsed = schema.safeParse({
      currentSituation: formData.get("currentSituation"),
      targetRole: formData.get("targetRole"),
      horizonYears: formData.get("horizonYears") || 3,
      evDomainSlug: formData.get("evDomainSlug") || "",
      constraints: formData.get("constraints") || "",
    });
    if (!parsed.success) {
      return {
        ok: false,
        message:
          parsed.error.issues[0]?.message ??
          "Tell us where you are today and where you want to go.",
        prevValues: snapshotFormData(formData),
      };
    }
    const result = await generateCareerPath({
      currentSituation: parsed.data.currentSituation,
      targetRole: parsed.data.targetRole,
      horizonYears: parsed.data.horizonYears,
      evDomainSlug: parsed.data.evDomainSlug || null,
      constraints: parsed.data.constraints || null,
    });
    return { ok: true, result, prevValues: snapshotFormData(formData) };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[career-path] action failed");
    return {
      ok: false,
      message: "Couldn't generate the path right now. Try again in a moment.",
      prevValues: snapshotFormData(formData),
    };
  }
}
