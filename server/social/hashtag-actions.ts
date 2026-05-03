"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import { pgRateLimit } from "@/lib/rate-limit-pg";
import { normalizeHashtag, normalizeHashtags } from "@/lib/social/hashtag";
import type { FormState } from "@/lib/form-state";

/**
 * Server actions for the subscribable-hashtag feature.
 *
 * The model is dead simple — each subscription is just (userId,
 * normalised tag). No auto-bootstrap from skills/domains; v1 is
 * explicit-only by design. The /topics discovery page suggests
 * tags but never auto-applies them.
 *
 * Three actions:
 *   • subscribeHashtag — single-tag follow from /tag/[slug] or
 *                        a chip click on /topics.
 *   • unsubscribeHashtag — mirror.
 *   • bulkSubscribeHashtags — onboarding step, accepts an array
 *                             from the "pick 3+ topics" form.
 */

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

// ─── single subscribe ────────────────────────────────────────

export interface SubscribeResult extends FormState {
  /// Echoed back so the caller's optimistic UI can confirm the
  /// canonical form (e.g. user typed "Battery Engineering" → we
  /// return "battery-engineering").
  tag?: string;
}

export async function subscribeHashtag(
  _prev: SubscribeResult,
  formData: FormData,
): Promise<SubscribeResult> {
  try {
    const session = await requireUser();
    const raw = z.string().min(1).max(50).parse(formData.get("tag"));
    const tag = normalizeHashtag(raw);
    if (!tag) {
      return {
        ok: false,
        message: "Tag must be 2–30 chars, letters/numbers/dashes only.",
      };
    }
    // Rate limit: 30 follows per hour per user. Catches a runaway
    // script subscribing to thousands of tags; well clear of any
    // realistic human (the onboarding step caps at 10).
    const limit = await pgRateLimit({
      action: "hashtag.subscribe",
      userId: session.user.id,
      opts: { limit: 30, windowMs: 60 * 60 * 1000 },
    });
    if (!limit.ok) return { ok: false, message: limit.message };

    // Idempotent — re-subscribing is a no-op via the @@unique.
    await db.hashtagSubscription.upsert({
      where: { userId_tag: { userId: session.user.id, tag } },
      create: { userId: session.user.id, tag },
      update: {}, // existing row stays put (createdAt unchanged)
    });
    await audit({
      actorId: session.user.id,
      action: "hashtag.subscribed",
      entity: "HashtagSubscription",
      entityId: tag,
    });
    revalidatePath(`/tag/${tag}`);
    revalidatePath("/me/topics");
    revalidatePath("/feed");
    return { ok: true, tag, message: `Following #${tag}.` };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[hashtag] subscribe failed");
    return { ok: false, message: "Couldn't follow that tag. Try again." };
  }
}

// ─── single unsubscribe ──────────────────────────────────────

export async function unsubscribeHashtag(formData: FormData): Promise<void> {
  try {
    const session = await requireUser();
    const tag = normalizeHashtag(z.string().parse(formData.get("tag")));
    if (!tag) return;
    await db.hashtagSubscription.deleteMany({
      where: { userId: session.user.id, tag },
    });
    await audit({
      actorId: session.user.id,
      action: "hashtag.unsubscribed",
      entity: "HashtagSubscription",
      entityId: tag,
    });
    revalidatePath(`/tag/${tag}`);
    revalidatePath("/me/topics");
    revalidatePath("/feed");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[hashtag] unsubscribe failed");
  }
}

// ─── bulk subscribe (onboarding) ─────────────────────────────

export interface BulkSubscribeResult extends FormState {
  /// Number of tags actually subscribed (after dedupe + already-
  /// subscribed filter).
  added?: number;
  /// Tags rejected by normaliser — useful for a "we ignored: x, y" hint.
  invalid?: string[];
}

/**
 * Onboarding "pick 3+ topics" step. The form sends one or more
 * `tag` values; we normalise + dedupe + cap, skip any the user
 * already subscribed to, then upsert the rest in one transaction.
 *
 * Doesn't redirect — caller (the onboarding page) decides where
 * to send the user next.
 */
