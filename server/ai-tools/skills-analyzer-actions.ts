"use server";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import {
  analyzeSkills,
  type SkillsAnalysisResult,
} from "@/lib/ai/skills-analyzer";
import {
  type FormState,
  snapshotFormData,
} from "@/lib/form-state";
import { isRouterControlError } from "@/lib/server-action-errors";

/**
 * Action for the Analyze-Your-EV-Skills tool. Stateless — the result
 * is returned inline via useActionState so the form page becomes the
 * result page on a successful submit. Anonymous visitors are rate-
 * limited to keep the OpenAI bill bounded (3/hour per IP via the
 * existing signupIp preset); signed-in users skip the cap.
 */

export interface SkillsAnalyzerState extends FormState {
  result?: SkillsAnalysisResult;
}

const schema = z.object({
  rawSkills: z.string().trim().min(2).max(4000),
  evDomainSlug: z.string().trim().max(60).optional().or(z.literal("")),
  seniorityLevel: z.string().trim().max(40).optional().or(z.literal("")),
  careerGoal: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function runSkillsAnalysis(
  _prev: SkillsAnalyzerState,
  formData: FormData,
): Promise<SkillsAnalyzerState> {
  try {
    const session = await auth();
    if (!session?.user) {
      await rateLimitOrThrow("skills-analyzer-anon", "signupIp").catch(() => undefined);
    }

    const parsed = schema.safeParse({
      rawSkills: formData.get("rawSkills"),
      evDomainSlug: formData.get("evDomainSlug") || "",
      seniorityLevel: formData.get("seniorityLevel") || "",
      careerGoal: formData.get("careerGoal") || "",
    });
    if (!parsed.success) {
      return {
        ok: false,
        message:
          parsed.error.issues[0]?.message ??
          "Add at least a short list of skills before analysing.",
        prevValues: snapshotFormData(formData),
      };
    }

    const result = await analyzeSkills({
      rawSkills: parsed.data.rawSkills,
      evDomainSlug: parsed.data.evDomainSlug || null,
      seniorityLevel: parsed.data.seniorityLevel || null,
      careerGoal: parsed.data.careerGoal || null,
    });

    return { ok: true, result, prevValues: snapshotFormData(formData) };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[skills-analyzer] action failed");
    return {
      ok: false,
      message: "Couldn't analyse right now. Try again in a moment.",
      prevValues: snapshotFormData(formData),
    };
  }
}
