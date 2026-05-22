import "server-only";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { Prisma, type WebhookDirection, type WebhookStatus } from "@prisma/client";

/**
 * Single point of entry for both inbound (provider → us) and outbound
 * (us → employer) webhook events. Inbound handlers (Razorpay, SES SNS)
 * call this for forensics; outbound dispatchers call this before AND
 * after the HTTP attempt so we can show pending/failed/delivered in
 * the admin log.
 *
 * Fire-and-forget: a slow log write never blocks the actual HTTP
 * processing. Forensic value is "best-effort" — perfect logging
 * coverage is impossible across distributed retries anyway.
 */
export async function recordWebhookEvent(opts: {
  direction: WebhookDirection;
  source: string;
  topic: string;
  externalId?: string | null;
  url?: string | null;
  status?: WebhookStatus;
  httpStatus?: number | null;
  responseBody?: string | null;
  payload?: unknown;
  companyId?: string | null;
  attempts?: number;
}): Promise<string | null> {
  try {
    const row = await db.webhookEvent.create({
      data: {
        direction: opts.direction,
        source: opts.source,
        topic: opts.topic,
        externalId: opts.externalId ?? null,
        url: opts.url ?? null,
        status: opts.status ?? "PENDING",
        httpStatus: opts.httpStatus ?? null,
        responseBody: opts.responseBody?.slice(0, 5000) ?? null,
        payload:
          opts.payload === undefined || opts.payload === null
            ? Prisma.JsonNull
            : (opts.payload as Prisma.InputJsonValue),
        companyId: opts.companyId ?? null,
        attempts: opts.attempts ?? 1,
        deliveredAt:
          opts.status === "DELIVERED" ? new Date() : null,
      },
    });
    return row.id;
  } catch (err) {
    logger.warn({ err }, "[webhook-log] write failed");
    return null;
  }
}

export async function updateWebhookEvent(
  id: string,
  patch: {
    status?: WebhookStatus;
    httpStatus?: number | null;
    responseBody?: string | null;
    attempts?: number;
  },
): Promise<void> {
  try {
    await db.webhookEvent.update({
      where: { id },
      data: {
        ...patch,
        responseBody: patch.responseBody?.slice(0, 5000),
        deliveredAt: patch.status === "DELIVERED" ? new Date() : undefined,
      },
    });
  } catch (err) {
    logger.warn({ err, id }, "[webhook-log] update failed");
  }
}
