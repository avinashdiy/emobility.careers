import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { Prisma, type DeliveryChannel, type DeliveryEventKind } from "@prisma/client";

/**
 * Single point of entry for recording delivery events into
 * `EmailDeliveryEvent`. Provider webhook handlers call this; the
 * function itself is fire-and-forget so a slow log write never
 * blocks the webhook ack.
 *
 * The schema name says "Email" but the table covers SMS + WhatsApp
 * too — column `channel` discriminates. We didn't rename because
 * Prisma migrations are easier additive than rename-during-greenfield;
 * the dashboard doesn't care.
 */
export async function recordDeliveryEvent(opts: {
  channel: DeliveryChannel;
  kind: DeliveryEventKind;
  recipient: string;
  provider: string;
  providerMessageId?: string | null;
  reason?: string | null;
  occurredAt?: Date;
  rawPayload?: unknown;
}): Promise<void> {
  try {
    await db.emailDeliveryEvent.create({
      data: {
        channel: opts.channel,
        kind: opts.kind,
        recipient: opts.recipient.slice(0, 320),
        provider: opts.provider,
        providerMessageId: opts.providerMessageId ?? null,
        reason: opts.reason ?? null,
        occurredAt: opts.occurredAt ?? new Date(),
        rawPayload:
          opts.rawPayload === undefined || opts.rawPayload === null
            ? Prisma.JsonNull
            : (opts.rawPayload as Prisma.InputJsonValue),
      },
    });
  } catch (err) {
    logger.warn({ err, opts }, "[delivery] event log failed");
  }
}
