"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { queueByName } from "@/lib/queue-introspect";
import { logger } from "@/lib/logger";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

/**
 * Retry a single failed job. Failures live in BullMQ's `failed` state
 * after exhausting all attempts; this kicks them back to `wait` so a
 * worker picks them up again. Use after fixing the underlying cause
 * (e.g. provider outage resolved, schema issue patched).
 */
export async function retryFailedJob(formData: FormData) {
  const session = await requireAdmin();
  const queueName = z.string().parse(formData.get("queue"));
  const jobId = z.string().parse(formData.get("jobId"));
  const queue = queueByName(queueName);
  if (!queue) {
    redirect(`/admin/operations?error=${encodeURIComponent("Unknown queue")}`);
  }
  const job = await queue.getJob(jobId);
  if (!job) {
    redirect(`/admin/operations/${queueName}?error=${encodeURIComponent("Job not found")}`);
  }
  try {
    await job.retry();
    await audit({
      actorId: session.user.id,
      action: "queue.retry",
      entity: "BullMQJob",
      entityId: `${queueName}:${jobId}`,
    });
  } catch (err) {
    logger.warn({ err, queueName, jobId }, "[ops] retry failed");
  }
  revalidatePath(`/admin/operations/${queueName}`);
  revalidatePath("/admin/operations");
}

/**
 * Permanently drop a failed job. For when the failure is a
 * data-shape problem we can't fix by retrying (e.g. a notification
 * targeting a deleted user) — leaving it in `failed` would clutter
 * the queue page forever.
 */
export async function discardFailedJob(formData: FormData) {
  const session = await requireAdmin();
  const queueName = z.string().parse(formData.get("queue"));
  const jobId = z.string().parse(formData.get("jobId"));
  const queue = queueByName(queueName);
  if (!queue) {
    redirect(`/admin/operations?error=${encodeURIComponent("Unknown queue")}`);
  }
  const job = await queue.getJob(jobId);
  if (!job) {
    redirect(`/admin/operations/${queueName}?error=${encodeURIComponent("Job not found")}`);
  }
  try {
    await job.remove();
    await audit({
      actorId: session.user.id,
      action: "queue.discard",
      entity: "BullMQJob",
      entityId: `${queueName}:${jobId}`,
    });
  } catch (err) {
    logger.warn({ err, queueName, jobId }, "[ops] discard failed");
  }
  revalidatePath(`/admin/operations/${queueName}`);
  revalidatePath("/admin/operations");
}

/**
 * Bulk-retry every failed job in a queue. Fast path for a flapping
 * provider — once the provider recovers, one click moves the whole
 * backlog back to `wait`. Caps at 1000 to keep the loop bounded.
 */
export async function retryAllFailed(formData: FormData) {
  const session = await requireAdmin();
  const queueName = z.string().parse(formData.get("queue"));
  const queue = queueByName(queueName);
  if (!queue) {
    redirect(`/admin/operations?error=${encodeURIComponent("Unknown queue")}`);
  }
  const failed = await queue.getJobs(["failed"], 0, 999, false);
  let retried = 0;
  for (const j of failed) {
    try {
      await j.retry();
      retried += 1;
    } catch (err) {
      logger.warn({ err, jobId: j.id }, "[ops] bulk retry failed");
    }
  }
  await audit({
    actorId: session.user.id,
    action: "queue.bulk_retry",
    entity: "BullMQQueue",
    entityId: queueName,
    meta: { retried },
  });
  revalidatePath(`/admin/operations/${queueName}`);
  revalidatePath("/admin/operations");
  redirect(
    `/admin/operations/${queueName}?notice=${encodeURIComponent(
      `Retried ${retried} job${retried === 1 ? "" : "s"}.`,
    )}`,
  );
}

/** Pause a queue — workers stop picking new jobs. Useful before a
    deploy that changes job schema. */
export async function pauseQueue(formData: FormData) {
  const session = await requireAdmin();
  const queueName = z.string().parse(formData.get("queue"));
  const queue = queueByName(queueName);
  if (!queue) return;
  await queue.pause();
  await audit({
    actorId: session.user.id,
    action: "queue.pause",
    entity: "BullMQQueue",
    entityId: queueName,
  });
  revalidatePath(`/admin/operations/${queueName}`);
  revalidatePath("/admin/operations");
}

export async function resumeQueue(formData: FormData) {
  const session = await requireAdmin();
  const queueName = z.string().parse(formData.get("queue"));
  const queue = queueByName(queueName);
  if (!queue) return;
  await queue.resume();
  await audit({
    actorId: session.user.id,
    action: "queue.resume",
    entity: "BullMQQueue",
    entityId: queueName,
  });
  revalidatePath(`/admin/operations/${queueName}`);
  revalidatePath("/admin/operations");
}
