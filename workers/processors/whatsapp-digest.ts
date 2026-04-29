import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  whatsappDigestQueue,
  QueueNames,
  type WhatsAppDigestJob,
} from "@/lib/queues";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/send";
import { env } from "@/lib/env";
import { WhatsAppSubscriptionStatus, type Prisma } from "@prisma/client";

/**
 * WhatsApp daily digest worker.
 *
 * Strategy:
 *   • Tick every 30 minutes — cheap because we early-return on
 *     subscriptions already sent today.
 *   • For each ACTIVE subscription whose `lastSentAt` < start-of-today
 *     (Asia/Kolkata), pull the top 5 OPEN jobs published in the last
 *     7 days that match the subscriber's filters.
 *   • Compose 5 short job-line strings + a tracked unsubscribe URL,
 *     then call sendWhatsAppTemplate using the pre-approved utility
 *     template (template name from env).
 *   • On send success: stamp lastSentAt + reset failedSendsInARow.
 *   • On send failure: increment failedSendsInARow; on the 5th
 *     consecutive failure flip status → PAUSED so we stop burning
 *     Cloud-API credits on a dead number.
 *
 * Self-scheduling: we register a single repeat job at boot via
 * `whatsappDigestQueue.add("tick", {tick:true}, {repeat:{every:…}, jobId})`.
 * Same pattern as the existing interview-reminders worker.
 */

const TICK_EVERY_MS = 30 * 60 * 1000; // every 30 minutes
const MAX_PER_TICK = 200; // cap how many sends per tick to avoid burst
const FAIL_AUTO_PAUSE = 5;

/**
 * Compute "start of today" in IST (UTC+5:30) — the platform is India-
 * focused and a 9am-IST send beats a 9am-server-local one.
 */
function startOfTodayIST(): Date {
  const now = new Date();
  // Shift to IST then truncate to midnight, shift back.
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  const istDate = new Date(istMs);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - 5.5 * 60 * 60 * 1000);
}

/**
 * Render a single job into a short line for the digest body. Kept under
 * 80 chars so the WhatsApp template doesn't visually truncate.
 *
 *   "Battery Engineer · Ola Electric · Bengaluru · ₹12-22L"
 */
function jobLine(job: {
  title: string;
  company: { name: string };
  locations: string[];
  workMode: string;
  salaryMin: { toString(): string } | null;
  salaryMax: { toString(): string } | null;
  salaryHidden: boolean;
}): string {
  const loc = job.locations[0] ?? job.workMode.toLowerCase();
  const salary =
    !job.salaryHidden && job.salaryMin && job.salaryMax
      ? ` · ₹${Math.round(Number(job.salaryMin) / 100000)}-${Math.round(Number(job.salaryMax) / 100000)}L`
      : "";
  const line = `${job.title} · ${job.company.name} · ${loc}${salary}`;
  return line.length > 80 ? line.slice(0, 77) + "…" : line;
}

export async function dispatchWhatsAppDigests() {
  const cutoff = startOfTodayIST();
  // Only ACTIVE subs that haven't received today's digest yet.
  const subs = await db.whatsAppDigestSubscription.findMany({
    where: {
      status: WhatsAppSubscriptionStatus.ACTIVE,
      OR: [{ lastSentAt: null }, { lastSentAt: { lt: cutoff } }],
    },
    take: MAX_PER_TICK,
  });
  if (subs.length === 0) return { sent: 0, failed: 0, paused: 0 };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  let sent = 0;
  let failed = 0;
  let paused = 0;

  for (const sub of subs) {
    // Build the per-subscriber filter. Empty domain list = no domain
    // filter (gets all jobs).
    const where: Prisma.JobPostingWhereInput = {
      status: "OPEN",
      audience: "PUBLIC",
      publishedAt: { gte: sevenDaysAgo },
    };
    if (sub.evDomainSlugs.length > 0) {
      where.evDomains = { some: { evDomain: { slug: { in: sub.evDomainSlugs } } } };
    }
    if (sub.location) {
      where.locations = { has: sub.location };
    }
    if (sub.profileMode) {
      where.profileMode = sub.profileMode;
    }

    const jobs = await db.jobPosting.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        locations: true,
        workMode: true,
        salaryMin: true,
        salaryMax: true,
        salaryHidden: true,
        company: { select: { name: true } },
      },
    });

    // Skip if there's nothing fresh — don't spam users with "no jobs
    // today" messages. We DON'T stamp lastSentAt so they're picked up
    // again later in the day if new jobs land.
    if (jobs.length === 0) continue;

    const lines = jobs.map(jobLine);
    // Pad to 5 lines so the template's 5 body params are always satisfied.
    while (lines.length < 5) lines.push("—");

    const unsubUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/digest/unsubscribe?t=${encodeURIComponent(sub.unsubscribeToken)}`;

    const result = await sendWhatsAppTemplate({
      to: sub.phone,
      templateName: env.WHATSAPP_DIGEST_TEMPLATE,
      bodyParams: lines,
      urlButtonParam: unsubUrl,
    });

    if (result.ok) {
      await db.whatsAppDigestSubscription.update({
        where: { id: sub.id },
        data: { lastSentAt: new Date(), failedSendsInARow: 0 },
      });
      sent += 1;
    } else {
      const nextFail = sub.failedSendsInARow + 1;
      const shouldPause = nextFail >= FAIL_AUTO_PAUSE;
      await db.whatsAppDigestSubscription.update({
        where: { id: sub.id },
        data: {
          failedSendsInARow: nextFail,
          status: shouldPause ? WhatsAppSubscriptionStatus.PAUSED : sub.status,
        },
      });
      if (shouldPause) paused += 1;
      failed += 1;
    }
  }

  return { sent, failed, paused };
}

export function startWhatsAppDigestWorker() {
  const worker = new Worker<WhatsAppDigestJob>(
    QueueNames.WhatsAppDigest,
    async () => {
      const result = await dispatchWhatsAppDigests();
      logger.info(result, "[whatsapp-digest] tick complete");
      return result;
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, "[whatsapp-digest] failed"),
  );

  // Self-scheduling repeat job. Same pattern as interview-reminders.
  void whatsappDigestQueue.add(
    "tick",
    { tick: true },
    {
      repeat: { every: TICK_EVERY_MS },
      jobId: "whatsapp-digest-tick",
    },
  );

  return worker;
}
