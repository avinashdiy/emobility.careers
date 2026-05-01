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
  /// Two-lane SES setup:
  ///   • "transactional" — verification, password reset, magic link,
  ///      booking confirmation, ID-verification result. Sent from the
  ///      `EMAIL_FROM` identity through `AWS_SES_CONFIGURATION_SET_TRANSACTIONAL`.
  ///   • "bulk" — daily digest, broadcasts, notification fan-outs,
  ///      grievance acks. Sent from `EMAIL_FROM_BULK` through
  ///      `AWS_SES_CONFIGURATION_SET_BULK`.
  /// When omitted, defaults to "transactional" — safer to start with
  /// the lane you definitely want delivering.
  kind?: "transactional" | "bulk";
}

/** Active provider — useful for diagnostics + the admin Settings page. */
export function activeMailProvider(): "ses" | "resend" | "none" {
  if (sesClient) return "ses";
  if (resendClient) return "resend";
  return "none";
}

async function resolveFromAddress(kind: "transactional" | "bulk"): Promise<string> {
  // Transactional uses EMAIL_FROM; bulk uses EMAIL_FROM_BULK. Both
  // get the admin-editable display-name override applied. Falling
  // back to the transactional address when bulk isn't configured
  // (small-deploy default) keeps everything working with one
  // identity if the operator hasn't set up the second lane yet.
  const base = kind === "bulk" ? env.EMAIL_FROM_BULK || env.EMAIL_FROM : env.EMAIL_FROM;
  const settingName = await getSetting("email.from_name").catch(() => "");
  if (!settingName) return base;
  const m = base.match(/^(.*?)<(.+)>\s*$/);
  if (m) return `${settingName} <${m[2].trim()}>`;
  return `${settingName} <${base}>`;
}

function configurationSetFor(kind: "transactional" | "bulk"): string | undefined {
  if (kind === "bulk") {
    return (
      env.AWS_SES_CONFIGURATION_SET_BULK ||
      env.AWS_SES_CONFIGURATION_SET ||
      undefined
    );
  }
  return (
    env.AWS_SES_CONFIGURATION_SET_TRANSACTIONAL ||
    env.AWS_SES_CONFIGURATION_SET ||
    undefined
  );
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
  const kind: "transactional" | "bulk" = opts.kind ?? "transactional";
  const from = await resolveFromAddress(kind);
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
          ConfigurationSetName: configurationSetFor(kind),
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
      logger.error({ err, to: recipients, subject: opts.subject, kind }, "[mail] SES send failed");
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
