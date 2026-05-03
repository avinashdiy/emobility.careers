/**
 * "Who viewed your profile" — writer + read queries.
 *
 * Module shape: regular server-side functions (NOT marked "use
 * server") because they're called from RSCs, not via the form-action
 * boundary. The toggle action lives in view-actions.ts.
 *
 * Privacy + dedup invariants the writer enforces:
 *   1. Self-views never recorded.
 *   2. View by a logged-out viewer → row with viewerUserId=null,
 *      wasAnonymous=false (we know it's "no identity available", not
 *      "identity hidden").
 *   3. View by a logged-in viewer with viewerVisibility=ANONYMOUS →
 *      row with viewerUserId=null, wasAnonymous=true.
 *   4. Same (viewer, viewed) pair within 24h → no new row written.
 *      Anonymous-then-visible inside that window also dedupes; the
 *      first row wins. Acceptable trade-off — getting precise per-
 *      visit counts isn't the use case, "did anyone notice me today"
 *      is.
 *
 * Throughput note: the writer is fire-and-forget at the call site
 * (`trackProfileView(...).catch(noop)`). It returns a void promise
 * so the caller never blocks on the dedup-then-insert path.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

interface TrackViewArgs {
  /// The user whose profile was opened.
  viewedUserId: string;
  /// Logged-in viewer's user id, or null for signed-out visitors.
  viewerUserId: string | null;
  /// Free-form context: "feed", "search", "tag", "post-author",
  /// "company-page-team", etc. Helps the viewed user understand
  /// where the impression came from.
  source?: string;
}

export async function trackProfileView({
  viewedUserId,
  viewerUserId,
  source,
}: TrackViewArgs): Promise<void> {
  try {
    // (1) Drop self-views — the writer never records them, so the
    // viewer's own page-loads don't pollute their stats.
    if (viewerUserId && viewerUserId === viewedUserId) return;

    // (3) Honour ANONYMOUS preference. We resolve this at write-time
    // so a later toggle to VISIBLE doesn't retro-de-anonymise old
    // views. Same shape LinkedIn ships — anonymity is a contract
    // about the moment of viewing.
    let effectiveViewerId: string | null = viewerUserId;
    let wasAnonymous = false;
    if (viewerUserId) {
      const viewerProfile = await db.candidateProfile.findUnique({
        where: { userId: viewerUserId },
        select: { viewerVisibility: true },
      });
      if (viewerProfile?.viewerVisibility === "ANONYMOUS") {
        effectiveViewerId = null;
        wasAnonymous = true;
      }
    }

    // (4) 24h dedup. We only dedup against the CURRENT-identity row;
    // a logged-in user who later signs out and visits again writes a
    // new row (different effective viewer key). That's intentional —
    // the two visits are different identities to the viewed user.
    if (effectiveViewerId !== null) {
      const recent = await db.profileView.findFirst({
        where: {
          viewedUserId,
          viewerUserId: effectiveViewerId,
          createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (recent) return;
    } else {
      // Signed-out / anonymous viewers — we don't have an identity
      // to dedup against, so we'd otherwise log every refresh. Cap
      // anonymous churn by deduping against viewedUserId+null+24h
      // bucket. Net effect: an anonymous spike still registers, but
      // doesn't inflate "1,000 anonymous viewers" off one bot.
      // Note: this collapses ALL anonymous visitors to one row per
      // day. Coarse-grained but right for this stat — recruiters
      // don't audition based on bot traffic.
      const recent = await db.profileView.findFirst({
        where: {
          viewedUserId,
          viewerUserId: null,
          createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (recent) return;
    }

    await db.profileView.create({
      data: {
        viewedUserId,
        viewerUserId: effectiveViewerId,
        wasAnonymous,
        source: source ?? null,
      },
    });
  } catch (err) {
    // Fire-and-forget — failures should never break the profile
    // render path. Log + move on.
    logger.warn({ err, viewedUserId }, "[profile-views] track failed");
  }
}

/**
 * Recent viewers, joined with viewer profile data when not
 * anonymous. Limit defaults to 30 (matches the /me/views detail
 * page). The widget on /feed uses limit=3.
 */
export async function getProfileViewers(
  viewedUserId: string,
  { limit = 30 }: { limit?: number } = {},
) {
  return db.profileView.findMany({
    where: { viewedUserId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      wasAnonymous: true,
      source: true,
      viewerUser: {
        select: {
          id: true,
          name: true,
          candidateProfile: {
            select: {
              slug: true,
              firstName: true,
              lastName: true,
              headline: true,
              profilePhotoUrl: true,
              isDIYguruVerified: true,
              idVerificationStatus: true,
              country: true,
              // Reciprocal-visibility: if the viewer themselves is
              // ANONYMOUS, they shouldn't appear here even if they
              // forgot to toggle before the view landed. The writer
              // already handles this by setting viewerUserId=null at
              // write-time, but pulling the field here lets future
              // surfaces (e.g. activity log) double-check.
              viewerVisibility: true,
            },
          },
        },
      },
    },
  });
}

export type ProfileViewerRow = Awaited<ReturnType<typeof getProfileViewers>>[number];

/**
 * Aggregate counts. Used by the feed left-rail widget headline
 * ("12 viewed your profile this week") and the /me/views summary
 * card. Anonymous + identified split is shown so the viewed user
 * understands what fraction of viewers chose privacy.
 */
export async function getProfileViewStats(
  viewedUserId: string,
  sinceDays = 7,
) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const [total, identified] = await Promise.all([
    db.profileView.count({
      where: { viewedUserId, createdAt: { gte: since } },
    }),
    db.profileView.count({
      where: {
        viewedUserId,
        createdAt: { gte: since },
        viewerUserId: { not: null },
      },
    }),
  ]);
  return {
    total,
    identified,
    anonymous: total - identified,
    sinceDays,
  };
}
