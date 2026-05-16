import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { sendSMS } from "@/lib/sms";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/send";
import { env } from "@/lib/env";
import { QueueNames, type NotificationsJob } from "@/lib/queues";
import { realtime, channels, events } from "@/lib/realtime";

// Default TTL for IN_APP rows. The cleanup cron deletes anything past
// `expiresAt` so notifications don't accumulate indefinitely. Callers
// can override per-event by passing `expiresAt` in the queue payload
// (e.g., interview reminders that are pointless after the event time).
const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function startNotificationsWorker() {
  const worker = new Worker<NotificationsJob>(
    QueueNames.Notifications,
    async (job) => {
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
      } = job.data;

      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true, phone: true, locale: true, name: true, notificationPrefs: true },
      });
      if (!user) return { ok: false, reason: "user-not-found" };

      // In-app row is always written (even when EMAIL/SMS also fire).
      // After the row lands we push a Pusher event on the user's
      // private channel so the bell icon + inbox can update in
      // real-time without a full page reload.
      if (ch.includes("IN_APP")) {
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

        // Best-effort realtime push — failure shouldn't block email/SMS.
        try {
          await realtime.trigger(channels.user(userId), events.notification, {
            id: created.id,
            type,
            title,
            body,
            link,
            actorId: actorId ?? null,
            createdAt: new Date().toISOString(),
          });
        } catch (err) {
          logger.warn({ err, userId }, "[notifications] realtime push failed");
        }
      }

      // Per-event channel preferences. Map notification type prefix → preference field.
      //
      // New (Wave B/C) notification type prefixes — outreach.*,
      // hiring-assistant.*, skill.*, recruiter.*, automation.* — are
      // mapped onto the closest existing preference. These are all
      // recruiter→candidate or system→user messages, so they ride
      // alongside the messagesEmail / applicationUpdatesEmail flags
      // rather than introducing new preference columns the user
      // wouldn't know what to set. If a user wants to silence them
      // specifically, future preference columns can be added later;
      // for now the alternative (always-on) would mean users with a
      // prefs row set never receive email for any new event type.
      const prefs = user.notificationPrefs;
      const wantEmail =
        !prefs ||
        (type.startsWith("application.") && prefs.applicationUpdatesEmail) ||
        (type.startsWith("message.") && prefs.messagesEmail) ||
        (type.startsWith("interview.") && prefs.interviewsEmail) ||
        (type.startsWith("job.") && prefs.jobAlertsEmail) ||
        // Recruiter outreach + automation messages map to messagesEmail.
        (type.startsWith("outreach.") && prefs.messagesEmail) ||
        (type.startsWith("recruiter.") && prefs.messagesEmail) ||
        (type.startsWith("automation.") && prefs.messagesEmail) ||
        // AI Hiring Assistant summaries are recruiter-facing operational
        // updates — gate behind applicationUpdatesEmail.
        (type.startsWith("hiring-assistant.") && prefs.applicationUpdatesEmail) ||
        // Skill-badge celebration emails ride on messagesEmail.
        (type.startsWith("skill.") && prefs.messagesEmail);
      const wantSMS =
        !prefs ||
        (type.startsWith("application.") && prefs.applicationUpdatesSMS) ||
        (type.startsWith("message.") && prefs.messagesSMS) ||
        (type.startsWith("interview.") && prefs.interviewsSMS) ||
        (type.startsWith("job.") && prefs.jobAlertsSMS) ||
        (type.startsWith("outreach.") && prefs.messagesSMS) ||
        (type.startsWith("recruiter.") && prefs.messagesSMS) ||
        (type.startsWith("automation.") && prefs.messagesSMS) ||
        (type.startsWith("hiring-assistant.") && prefs.applicationUpdatesSMS) ||
        (type.startsWith("skill.") && prefs.messagesSMS);

      if (ch.includes("EMAIL") && wantEmail && user.email) {
        // Notification fan-out goes through the bulk SES lane —
        // there are far more of these than transactional sends and
        // a single buggy notification template that triggers
        // complaints shouldn't cascade into auth-email suppression.
        // Auth-only emails (verification, password reset, magic link)
        // still go through the transactional lane via their direct
        // sendMail() call sites.
        await sendMail({
          to: user.email,
          subject: title,
          html: `<p>${body}</p>${link ? `<p><a href="${env.NEXT_PUBLIC_APP_URL}${link}">Open in eMobility Careers</a></p>` : ""}`,
          kind: "bulk",
        });
      }

      if (ch.includes("SMS") && wantSMS && user.phone && env.MSG91_TXN_TEMPLATE_ID) {
        await sendSMS({
          to: user.phone,
          templateId: env.MSG91_TXN_TEMPLATE_ID,
          variables: { title, body },
        });
      }

      // WhatsApp delivery — gated by the same per-event preference logic
      // as SMS (the channels share the "I want a real-time mobile ping"
      // intent). Uses the same approved template as the digest with two
      // body params (title + body); ops can swap to a notification-class
      // template via env if they want a richer layout.
      if (ch.includes("WHATSAPP") && wantSMS && user.phone) {
        await sendWhatsAppTemplate({
          to: user.phone,
          templateName: env.WHATSAPP_DIGEST_TEMPLATE,
          // Five body params required by the digest template — pad with
          // dashes so the template's body validators don't reject.
          bodyParams: [title, body, "—", "—", "—"],
          urlButtonParam: link
            ? `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${link}`
            : env.NEXT_PUBLIC_APP_URL,
        }).catch((err) => logger.warn({ err }, "[notifications] whatsapp send failed"));
      }

      return { ok: true };
    },
    { connection: redis, concurrency: 8 },
  );

  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, "[notifications] failed"),
  );

  return worker;
}
