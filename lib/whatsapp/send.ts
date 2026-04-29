import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { normalizePhone } from "@/lib/whatsapp/link";

/**
 * WhatsApp Cloud API sender. Used by the daily-digest worker (and any
 * future utility-class messaging like interview reminders).
 *
 * IMPORTANT — Meta Business Platform rules:
 *   • Outside the 24h customer-care window, only TEMPLATE messages can
 *     be sent. The template (`WHATSAPP_DIGEST_TEMPLATE`) must be
 *     pre-approved in WhatsApp Manager. Non-approved templates → 4xx.
 *   • A "utility" template is the right category for daily job digests
 *     (transactional / informational). "Marketing" templates have a
 *     stricter cadence + opt-in audit.
 *   • The template body must be designed in WA Manager with `{{1}} ..
 *     {{N}}` placeholders that we fill from `parameters` below.
 *
 * Falls back to a no-op when `WHATSAPP_PHONE_NUMBER_ID` /
 * `WHATSAPP_ACCESS_TOKEN` are unset — keeps dev / staging from
 * blowing up.
 */

const GRAPH_VERSION = "v20.0";

export interface WhatsAppTemplateMessage {
  to: string;
  templateName: string;
  /** Two-letter ISO language code matching the approved template. */
  language?: string;
  /** Body params filled into {{1}} {{2}} … of the template body. */
  bodyParams?: string[];
  /** Optional URL-button param — fills the {{1}} placeholder of a CTA URL button. */
  urlButtonParam?: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  /** WA-side message id if send succeeded. */
  messageId?: string;
  /** Any error code Meta returned — used to drive auto-pause. */
  errorCode?: number;
  errorMessage?: string;
}

/**
 * Send a template message via WhatsApp Cloud API. Returns a structured
 * result; never throws — callers (the digest worker) are expected to
 * inspect `ok` and increment the consecutive-failure counter as needed.
 */
export async function sendWhatsAppTemplate(msg: WhatsAppTemplateMessage): Promise<WhatsAppSendResult> {
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
  const token = env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token) {
    logger.debug("[whatsapp] not configured — skipping send");
    return { ok: false, errorMessage: "WhatsApp Cloud API not configured" };
  }

  const phone = normalizePhone(msg.to);
  if (!phone) return { ok: false, errorMessage: "Invalid phone number" };

  const components: Array<Record<string, unknown>> = [];
  if (msg.bodyParams && msg.bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: msg.bodyParams.map((text) => ({ type: "text", text })),
    });
  }
  if (msg.urlButtonParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: msg.urlButtonParam }],
    });
  }

  const body = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: msg.templateName,
      language: { code: msg.language ?? env.WHATSAPP_DIGEST_LANGUAGE },
      components,
    },
  };

  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await r.json().catch(() => null)) as
      | {
          messages?: Array<{ id: string }>;
          error?: { code?: number; message?: string };
        }
      | null;
    if (!r.ok) {
      const code = json?.error?.code;
      const message = json?.error?.message ?? `HTTP ${r.status}`;
      logger.warn({ to: phone, code, message, template: msg.templateName }, "[whatsapp] send failed");
      return { ok: false, errorCode: code, errorMessage: message };
    }
    return { ok: true, messageId: json?.messages?.[0]?.id };
  } catch (err) {
    logger.warn({ err, to: phone }, "[whatsapp] send threw");
    return { ok: false, errorMessage: err instanceof Error ? err.message : "Send error" };
  }
}
