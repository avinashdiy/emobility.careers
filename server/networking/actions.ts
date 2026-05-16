"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { isRouterControlError } from "@/lib/server-action-errors";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * #5 Skill-trade pairing + #3 Warm-intro graph — shared "connect to
 * another candidate" server actions. Both mint a peer MessageThread
 * tagged with the appropriate `source` so the UI on each side can
 * render the right context strip.
 *
 * Auth + rate-limit: every connect request runs through `saveItem`
 * preset (~30/min/user). Prevents a bored or hostile user from
 * mass-spamming intro requests across the platform.
 *
 * Idempotency: if a thread already exists between the two
 * candidates, the existing thread is reused — we don't fork. The
 * uniqueness of peer threads (no applicationId, same two userIds)
 * is enforced at the DB level by the partial unique index
 * `message_thread_peer_uniq` (scripts/migrations/2026-05-…).
 */

const SCHEMAS = {
  swap: z.object({
    targetSlug: z.string().min(1).max(60),
    /// Free-text intro message — optional. We render a default
    /// one-liner when blank so the recipient always has context.
    note: z.string().trim().max(400).optional(),
  }),
  warmIntro: z.object({
    targetSlug: z.string().min(1).max(60),
    jobId: z.string().min(1).max(40).optional(),
    note: z.string().trim().max(400).optional(),
  }),
};

export async function requestSkillSwap(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin?next=/me/skill-swap");

    try {
      await rateLimitOrThrow(`connect-req:${session.user.id}`, "saveItem");
    } catch (err) {
      if (isRouterControlError(err)) throw err;
      redirect("/me/skill-swap?error=" + encodeURIComponent("Slow down — try again in a minute."));
    }

    const parsed = SCHEMAS.swap.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/me/skill-swap?error=" + encodeURIComponent("Bad request — please retry."));
    }
    const { targetSlug, note } = parsed.data;

    const [me, target] = await Promise.all([
      db.candidateProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true, userId: true, slug: true, firstName: true },
      }),
      db.candidateProfile.findUnique({
        where: { slug: targetSlug },
        // cvVisibility filter is enforced AFTER fetch (Prisma's
        // `findUnique` doesn't accept a `where` filter beyond the
        // unique key). Without this check, a tampered `targetSlug`
        // would reach PRIVATE / EMPLOYERS_ONLY candidates who never
        // opted into peer-discovery — the suggestion engine in
        // skill-swap.ts already filters; the action did not.
        select: { id: true, userId: true, slug: true, firstName: true, cvVisibility: true },
      }),
    ]);
    if (!me) redirect("/onboarding");
    if (!target || target.userId === me.userId) {
      redirect("/me/skill-swap?error=" + encodeURIComponent("That candidate isn't reachable."));
    }
    // Privacy: PRIVATE = no peer messages at all; EMPLOYERS_ONLY =
    // gated to verified recruiters, not peer candidates.
    if (target.cvVisibility === "PRIVATE" || target.cvVisibility === "EMPLOYERS_ONLY") {
      redirect("/me/skill-swap?error=" + encodeURIComponent("That candidate isn't accepting peer requests right now."));
    }

    await mintConnectThread({
      senderUserId: me.userId,
      recipientUserId: target.userId,
      source: "SKILL_TRADE",
      note: note ?? `Hey ${target.firstName}, our skill-trade looked like a clean match — happy to swap notes for an hour?`,
      notificationTitle: `${me.firstName} wants to swap skills`,
      notificationBody: `Peer skill-trade request — read it in your inbox and reply if you're up for it.`,
    });

    redirect(`/me/messages?notice=` + encodeURIComponent(`Sent. We've opened a thread with ${target.firstName}.`));
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[requestSkillSwap] unexpected");
    redirect("/me/skill-swap?error=" + encodeURIComponent("Couldn't send — try again."));
  }
}

