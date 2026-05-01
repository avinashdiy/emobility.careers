"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

/**
 * DPDPA / GDPR data-rights flow.
 *
 *   1. Export (Right to Access): user (or admin on their behalf)
 *      requests a JSON dump of every row tied to their user id +
 *      candidate profile. We don't generate the file synchronously
 *      because heavy candidates (10k posts, 100 applications) blow
 *      the request timeout — instead we serialise in `exportUserData`
 *      and stream JSON straight to the response.
 *
 *   2. Soft delete: set User.status=DELETED, scrub PII (name → "Deleted
 *      User", email → randomised, phone → null), unpublish posts +
 *      profile (visibility → PRIVATE), but keep referential integrity
 *      so applications, ATS history, audit log, and counterparty
 *      messages survive — they belong to the employer / counterparty,
 *      not the deleted user.
 *
 *   3. Hard delete: scheduled by `purgeDeletedAccounts` worker 30 days
 *      after soft-delete, removing the User row and cascade-deleting
 *      everything not under another user's authority.
 *
 * Both export and delete are admin-callable on a user's behalf (DPDPA
 * §11(2)). Audit log captures the actor in either case.
 */

async function requireSelfOrAdmin(targetUserId?: string): Promise<{
  actorId: string;
  actorRole: "ADMIN" | "OTHER";
  targetUserId: string;
}> {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const actorId = session.user.id;
  const isAdmin = session.user.role === "ADMIN";
  const target = targetUserId ?? actorId;
  if (target !== actorId && !isAdmin) redirect("/403");
  return {
    actorId,
    actorRole: isAdmin ? "ADMIN" : "OTHER",
    targetUserId: target,
  };
}

/** Bundle every row tied to a user into a single JSON-serialisable
    object. Top-level shape: `{ user, candidateProfile, applications,
    posts, comments, reactions, messages, savedJobs, jobAlerts,
    auditTrail }`. The shape is documented in /me/account so users
    know what they'll get. */
export async function exportUserData(targetUserId?: string): Promise<{
  ok: boolean;
  data?: unknown;
  message?: string;
}> {
  const { actorId, actorRole, targetUserId: targetId } = await requireSelfOrAdmin(targetUserId);

  const user = await db.user.findUnique({
    where: { id: targetId },
    include: {
      accounts: { select: { provider: true, type: true } },
      candidateProfile: {
        include: {
          experiences: true,
          education: true,
          skills: { include: { skill: { select: { name: true } } } },
          certifications: true,
          projects: true,
          awards: true,
          evDomains: { include: { evDomain: { select: { name: true } } } },
          // Application + saved-job + alerts hang off CandidateProfile,
          // not User directly. Same with anything sourced from a job
          // search (savedJobs / jobAlerts) — these are candidate-side
          // entities. We pick them up on the profile include below.
          applications: {
            include: {
              // Relation is named `history` on Application, not
              // `stageHistory` (the shared StageHistory model is used
              // here as the row type, exposed via the `history` field).
              history: true,
              job: { select: { id: true, title: true, slug: true } },
            },
          },
          savedJobs: { select: { jobId: true, createdAt: true } },
          jobAlerts: true,
        },
      },
      employerProfile: { include: { company: { select: { name: true, slug: true } } } },
      sentMessages: { select: { id: true, body: true, createdAt: true, threadId: true } },
      notificationPrefs: true,
      // posts / postComments / reactions — selected via separate query
      // since they're large but uncomplicated.
    },
  });
  if (!user) return { ok: false, message: "User not found." };

  const [posts, comments, reactions] = await Promise.all([
    db.post.findMany({
      where: { authorId: targetId },
      select: {
        id: true,
        body: true,
        kind: true,
        visibility: true,
        createdAt: true,
        hashtags: true,
      },
    }),
    db.postComment.findMany({
      where: { authorId: targetId },
      select: { id: true, body: true, postId: true, createdAt: true },
    }),
    db.postReaction.findMany({
      where: { userId: targetId },
      select: { type: true, postId: true, createdAt: true },
    }),
  ]);

  const auditTrail = await db.auditLog.findMany({
    where: {
      OR: [{ actorId: targetId }, { entity: "User", entityId: targetId }],
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      action: true,
      entity: true,
      entityId: true,
      meta: true,
      createdAt: true,
    },
  });

  // Strip employer-side notes/ratings on applications — they're not
  // the candidate's data even though they're attached to the
  // application row. Applications are sourced via the candidate
  // profile include above.
  const sanitisedApplications = (user.candidateProfile?.applications ?? []).map(
    (a: { rating?: unknown }) => ({
      ...a,
      rating: null,
      employerNotes: null,
    }),
  );

  await audit({
    actorId,
    action:
      actorRole === "ADMIN" && actorId !== targetId
        ? "admin.user_data_exported"
        : "user.data_exported",
    entity: "User",
    entityId: targetId,
  });

  return {
    ok: true,
    data: {
      exportedAt: new Date().toISOString(),
      requestedBy: actorId,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        emailVerifiedAt: user.emailVerifiedAt,
        phoneVerifiedAt: user.phoneVerifiedAt,
        accounts: user.accounts,
      },
      candidateProfile: user.candidateProfile,
      employerProfile: user.employerProfile,
      applications: sanitisedApplications,
      posts,
      comments,
      reactions,
      sentMessages: user.sentMessages,
      savedJobs: user.candidateProfile?.savedJobs ?? [],
      jobAlerts: user.candidateProfile?.jobAlerts ?? [],
      notificationPrefs: user.notificationPrefs,
      auditTrail,
    },
  };
}

