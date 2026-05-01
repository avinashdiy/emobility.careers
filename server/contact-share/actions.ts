"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { isRouterControlError } from "@/lib/server-action-errors";
import { notificationsQueue } from "@/lib/queues";

/**
 * Recruiter → candidate "share your contact?" flow. The complement
 * to the strict `canSeeContact` gate: an employer who can't see a
 * candidate's contact via visibility/application can ASK; the
 * candidate APPROVES (or DENIES); the gate then honours the grant.
 *
 * Lifecycle (mirrors the schema-side state machine):
 *
 *   PENDING ──Approve──→ GRANTED ──Revoke──→ REVOKED
 *           ──Deny─────→ DENIED
 *           ──30 days──→ EXPIRED  (notification-maintenance tick)
 *
 * Spam guards:
 *   • Rate-limited per recruiter via the existing `invite` bucket.
 *   • A DENIED row blocks new PENDINGs from the same recruiter for
 *     90 days — anti-harassment cool-off.
 *   • A PENDING from the same pair is reused on resubmit (the
 *     unique constraint on (requesterUserId, targetUserId) makes
 *     this enforced at the DB layer too).
 *
 * Privacy:
 *   • The candidate sees the recruiter's name + company + (optional)
 *     message. They never see the recruiter's email/phone.
 *   • The recruiter never sees the candidate's contact until GRANTED.
 *     `canSeeContact` reads `ContactShareRequest` to decide.
 */

const PENDING_TTL_DAYS = 30;
const DENY_COOLOFF_DAYS = 90;

const requestSchema = z.object({
  targetUserId: z.string().min(1),
  message: z.string().max(1000).optional(),
  applicationId: z.string().optional(),
});

export type ShareActionResult = { ok: boolean; message: string };

async function requireUser(): Promise<{ userId: string; role: string }> {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return { userId: session.user.id, role: session.user.role ?? "" };
}

/**
 * Recruiter sends a contact-share request to a candidate. Re-uses
 * the existing row in the (requester, target) pair if one is there,
 * subject to the cool-off rule for DENIED.
 */
