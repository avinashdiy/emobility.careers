import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notificationsQueue, type NotificationsJob } from "@/lib/queues";
import {
  realtime,
  channels as rtChannels,
  events as rtEvents,
} from "@/lib/realtime";
import type { NotificationTemplateChannel } from "@prisma/client";

// ─── Template resolution ──────────────────────────────────────────
//
// Admin-editable `NotificationTemplate` rows can override the title /
// body / channels at dispatch time. Lookup keyed by `type` — one
// template per key. Cached in-memory for 30s to bound DB pressure
// (these rows change once a quarter; per-call lookup would be wasteful).
//
// If no row exists (or it's marked inactive), behaviour is unchanged
// and the inline title/body wins. Templates are opt-in.

type CachedTemplate = {
  titleOverride: string | null;
  bodyOverride: string | null;
  channels: NotificationTemplateChannel[];
} | null; // null = explicitly known-absent (so we don't re-query)

const TEMPLATE_TTL_MS = 30_000;
const templateCache = new Map<string, { value: CachedTemplate; expiresAt: number }>();

async function resolveTemplate(type: string): Promise<CachedTemplate> {
  const cached = templateCache.get(type);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value: CachedTemplate = null;
  try {
    const row = await db.notificationTemplate.findUnique({
      where: { key: type },
      select: { active: true, titleOverride: true, bodyOverride: true, channels: true },
    });
    if (row && row.active) {
      value = {
        titleOverride: row.titleOverride,
        bodyOverride: row.bodyOverride,
        channels: row.channels,
      };
    }
  } catch (err) {
    // Defensive — if the lookup fails (DB hiccup, schema mismatch),
    // fall through to inline copy. Never block dispatch on this.
    logger.warn({ err, type }, "[dispatchNotification] template lookup failed");
  }
  templateCache.set(type, { value, expiresAt: Date.now() + TEMPLATE_TTL_MS });
  return value;
}

/**
 * Replace `{{key}}` placeholders in a template string using values
 * from `payload`, plus two special keys: `{{title}}` and `{{body}}`
 * which echo the inline values (lets a template wrap them, e.g.
 * "[emobility.careers] {{title}}").
 *
 * Unknown placeholders are left as-is so the admin sees them in
 * the rendered output — easier to debug than silently emptying them.
 */
function interpolate(
  template: string,
  args: { title: string; body?: string; payload?: Record<string, unknown> },
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (full, key) => {
    if (key === "title") return args.title;
    if (key === "body") return args.body ?? "";
    const v = args.payload?.[key];
    return v === undefined || v === null ? full : String(v);
  });
}

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
    title: inlineTitle,
    body: inlineBody,
    link,
    payload,
    channels: inlineChannels = ["IN_APP"],
    actorId,
    groupKey,
    expiresAt: expiresAtOverride,
  } = job;

  // Template override (opt-in per `type`). If a row exists AND it's
  // active, its title/body/channels supersede the inline call. This
  // keeps the dispatcher backward-compat: every existing call site
  // works unchanged unless admin opts in by creating a template row.
  const template = await resolveTemplate(type);
  const title = template?.titleOverride
    ? interpolate(template.titleOverride, { title: inlineTitle, body: inlineBody, payload })
    : inlineTitle;
  const body = template?.bodyOverride
    ? interpolate(template.bodyOverride, { title: inlineTitle, body: inlineBody, payload })
    : inlineBody;
  const ch =
    template?.channels && template.channels.length > 0
      ? (template.channels as unknown as typeof inlineChannels)
      : inlineChannels;

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
      // Per-channel dispatch log. SENT immediately for IN_APP since
      // we already wrote the row. Best-effort — log write failure
      // shouldn't break the notification.
      writeDispatchLog({ userId, type, channel: "IN_APP", title, body, status: "SENT" });
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
      writeDispatchLog({
        userId, type, channel: "IN_APP", title, body,
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fan-out to non-IN_APP channels via the BullMQ worker. Strip
  // IN_APP from the channels list so the worker doesn't write a
  // duplicate row when it processes the job.
  const queueChannels = ch.filter((c) => c !== "IN_APP");
  if (queueChannels.length > 0) {
    try {
      await notificationsQueue.add(type, {
        ...job,
        // Pass through the (possibly template-overridden) title/body
        // so the worker emits the same copy the user saw in-app.
        title,
        body,
        channels: queueChannels,
      });
      // Log one QUEUED row per channel. The worker should flip these
      // to SENT/FAILED after the provider call — that's a follow-up
      // (the worker currently doesn't write logs).
      for (const c of queueChannels) {
        writeDispatchLog({ userId, type, channel: c as NotificationTemplateChannel, title, body, status: "QUEUED" });
      }
    } catch (err) {
      // Worker enqueue failure shouldn't cascade — the IN_APP row is
      // already written, the user knows. Email/SMS may be missed
      // until the next event of the same kind.
      logger.warn(
        { err, userId, type },
        "[dispatchNotification] queue enqueue failed (in-app row already written)",
      );
      for (const c of queueChannels) {
        writeDispatchLog({
          userId, type, channel: c as NotificationTemplateChannel, title, body,
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

/**
 * Per-channel dispatch log. Best-effort fire-and-forget so a log
 * write failure can't break the notification path. Reads from
 * `/admin/notifications/logs`.
 */
function writeDispatchLog(input: {
  userId: string;
  type: string;
  channel: NotificationTemplateChannel;
  title: string;
  body?: string;
  status: "QUEUED" | "SENT" | "FAILED" | "DELIVERED" | "BOUNCED";
  errorMessage?: string;
}): void {
  void db.notificationLog
    .create({
      data: {
        userId: input.userId,
        type: input.type,
        channel: input.channel,
        title: input.title,
        body: input.body ?? null,
        status: input.status,
        errorMessage: input.errorMessage ?? null,
      },
    })
    .catch((err) => {
      logger.warn({ err, type: input.type }, "[dispatchNotification] log write failed");
    });
}
