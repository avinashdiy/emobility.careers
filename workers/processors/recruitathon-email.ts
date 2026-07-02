import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { QueueNames, type RecruitathonEmailJob } from "@/lib/queues";
import { sendMail } from "@/lib/mail";

/**
 * Recruitathon bulk-email sender. One job per campaign. Paginates the
 * campaign's PENDING recipients and sends each via SES (kind "bulk"),
 * persisting the SES MessageId per recipient so the delivery webhook can
 * attribute delivery/bounce/complaint events back to it.
 *
 * Idempotent + resumable: only PENDING recipients are picked up, so a
 * retry (or a re-send of a FAILED campaign) continues where it stopped
 * without re-emailing anyone who already got it.
 */

const BATCH = 200;
const THROTTLE_MS = Number(process.env.RECRUITATHON_EMAIL_THROTTLE_MS ?? 130); // ~7-8/sec, under typical SES caps

function wrapBody(bodyHtml: string): string {
  return `${bodyHtml}<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"><p style="color:#6b7280;font-size:12px;">You're receiving this because you registered interest in the Bharat eMobility Recruitathon 2026. If you'd prefer not to receive these emails, reply to this message and we'll remove you.</p>`;
}

export function startRecruitathonEmailWorker() {
  const worker = new Worker<RecruitathonEmailJob>(
    QueueNames.RecruitathonEmail,
    async (job) => {
      const { campaignId } = job.data;
      const campaign = await db.recruitathonEmailCampaign.findUnique({ where: { id: campaignId } });
      if (!campaign) {
        logger.warn({ campaignId }, "[recruitathon-email] campaign not found — skip");
        return;
      }
      if (campaign.status !== "SENDING") {
        logger.warn({ campaignId, status: campaign.status }, "[recruitathon-email] campaign not SENDING — skip");
        return;
      }
      const html = wrapBody(campaign.bodyHtml);

      let sentThisRun = 0;
      let failedThisRun = 0;
      for (;;) {
        const batch = await db.recruitathonEmailRecipient.findMany({
          where: { campaignId, status: "PENDING" },
          orderBy: { id: "asc" },
          take: BATCH,
        });
        if (batch.length === 0) break;

        for (const r of batch) {
          try {
            const res = await sendMail({ to: r.email, subject: campaign.subject, html, kind: "bulk" });
            await db.recruitathonEmailRecipient.update({
              where: { id: r.id },
              data: { status: "SENT", providerMessageId: res.providerMessageId ?? null, sentAt: new Date(), error: null },
            });
            sentThisRun++;
          } catch (err) {
            await db.recruitathonEmailRecipient
              .update({
                where: { id: r.id },
                data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 500) : String(err) },
              })
              .catch(() => {});
            failedThisRun++;
          }
          if (THROTTLE_MS > 0) await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
        }
      }

      // Final tallies from the source of truth (all attempts, not just this run).
      const grouped = await db.recruitathonEmailRecipient.groupBy({
        by: ["status"],
        where: { campaignId },
        _count: true,
      });
      const count = (s: string) => grouped.find((g) => g.status === s)?._count ?? 0;
      await db.recruitathonEmailCampaign.update({
        where: { id: campaignId },
        data: {
          status: "SENT",
          completedAt: new Date(),
          sentCount: count("SENT") + count("DELIVERED") + count("BOUNCED") + count("COMPLAINED"),
          failedCount: count("FAILED"),
        },
      });
      logger.info({ campaignId, sentThisRun, failedThisRun }, "[recruitathon-email] send complete");
      return { ok: true, sent: sentThisRun, failed: failedThisRun };
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on("failed", async (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "[recruitathon-email] job failed");
    if (job?.data.campaignId) {
      await db.recruitathonEmailCampaign
        .update({ where: { id: job.data.campaignId }, data: { status: "FAILED", completedAt: new Date() } })
        .catch(() => {});
    }
  });

  return worker;
}
