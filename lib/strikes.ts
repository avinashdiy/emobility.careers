import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import type { StrikeReason, AccountState } from "@prisma/client";

/**
 * Moderation strike state machine. Single writer to:
 *   • the Strike table (audit trail)
 *   • User.strikes counter
 *   • User.accountState
 *   • User.suspendedUntil + User.status (the legacy AccountStatus
 *     enum that middleware reads — we keep both in sync so the auth
 *     gate doesn't need to know about the new state machine).
 *
 * Thresholds:
 *   • 1-2 strikes  → state = WARNED
 *   • 3-4 strikes  → state = SUSPENDED + 7-day suspendedUntil
 *   • 5+ strikes   → state = BANNED + permanent (status flips to
 *     SUSPENDED at the legacy layer; sign-in blocked entirely)
 *
 * The user is notified on every strike with the reason. Audit-log
 * captures who issued the strike + the snapshot at issue time so
 * we can prove the state machine was correct after the fact.
 */

const SUSPEND_THRESHOLD = 3;
const BAN_THRESHOLD = 5;
const SUSPENSION_DAYS = 7;

export interface IssueStrikeInput {
  /// User who's getting struck.
  targetUserId: string;
  /// Admin who's issuing the strike. Null only when the system
  /// auto-issues (e.g. banned-word auto-flag escalated to a strike
  /// by another worker — not currently wired but the column tolerates it).
  authorId: string | null;
  reason: StrikeReason;
  /// Optional free-text. Required when reason = OTHER.
  note?: string;
  /// Optional reference back to the offending content — postComment.id
  /// for COMMENT_HIDDEN, post.id for POST_REMOVED, auditLog.id for
  /// REPORT_UPHELD, etc.
  evidenceRef?: string;
}

export interface IssueStrikeResult {
  ok: boolean;
  newStrikeCount: number;
  newAccountState: AccountState;
  /// True when this strike pushed the user across a threshold
  /// (WARNED→SUSPENDED, SUSPENDED→BANNED). Useful for the admin UI
  /// to render an extra banner.
  thresholdCrossed: boolean;
  suspendedUntil: Date | null;
}

function nextState(strikeCount: number): {
  state: AccountState;
  suspendedUntil: Date | null;
} {
  if (strikeCount >= BAN_THRESHOLD) {
    return { state: "BANNED", suspendedUntil: null };
  }
  if (strikeCount >= SUSPEND_THRESHOLD) {
    return {
      state: "SUSPENDED",
      suspendedUntil: new Date(Date.now() + SUSPENSION_DAYS * 86400_000),
    };
  }
  if (strikeCount >= 1) {
    return { state: "WARNED", suspendedUntil: null };
  }
  return { state: "ACTIVE", suspendedUntil: null };
}

export async function issueStrike(input: IssueStrikeInput): Promise<IssueStrikeResult> {
  const target = await db.user.findUnique({
    where: { id: input.targetUserId },
    select: {
      id: true,
      email: true,
      strikes: true,
      accountState: true,
      role: true,
    },
  });
  if (!target) {
    return {
      ok: false,
      newStrikeCount: 0,
      newAccountState: "ACTIVE",
      thresholdCrossed: false,
      suspendedUntil: null,
    };
  }
  // Refuse to strike admins — accidental self-suspension would lock
  // out support. If this needs to change, do it manually via SQL or
  // via the existing `setUserStatus` admin tool with full audit.
  if (target.role === "ADMIN") {
    return {
      ok: false,
      newStrikeCount: target.strikes,
      newAccountState: target.accountState,
      thresholdCrossed: false,
      suspendedUntil: null,
    };
  }

  const newCount = target.strikes + 1;
  const { state: newState, suspendedUntil } = nextState(newCount);
  const previousState = target.accountState;
  const thresholdCrossed = previousState !== newState;

  // Mirror BANNED into the legacy AccountStatus.SUSPENDED so the
  // middleware auth gate (which only reads AccountStatus) blocks
  // login. Also flip on SUSPENDED for the 7-day cool-off.
  const legacyStatus =
    newState === "BANNED" || newState === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";

  await db.$transaction([
    db.strike.create({
      data: {
        targetUserId: target.id,
        authorId: input.authorId,
        reason: input.reason,
        note: input.note ?? null,
        evidenceRef: input.evidenceRef ?? null,
        newStrikeCount: newCount,
        newAccountState: newState,
      },
    }),
    db.user.update({
      where: { id: target.id },
      data: {
        strikes: newCount,
        accountState: newState,
        suspendedUntil,
        status: legacyStatus,
      },
    }),
  ]);

  await audit({
    actorId: input.authorId,
    action: "user.strike_issued",
    entity: "User",
    entityId: target.id,
    meta: {
      reason: input.reason,
      note: input.note ?? null,
      evidenceRef: input.evidenceRef ?? null,
      newStrikeCount: newCount,
      newAccountState: newState,
      previousAccountState: previousState,
    },
  });

  // Tell the user what just happened. Important: even BANNED users
  // get this notification — they can't log in to read it but the
  // email lands and lets them appeal via support.
  try {
    const titleByState: Record<AccountState, string> = {
      ACTIVE: `Account warning`,
      WARNED: `Account warning — ${newCount} strike${newCount === 1 ? "" : "s"}`,
      SUSPENDED: `Your account is suspended for ${SUSPENSION_DAYS} days`,
      BANNED: `Your account has been banned`,
    };
    await dispatchNotification({
      userId: target.id,
      type: `moderation.${newState.toLowerCase()}`,
      title: titleByState[newState],
      body: input.note
        ? `Reason: ${humanReason(input.reason)} — ${input.note}`
        : `Reason: ${humanReason(input.reason)}`,
      link: "/me/account",
      channels: ["IN_APP", "EMAIL"],
      actorId: input.authorId ?? undefined,
    });
  } catch (err) {
    logger.warn({ err, targetId: target.id }, "[strikes] notify failed");
  }

  return {
    ok: true,
    newStrikeCount: newCount,
    newAccountState: newState,
    thresholdCrossed,
    suspendedUntil,
  };
}

