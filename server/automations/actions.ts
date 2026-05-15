"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  AutomationAction as A,
  AutomationTrigger as T,
  ApplicationStage,
} from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import {
  snapshotFormData,
  zodErrorsToFieldErrors,
  type FormState,
} from "@/lib/form-state";

/**
 * #23 Automation Rules — CRUD + toggle. UI at
 * /employer/jobs/[id]/automations (per-job) and
 * /employer/automations (company-wide).
 *
 * Auth: must be an EmployerProfile at the company that owns the rule
 * (or admin). All writes audit-logged.
 */

async function requireCompanyAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");
  if (!employer.isCompanyAdmin && session.user.role !== "ADMIN") redirect("/403");
  return { session: session!, employer };
}

const createRuleSchema = z.object({
  jobId: z.string().min(1).optional().nullable(),
  label: z.string().trim().min(2).max(160),
  trigger: z.nativeEnum(T),
  // Conditions inputs — strings from the form, normalised below.
  matchScoreMin: z.coerce.number().min(0).max(100).optional(),
  mustBeDIYguruVerified: z.coerce.boolean().optional(),
  mustHaveBadgesCsv: z.string().max(500).optional(),
  mustHaveCredentialsCsv: z.string().max(500).optional(),
  locationsCsv: z.string().max(500).optional(),
  evDomainsCsv: z.string().max(500).optional(),
  experienceMin: z.coerce.number().min(0).max(600).optional(),
  fromStage: z.nativeEnum(ApplicationStage).optional(),
  toStage: z.nativeEnum(ApplicationStage).optional(),
  action: z.nativeEnum(A),
  actionToStage: z.nativeEnum(ApplicationStage).optional(),
  actionReason: z.string().max(1000).optional(),
  actionMessage: z.string().max(2000).optional(),
  actionSubject: z.string().max(200).optional(),
});

function csvToList(csv: string | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function createAutomation(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const { session, employer } = await requireCompanyAdmin();
    const parsed = createRuleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        message: "Please fix the highlighted fields.",
        fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()),
        prevValues: snapshotFormData(formData),
      };
    }
    const data = parsed.data;

    // If a jobId is supplied, verify it belongs to this employer's
    // company — recruiters at company A shouldn't be able to create
    // rules on company B's jobs even if they know the id.
    if (data.jobId) {
      const job = await db.jobPosting.findFirst({
        where: { id: data.jobId, companyId: employer.companyId },
        select: { id: true },
      });
      if (!job) {
        return {
          ok: false,
          message: "That job isn't part of your company.",
          prevValues: snapshotFormData(formData),
        };
      }
    }

    // Build the conditions JSON. matchScoreMin enters as 0..100 in the
    // form but stores as 0..1 to match how matchScore is stored on
    // Application rows. Empty fields are omitted to keep the JSON
    // tidy.
    const conditions: Record<string, unknown> = {};
    if (data.matchScoreMin !== undefined && data.matchScoreMin > 0) {
      conditions.matchScoreMin = data.matchScoreMin / 100;
    }
    if (data.mustBeDIYguruVerified) conditions.mustBeDIYguruVerified = true;
    const badges = csvToList(data.mustHaveBadgesCsv);
    if (badges.length) conditions.mustHaveVerifiedBadge = badges;
    const creds = csvToList(data.mustHaveCredentialsCsv);
    if (creds.length) conditions.mustHaveCredential = creds;
    const locs = csvToList(data.locationsCsv);
    if (locs.length) conditions.locationsAny = locs;
    const doms = csvToList(data.evDomainsCsv);
    if (doms.length) conditions.evDomainsAny = doms;
    if (data.experienceMin !== undefined && data.experienceMin > 0) {
      conditions.experienceMin = data.experienceMin;
    }
    if (data.fromStage) conditions.fromStage = data.fromStage;
    if (data.toStage) conditions.toStage = data.toStage;

    // Build the action payload.
    let actionPayload: Record<string, unknown> = {};
    if (data.action === A.AUTO_MOVE_STAGE) {
      if (!data.actionToStage) {
        return {
          ok: false,
          message: "Pick a target stage for the auto-move action.",
          prevValues: snapshotFormData(formData),
        };
      }
      actionPayload = { toStage: data.actionToStage, reason: data.actionReason ?? null };
    } else if (data.action === A.REJECT_WITH_REASON) {
      if (!data.actionReason) {
        return {
          ok: false,
          message: "Provide a reason for the auto-reject — the candidate sees it.",
          prevValues: snapshotFormData(formData),
        };
      }
      actionPayload = { reason: data.actionReason };
    } else if (data.action === A.NOTIFY_TEAM) {
      actionPayload = { message: data.actionMessage ?? "Automation flagged this candidate." };
    } else if (data.action === A.SEND_TEMPLATE) {
      if (!data.actionMessage) {
        return {
          ok: false,
          message: "Provide the message body — it goes to the candidate.",
          prevValues: snapshotFormData(formData),
        };
      }
      actionPayload = { subject: data.actionSubject ?? null, body: data.actionMessage };
    }

    const rule = await db.pipelineAutomation.create({
      data: {
        companyId: employer.companyId,
        jobId: data.jobId ?? null,
        createdById: session.user.id,
        label: data.label,
        trigger: data.trigger,
        conditions: conditions as Prisma.InputJsonValue,
        action: data.action,
        actionPayload: actionPayload as Prisma.InputJsonValue,
      },
    });

    try {
      await audit({
        actorId: session.user.id,
        action: "automation.created",
        entity: "PipelineAutomation",
        entityId: rule.id,
        meta: { jobId: data.jobId, label: data.label },
      });
    } catch {/* best-effort */}

    revalidatePath("/employer/automations");
    if (data.jobId) {
      revalidatePath(`/employer/jobs/${data.jobId}/automations`);
    }
    return { ok: true, message: "Automation created." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[automations.create] unexpected");
    return { ok: false, message: "Couldn't create — try again." };
  }
}

