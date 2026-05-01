import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  mentorshipRemindersQueue,
  notificationsQueue,
  QueueNames,
  type MentorshipReminderJob,
} from "@/lib/queues";
import { formatDateTime } from "@/lib/utils";

const TICK_EVERY_MS = 10 * 60 * 1000;

/**
 * Sends 24h-out and 1h-out reminders for upcoming CONFIRMED mentorship
 * sessions. Mirrors the interview-reminders worker — the marker columns
 * (`reminderDayBeforeSentAt`, `reminderHourBeforeSentAt`) make each ping
 * exactly-once.
 */
export async function dispatchMentorshipReminders() {
  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const windowDayLow = new Date(now.getTime() + 22 * 60 * 60 * 1000);

  const dueDay = await db.mentorshipSession.findMany({
    where: {
      status: "CONFIRMED",
      reminderDayBeforeSentAt: null,
      scheduledAt: { gte: windowDayLow, lte: in24h },
    },
    include: {
      mentor: { select: { userId: true, headline: true } },
      mentee: { select: { id: true, candidateProfile: { select: { firstName: true } } } },
    },
    take: 200,
  });
  for (const s of dueDay) {
    await notificationsQueue.add("mentorship-reminder-24h-mentee", {
      userId: s.menteeUserId,
      type: "mentorship.reminder_24h",
      title: `Mentorship session tomorrow`,
      body: `${formatDateTime(s.scheduledAt)} · ${s.mode} · with ${s.mentor.headline}`,
      link: "/me/sessions",
      channels: ["IN_APP", "EMAIL"],
    });
    await notificationsQueue.add("mentorship-reminder-24h-mentor", {
      userId: s.mentor.userId,
      type: "mentorship.reminder_24h",
      title: `You have a mentorship session tomorrow`,
      body: `${formatDateTime(s.scheduledAt)} · ${s.mode} · ${s.topic.slice(0, 80)}`,
      link: "/me/mentor/sessions",
      channels: ["IN_APP", "EMAIL"],
    });
    // Belt-and-braces: if the booking-flow calendar email failed at
    // create time (provider outage, MinIO downtime, etc.) we fire it
    // here on the T-24h tick so attendees still get the ICS in time
    // to add the session to their calendar before it starts.
    if (!s.calendarInviteSentAt) {
      try {
        const { sendCalendarInviteForSession } = await import("@/server/mentorship/actions");
        await sendCalendarInviteForSession(s.id);
      } catch (err) {
        logger.warn({ err, sessionId: s.id }, "[mentorship-reminders] late ICS failed");
      }
    }
    await db.mentorshipSession.update({ where: { id: s.id }, data: { reminderDayBeforeSentAt: new Date() } });
  }

  const dueHour = await db.mentorshipSession.findMany({
    where: {
      status: "CONFIRMED",
      reminderHourBeforeSentAt: null,
      scheduledAt: { gte: now, lte: in1h },
    },
    include: { mentor: { select: { userId: true } } },
    take: 200,
  });
  for (const s of dueHour) {
    await notificationsQueue.add("mentorship-reminder-1h-mentee", {
      userId: s.menteeUserId,
      type: "mentorship.reminder_1h",
      title: `Mentorship session in 1 hour`,
      body: `${formatDateTime(s.scheduledAt)}${s.meetingUrl ? ` · ${s.meetingUrl}` : ""}`,
      link: "/me/sessions",
      channels: ["IN_APP", "EMAIL", "SMS"],
    });
    await notificationsQueue.add("mentorship-reminder-1h-mentor", {
      userId: s.mentor.userId,
      type: "mentorship.reminder_1h",
      title: `Mentorship session in 1 hour`,
      body: `${formatDateTime(s.scheduledAt)}${s.meetingUrl ? ` · ${s.meetingUrl}` : ""}`,
      link: "/me/mentor/sessions",
      channels: ["IN_APP", "EMAIL", "SMS"],
    });
    await db.mentorshipSession.update({ where: { id: s.id }, data: { reminderHourBeforeSentAt: new Date() } });
  }

  return { dayBefore: dueDay.length, hourBefore: dueHour.length };
}

export function startMentorshipRemindersWorker() {
  const worker = new Worker<MentorshipReminderJob>(
    QueueNames.MentorshipReminders,
    async () => {
      const result = await dispatchMentorshipReminders();
      logger.info(result, "[mentorship-reminders] tick complete");
      return result;
    },
    { connection: redis, concurrency: 1 },
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, "[mentorship-reminders] failed"),
  );
  void mentorshipRemindersQueue.add(
    "tick",
    { tick: true },
    { repeat: { every: TICK_EVERY_MS }, jobId: "mentorship-reminders-tick" },
  );
  return worker;
}
