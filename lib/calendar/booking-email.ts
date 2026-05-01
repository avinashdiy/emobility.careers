import "server-only";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { buckets, presignDownload, s3 } from "@/lib/storage";
import { buildICS, type ICSEventInput } from "@/lib/calendar/ics";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Generate + upload an ICS file for a mentorship session and email
 * the booking confirmation to both mentor and mentee. The ICS lives
 * in our private `docs` bucket; we surface it via a presigned URL
 * (7-day expiry) plus a Google Calendar template URL so users on
 * any calendar platform can add the event in one click.
 *
 * We deliberately don't MIME-attach the ICS — SES v2 + Resend treat
 * attachments differently, and a download link works fine across
 * mobile clients where attachment handling is fiddly.
 *
 * The caller is responsible for stamping
 * `MentorshipSession.calendarInviteSentAt` after a successful return
 * so the reminder worker doesn't double-send.
 */

const ICS_PRESIGN_TTL = 60 * 60 * 24 * 7; // 7 days — re-upload on reschedule

export interface BookingEmailInput {
  sessionId: string;
  /// Stable UID across reschedules — usually the row's `icsUid`. Calendars
  /// dedupe on this so updating an event reuses the row.
  icsUid: string;
  scheduledAt: Date;
  durationMins: number;
  topic: string;
  meetingUrl: string | null;
  /// SEQUENCE in iCalendar — bump on reschedule. Default 0.
  sequence?: number;
  cancelled?: boolean;
  mentor: { name: string; email: string };
  mentee: { name: string; email: string };
}

function googleCalendarUrl(opts: ICSEventInput): string {
  // Format dates as YYYYMMDDTHHmmssZ for Google's calendar template URL.
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = fmt(opts.startsAt);
  const end = fmt(new Date(opts.startsAt.getTime() + opts.durationMins * 60_000));
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.summary,
    dates: `${start}/${end}`,
    details: opts.description,
  });
  if (opts.location) params.set("location", opts.location);
  return `https://calendar.google.com/calendar/render?${params}`;
}

