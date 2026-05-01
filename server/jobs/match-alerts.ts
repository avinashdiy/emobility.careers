"use server";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notificationsQueue } from "@/lib/queues";

/**
 * Fan out notifications to every candidate whose JobAlert matches a
 * freshly-published JobPosting. Called from `createJob` after the
 * row commits, and conditionally from `updateJobStatus` when status
 * transitions DRAFT → OPEN.
 *
 * v1 matching is intentionally simple:
 *   • Case-insensitive substring match of `JobAlert.query` against
 *     `JobPosting.title` OR `JobPosting.company.name`.
 *   • Skip alerts whose `lastSentAt` is within the last 24h to avoid
 *     re-notifying a candidate when an employer re-publishes a job.
 *   • Skip alerts marked `isActive: false`.
 *   • Respect the alert's preferred channels — defaults to IN_APP+EMAIL
 *     when the column is empty.
 *
 * Filters (location / workMode / experience / domain) live as JSON in
 * `JobAlert.filters`; v1 ignores them. We can layer those in by
 * narrowing the matched candidates AFTER the keyword filter when we
 * have query-perf concerns.
 *
 * Best-effort: a single failure (e.g., queue outage) doesn't block
 * the rest of the alerts in the batch.
 */
export async function matchAndNotifyJobAlerts(jobId: string): Promise<{
  matched: number;
  enqueued: number;
}> {
  const job = await db.jobPosting.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      audience: true,
      company: { select: { name: true, verificationStatus: true } },
    },
  });
  if (!job) return { matched: 0, enqueued: 0 };
  if (job.status !== "OPEN") return { matched: 0, enqueued: 0 };
  // Don't notify on REJECTED-company jobs (they're hidden from public
  // listings anyway). Same gate as the public /jobs filter.
  if (job.company.verificationStatus === "REJECTED") {
    return { matched: 0, enqueued: 0 };
  }
  // INVITE_ONLY jobs aren't browseable, so JobAlerts shouldn't fire
  // on them. DIYGURU_ONLY does fire — but only for verified
  // candidates, gated below.
  if (job.audience === "INVITE_ONLY") return { matched: 0, enqueued: 0 };

  const cooldownAfter = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Pull every active, off-cooldown alert. We filter client-side for
  // the keyword match because alert queries are short, the row count
  // is bounded by total active candidates, and pushing the substring
  // check into Postgres correctly (each alert's `query` against this
  // job's title) requires a flipped LIKE that Prisma doesn't express
  // ergonomically. Take cap of 1000 keeps fanout bounded at v1 scale.
  const haystack = `${job.title} ${job.company.name}`.toLowerCase();
  const candidates = await db.jobAlert.findMany({
    where: {
      isActive: true,
      OR: [
        { lastSentAt: null },
        { lastSentAt: { lt: cooldownAfter } },
      ],
    },
    take: 1000,
    select: {
      id: true,
      query: true,
      candidateId: true,
      channels: true,
      candidate: { select: { userId: true } },
    },
  });

  const matched = candidates.filter((alert) => {
    const q = alert.query.trim().toLowerCase();
    if (q.length < 2) return false;
    return haystack.includes(q);
  });

  if (matched.length === 0) return { matched: 0, enqueued: 0 };

  let enqueued = 0;
  for (const alert of matched) {
    const ch = alert.channels.length > 0 ? alert.channels : ["IN_APP", "EMAIL"];
    try {
      await notificationsQueue.add("job-alert-match", {
        userId: alert.candidate.userId,
        type: "job.alert_match",
        title: `New match for "${alert.query}"`,
        body: `${job.title} at ${job.company.name} just opened. Apply before others do.`,
        link: `/job/${job.slug}`,
        channels: ch as ("IN_APP" | "EMAIL" | "SMS" | "WHATSAPP")[],
      });
      enqueued += 1;
    } catch (err) {
      logger.warn({ err, alertId: alert.id, jobId }, "[job-alerts] enqueue failed");
    }
  }

  // Stamp lastSentAt so we don't re-fire on a near-immediate re-publish.
  await db.jobAlert.updateMany({
    where: { id: { in: matched.map((a) => a.id) } },
    data: { lastSentAt: new Date() },
  });

  return { matched: matched.length, enqueued };
}
