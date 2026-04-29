import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * MSG91 client for India SMS + OTP.
 * Uses MSG91 Flow API (DLT-compliant). Templates must be approved per the
 * sender ID before sending.
 */

interface SendSMSOptions {
  to: string;            // E.164 phone, e.g. "+919876543210"
  templateId: string;    // MSG91 flow / template ID
  variables?: Record<string, string | number>;
}

export async function sendSMS(opts: SendSMSOptions): Promise<void> {
  if (!env.MSG91_AUTH_KEY) {
    logger.warn({ to: opts.to }, "[sms] MSG91 not configured — skipping send");
    return;
  }

  const phone = opts.to.replace(/^\+/, "");
  const res = await fetch("https://control.msg91.com/api/v5/flow/", {
    method: "POST",
    headers: {
      "authkey": env.MSG91_AUTH_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      template_id: opts.templateId,
      sender: env.MSG91_SENDER_ID,
      short_url: 0,
      mobiles: phone,
      ...opts.variables,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text }, "[sms] MSG91 send failed");
    throw new Error(`MSG91 send failed: ${res.status} ${text}`);
  }
}

export async function sendOTP(phone: string, otp: string): Promise<void> {
  if (!env.MSG91_OTP_TEMPLATE_ID) {
    logger.warn({ phone }, "[sms] OTP template not configured — skipping");
    return;
  }
  await sendSMS({
    to: phone,
    templateId: env.MSG91_OTP_TEMPLATE_ID,
    variables: { otp, var: otp, OTP: otp },
  });
}
