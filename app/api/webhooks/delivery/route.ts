import { NextRequest } from "next/server";
import { recordDeliveryEvent } from "@/lib/delivery/record";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { DeliveryChannel, DeliveryEventKind } from "@prisma/client";

/**
 * Multi-provider delivery webhook receiver. Looks at the payload to
 * decide whether it's:
 *   - SES (SNS-wrapped JSON with eventType: bounce|complaint|delivery)
 *   - Resend (event: email.delivered|bounced|complained|opened|clicked)
 *   - MSG91 (DLR webhook with status: 1=delivered, 2=failed, 16=rejected)
 *
 * We don't validate signatures here — that lives in the provider-
 * specific helpers (lib/mail.ts already verifies SES, etc.). This
 * route is a unifier so the dashboard reads from one table.
 *
 * To add a new provider: extend the `parse()` function below. We
 * intentionally swallow unrecognised payloads with a 200 OK so that
 * an unexpected provider doesn't end up in the provider's retry
 * queue forever — logging is enough to alert us.
 */

interface ParsedEvent {
  channel: DeliveryChannel;
  kind: DeliveryEventKind;
  recipient: string;
  provider: string;
  providerMessageId?: string | null;
  reason?: string | null;
  occurredAt?: Date;
}

function parse(body: unknown): ParsedEvent | null {
  if (typeof body !== "object" || body === null) return null;
  const r = body as Record<string, unknown>;

  // SES via SNS — payload is a string in `Message`, JSON-encoded.
  if (typeof r.Message === "string" && r.Type === "Notification") {
    try {
      const inner = JSON.parse(r.Message) as Record<string, unknown>;
      const eventType = inner.eventType ?? inner.notificationType;
      const mail = inner.mail as Record<string, unknown> | undefined;
      const recipient =
        ((mail?.destination as string[] | undefined)?.[0]) ??
        ((inner.bounce as { bouncedRecipients?: { emailAddress: string }[] } | undefined)?.bouncedRecipients?.[0]
          ?.emailAddress) ??
        "unknown";
      const map: Record<string, DeliveryEventKind> = {
        Bounce: "BOUNCED",
        Complaint: "COMPLAINED",
        Delivery: "DELIVERED",
        Send: "ACCEPTED",
      };
      const kind = map[eventType as string];
      if (!kind) return null;
      return {
        channel: "EMAIL",
        kind,
        recipient,
        provider: "ses",
        providerMessageId: (mail?.messageId as string | undefined) ?? null,
        reason:
          (inner.bounce as { bounceType?: string } | undefined)?.bounceType ??
          (inner.complaint as { complaintFeedbackType?: string } | undefined)?.complaintFeedbackType ??
          null,
        occurredAt: mail?.timestamp ? new Date(mail.timestamp as string) : undefined,
      };
    } catch {
      return null;
    }
  }

  // Resend — event format: { type: "email.delivered", data: {...} }.
  if (typeof r.type === "string" && (r.type as string).startsWith("email.")) {
    const data = (r.data ?? {}) as Record<string, unknown>;
    const map: Record<string, DeliveryEventKind> = {
      "email.delivered": "DELIVERED",
      "email.bounced": "BOUNCED",
      "email.complained": "COMPLAINED",
      "email.opened": "OPENED",
      "email.clicked": "CLICKED",
      "email.delivery_delayed": "DEFERRED",
      "email.sent": "ACCEPTED",
    };
    const kind = map[r.type as string];
    if (!kind) return null;
    return {
      channel: "EMAIL",
      kind,
      recipient: ((data.to as string[] | undefined)?.[0]) ?? "unknown",
      provider: "resend",
      providerMessageId: (data.email_id as string | undefined) ?? null,
      occurredAt: data.created_at ? new Date(data.created_at as string) : undefined,
    };
  }

  // MSG91 SMS DLR — has `mobile`, `status`, `request_id`. Status codes:
  // 1=delivered, 2=failed, 16=rejected, 17=submitted.
  if (r.mobile && typeof r.status === "number") {
    const statusMap: Record<number, DeliveryEventKind> = {
      1: "DELIVERED",
      2: "FAILED",
      16: "FAILED",
      17: "ACCEPTED",
      9: "BOUNCED",
    };
    const kind = statusMap[r.status as number];
    if (!kind) return null;
    return {
      channel: "SMS",
      kind,
      recipient: String(r.mobile),
      provider: "msg91",
      providerMessageId: (r.request_id as string | undefined) ?? null,
      reason: (r.description as string | undefined) ?? null,
    };
  }

  return null;
}

/**
 * Attribute an EMAIL delivery event to a Recruitathon bulk-email
 * recipient (matched by the SES/Resend message id we stored at send),
 * advancing its status and keeping the campaign's report counts exact.
 * Best-effort — wrapped by the caller so it never fails the webhook.
 */
async function attributeRecruitathonCampaign(ev: ParsedEvent): Promise<void> {
  if (ev.channel !== "EMAIL" || !ev.providerMessageId) return;
  if (ev.kind !== "DELIVERED" && ev.kind !== "BOUNCED" && ev.kind !== "COMPLAINED") return;

  const rec = await db.recruitathonEmailRecipient.findFirst({
    where: { providerMessageId: ev.providerMessageId },
    select: { id: true, campaignId: true },
  });
  if (!rec) return;

  const now = ev.occurredAt ?? new Date();
  // Guard transitions so duplicate SES events can't double-apply.
  const fromStatuses =
    ev.kind === "COMPLAINED" ? (["SENT", "DELIVERED"] as const) : (["SENT"] as const);
  const stamp =
    ev.kind === "DELIVERED" ? { deliveredAt: now } : ev.kind === "BOUNCED" ? { bouncedAt: now } : { complainedAt: now };

  const upd = await db.recruitathonEmailRecipient.updateMany({
    where: { id: rec.id, status: { in: [...fromStatuses] } },
    data: { status: ev.kind, ...stamp },
  });
  if (upd.count === 0) return;

  // Recompute the campaign's report counts from the source of truth.
  const g = await db.recruitathonEmailRecipient.groupBy({ by: ["status"], where: { campaignId: rec.campaignId }, _count: true });
  const c = (s: string) => g.find((x) => x.status === s)?._count ?? 0;
  await db.recruitathonEmailCampaign.update({
    where: { id: rec.campaignId },
    data: { deliveredCount: c("DELIVERED"), bouncedCount: c("BOUNCED"), complainedCount: c("COMPLAINED") },
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = parse(body);
  if (!parsed) {
    logger.info({ body }, "[delivery-webhook] unrecognised payload");
    return new Response("ok", { status: 200 });
  }
  await recordDeliveryEvent({ ...parsed, rawPayload: body });
  try {
    await attributeRecruitathonCampaign(parsed);
  } catch (err) {
    logger.warn({ err }, "[delivery-webhook] recruitathon campaign attribution failed");
  }
  return new Response("ok", { status: 200 });
}
