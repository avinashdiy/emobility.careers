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
 *   - LIVE + registrationClosesAt T-7d/T-1d → captain reminder
 *   - LIVE + endsAt T-3d                     → captain submission reminder
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

  // Captain reminders for team-based competitions. We send three
  // distinct nudges per team:
  //
  //   • Registration-close T-7d  →  "Add the rest of your team."
  //   • Registration-close T-1d  →  "Last day to add members."
  //   • Submission-close T-3d    →  "Submit your prototype video."
  //
  // Idempotency: BullMQ + the `notification.dedupe` `type` field
  // protect us from duplicate sends within a tick window. We send
  // once per (team, kind) by keying the notification's groupKey on
  // the team id + kind — the notifications worker dedupes on this.
  const remindersFired = await dispatchCaptainReminders(now);

  return {
    wentLive: dueLive.length,
    intoJudging: dueJudging.length,
    captainReminders: remindersFired,
  };
}

/**
 * Send T-7d / T-1d / T-3d captain reminders. Each reminder runs as
 * its own narrow query so a backlog on one kind doesn't block the
 * others. The 30-min tick cadence means each reminder fires within
 * ±15 min of the target time — close enough.
 */
async function dispatchCaptainReminders(now: Date): Promise<{ regClose7d: number; regClose1d: number; subClose3d: number }> {
  const t7d = 7 * 24 * 60 * 60 * 1000;
  const t1d = 1 * 24 * 60 * 60 * 1000;
  const t3d = 3 * 24 * 60 * 60 * 1000;
  const tick = 35 * 60 * 1000; // window slightly larger than the 30-min cadence

  // Helper — run one reminder kind, return count.
  const fireReminder = async (params: {
    kind: "registration_close_7d" | "registration_close_1d" | "submission_close_3d";
    centerTimeOffsetMs: number;
    competitionDateField: "registrationClosesAt" | "endsAt";
    titleFn: (compTitle: string) => string;
    bodyFn: (compTitle: string) => string;
  }): Promise<number> => {
    const target = new Date(now.getTime() + params.centerTimeOffsetMs);
    const lo = new Date(target.getTime() - tick / 2);
    const hi = new Date(target.getTime() + tick / 2);
    const teams = await db.competitionRegistration.findMany({
      where: {
        competition: {
          status: "LIVE",
          isTeamBased: true,
          [params.competitionDateField]: { gte: lo, lte: hi },
        },
      },
      select: {
        id: true,
        teamName: true,
        leaderUserId: true,
        competition: { select: { title: true, slug: true } },
      },
      take: 200,
    });
    for (const t of teams) {
      await notificationsQueue
        .add(`competition.captain-${params.kind}`, {
          userId: t.leaderUserId,
          type: `competition.captain_${params.kind}`,
          title: params.titleFn(t.competition.title),
          body: params.bodyFn(t.teamName ?? "your team"),
          link: `/me/teams/${t.id}`,
          channels: ["IN_APP", "EMAIL"],
          // groupKey deduplicates within the notifications worker —
          // we don't want a flapping 30-min tick to spam the captain
          // when the worker re-runs across the boundary.
          groupKey: `comp.${t.id}.${params.kind}`,
        })
        .catch(() => undefined);
    }
    return teams.length;
  };

  const regClose7d = await fireReminder({
    kind: "registration_close_7d",
    centerTimeOffsetMs: t7d,
    competitionDateField: "registrationClosesAt",
    titleFn: (c) => `Registration closes in 7 days for ${c}`,
    bodyFn: (team) => `Add the rest of ${team} before the cap closes — captain dashboard has the bulk-invite panel.`,
  });
  const regClose1d = await fireReminder({
    kind: "registration_close_1d",
    centerTimeOffsetMs: t1d,
    competitionDateField: "registrationClosesAt",
    titleFn: (c) => `Last day to add teammates for ${c}`,
    bodyFn: (team) => `Registration for ${team} closes in ~24 hours.`,
  });
  const subClose3d = await fireReminder({
    kind: "submission_close_3d",
    centerTimeOffsetMs: t3d,
    competitionDateField: "endsAt",
    titleFn: (c) => `Submission closes in 3 days for ${c}`,
    bodyFn: (team) => `Time to upload ${team}'s prototype video and write-up.`,
  });

  return { regClose7d, regClose1d, subClose3d };
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