export async function requestWarmIntro(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin");

    try {
      await rateLimitOrThrow(`connect-req:${session.user.id}`, "saveItem");
    } catch (err) {
      if (isRouterControlError(err)) throw err;
      redirect("/me?error=" + encodeURIComponent("Slow down — try again in a minute."));
    }

    const parsed = SCHEMAS.warmIntro.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/me?error=" + encodeURIComponent("Bad request — please retry."));
    }
    const { targetSlug, jobId, note } = parsed.data;

    const [me, target] = await Promise.all([
      db.candidateProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true, userId: true, firstName: true },
      }),
      db.candidateProfile.findUnique({
        where: { slug: targetSlug },
        select: { id: true, userId: true, slug: true, firstName: true, cvVisibility: true },
      }),
    ]);
    if (!me) redirect("/onboarding");
    if (!target || target.userId === me.userId) {
      redirect("/me?error=" + encodeURIComponent("That alum isn't reachable."));
    }
    // Same privacy gate as the skill-swap action — PRIVATE / EMPLOYERS_ONLY
    // candidates are out of the peer-discovery loop. The warm-intro
    // suggestion engine already excludes them; this enforces the same
    // contract when the FormData is tampered or arrives stale.
    if (target.cvVisibility === "PRIVATE" || target.cvVisibility === "EMPLOYERS_ONLY") {
      redirect("/me?error=" + encodeURIComponent("That alum isn't accepting peer intros right now."));
    }

    let jobContext: { title: string; company: string } | null = null;
    if (jobId) {
      const job = await db.jobPosting.findUnique({
        where: { id: jobId },
        select: { title: true, company: { select: { name: true } } },
      });
      if (job) jobContext = { title: job.title, company: job.company.name };
    }

    const defaultIntro = jobContext
      ? `Hi ${target.firstName} — I'm applying for the ${jobContext.title} role at ${jobContext.company}. I noticed we share an alma mater — would you be open to a quick chat about the team / culture? 5 minutes would be plenty.`
      : `Hi ${target.firstName} — I noticed we share an alma mater and you're at a company I'm interested in. Open to a 5-min chat?`;

    await mintConnectThread({
      senderUserId: me.userId,
      recipientUserId: target.userId,
      source: "WARM_INTRO",
      note: note ?? defaultIntro,
      notificationTitle: `${me.firstName} wants a 5-min intro`,
      notificationBody: jobContext
        ? `A fellow alum is applying for ${jobContext.title} at your company and asked for a quick intro. No pressure.`
        : `A fellow alum sent an intro request. Reply if you're up for it.`,
    });

    redirect(`/me/messages?notice=` + encodeURIComponent(`Sent. Thread opened with ${target.firstName}.`));
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[requestWarmIntro] unexpected");
    redirect("/me?error=" + encodeURIComponent("Couldn't send — try again."));
  }
}

/**
 * Shared mint path for both skill-swap and warm-intro requests.
 * Re-uses an existing peer thread between the two candidates if one
 * exists (no fork), tags fresh threads with the appropriate
 * `source`, posts the intro message + dispatches an in-app
 * notification.
 *
 * Note: we treat peer-to-peer threads identically to the existing
 * candidate-recruiter peer-thread pattern. Both sides see the
 * thread in their `/me/messages` inbox; `candidateUserId` is the
 * RECIPIENT, `employerUserId` is the SENDER (a slight misnomer
 * since both sides are candidates — but the existing inbox query
 * shape handles arbitrary user-to-user threads via the two
 * nullable columns).
 */