export async function requestContactShare(input: {
  targetUserId: string;
  message?: string;
  applicationId?: string;
}): Promise<ShareActionResult> {
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin");
    if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
      return {
        ok: false,
        message: "Only employers can request contact share.",
      };
    }
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: "Invalid request payload." };
    }
    if (parsed.data.targetUserId === session.user.id) {
      return { ok: false, message: "You can't request your own contact." };
    }

    await rateLimitOrThrow(`contact-share:${session.user.id}`, "invite");

    // Pull target + verify they're a candidate. Don't surface to
    // recruiter that the user doesn't exist (privacy) — we say
    // "couldn't deliver" generically.
    const target = await db.user.findUnique({
      where: { id: parsed.data.targetUserId },
      select: {
        id: true,
        role: true,
        status: true,
        candidateProfile: { select: { id: true, firstName: true } },
      },
    });
    if (
      !target ||
      target.status !== "ACTIVE" ||
      target.role !== "CANDIDATE" ||
      !target.candidateProfile
    ) {
      return {
        ok: false,
        message: "We couldn't deliver that request. Try messaging in-app instead.",
      };
    }

    // Check existing row for this pair.
    const existing = await db.contactShareRequest.findUnique({
      where: {
        requesterUserId_targetUserId: {
          requesterUserId: session.user.id,
          targetUserId: parsed.data.targetUserId,
        },
      },
    });
    if (existing) {
      // Already in a state that doesn't allow re-asking?
      if (existing.status === "GRANTED") {
        return {
          ok: true,
          message: "You already have access to their contact.",
        };
      }
      if (existing.status === "PENDING") {
        return {
          ok: true,
          message: "Already pending — give them a moment to respond.",
        };
      }
      if (existing.status === "DENIED") {
        const cool =
          existing.deniedAt &&
          existing.deniedAt.getTime() + DENY_COOLOFF_DAYS * 86400_000 > Date.now();
        if (cool) {
          return {
            ok: false,
            message: `This candidate previously declined. You can ask again after ${DENY_COOLOFF_DAYS} days from the previous decline.`,
          };
        }
      }
      // EXPIRED, REVOKED, or DENIED past cool-off → reset to PENDING.
      const expiresAt = new Date(Date.now() + PENDING_TTL_DAYS * 86400_000);
      await db.contactShareRequest.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          message: parsed.data.message?.slice(0, 1000) || null,
          applicationId: parsed.data.applicationId ?? null,
          expiresAt,
          grantedAt: null,
          deniedAt: null,
          revokedAt: null,
          denyReason: null,
        },
      });
    } else {
      // Brand-new row.
      await db.contactShareRequest.create({
        data: {
          requesterUserId: session.user.id,
          targetUserId: parsed.data.targetUserId,
          message: parsed.data.message?.slice(0, 1000) || null,
          applicationId: parsed.data.applicationId ?? null,
          expiresAt: new Date(Date.now() + PENDING_TTL_DAYS * 86400_000),
        },
      });
    }

    await audit({
      actorId: session.user.id,
      action: "contact_share.requested",
      entity: "User",
      entityId: parsed.data.targetUserId,
      meta: { applicationId: parsed.data.applicationId ?? null },
    });

    // Notify candidate. Inbox card has Approve/Deny buttons that
    // invoke the actions below.
    try {
      // Resolve the recruiter's name + company for the notification body
      const recruiter = await db.user.findUnique({
        where: { id: session.user.id },
        select: {
          name: true,
          email: true,
          employerProfile: {
            select: { company: { select: { name: true } } },
          },
        },
      });
      const recruiterName = recruiter?.name ?? recruiter?.email ?? "A recruiter";
      const companyName = recruiter?.employerProfile?.company.name;
      await notificationsQueue.add("contact-share.requested", {
        userId: parsed.data.targetUserId,
        type: "contact_share.requested",
        title: companyName
          ? `${recruiterName} at ${companyName} wants to contact you`
          : `${recruiterName} wants to contact you`,
        body: parsed.data.message
          ? parsed.data.message.slice(0, 200)
          : `Approve to share your email + phone. Decline to keep it private — they can still message you in-app.`,
        link: "/me/contact-shares",
        channels: ["IN_APP", "EMAIL"],
        actorId: session.user.id,
        groupKey: `contact-share:${session.user.id}:${parsed.data.targetUserId}`,
      });
    } catch (err) {
      logger.warn({ err }, "[contact-share] notify failed");
    }

    revalidatePath("/employer/contact-requests");
    return {
      ok: true,
      message:
        "Request sent. We'll let you know when they respond — or after 30 days if they don't.",
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[contact-share] request unhandled");
    return {
      ok: false,
      message: "Couldn't send request — try again in a moment.",
    };
  }
}

const idSchema = z.object({ requestId: z.string().min(1) });