const toggleSchema = z.object({
  ruleId: z.string().min(1),
  enabled: z.enum(["true", "false"]),
});

export async function toggleAutomation(formData: FormData): Promise<void> {
  const { session, employer } = await requireCompanyAdmin();
  const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/employer/automations?error=" + encodeURIComponent("Invalid request."));
  }
  const rule = await db.pipelineAutomation.findUnique({
    where: { id: parsed.data.ruleId },
  });
  if (!rule || rule.companyId !== employer.companyId) redirect("/403");
  await db.pipelineAutomation.update({
    where: { id: rule.id },
    data: { enabled: parsed.data.enabled === "true" },
  });
  try {
    await audit({
      actorId: session.user.id,
      action: parsed.data.enabled === "true" ? "automation.enabled" : "automation.disabled",
      entity: "PipelineAutomation",
      entityId: rule.id,
    });
  } catch {/* best-effort */}
  revalidatePath("/employer/automations");
  if (rule.jobId) revalidatePath(`/employer/jobs/${rule.jobId}/automations`);
}

const deleteSchema = z.object({ ruleId: z.string().min(1) });

export async function deleteAutomation(formData: FormData): Promise<void> {
  const { session, employer } = await requireCompanyAdmin();
  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/employer/automations?error=" + encodeURIComponent("Invalid request."));
  }
  const rule = await db.pipelineAutomation.findUnique({
    where: { id: parsed.data.ruleId },
  });
  if (!rule || rule.companyId !== employer.companyId) redirect("/403");
  await db.pipelineAutomation.delete({ where: { id: rule.id } });
  try {
    await audit({
      actorId: session.user.id,
      action: "automation.deleted",
      entity: "PipelineAutomation",
      entityId: rule.id,
    });
  } catch {/* best-effort */}
  revalidatePath("/employer/automations");
  if (rule.jobId) revalidatePath(`/employer/jobs/${rule.jobId}/automations`);
}
