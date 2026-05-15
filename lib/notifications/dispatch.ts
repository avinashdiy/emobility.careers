import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notificationsQueue, type NotificationsJob } from "@/lib/queues";
import {
  realtime,
  channels as rtChannels,
  events as rtEvents,
} from "@/lib/realtime";

/**
 * Synchronous in-app notification + async fan-out to email/SMS/WhatsApp.
 *
 * The previous shape — `notificationsQueue.add(name, payload)` from
 * the server actions — meant the IN_APP row was written by the BullMQ
 * worker process, NOT the action. If the worker container was offline
 * (Redis hiccup, worker crash-loop, undeployed) the user's like /
 * comment / job-apply event silently produced no inbox row and no
 * bell badge, even though the action itself succeeded. Recruiters
 * reported this as "notifications don't work".
 *
 * `dispatchNotification` writes the IN_APP row inline and fires the
 * realtime push from the action's request, so the user sees the
 * notification as soon as their browser loads `/me/notifications`
 * (and the live bell-badge updates over the Soketi channel). The
 * worker stays responsible for the non-IN_APP channels — those are
 * fan-out work that's correctly async, and a Redis outage there just
 * means "no email this time", not "no notification at all".
 *
 * Idempotency: when both IN_APP and EMAIL are requested, we write the
 * IN_APP row here AND enqueue a job with `channels = ['EMAIL']` so
 * the worker doesn't double-write the row.
 */
const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export async function dispatchNotification(job: NotificationsJob): Promise<void> {
  const {
    userId,
    type,
    title,
    body,
    link,
    payload,
    channels: ch = ["IN_APP"],
    actorId,
    groupKey,
    expiresAt: expiresAtOverride,
  } = job;

  if (ch.includes("IN_APP")) {
    try {
      const expiresAt = expiresAtOverride
        ? new Date(expiresAtOverride)
        : new Date(Date.now() + DEFAULT_TTL_MS);
      const created = await db.notification.create({
        data: {
          userId,
          actorId: actorId ?? null,
          type,
          title,
          body,
          link,
          payload: payload ? (payload as object) : undefined,
          channel: "IN_APP",
          sentAt: new Date(),
          groupKey: groupKey ?? null,
          expiresAt,
        },
        select: { id: true },
      });
      // Realtime push lets the bell badge / inbox update without a
      // page reload. Best-effort: Soketi being down shouldn't fail
      // the action — the user will still see the row on next refresh.
      try {
        await realtime.trigger(rtChannels.user(userId), rtEvents.notification, {
          id: created.id,
          type,
          title,
          body,
          link,
          actorId: actorId ?? null,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.warn(
          { err, userId },
          "[dispatchNotification] realtime push failed (row still written)",
        );
      }
    } catch (err) {
      // The action that called us has already mutated state (a
      // reaction was recorded, a comment landed, an application was
      // submitted). We don't throw — that would imply the action
      // failed, when only the side-channel notification did. Log
      // loudly so the issue surfaces in /admin/operations.
      logger.error(
        { err, userId, type, title },
        "[dispatchNotification] in-app row write failed",
      );
    }
  }

  // Fan-out to non-IN_APP channels via the BullMQ worker. Strip
  // IN_APP from the channels list so the worker doesn't write a
  // duplicate row when it processes the job.
  const queueChannels = ch.filter((c) => c !== "IN_APP");
  if (queueChannels.length > 0) {
    try {
      await notificationsQueue.add(type, { ...job, channels: queueChannels });
    } catch (err) {
      // Worker enqueue failure shouldn't cascade — the IN_APP row is
      // already written, the user knows. Email/SMS may be missed
      // until the next event of the same kind.
      logger.warn(
        { err, userId, type },
        "[dispatchNotification] queue enqueue failed (in-app row already written)",
      );
    }
  }
}