export async function bulkSubscribeHashtags(
  _prev: BulkSubscribeResult,
  formData: FormData,
): Promise<BulkSubscribeResult> {
  try {
    const session = await requireUser();
    const raw = formData.getAll("tag").map(String);
    const tags = normalizeHashtags(raw, 50);
    const invalid = raw
      .map((s) => ({ raw: s, norm: normalizeHashtag(s) }))
      .filter((p) => !p.norm)
      .map((p) => p.raw);
    if (tags.length === 0) {
      return {
        ok: false,
        message: "Pick at least one tag — letters/numbers/dashes only.",
        invalid: invalid.length > 0 ? invalid : undefined,
      };
    }
    // Same per-hour ceiling as single subscribe — onboarding's 10-
    // tag cap is well within 30/hour.
    const limit = await pgRateLimit({
      action: "hashtag.subscribe",
      userId: session.user.id,
      opts: { limit: 30, windowMs: 60 * 60 * 1000 },
    });
    if (!limit.ok) return { ok: false, message: limit.message };

    // Compute the delta — only insert rows we don't already have.
    // Cheap because the (userId, tag) unique covers the whole
    // search space.
    const existing = await db.hashtagSubscription.findMany({
      where: { userId: session.user.id, tag: { in: tags } },
      select: { tag: true },
    });
    const existingSet = new Set(existing.map((e) => e.tag));
    const toInsert = tags.filter((t) => !existingSet.has(t));

    if (toInsert.length > 0) {
      await db.hashtagSubscription.createMany({
        data: toInsert.map((tag) => ({ userId: session.user.id, tag })),
        // skipDuplicates is belt-and-braces — we already filtered
        // by the existing set, but a concurrent subscribe (e.g.,
        // user submits the form twice quickly) could race in.
        skipDuplicates: true,
      });
    }
    await audit({
      actorId: session.user.id,
      action: "hashtag.bulk_subscribed",
      entity: "HashtagSubscription",
      meta: { added: toInsert.length, total: tags.length },
    });

    revalidatePath("/me/topics");
    revalidatePath("/feed");
    return {
      ok: true,
      added: toInsert.length,
      message:
        toInsert.length === 0
          ? "All those tags were already in your topics."
          : `Following ${toInsert.length} new ${toInsert.length === 1 ? "topic" : "topics"}.`,
      invalid: invalid.length > 0 ? invalid : undefined,
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[hashtag] bulk subscribe failed");
    return { ok: false, message: "Couldn't subscribe. Try again." };
  }
}

// ─── onboarding wrapper ──────────────────────────────────────

/**
 * Used by /onboarding/topics. Same logic as bulkSubscribeHashtags
 * but redirects to /me on success — onboarding is a one-shot flow
 * and we want the page transition to feel terminal, not a result-
 * banner that the user has to dismiss.
 *
 * Errors silently here (logged + tracked) rather than blocking the
 * onboarding finish — a user who's already typed their preferences
 * shouldn't get stuck because a network blip dropped the topic set.
 */
export async function completeOnboardingTopics(formData: FormData): Promise<void> {
  try {
    const session = await requireUser();
    const raw = formData.getAll("tag").map(String);
    const tags = normalizeHashtags(raw, 50);

    if (tags.length > 0) {
      const existing = await db.hashtagSubscription.findMany({
        where: { userId: session.user.id, tag: { in: tags } },
        select: { tag: true },
      });
      const existingSet = new Set(existing.map((e) => e.tag));
      const toInsert = tags.filter((t) => !existingSet.has(t));
      if (toInsert.length > 0) {
        await db.hashtagSubscription.createMany({
          data: toInsert.map((tag) => ({ userId: session.user.id, tag })),
          skipDuplicates: true,
        });
        await audit({
          actorId: session.user.id,
          action: "hashtag.bulk_subscribed",
          entity: "HashtagSubscription",
          meta: { added: toInsert.length, source: "onboarding" },
        });
        revalidatePath("/feed");
        revalidatePath("/me/topics");
      }
    }
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[hashtag] onboarding topics failed");
    // intentional: don't block onboarding completion on this step
  }
  redirect("/me");
}
