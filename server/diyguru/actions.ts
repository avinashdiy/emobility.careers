"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";

/**
 * Candidate-initiated self-claim of the DIYguru Verified badge.
 *
 * The CSV import (server/admin/actions → importDIYguruRoster) only
 * auto-verifies candidates who already have an account at the moment
 * of import. Anyone who signs up *after* a roster upload — which is
 * the common case for fresh DIYguru graduates — never gets verified
 * unless they nudge an admin manually. That's a high-friction gap.
 *
 * This action lets the candidate themselves trigger the lookup. The
 * security model is "their own verified email":
 *
 *   1. Pull the signed-in user's email (NextAuth has already proven
 *      it via OAuth provider or email-OTP at signup, so we trust it).
 *   2. Look the email up in DIYguruRoster (case-insensitive).
 *   3. If found, flip the candidate's `isDIYguruVerified` true,
 *      copy across studentId / labTags from the roster row, stamp
 *      the roster row as claimed, and audit-log.
 *   4. If not found, return a friendly "no match" — never reveal
 *      what *is* in the roster.
 *
 * No OTP-by-email flow because the user's email is already verified
 * — re-verifying it would just be ceremony.
 */
export async function claimDIYguruVerification(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  // No role check — claiming your own DIYguru badge is a self-action
  // on personal data. The roster lookup below is the real gate: only
  // users whose email matches a roster row can flip the badge.
  // EMPLOYERs who are themselves DIYguru graduates (it happens —
  // ex-students who later founded EV companies and post jobs here)
  // were previously locked out for no reason.
  // Rate-limit claim attempts so a curious user can't probe the
  // roster by spamming the action with different identifier shapes.
  // Reuses the `saveItem` bucket — same low-volume profile.
  await rateLimitOrThrow(`diyguru-claim:${session.user.id}`, "saveItem");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      candidateProfile: {
        select: { id: true, isDIYguruVerified: true, labExposureTags: true },
      },
    },
  });
  if (!user || !user.candidateProfile) {
    return { ok: false, message: "Finish onboarding first." };
  }
  // Belt-and-braces — guards against a bug where someone tries to claim
  // before email verification. NextAuth's email-OTP path stamps
  // emailVerifiedAt; OAuth's bridgePrismaAdapter stamps it at first
  // login. So in normal flows this is always non-null. The check is here
  // so a future regression doesn't silently issue verified badges from
  // unverified emails.
  if (!user.emailVerifiedAt) {
    return {
      ok: false,
      message: "Verify your email first — we'll only check the DIYguru roster against a verified address.",
    };
  }
  if (user.candidateProfile.isDIYguruVerified) {
    return { ok: true, message: "You're already verified." };
  }

  // Case-insensitive email lookup. We don't dedup by email at import
  // time (a candidate can appear in multiple cohorts), so we may get
  // multiple roster rows — pick the most recent.
  const rosterRow = await db.dIYguruRoster.findFirst({
    where: { email: { equals: user.email, mode: "insensitive" } },
    orderBy: [
      { completionDate: "desc" },
      { createdAt: "desc" },
    ],
  });

  if (!rosterRow) {
    return {
      ok: false,
      message:
        "We don't see your email in the DIYguru roster yet. If you've recently completed a course, ping students@diyguru.org with your enrollment details — they sync with us regularly.",
    };
  }

  await db.$transaction([
    db.candidateProfile.update({
      where: { id: user.candidateProfile.id },
      data: {
        isDIYguruVerified: true,
        diyguruStudentId: rosterRow.studentId,
        diyguruVerifiedAt: new Date(),
        // Merge lab tags — preserve any existing ones (could have been
        // self-asserted), append from the roster, dedupe. We don't
        // simply overwrite because tags from another verification
        // pathway should survive.
        ...(rosterRow.labTags.length > 0
          ? {
              labExposureTags: Array.from(
                new Set([
                  ...user.candidateProfile.labExposureTags,
                  ...rosterRow.labTags,
                ]),
              ),
            }
          : {}),
      },
    }),
    db.dIYguruRoster.update({
      where: { id: rosterRow.id },
      data: {
        claimedAt: new Date(),
        claimedByUserId: user.id,
      },
    }),
  ]);

  await audit({
    actorId: user.id,
    action: "diyguru.self_claim",
    entity: "CandidateProfile",
    entityId: user.candidateProfile.id,
    meta: {
      rosterRowId: rosterRow.id,
      courseName: rosterRow.courseName,
      studentId: rosterRow.studentId,
    },
  });

  // Refresh: profile page shows the badge, /[username] public page
  // shows the badge, /me dashboard recalculates completeness.
  revalidatePath("/me/profile");
  revalidatePath("/me");
  // The slug-based public profile lives at /[username] — we don't have
  // the slug here without an extra query. Targeting layout invalidates
  // the cached header. Cheap and correct.
  revalidatePath("/[username]", "page");

  const courseSuffix = rosterRow.courseName ? ` for ${rosterRow.courseName}` : "";
  return {
    ok: true,
    message: `Verified${courseSuffix}. Your profile now shows the DIYguru badge.`,
  };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[diyguru-claim] unhandled error");
    return {
      ok: false,
      message:
        "Couldn't process your claim — the team has been notified. Try again in a few minutes.",
    };
  }
}
