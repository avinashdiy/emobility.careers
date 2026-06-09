/**
 * Pre-event reminder ticker for recruitment fairs (Recruitathon).
 *
 * Walks every active RecruitmentDriveRegistration and fires three
 * pre-event reminders at T-7 days, T-3 days, and T-1 day relative
 * to the fair's startsAt. Marker columns (reminderXSentAt) prevent
 * duplicate sends — the worker is idempotent under repeated ticks.
 *
 * Mirrors the pattern in workers/processors/interview-reminders.ts —
 * tick every 10 minutes from the worker entry point, find rows in
 * the appropriate window, enqueue a notification job per registrant,
 * stamp the marker so we don't ping again.
 *
 * Channels per reminder: IN_APP + EMAIL by default. SMS / WHATSAPP
 * are intentionally NOT enabled here — they pile up on the user's
 * phone over the 7-day window and erode goodwill. The day-of
 * "you're checking in soon" reminder (T-1) is a candidate for SMS
 * but we keep that to admin-broadcast instead so the placement
 * team controls the messaging.
 */

import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  fairRemindersQueue,
  notificationsQueue,
  QueueNames,
  type FairReminderJob,
} from "@/lib/queues";

const TICK_EVERY_MS = 10 * 60 * 1000; // 10 minutes

// Reminder definitions. Each tuple: (marker column, offset hours,
// window-low hours, window-high hours, title-template, body-template).
// The marker column ensures one-and-done; the window covers ±2-12 hr
// around the target so a worker that's been offline for an hour
// still catches due rows.
//
// Phase 1 hybrid — `buildBody` receives the registration's `fairMode`
// so the copy can branch:
//   OFFLINE → venue address copy ("plan your travel to Pune")
//   ONLINE  → Meet-link copy ("your interview slots have join links
//             on your fair pass")
//   HYBRID / null → blended copy that mentions both paths
type FairMode = "OFFLINE" | "ONLINE" | "HYBRID" | null;

type ReminderDef = {
  marker: "reminderWeekBeforeSentAt" | "reminder3DaysSentAt" | "reminderDayBeforeSentAt" | "reminderHourBeforeSentAt";
  windowFromHours: number;
  windowToHours: number;
  type: string;
  buildBody: (args: {
    driveTitle: string;
    checkInCode: string;
    place: string;
    fairMode: FairMode;
  }) => { title: string; body: string };
};

const REMINDERS: ReminderDef[] = [
  {
    marker: "reminderWeekBeforeSentAt",
    windowFromHours: 7 * 24 - 6,
    windowToHours: 7 * 24 + 6,
    type: "fair.reminder_week",
    buildBody: ({ driveTitle }) => ({
      title: `${driveTitle} is a week away`,
      body: "One week to go. Make sure your profile + résumé are up to date so recruiters can find you on the day.",
    }),
  },
  {
    marker: "reminder3DaysSentAt",
    windowFromHours: 3 * 24 - 6,
    windowToHours: 3 * 24 + 6,
    type: "fair.reminder_3days",
    buildBody: ({ driveTitle, place, fairMode }) => ({
      title: `${driveTitle} — 3 days to go`,
      body:
        fairMode === "ONLINE"
          ? "Online attendees: pre-book interview slots from the fair page so the in-demand recruiters don't fill up. Meet links will be on each booked slot in your fair pass."
          : fairMode === "OFFLINE"
            ? `Plan your travel to ${place}. Pre-book any interview slots from the fair page so the in-demand booths don't fill up.`
            : `Plan your trip to ${place} (or your virtual setup). Pre-book interview slots from the fair page so the in-demand booths don't fill up.`,
    }),
  },
  {
    marker: "reminderDayBeforeSentAt",
    windowFromHours: 24 - 4,
    windowToHours: 24 + 4,
    type: "fair.reminder_day_before",
    buildBody: ({ driveTitle, checkInCode, fairMode }) => ({
      title: `${driveTitle} is tomorrow`,
      body:
        fairMode === "ONLINE"
          ? `Open your fair pass tomorrow — your booked interview slots have Join buttons that activate 30 min before each slot. Test your camera + mic now if you haven't already.`
          : `Save your check-in code ${checkInCode} and your fair pass for offline use. We'll see you tomorrow!`,
    }),
  },
  {
    marker: "reminderHourBeforeSentAt",
    windowFromHours: 1,
    windowToHours: 3,
    type: "fair.reminder_hour_before",
    buildBody: ({ driveTitle, checkInCode, place, fairMode }) => ({
      title:
        fairMode === "ONLINE"
          ? `${driveTitle} starts soon — open your fair pass`
          : `Heading to ${driveTitle}?`,
      body:
        fairMode === "ONLINE"
          ? `Doors open soon. Open your fair pass and watch for Join buttons on your booked slots — they activate 30 min before each slot.`
          : `Doors open soon. Your check-in code is ${checkInCode}. Venue: ${place}.`,
    }),
  },
];

