import { Resend } from "resend";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getSetting } from "@/lib/settings";

/**
 * Unified mail layer. Provider preference:
 *
 *   1. Amazon SES — if AWS_SES_REGION + AWS_SES_ACCESS_KEY_ID + AWS_SES_SECRET_ACCESS_KEY are set
 *   2. Resend     — if RESEND_API_KEY is set
 *   3. No-op log  — neither configured (dev / staging fallback)
 *
 * Callers don't change. The `from` line resolves dynamically: the admin-
 * editable `email.from_name` SiteSetting wins over the env default; the
 * `email.signature` SiteSetting is appended to every outgoing body so admins
 * can change the sign-off site-wide without a redeploy.
 */

const sesConfigured =
  Boolean(env.AWS_SES_REGION && env.AWS_SES_ACCESS_KEY_ID && env.AWS_SES_SECRET_ACCESS_KEY);

const sesClient = sesConfigured
  ? new SESv2Client({
      region: env.AWS_SES_REGION!,
      credentials: {
        accessKeyId: env.AWS_SES_ACCESS_KEY_ID!,
        secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY!,
      },
    })
  : null;

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/** Active provider — useful for diagnostics + the admin Settings page. */
export function activeMailProvider(): "ses" | "resend" | "none" {
  if (sesClient) return "ses";
  if (resendClient) return "resend";
  return "none";
}

async function resolveFromAddress(): Promise<string> {
  // EMAIL_FROM is the canonical default ("Name <addr@domain>"). The admin
  // Settings page lets admins change just the display name without touching
  // env vars, so we splice it in when both are present.
  const settingName = await getSetting("email.from_name").catch(() => "");
  const base = env.EMAIL_FROM;
  if (!settingName) return base;
  const m = base.match(/^(.*?)<(.+)>\s*$/);
  if (m) return `${settingName} <${m[2].trim()}>`;
  return `${settingName} <${base}>`;
}

async function appendSignature(html: string, text?: string): Promise<{ html: string; text?: string }> {
  const sig = await getSetting("email.signature").catch(() => "");
  if (!sig) return { html, text };
  const sigHtml = sig.replace(/\n/g, "<br>");
  return {
    html: `${html}<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"><p style="color:#6b7280;font-size:12px;">${sigHtml}</p>`,
    text: text ? `${text}\n\n${sig}` : undefined,
  };
}

export async function sendMail(opts: SendMailOptions): Promise<void> {
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];
  const from = await resolveFromAddress();
  const settingReplyTo = await getSetting("email.reply_to").catch(() => "");
  const replyTo = opts.replyTo ?? (settingReplyTo || undefined);
  const { html, text } = await appendSignature(opts.html, opts.text);

  // Amazon SES (preferred)
  if (sesClient) {
    try {
      await sesClient.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: recipients },
          ReplyToAddresses: replyTo ? [replyTo] : undefined,
          ConfigurationSetName: env.AWS_SES_CONFIGURATION_SET,
          Content: {
            Simple: {
              Subject: { Data: opts.subject, Charset: "UTF-8" },
              Body: {
                Html: { Data: html, Charset: "UTF-8" },
                ...(text ? { Text: { Data: text, Charset: "UTF-8" } } : {}),
              },
            },
          },
        }),
      );
      return;
    } catch (err) {
      logger.error({ err, to: recipients, subject: opts.subject }, "[mail] SES send failed");
      throw err;
    }
  }

  // Resend (fallback)
  if (resendClient) {
    try {
      await resendClient.emails.send({
        from,
        to: recipients,
        subject: opts.subject,
        html,
        text,
        replyTo,
      });
      return;
    } catch (err) {
      logger.error({ err, to: recipients, subject: opts.subject }, "[mail] Resend send failed");
      throw err;
    }
  }

  // Neither configured — log and move on.
  logger.warn(
    { to: recipients, subject: opts.subject },
    "[mail] no provider configured (set AWS_SES_* or RESEND_API_KEY) — skipping send",
  );
}
