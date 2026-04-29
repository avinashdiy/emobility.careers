import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  interviewRemindersQueue,
  notificationsQueue,
  QueueNames,
  type InterviewReminderJob,
} from "@/lib/queues";
import { formatDateTime } from "@/lib/utils";

const TICK_EVERY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Looks for SCHEDULED interviews coming up in the next 24h or 1h that haven't
 * had the corresponding reminder fired yet. Idempotent: marker columns ensure
 * we don't ping twice for the same interview at the same window.
 */
export async function dispatchInterviewReminders() {
  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // 24-hour-out reminders: send between [now+22h, now+26h] window once
  const windowDayLow = new Date(now.getTime() + 22 * 60 * 60 * 1000);
  const dueDayBefore = await db.interview.findMany({
    where: {
      status: "SCHEDULED",
      reminderDayBeforeSentAt: null,
      scheduledAt: { gte: windowDayLow, lte: in24h },
    },
    include: {
      application: {
        include: {
          job: { select: { title: true } },
          candidate: { select: { user: { select: { id: true } } } },
        },
      },
    },
    take: 200,
  });

  for (const iv of dueDayBefore) {
    await notificationsQueue.add("interview-reminder-24h", {
      userId: iv.application.candidate.user.id,
      type: "interview.reminder_24h",
      title: `Interview tomorrow — ${iv.application.job.title}`,
      body: `${formatDateTime(iv.scheduledAt)} · ${iv.mode}${iv.meetingUrl ? ` · ${iv.meetingUrl}` : ""}`,
      link: "/me/interviews",
      channels: ["IN_APP", "EMAIL"],
    });
    await db.interview.update({
      where: { id: iv.id },
      data: { reminderDayBeforeSentAt: new Date() },
    });
  }

  // 1-hour-out reminders: send when scheduled in the next 70 minutes
  const dueHourBefore = await db.interview.findMany({
    where: {
      status: "SCHEDULED",
      reminderHourBeforeSentAt: null,
      scheduledAt: { gte: now, lte: in1h },
    },
    include: {
      application: {
        include: {
          job: { select: { title: true } },
          candidate: { select: { user: { select: { id: true } } } },
        },
      },
    },
    take: 200,
  });

  for (const iv of dueHourBefore) {
    await notificationsQueue.add("interview-reminder-1h", {
      userId: iv.application.candidate.user.id,
      type: "interview.reminder_1h",
      title: `Interview in 1 hour — ${iv.application.job.title}`,
      body: `${formatDateTime(iv.scheduledAt)} · ${iv.mode}${iv.meetingUrl ? ` · ${iv.meetingUrl}` : ""}`,
      link: "/me/interviews",
      channels: ["IN_APP", "EMAIL", "SMS"],
    });
    await db.interview.update({
      where: { id: iv.id },
      data: { reminderHourBeforeSentAt: new Date() },
    });
  }

  return { dayBefore: dueDayBefore.length, hourBefore: dueHourBefore.length };
}

export function startInterviewRemindersWorker() {
  // Self-scheduling repeatable job. We don't use BullMQ's `repeat` because
  // re-scheduling on every worker boot is simpler than auditing repeat keys.
  const worker = new Worker<InterviewReminderJob>(
    QueueNames.InterviewReminders,
    async () => {
      const result = await dispatchInterviewReminders();
      logger.info(result, "[interview-reminders] tick complete");
      return result;
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, "[interview-reminders] failed"),
  );

  // Ensure a single repeat job is registered.
  void interviewRemindersQueue.add(
    "tick",
    { tick: true },
    {
      repeat: { every: TICK_EVERY_MS },
      jobId: "interview-reminders-tick",
    },
  );

  return worker;
}