/**
 * One sweep. Iterates each reminder window, finds due un-stamped
 * registrations, enqueues notifications, and stamps the marker. Pulls
 * up to 1000 rows per sweep per window — sufficient for any single
 * Recruitathon edition (Delhi + Pune are each ~1k-3k registrants).
 */
export async function dispatchFairReminders() {
  const now = Date.now();
  for (const r of REMINDERS) {
    // Window = (startsAt - windowTo) <= now <= (startsAt - windowFrom)
    // → startsAt is in [now + windowFrom, now + windowTo].
    const lo = new Date(now + r.windowFromHours * 60 * 60 * 1000);
    const hi = new Date(now + r.windowToHours * 60 * 60 * 1000);

    const due = await db.recruitmentDriveRegistration.findMany({
      where: {
        [r.marker]: null,
        cancelledAt: null,
        drive: {
          status: { in: ["OPEN", "IN_PROGRESS"] },
          startsAt: { gte: lo, lte: hi },
        },
      },
      take: 1000,
      select: {
        id: true,
        checkInCode: true,
        // Phase 1 hybrid — fairMode drives the mode-aware copy branch.
        fairMode: true,
        candidate: { select: { userId: true } },
        drive: { select: { id: true, slug: true, title: true, city: true, state: true } },
      },
    });

    if (due.length === 0) continue;

    for (const reg of due) {
      const place = [reg.drive.city, reg.drive.state].filter(Boolean).join(", ");
      const { title, body } = r.buildBody({
        driveTitle: reg.drive.title,
        checkInCode: reg.checkInCode,
        place,
        fairMode: reg.fairMode,
      });
      try {
        await notificationsQueue.add(`fair-reminder-${r.marker}`, {
          userId: reg.candidate.userId,
          type: r.type,
          title,
          body,
          link: `/me/fairs/${reg.drive.slug}/pass`,
          channels: ["IN_APP", "EMAIL"],
          payload: { driveId: reg.drive.id, registrationId: reg.id, marker: r.marker },
        });
        await db.recruitmentDriveRegistration.update({
          where: { id: reg.id },
          data: { [r.marker]: new Date() },
        });
      } catch (err) {
        logger.warn({ err, regId: reg.id, marker: r.marker }, "[fair-reminders] dispatch failed");
      }
    }

    logger.info({ marker: r.marker, count: due.length }, "[fair-reminders] enqueued");
  }
}

export function startFairRemindersWorker() {
  const worker = new Worker<FairReminderJob>(
    QueueNames.FairReminders,
    async () => {
      await dispatchFairReminders();
      return { ok: true };
    },
    { connection: redis, concurrency: 1 },
  );

  // Self-schedule the next tick. Same pattern as the other tick
  // workers — first tick fires on worker startup, then every
  // TICK_EVERY_MS thereafter.
  void fairRemindersQueue.add(
    "tick",
    { tick: true },
    { jobId: "fair-reminders-bootstrap", removeOnComplete: true, removeOnFail: true },
  ).catch(() => undefined);

  void fairRemindersQueue.add(
    "tick",
    { tick: true },
    {
      repeat: { every: TICK_EVERY_MS },
      jobId: "fair-reminders-tick",
      removeOnComplete: true,
      removeOnFail: true,
    },
  ).catch(() => undefined);

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "[fair-reminders] tick failed");
  });

  return worker;
}