/**
 * Soft-delete a user account: status → DELETED, PII scrubbed, posts
 * + profile flipped to PRIVATE. Hard delete happens 30 days later
 * via the `purgeDeletedAccounts` cron — gives the user an "oh shit
 * I changed my mind" window without us implementing a separate
 * "deactivate" path.
 */
/** Server-action variant — used directly from `<form action={...}>`.
    Returns void: redirects on self-delete, or to an error/notice
    querystring on admin-delete. Use the underscore-prefixed core
    function elsewhere if you need the result tuple. */
export async function softDeleteAccount(formData: FormData): Promise<void> {
  const targetUserId = (formData.get("targetUserId") as string | null) ?? undefined;
  const reason = String(formData.get("reason") ?? "").slice(0, 500) || null;

  const { actorId, actorRole, targetUserId: targetId } = await requireSelfOrAdmin(targetUserId);

  const target = await db.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      candidateProfile: { select: { id: true } },
    },
  });
  if (!target) {
    redirect(
      "/me/account?error=" + encodeURIComponent("User not found."),
    );
  }
  if (target.role === "ADMIN" && actorId !== targetId) {
    redirect(
      "/admin/users?error=" +
        encodeURIComponent("Refusing to delete another admin via this flow."),
    );
  }

  // PII scrub. Email is replaced with a randomised value because
  // (a) we keep User.email NOT NULL by schema, and (b) we don't
  // want a future signup with the same email to magically resurrect
  // the deleted account's data via foreign keys. The original email
  // is recorded in the audit meta so legal can resolve disputes.
  const scrubEmail = `deleted-${target.id}-${Date.now()}@deleted.local`;

  await db.$transaction([
    db.user.update({
      where: { id: targetId },
      data: {
        status: "DELETED",
        email: scrubEmail,
        name: "Deleted user",
        image: null,
        phone: null,
      },
    }),
    ...(target.candidateProfile
      ? [
          db.candidateProfile.update({
            where: { id: target.candidateProfile.id },
            data: {
              cvVisibility: "PRIVATE",
              contactVisibility: "PRIVATE",
              resumeVisibility: "PRIVATE",
              openToWork: false,
              hiringNow: false,
              phone: null,
              email: null,
              firstName: "Deleted",
              lastName: "User",
              headline: null,
              summary: null,
              profilePhotoUrl: null,
              bannerUrl: null,
            },
          }),
        ]
      : []),
    db.post.updateMany({
      where: { authorId: targetId },
      data: { visibility: "PRIVATE" },
    }),
  ]);

  await audit({
    actorId,
    action:
      actorRole === "ADMIN" && actorId !== targetId
        ? "admin.user_soft_deleted"
        : "user.self_soft_deleted",
    entity: "User",
    entityId: targetId,
    meta: { originalEmail: target.email, reason },
  });

  // Email confirmation. Use the scrubbed local email if the user
  // requested deletion themselves — they'll never see it, but the
  // address has audit value if they appeal via support.
  if (target.email && actorId === targetId) {
    try {
      await sendMail({
        to: target.email,
        subject: "Your eMobility Careers account is closed",
        html: `<p>Your account has been closed and your data scrubbed from public surfaces.</p>
<p>If you change your mind, contact <a href="mailto:support@${new URL(env.NEXT_PUBLIC_APP_URL).host}">support</a>
within 30 days. After that, we permanently delete the remaining records.</p>`,
        text:
          "Your account has been closed. Contact support within 30 days if you change your mind.",
      });
    } catch (err) {
      logger.warn({ err }, "[account-delete] confirmation email failed");
    }
  }

  revalidatePath("/me/account");
  // Self-delete bounces user to a goodbye page. Admin-delete just
  // refreshes the admin user-list with a notice.
  if (actorId === targetId) {
    redirect("/api/auth/signout?next=/goodbye");
  }
  redirect(
    `/admin/users/${target.id}?notice=` +
      encodeURIComponent("Account soft-deleted; will purge in 30 days."),
  );
}
