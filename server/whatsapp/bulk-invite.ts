"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { isRouterControlError } from "@/lib/server-action-errors";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * #20 Bulk WhatsApp Invite — fans out a templated message to a set of
 * selected candidates via the platform's existing dispatchNotification
 * pipeline. Each invite:
 *
 *   1. Creates (or upserts) a MessageThread between the recruiter and
 *      the candidate. If the recruiter has been talking to this
 *      candidate before, the existing thread is reused so the bulk
 *      send doesn't fragment the inbox.
 *   2. Drops the personalised body into the thread as a Message —
 *      so the recruiter's inbox + the candidate's /me/messages both
 *      reflect the invite.
 *   3. Fires dispatchNotification with channels=["WHATSAPP","IN_APP"].
 *      The notifications worker sends via the WhatsApp Cloud API using
 *      the configured digest template (or whichever recruiter-outreach
 *      template the deploy has wired up).
 *
 * Returns counts so the UI can render "Sent 12 · Skipped 3 (no phone)".
 *
 * Distinct from the existing wa.me deep-link path (BulkWhatsAppDialog's
 * default): that path is recruiter-clicks-each-link, this path is
 * fire-and-forget through the platform. Recruiters with approved
 * templates use this; everyone else falls back to deep-link.
 */

const inviteSchema = z.object({
  candidateIds: z.array(z.string().min(1)).min(1).max(50),
  bodyTemplate: z.string().trim().min(20).max(1000),
});

export interface BulkInviteResult {
  ok: boolean;
  sent: number;
  skipped: number;
  failed: number;
  message?: string;
}

export async function bulkWhatsAppInvite(input: {
  candidateIds: string[];
  bodyTemplate: string;
}): Promise<BulkInviteResult> {
  try {
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, sent: 0, skipped: 0, failed: 0, message: "Invalid input." };
    }

    const session = await auth();
    if (!session?.user) return { ok: false, sent: 0, skipped: 0, failed: 0, message: "Sign in first." };
    const employer = await db.employerProfile.findUnique({
      where: { userId: session.user.id },
      include: { company: { select: { name: true } } },
    });
    if (!employer) {
      return { ok: false, sent: 0, skipped: 0, failed: 0, message: "Recruiter profile required." };
    }

    try {
      // Bulk-InMail bucket already gates cold-outreach volume to 200/24h
      // per recruiter. Reuse the same bucket so a recruiter can't burn
      // through bulk via WhatsApp while staying under the InMail cap.
      await rateLimitOrThrow(`bulk-wa:${session.user.id}`, "bulkInMail");
    } catch (err) {
      if (isRouterControlError(err)) throw err;
      return { ok: false, sent: 0, skipped: 0, failed: 0, message: "Hit the daily bulk-outreach cap (200/day)." };
    }

    const candidates = await db.candidateProfile.findMany({
      where: { id: { in: parsed.data.candidateIds } },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
        phone: true,
        user: { select: { phone: true } },
      },
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const c of candidates) {
      const phone = c.phone ?? c.user.phone ?? null;
      if (!phone) {
        skipped += 1;
        continue;
      }
      try {
        // Find or create a thread between recruiter + candidate.
        // MessageThread doesn't have a unique on (employerUserId,
        // candidateUserId) on its own — peer-to-peer threads aren't
        // application-scoped — so we do an upsert via findFirst then
        // create.
        let thread = await db.messageThread.findFirst({
          where: {
            employerUserId: session.user.id,
            candidateUserId: c.userId,
            applicationId: null,
          },
          select: { id: true },
        });
        if (!thread) {
          thread = await db.messageThread.create({
            data: {
              employerUserId: session.user.id,
              candidateUserId: c.userId,
              lastMessageAt: new Date(),
            },
            select: { id: true },
          });
        }

        const personalisedBody = parsed.data.bodyTemplate
          .replace(/\{\{\s*firstName\s*\}\}/gi, c.firstName)
          .replace(/\{\{\s*name\s*\}\}/gi, `${c.firstName} ${c.lastName ?? ""}`.trim())
          .replace(/\{\{\s*company\s*\}\}/gi, employer.company.name);

        await db.message.create({
          data: {
            threadId: thread.id,
            senderId: session.user.id,
            body: personalisedBody,
          },
        });
        await db.messageThread.update({
          where: { id: thread.id },
          data: { lastMessageAt: new Date() },
        });

        // Fire WhatsApp + IN_APP notification. The worker handles the
        // Meta Cloud API send; the IN_APP row writes inline so the
        // candidate sees the inbox bell even before the WhatsApp
        // template lands on their phone.
        try {
          await dispatchNotification({
            userId: c.userId,
            actorId: session.user.id,
            type: "recruiter.bulk_wa_invite",
            title: `Message from ${employer.company.name}`,
            body: personalisedBody.slice(0, 200),
            link: `/me/messages/${thread.id}`,
            channels: ["IN_APP", "WHATSAPP"],
            groupKey: `bulk-wa:${session.user.id}:${c.userId}`,
          });
        } catch (err) {
          logger.warn({ err, candidateId: c.id }, "[bulk-wa] dispatch failed");
        }

        sent += 1;
      } catch (err) {
        logger.warn({ err, candidateId: c.id }, "[bulk-wa] send failed");
        failed += 1;
      }
    }

    try {
      await audit({
        actorId: session.user.id,
        action: "recruiter.bulk_wa_invite",
        entity: "MessageThread",
        entityId: parsed.data.candidateIds[0] ?? "bulk",
        meta: { sent, skipped, failed, batchSize: parsed.data.candidateIds.length },
      });
    } catch {/* best-effort */}

    return {
      ok: true,
      sent,
      skipped,
      failed,
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[bulk-wa] unexpected");
    return { ok: false, sent: 0, skipped: 0, failed: 0, message: "Couldn't send — try again." };
  }
}
