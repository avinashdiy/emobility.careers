import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  competitionTicksQueue,
  notificationsQueue,
  QueueNames,
  type CompetitionTickJob,
} from "@/lib/queues";

const TICK_EVERY_MS = 30 * 60 * 1000; // 30 minutes — competitions move on hour scale

/**
 * Time-driven competition lifecycle:
 *   - APPROVED + publishedAt ≤ now           → flip to LIVE
 *   - LIVE + endsAt < now                    → flip to JUDGING
 *   - LIVE + registrationClosesAt just passed → ping host so they can move judges in
 *   - LIVE + final stage endsAt < now − 24h  → ping registrants to remind them about results
 *
 * Results announcement remains a manual host action (announceResults server
 * action) — we never auto-publish results since rank assignment is human work.
 */
export async function dispatchCompetitionTicks() {
  const now = new Date();

  const dueLive = await db.competition.findMany({
    where: { status: "APPROVED", publishedAt: { lte: now } },
    select: { id: true, slug: true, postedById: true, title: true },
    take: 50,
  });
  for (const c of dueLive) {
    await db.competition.update({ where: { id: c.id }, data: { status: "LIVE" } });
    await notificationsQueue.add("competition.live", {
      userId: c.postedById,
      type: "competition.live",
      title: `"${c.title}" is now live`,
      body: "Registrations are open.",
      link: `/competitions/${c.slug}`,
    });
  }

  const dueJudging = await db.competition.findMany({
    where: { status: "LIVE", endsAt: { lt: now } },
    select: { id: true, slug: true, postedById: true, title: true },
    take: 50,
  });
  for (const c of dueJudging) {
    await db.competition.update({ where: { id: c.id }, data: { status: "JUDGING" } });
    await notificationsQueue.add("competition.judging", {
      userId: c.postedById,
      type: "competition.judging",
      title: `Time to judge "${c.title}"`,
      body: "The competition has ended. Score submissions and announce results.",
      link: `/employer/competitions/${c.id}/judge`,
      channels: ["IN_APP", "EMAIL"],
    });
  }

  return { wentLive: dueLive.length, intoJudging: dueJudging.length };
}

export function startCompetitionTicksWorker() {
  const worker = new Worker<CompetitionTickJob>(
    QueueNames.CompetitionTicks,
    async () => {
      const result = await dispatchCompetitionTicks();
      logger.info(result, "[competition-ticks] tick complete");
      return result;
    },
    { connection: redis, concurrency: 1 },
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, "[competition-ticks] failed"),
  );
  void competitionTicksQueue.add(
    "tick",
    { tick: true },
    { repeat: { every: TICK_EVERY_MS }, jobId: "competition-ticks-tick" },
  );
  return worker;
}