export async function sendBookingConfirmationEmail(
  input: BookingEmailInput,
): Promise<{ ok: boolean; downloadUrl?: string; gcalUrl?: string }> {
  const summary = input.cancelled
    ? `[Cancelled] Mentorship: ${input.topic}`
    : `Mentorship: ${input.topic}`;
  const startISO = input.scheduledAt.toISOString();
  const niceTime = input.scheduledAt.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const description = [
    `Mentorship session between ${input.mentor.name} and ${input.mentee.name}.`,
    `Topic: ${input.topic}`,
    input.meetingUrl ? `Join link: ${input.meetingUrl}` : null,
    `Manage on eMobility Careers: ${env.NEXT_PUBLIC_APP_URL}/me/sessions`,
  ]
    .filter(Boolean)
    .join("\\n");

  const icsInput: ICSEventInput = {
    uid: input.icsUid,
    sequence: input.sequence ?? 0,
    summary,
    description,
    startsAt: input.scheduledAt,
    durationMins: input.durationMins,
    organizerEmail: input.mentor.email,
    organizerName: input.mentor.name,
    attendees: [
      { email: input.mentee.email, name: input.mentee.name },
      { email: input.mentor.email, name: input.mentor.name },
    ],
    location: input.meetingUrl ?? "Online",
    url: `${env.NEXT_PUBLIC_APP_URL}/me/sessions`,
    status: input.cancelled ? "CANCELLED" : "CONFIRMED",
  };

  const ics = buildICS(icsInput);
  const gcalUrl = googleCalendarUrl(icsInput);

  // Upload ICS to MinIO so we can hand out a stable HTTPS link in
  // the email. Bucket is private — we presign a 7-day URL.
  const key = `mentorship-ics/${input.sessionId}-seq${icsInput.sequence ?? 0}.ics`;
  let downloadUrl: string | null = null;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: buckets.docs,
        Key: key,
        Body: ics,
        ContentType: "text/calendar; charset=utf-8",
        ContentDisposition: `attachment; filename="mentorship-${input.sessionId}.ics"`,
      }),
    );
    downloadUrl = await presignDownload("docs", key, ICS_PRESIGN_TTL);
  } catch (err) {
    logger.warn({ err, sessionId: input.sessionId }, "[booking-email] ICS upload failed");
    // Non-fatal — we still send the email with the Google Calendar link.
  }

  const ctaButtons = `
    <p style="margin:18px 0;">
      <a href="${gcalUrl}" target="_blank" style="display:inline-block;background:#374a47;color:#c1ffb4;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700;margin-right:8px;">
        Add to Google Calendar →
      </a>
      ${
        downloadUrl
          ? `<a href="${downloadUrl}" style="display:inline-block;background:#fff;border:1px solid #cbd5e1;color:#0f172a;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700;">
                Download .ics
              </a>`
          : ""
      }
    </p>`;

  const subject = input.cancelled
    ? `Mentorship cancelled — ${niceTime} IST`
    : `Mentorship confirmed — ${niceTime} IST`;

  // Send to both attendees. Each gets a slightly tailored intro so
  // the email reads naturally to either side. Send sequentially so
  // a flaky provider failing on one address doesn't drop the other.
  const recipients: { to: string; greeting: string }[] = [
    { to: input.mentee.email, greeting: `Hi ${input.mentee.name.split(" ")[0]}` },
    { to: input.mentor.email, greeting: `Hi ${input.mentor.name.split(" ")[0]}` },
  ];
  let sent = 0;
  for (const r of recipients) {
    const html = `
<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f5f7f5;padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:white;border-radius:12px;padding:32px;">
    <tr><td>
      <h1 style="font-size:22px;color:#0f172a;margin:0 0 12px 0;">${
        input.cancelled
          ? "Your mentorship session was cancelled"
          : "Your mentorship session is confirmed"
      }</h1>
      <p style="color:#475569;margin:0 0 8px 0;">${r.greeting},</p>
      <p style="color:#475569;margin:0 0 16px 0;">
        ${
          input.cancelled
            ? `The mentorship session below has been cancelled. No further action needed.`
            : `Your session with ${
                r.to === input.mentee.email ? input.mentor.name : input.mentee.name
              } is on the calendar.`
        }
      </p>
      <table style="width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:0 0 8px 0;">
        <tr><td style="color:#0f172a;font-weight:700;font-size:14px;padding:2px 0;">${input.topic}</td></tr>
        <tr><td style="color:#475569;font-size:13px;padding:2px 0;">${niceTime} IST · ${input.durationMins} min</td></tr>
        ${input.meetingUrl ? `<tr><td style="font-size:13px;padding:6px 0;"><a href="${input.meetingUrl}" style="color:#374a47;font-weight:700;">Join link →</a></td></tr>` : ""}
      </table>
      ${input.cancelled ? "" : ctaButtons}
      <p style="color:#94a3b8;font-size:12px;margin:24px 0 0 0;">
        Manage your sessions on
        <a href="${env.NEXT_PUBLIC_APP_URL}/me/sessions" style="color:#374a47;">eMobility Careers</a>.
      </p>
    </td></tr>
  </table>
</body></html>`;
    const text = `${input.cancelled ? "Cancelled" : "Confirmed"}: ${input.topic}\n${niceTime} IST · ${input.durationMins} min\n${
      input.meetingUrl ? `Join: ${input.meetingUrl}\n` : ""
    }Add to Google Calendar: ${gcalUrl}\n${
      downloadUrl ? `Download ICS: ${downloadUrl}\n` : ""
    }Manage: ${env.NEXT_PUBLIC_APP_URL}/me/sessions\n`;
    try {
      await sendMail({ to: r.to, subject, html, text });
      sent += 1;
    } catch (err) {
      logger.warn({ err, to: r.to, sessionId: input.sessionId }, "[booking-email] send failed");
    }
  }
  return {
    ok: sent > 0,
    downloadUrl: downloadUrl ?? undefined,
    gcalUrl,
  };
}
