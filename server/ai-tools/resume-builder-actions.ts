"use server";

import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import {
  buildResume,
  type BuiltResume,
} from "@/lib/ai/resume-builder";
import { type FormState, snapshotFormData } from "@/lib/form-state";
import { isRouterControlError } from "@/lib/server-action-errors";

export interface ResumeBuilderState extends FormState {
  result?: BuiltResume;
}

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  targetRole: z.string().trim().min(2).max(120),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  location: z.string().trim().max(120).optional().or(z.literal("")),
  linkedinUrl: z.string().trim().max(300).optional().or(z.literal("")),
  portfolioUrl: z.string().trim().max(300).optional().or(z.literal("")),
  brainDump: z.string().trim().min(80).max(8000),
  evDomainSlug: z.string().trim().max(60).optional().or(z.literal("")),
});

export async function runResumeBuilder(
  _prev: ResumeBuilderState,
  formData: FormData,
): Promise<ResumeBuilderState> {
  try {
    const session = await auth();
    if (!session?.user) {
      await rateLimitOrThrow("resume-builder-anon", "signupIp").catch(() => undefined);
    }
    const parsed = schema.safeParse({
      name: formData.get("name"),
      targetRole: formData.get("targetRole"),
      email: formData.get("email") || "",
      phone: formData.get("phone") || "",
      location: formData.get("location") || "",
      linkedinUrl: formData.get("linkedinUrl") || "",
      portfolioUrl: formData.get("portfolioUrl") || "",
      brainDump: formData.get("brainDump"),
      evDomainSlug: formData.get("evDomainSlug") || "",
    });
    if (!parsed.success) {
      return {
        ok: false,
        message:
          parsed.error.issues[0]?.message ??
          "Fill in name, target role, and paste your background.",
        prevValues: snapshotFormData(formData),
      };
    }
    const result = await buildResume({
      name: parsed.data.name,
      targetRole: parsed.data.targetRole,
      email: parsed.data.email || "",
      phone: parsed.data.phone || "",
      location: parsed.data.location || "",
      linkedinUrl: parsed.data.linkedinUrl || "",
      portfolioUrl: parsed.data.portfolioUrl || "",
      brainDump: parsed.data.brainDump,
      evDomainSlug: parsed.data.evDomainSlug || null,
    });
    return { ok: true, result, prevValues: snapshotFormData(formData) };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[resume-builder] action failed");
    return {
      ok: false,
      message: "Couldn't build the resume right now. Try again in a moment.",
      prevValues: snapshotFormData(formData),
    };
  }
}
