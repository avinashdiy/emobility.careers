import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { sendSMS } from "@/lib/sms";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/send";
import { env } from "@/lib/env";
import { QueueNames, type NotificationsJob } from "@/lib/queues";

export function startNotificationsWorker() {
  const worker = new Worker<NotificationsJob>(
    QueueNames.Notifications,
    async (job) => {
      const { userId, type, title, body, link, payload, channels = ["IN_APP"] } = job.data;

      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true, phone: true, locale: true, name: true, notificationPrefs: true },
      });
      if (!user) return { ok: false, reason: "user-not-found" };

      // In-app row is always written (even when EMAIL/SMS also fire)
      if (channels.includes("IN_APP")) {
        await db.notification.create({
          data: {
            userId,
            type,
            title,
            body,
            link,
            payload: payload ? (payload as object) : undefined,
            channel: "IN_APP",
            sentAt: new Date(),
          },
        });
      }

      // Per-event channel preferences. Map notification type prefix → preference field.
      const prefs = user.notificationPrefs;
      const wantEmail =
        !prefs ||
        (type.startsWith("application.") && prefs.applicationUpdatesEmail) ||
        (type.startsWith("message.") && prefs.messagesEmail) ||
        (type.startsWith("interview.") && prefs.interviewsEmail) ||
        (type.startsWith("job.") && prefs.jobAlertsEmail);
      const wantSMS =
        !prefs ||
        (type.startsWith("application.") && prefs.applicationUpdatesSMS) ||
        (type.startsWith("message.") && prefs.messagesSMS) ||
        (type.startsWith("interview.") && prefs.interviewsSMS) ||
        (type.startsWith("job.") && prefs.jobAlertsSMS);

      if (channels.includes("EMAIL") && wantEmail && user.email) {
        await sendMail({
          to: user.email,
          subject: title,
          html: `<p>${body}</p>${link ? `<p><a href="${env.NEXT_PUBLIC_APP_URL}${link}">Open in eMobility Careers</a></p>` : ""}`,
        });
      }

      if (channels.includes("SMS") && wantSMS && user.phone && env.MSG91_TXN_TEMPLATE_ID) {
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
      if (channels.includes("WHATSAPP") && wantSMS && user.phone) {
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
