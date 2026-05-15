"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import { runHiringAssistantForJob } from "@/server/hiring-assistant/run";

/**
 * #22 AI Hiring Assistant — config CRUD + manual "run now" trigger.
 *
 * The agentic loop usually runs on a daily cron tick (workers/index.ts
 * registers a worker that processes every enabled HiringAssistantConfig
 * once per day). The "Run now" button on the per-job page lets the
 * recruiter trigger the loop manually for testing + immediate first
 * runs.
 */

async function requireJobOwner(jobId: string) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");
  const job = await db.jobPosting.findUnique({
    where: { id: jobId },
    select: { id: true, companyId: true },
  });
  if (!job || job.companyId !== employer.companyId) redirect("/403");
  return { session: session!, employer, job };
}

const configSchema = z.object({
  jobId: z.string().min(1),
  enabled: z.coerce.boolean().optional(),
  draftBatchSize: z.coerce.number().int().min(1).max(20).optional(),
  followUpAfterDays: z.coerce.number().int().min(0).max(30).optional(),
  tone: z.enum(["FORMAL", "WARM", "CASUAL"]).optional(),
  maxOutreachPerTick: z.coerce.number().int().min(1).max(30).optional(),
});

export async function saveHiringAssistantConfig(formData: FormData): Promise<void> {
  try {
    const parsed = configSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const jobId = formData.get("jobId");
      redirect(
        `/employer/jobs/${jobId}/assistant?error=` +
          encodeURIComponent("Couldn't save — check the values and retry."),
      );
    }
    const { jobId, ...rest } = parsed.data;
    const { session } = await requireJobOwner(jobId);

    const data = {
      enabled: rest.enabled ?? true,
      draftBatchSize: rest.draftBatchSize ?? 5,
      // 0 in the form means "never chase"; store as null so the run
      // loop can treat it as "skip the chase pass".
      followUpAfterDays:
        rest.followUpAfterDays === undefined || rest.followUpAfterDays === 0
          ? null
          : rest.followUpAfterDays,
      tone: rest.tone ?? "WARM",
      maxOutreachPerTick: rest.maxOutreachPerTick ?? 10,
    };

    await db.hiringAssistantConfig.upsert({
      where: { jobId },
      create: {
        jobId,
        enabledById: session.user.id,
        ...data,
      },
      update: data,
    });

    try {
      await audit({
        actorId: session.user.id,
        action: "hiring_assistant.configured",
        entity: "HiringAssistantConfig",
        entityId: jobId,
      });
    } catch {/* best-effort */}

    revalidatePath(`/employer/jobs/${jobId}/assistant`);
    redirect(
      `/employer/jobs/${jobId}/assistant?notice=` + encodeURIComponent("Assistant settings saved."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[hiring-assistant.save] unexpected");
    const jobId = formData.get("jobId");
    redirect(
      `/employer/jobs/${jobId}/assistant?error=` +
        encodeURIComponent("Couldn't save — try again."),
    );
  }
}

const runNowSchema = z.object({ jobId: z.string().min(1) });

export async function runHiringAssistantNow(formData: FormData): Promise<void> {
  try {
    const parsed = runNowSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) redirect("/employer");
    const { jobId } = parsed.data;
    await requireJobOwner(jobId);
    const config = await db.hiringAssistantConfig.findUnique({ where: { jobId } });
    if (!config) {
      redirect(
        `/employer/jobs/${jobId}/assistant?error=` +
          encodeURIComponent("Enable the assistant first, then run."),
      );
    }
    if (!config.enabled) {
      redirect(
        `/employer/jobs/${jobId}/assistant?error=` +
          encodeURIComponent("Assistant is paused — toggle it on first."),
      );
    }
    try {
      await runHiringAssistantForJob(config.id);
    } catch (err) {
      logger.error({ err, configId: config.id }, "[hiring-assistant.runNow] failed");
      redirect(
        `/employer/jobs/${jobId}/assistant?error=` +
          encodeURIComponent("Run failed — check the run history for details."),
      );
    }
    revalidatePath(`/employer/jobs/${jobId}/assistant`);
    redirect(
      `/employer/jobs/${jobId}/assistant?notice=` + encodeURIComponent("Run complete."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[hiring-assistant.runNow] unexpected");
    const jobId = formData.get("jobId");
    redirect(
      `/employer/jobs/${jobId}/assistant?error=` +
        encodeURIComponent("Run failed unexpectedly — try again."),
    );
  }
}
