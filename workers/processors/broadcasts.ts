import { Worker } from "bullmq";
import type { Prisma } from "@prisma/client";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notificationsQueue, QueueNames, type BroadcastJob } from "@/lib/queues";

/**
 * Broadcast fanout — reads the targeting filter, paginates user IDs, and
 * queues an individual notification job per recipient. The notifications
 * worker handles in-app + email/SMS dispatch with the user's preferences.
 */

function whereForTarget(target: string): Prisma.UserWhereInput {
  switch (target) {
    case "ALL_USERS":
      return { status: "ACTIVE" };
    case "ALL_CANDIDATES":
      return { status: "ACTIVE", role: "CANDIDATE" };
    case "ALL_EMPLOYERS":
      return { status: "ACTIVE", role: "EMPLOYER" };
    case "DIYGURU_VERIFIED":
      return { status: "ACTIVE", role: "CANDIDATE", candidateProfile: { isDIYguruVerified: true } };
    case "OPEN_TO_WORK":
      return { status: "ACTIVE", role: "CANDIDATE", candidateProfile: { openToWork: true } };
    case "EMPLOYERS_VERIFIED":
      return {
        status: "ACTIVE",
        role: "EMPLOYER",
        employerProfile: { company: { verificationStatus: "VERIFIED" } },
      };
    default:
      return { status: "ACTIVE" };
  }
}

export function startBroadcastsWorker() {
  const worker = new Worker<BroadcastJob>(
    QueueNames.Broadcasts,
    async (job) => {
      const { broadcastId } = job.data;
      const broadcast = await db.broadcast.findUnique({ where: { id: broadcastId } });
      if (!broadcast) return { ok: false, reason: "not-found" };

      const where = whereForTarget(broadcast.target);
      const total = await db.user.count({ where });
      await db.broadcast.update({
        where: { id: broadcastId },
        data: { recipientCount: total },
      });

      // Paginate by id to keep memory bounded for large audiences.
      let cursor: string | undefined;
      let sent = 0;
      const PAGE = 500;
      // Cap to a sane upper bound so a misclick doesn't email 10M people.
      const MAX_RECIPIENTS = 50_000;
      while (sent < MAX_RECIPIENTS) {
        const batch = await db.user.findMany({
          where,
          select: { id: true },
          orderBy: { id: "asc" },
          take: PAGE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (batch.length === 0) break;

        // Enqueue one notification job per user
        await notificationsQueue.addBulk(
          batch.map((u) => ({
            name: "broadcast",
            data: {
              userId: u.id,
              type: "platform.broadcast",
              title: broadcast.title,
              body: broadcast.body,
              link: broadcast.link ?? undefined,
              channels: broadcast.channels,
              payload: { broadcastId },
            },
          })),
        );
        sent += batch.length;
        cursor = batch[batch.length - 1].id;
        if (batch.length < PAGE) break;
      }

      await db.broadcast.update({
        where: { id: broadcastId },
        data: {
          status: "SENT",
          sentCount: sent,
          completedAt: new Date(),
        },
      });
      logger.info({ broadcastId, recipients: sent }, "[broadcasts] fanout complete");
      return { ok: true, sent };
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on("failed", async (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "[broadcasts] failed");
    if (job?.data.broadcastId) {
      await db.broadcast.update({
        where: { id: job.data.broadcastId },
        data: { status: "FAILED", completedAt: new Date() },
      }).catch(() => {});
    }
  });

  return worker;
}