/** Candidate approves a pending contact-share request. */
export async function grantContactShare(
  input: { requestId: string },
): Promise<ShareActionResult> {
  try {
    const { userId } = await requireUser();
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Invalid request." };

    const row = await db.contactShareRequest.findUnique({
      where: { id: parsed.data.requestId },
      select: { id: true, targetUserId: true, requesterUserId: true, status: true },
    });
    if (!row) return { ok: false, message: "Request not found." };
    if (row.targetUserId !== userId) {
      return { ok: false, message: "That request isn't for you." };
    }
    if (row.status === "GRANTED") {
      return { ok: true, message: "Already granted." };
    }
    if (row.status !== "PENDING") {
      return {
        ok: false,
        message: "That request is no longer pending. The recruiter can re-ask.",
      };
    }

    await db.contactShareRequest.update({
      where: { id: row.id },
      data: { status: "GRANTED", grantedAt: new Date() },
    });

    await audit({
      actorId: userId,
      action: "contact_share.granted",
      entity: "ContactShareRequest",
      entityId: row.id,
      meta: { recruiterId: row.requesterUserId },
    });

    // Tell the recruiter — they'll want to act on it quickly.
    try {
      const candidate = await db.candidateProfile.findUnique({
        where: { userId },
        select: { firstName: true, lastName: true },
      });
      const candidateName = candidate
        ? `${candidate.firstName} ${candidate.lastName ?? ""}`.trim()
        : "A candidate";
      await notificationsQueue.add("contact-share.granted", {
        userId: row.requesterUserId,
        type: "contact_share.granted",
        title: `${candidateName} shared their contact`,
        body: "You can now see their email and phone on their profile.",
        link: `/employer/contact-requests`,
        channels: ["IN_APP", "EMAIL"],
        actorId: userId,
      });
    } catch (err) {
      logger.warn({ err }, "[contact-share] grant notify failed");
    }

    revalidatePath("/me/contact-shares");
    revalidatePath("/me/notifications");
    return { ok: true, message: "Contact shared. They'll be notified." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[contact-share] grant unhandled");
    return { ok: false, message: "Couldn't grant — try again in a moment." };
  }
}

const denySchema = z.object({
  requestId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

/** Candidate denies a pending contact-share request. */
export async function denyContactShare(input: {
  requestId: string;
  reason?: string;
}): Promise<ShareActionResult> {
  try {
    const { userId } = await requireUser();
    const parsed = denySchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Invalid request." };

    const row = await db.contactShareRequest.findUnique({
      where: { id: parsed.data.requestId },
      select: { id: true, targetUserId: true, status: true, requesterUserId: true },
    });
    if (!row) return { ok: false, message: "Request not found." };
    if (row.targetUserId !== userId) {
      return { ok: false, message: "That request isn't for you." };
    }
    if (row.status === "DENIED") {
      return { ok: true, message: "Already declined." };
    }
    if (row.status !== "PENDING") {
      return {
        ok: false,
        message: "That request is no longer pending.",
      };
    }

    await db.contactShareRequest.update({
      where: { id: row.id },
      data: {
        status: "DENIED",
        deniedAt: new Date(),
        denyReason: parsed.data.reason?.slice(0, 500) || null,
      },
    });

    await audit({
      actorId: userId,
      action: "contact_share.denied",
      entity: "ContactShareRequest",
      entityId: row.id,
      meta: { recruiterId: row.requesterUserId },
    });

    // Quietly notify the recruiter so they stop wondering. Less
    // emphatic than the GRANTED message — IN_APP only, no email.
    try {
      await notificationsQueue.add("contact-share.denied", {
        userId: row.requesterUserId,
        type: "contact_share.denied",
        title: "Contact request declined",
        body:
          "The candidate chose not to share their contact. You can still message them in-app.",
        link: "/employer/contact-requests",
        channels: ["IN_APP"],
      });
    } catch (err) {
      logger.warn({ err }, "[contact-share] deny notify failed");
    }

    revalidatePath("/me/contact-shares");
    revalidatePath("/me/notifications");
    return { ok: true, message: "Declined." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[contact-share] deny unhandled");
    return { ok: false, message: "Couldn't decline — try again in a moment." };
  }
}

/** Candidate revokes an existing GRANTED share. */
export async function revokeContactShare(input: {
  requestId: string;
}): Promise<ShareActionResult> {
  try {
    const { userId } = await requireUser();
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Invalid request." };

    const row = await db.contactShareRequest.findUnique({
      where: { id: parsed.data.requestId },
      select: { id: true, targetUserId: true, status: true, requesterUserId: true },
    });
    if (!row) return { ok: false, message: "Request not found." };
    if (row.targetUserId !== userId) {
      return { ok: false, message: "That share isn't yours to revoke." };
    }
    if (row.status !== "GRANTED") {
      return { ok: false, message: "Only granted shares can be revoked." };
    }
    await db.contactShareRequest.update({
      where: { id: row.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await audit({
      actorId: userId,
      action: "contact_share.revoked",
      entity: "ContactShareRequest",
      entityId: row.id,
      meta: { recruiterId: row.requesterUserId },
    });
    // Don't notify the recruiter — finding out their access was
    // pulled creates an unproductive "what did I do wrong" loop.
    // It just silently disappears from their dashboard.
    revalidatePath("/me/contact-shares");
    return { ok: true, message: "Revoked. They no longer see your contact." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[contact-share] revoke unhandled");
    return { ok: false, message: "Couldn't revoke — try again in a moment." };
  }
}