async function mintConnectThread(args: {
  senderUserId: string;
  recipientUserId: string;
  source: "SKILL_TRADE" | "WARM_INTRO";
  note: string;
  notificationTitle: string;
  notificationBody: string;
}): Promise<void> {
  const { senderUserId, recipientUserId, source, note, notificationTitle, notificationBody } = args;

  // Canonicalize (employerUserId, candidateUserId) so the partial
  // unique index `message_thread_peer_uniq` actually covers BOTH
  // directions of the same pair. Without canonicalisation, two
  // concurrent requests (Alice→Bob and Bob→Alice) would each pass
  // their own findFirst (no row matching their direction) and each
  // insert successfully — the partial index is `WHERE applicationId
  // IS NULL` on `(employerUserId, candidateUserId)` but it can't
  // dedup the swapped tuple. We pick the lexicographically smaller
  // userId as `employerUserId` so every peer pair has exactly ONE
  // row regardless of who initiated.
  const [lowerUserId, higherUserId] = senderUserId < recipientUserId
    ? [senderUserId, recipientUserId]
    : [recipientUserId, senderUserId];

  // Reuse the existing peer thread when one exists, else create.
  // Wrapped in a try/catch around the create — under a concurrent
  // race the partial unique index throws P2002; we fall back to a
  // second findFirst on the now-existing row and proceed.
  let threadId: string;
  const existing = await db.messageThread.findFirst({
    where: {
      employerUserId: lowerUserId,
      candidateUserId: higherUserId,
      applicationId: null,
    },
    select: { id: true },
  });

  if (existing) {
    threadId = existing.id;
  } else {
    try {
      // Wrap thread + message + lastMessageAt in a single transaction
      // so a partial-create (thread without message, or thread with
      // message but stale lastMessageAt) can't leak into the inbox.
      // The mutual-interest mint path already uses this pattern; mirror
      // it here.
      const newId = await db.$transaction(async (tx) => {
        const thread = await tx.messageThread.create({
          data: {
            employerUserId: lowerUserId,
            candidateUserId: higherUserId,
            source,
            lastMessageAt: new Date(),
          },
        });
        await tx.message.create({
          data: {
            threadId: thread.id,
            senderId: senderUserId,
            body: note,
          },
        });
        return thread.id;
      });
      threadId = newId;
    } catch (err) {
      // P2002 unique-violation from the partial index means a
      // concurrent caller minted the thread between our findFirst
      // and create. Re-fetch and use that row; THEN post a message
      // to it (we don't want the loser-side request to silently
      // discard the user's intro note).
      const code = (err as { code?: string })?.code;
      if (code !== "P2002") {
        logger.error({ err }, "[connect-thread] unexpected create failure");
        throw err;
      }
      const winner = await db.messageThread.findFirst({
        where: {
          employerUserId: lowerUserId,
          candidateUserId: higherUserId,
          applicationId: null,
        },
        select: { id: true },
      });
      if (!winner) {
        // Shouldn't happen — P2002 means a row exists. Bail loudly.
        logger.error({ lowerUserId, higherUserId }, "[connect-thread] P2002 but no winner row found");
        return;
      }
      threadId = winner.id;
    }
  }

  // Always post the message + bump lastMessageAt. If the thread
  // pre-existed (either via earlier connect or a concurrent race),
  // the message is appended. If we just created it, the message
  // was already inserted inside the transaction above — skip the
  // duplicate write.
  if (existing) {
    await db.$transaction(async (tx) => {
      await tx.message.create({
        data: {
          threadId,
          senderId: senderUserId,
          body: note,
        },
      });
      await tx.messageThread.update({
        where: { id: threadId },
        data: { lastMessageAt: new Date() },
      });
    });
  }

  // Notification — gated by a 7-day groupKey dedup. Without this,
  // the recipient's bell would ping every time the sender re-fired
  // a request (rate-limit caps at ~30/min, but even 2 in a single
  // minute is noise). The `recruiter-peek` helper uses the same
  // pattern; mirroring it keeps dedup behaviour consistent across
  // peer-notification surfaces.
  const groupKey = `peer-${source.toLowerCase()}-${senderUserId}-${recipientUserId}`;
  const recentNotif = await db.notification.findFirst({
    where: {
      userId: recipientUserId,
      groupKey,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
  });
  if (!recentNotif) {
    try {
      await dispatchNotification({
        userId: recipientUserId,
        type: source === "SKILL_TRADE" ? "skill_swap.request" : "warm_intro.request",
        title: notificationTitle,
        body: notificationBody,
        link: `/me/messages/${threadId}`,
        channels: ["IN_APP"],
        groupKey,
      });
    } catch (err) {
      logger.warn({ err }, "[connect-thread] notification dispatch failed");
    }
  }

  revalidatePath("/me/messages");
}