/** Reverse a strike — admin oversight when one was issued in error.
    Decrements the counter, recomputes state. Audit-logged separately
    so a "strike removed" trail is distinct from issuance. */
export async function removeStrike(strikeId: string, removerId: string): Promise<void> {
  const strike = await db.strike.findUnique({
    where: { id: strikeId },
    select: { id: true, targetUserId: true },
  });
  if (!strike) return;

  const target = await db.user.findUnique({
    where: { id: strike.targetUserId },
    select: { strikes: true },
  });
  if (!target) return;

  const newCount = Math.max(0, target.strikes - 1);
  const { state: newState, suspendedUntil } = nextState(newCount);
  const legacyStatus =
    newState === "BANNED" || newState === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";

  await db.$transaction([
    db.strike.delete({ where: { id: strikeId } }),
    db.user.update({
      where: { id: strike.targetUserId },
      data: {
        strikes: newCount,
        accountState: newState,
        suspendedUntil,
        status: legacyStatus,
      },
    }),
  ]);

  await audit({
    actorId: removerId,
    action: "user.strike_removed",
    entity: "User",
    entityId: strike.targetUserId,
    meta: { strikeId, newStrikeCount: newCount, newAccountState: newState },
  });
}

/** UI-friendly description of a strike reason. */
export function humanReason(reason: StrikeReason): string {
  const map: Record<StrikeReason, string> = {
    COMMENT_HIDDEN: "Comment hidden by a moderator",
    POST_REMOVED: "Post removed by a moderator",
    REPORT_UPHELD: "A report against your content was upheld",
    HARASSMENT: "Harassment or bullying",
    IMPERSONATION: "Impersonating another person or brand",
    SPAM: "Spammy posting / messaging",
    TOS_VIOLATION: "Violation of our Terms of Service",
    OTHER: "See the reviewer's note",
  };
  return map[reason];
}

/** Lift a SUSPENDED account when its `suspendedUntil` has passed.
    Called by the notification-maintenance worker tick. Idempotent. */
export async function liftExpiredSuspensions(): Promise<{ lifted: number }> {
  const now = new Date();
  const expired = await db.user.findMany({
    where: {
      accountState: "SUSPENDED",
      suspendedUntil: { lt: now },
    },
    select: { id: true, strikes: true },
    take: 500,
  });
  let lifted = 0;
  for (const u of expired) {
    // Re-derive state: with strikes still ≥ BAN_THRESHOLD they should
    // be BANNED, not lifted. Otherwise drop to WARNED (since they
    // were SUSPENDED, they had ≥ 3 strikes; if removeStrike pulled
    // them below 3, this loop won't see them anyway).
    const target = u.strikes >= BAN_THRESHOLD ? "BANNED" : "WARNED";
    const legacyStatus = target === "BANNED" ? "SUSPENDED" : "ACTIVE";
    await db.user.update({
      where: { id: u.id },
      data: {
        accountState: target,
        suspendedUntil: null,
        status: legacyStatus,
      },
    });
    lifted += 1;
  }
  if (lifted > 0) {
    logger.info({ lifted }, "[strikes] suspensions lifted by tick");
  }
  return { lifted };
}
