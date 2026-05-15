"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notificationsQueue } from "@/lib/queues";
import { CompanyTeamRole } from "@prisma/client";
import { logger } from "@/lib/logger";

/**
 * Best-effort notification fanout. Wraps the queue add in a catch so
 * a queue outage never blocks an admin action — the audit log still
 * captures the underlying mutation. Same pattern used in event-cancel
 * and answer-create fanouts.
 */
async function notify(opts: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  await notificationsQueue
    .add(opts.type, {
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      link: opts.link,
      channels: ["IN_APP", "EMAIL"],
    })
    .catch(() => undefined);
}

/**
 * Platform-admin-only actions for managing a company's team roster.
 * These bypass the email-invite flow that company admins use — the
 * platform admin can add or remove anyone directly. Useful for:
 *
 *   • Manually claiming a verified company on behalf of a recruiter
 *     who can't get the invite email through.
 *   • Removing an abusive team member when the company admin is
 *     unresponsive.
 *   • Promoting a second teammate to company-admin so the original
 *     creator isn't a bus factor (the user's "more than one admin
 *     per page" requirement).
 *
 * Platform admins can do these regardless of whether they themselves
 * have an EmployerProfile at the target company.
 */

async function requirePlatformAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

const addSchema = z.object({
  companyId: z.string().min(1),
  // Either an email address or a candidate slug — both are accepted so
  // the admin can pick whichever they have on hand. Resolved below.
  identifier: z.string().min(1).max(200),
  teamRole: z.nativeEnum(CompanyTeamRole),
  isCompanyAdmin: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.string()])
    .optional()
    .transform((v) => v === "on" || v === "true"),
  designation: z.string().min(1).max(120),
  // Required when adding to a non-UNVERIFIED company. The
  // `joinExistingCompany` self-serve path refuses self-attach to
  // verified companies (impersonation defence); admins can override
  // but must explicitly tick "I confirm this is a legitimate request"
  // so the bypass is recorded with intent rather than silently used.
  ackVerifiedBypass: z
    .union([z.literal("on"), z.literal(""), z.string().optional()])
    .optional()
    .transform((v) => v === "on"),
});

/**
 * Add a user to a company's team. The admin types either an email or
 * a candidate slug and we resolve to a User row. Refuses if no User
 * matches — admins shouldn't be able to attach phantom rows.
 *
 * IMPORTANT: this does NOT bump the target user's `User.role` to
 * EMPLOYER. They remain whatever role they had (likely CANDIDATE).
 * Their `EmployerProfile` exists, but they can't post jobs because
 * `requireEmployer` (used by createJob and friends) gates on
 * `User.role === EMPLOYER`. Platform admins must explicitly promote
 * via `adminSetEmployerRole` if the user should be able to post.
 */
export async function adminAddTeamMember(formData: FormData) {
  const session = await requirePlatformAdmin();
  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      `/admin/employers/${formData.get("companyId")}/team?error=` +
        encodeURIComponent("Pick a user, role, and designation."),
    );
  }
  const { companyId, identifier, teamRole, isCompanyAdmin, designation, ackVerifiedBypass } = parsed.data;

  // Resolve the identifier — try email first, then slug.
  const id = identifier.trim();
  const user = id.includes("@")
    ? await db.user.findUnique({ where: { email: id.toLowerCase() }, select: { id: true } })
    : await db.candidateProfile.findUnique({ where: { slug: id }, select: { userId: true } });
  if (!user) {
    redirect(
      `/admin/employers/${companyId}/team?error=` +
        encodeURIComponent(`No user found for "${id}". Try the registered email instead.`),
    );
  }
  const targetUserId = "id" in user! ? user.id : user.userId;

  // Verified-company bypass gate. The self-serve `joinExistingCompany`
  // refuses to attach the user to anything past UNVERIFIED to prevent
  // impersonation. Admins are allowed to override, but only when
  // they explicitly tick the bypass-acknowledgement checkbox — that
  // way the audit log captures the intent and the action can never be
  // hand-waved as "I didn't realise this was a verified company".
  const targetCompany = await db.company.findUnique({
    where: { id: companyId },
    select: { verificationStatus: true, name: true },
  });
  if (!targetCompany) {
    redirect(
      `/admin/employers/${companyId}/team?error=` +
        encodeURIComponent("Company not found."),
    );
  }
  const isVerifiedTier =
    targetCompany!.verificationStatus === "VERIFIED" ||
    targetCompany!.verificationStatus === "PENDING";
  if (isVerifiedTier && !ackVerifiedBypass) {
    redirect(
      `/admin/employers/${companyId}/team?error=` +
        encodeURIComponent(
          `${targetCompany!.name} is ${targetCompany!.verificationStatus.toLowerCase()} — tick "I'm bypassing the self-join gate intentionally" before adding members. The self-serve path refuses this exact attach to prevent impersonation, so we record admin overrides explicitly.`,
        ),
    );
  }

  // EmployerProfile.userId is unique — one company per user. If the
  // user already has a profile elsewhere, don't silently overwrite it.
  const existing = await db.employerProfile.findUnique({
    where: { userId: targetUserId },
    select: { companyId: true },
  });
  if (existing && existing.companyId !== companyId) {
    redirect(
      `/admin/employers/${companyId}/team?error=` +
        encodeURIComponent(
          "That user is already on a different company's team. Remove them from there first.",
        ),
    );
  }

  await db.employerProfile.upsert({
    where: { userId: targetUserId },
    create: {
      userId: targetUserId,
      companyId,
      teamRole,
      isCompanyAdmin,
      designation,
    },
    update: {
      companyId,
      teamRole,
      isCompanyAdmin,
      designation,
    },
  });

  await audit({
    actorId: session.user.id,
    action: "admin.team.added",
    entity: "EmployerProfile",
    entityId: targetUserId,
    // companyVerificationStatus + bypass flag explicitly captured so
    // the moderation history makes it obvious when an admin attached
    // a user to a verified company (the "I'm overriding the
    // impersonation defence" path) vs a routine UNVERIFIED add.
    meta: {
      companyId,
      teamRole,
      isCompanyAdmin,
      addedVia: "admin_panel",
      companyVerificationStatus: targetCompany!.verificationStatus,
      bypassAcknowledged: isVerifiedTier ? true : undefined,
    },
  });

  // Notify the target user. Two cases:
  //   • Their User.role is already EMPLOYER/ADMIN → straightforward
  //     "you're now on Acme's team" message; signing-in as usual will
  //     show the new dashboard.
  //   • Role is still CANDIDATE → they need to sign out and back in
  //     so the JWT picks up future role changes; ALSO, their current
  //     EmployerProfile won't grant job-posting until role is bumped
  //     via `adminSetEmployerRole`. The body explains both.
  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { role: true },
  });
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true, slug: true },
  });
  if (company) {
    const needsRoleBump = target?.role === "CANDIDATE";
    await notify({
      userId: targetUserId,
      type: "company.team.added",
      title: `You've been added to ${company.name}'s team`,
      body: needsRoleBump
        ? `An admin added you as ${teamRole.toLowerCase()} at ${company.name}. To post jobs on their behalf you'll need an EMPLOYER role — the admin can promote you, then sign out and back in to refresh your session.`
        : `An admin added you as ${teamRole.toLowerCase()} at ${company.name}. Sign out and back in if you don't see the Employer dashboard yet.`,
      link: `/company/${company.slug}`,
    });
  }

  revalidatePath(`/admin/employers/${companyId}/team`);
  revalidatePath("/admin/employers");
  redirect(`/admin/employers/${companyId}/team`);
}

const removeSchema = z.object({
  companyId: z.string().min(1),
  userId: z.string().min(1),
});

export async function adminRemoveTeamMember(formData: FormData) {
  const session = await requirePlatformAdmin();
  const parsed = removeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    logger.warn(
      { fieldErrors: parsed.error.flatten().fieldErrors },
      "[admin-team] Zod validation failed — bare form action returns void; user sees no feedback.",
    );
    return;
  }

  // Refuse to remove the company owner — that would leave the
  // company orphaned (Company.ownerUserId is required). Platform
  // admin should transfer ownership first if they really need to
  // remove the original creator. Fetch name too so we can use it in
  // the notification body further down without a second query.
  const company = await db.company.findUnique({
    where: { id: parsed.data.companyId },
    select: { ownerUserId: true, name: true },
  });
  if (company?.ownerUserId === parsed.data.userId) {
    redirect(
      `/admin/employers/${parsed.data.companyId}/team?error=` +
        encodeURIComponent("Can't remove the company owner. Transfer ownership first."),
    );
  }

  await db.employerProfile.deleteMany({
    where: { userId: parsed.data.userId, companyId: parsed.data.companyId },
  });

  await audit({
    actorId: session.user.id,
    action: "admin.team.removed",
    entity: "EmployerProfile",
    entityId: parsed.data.userId,
    meta: { companyId: parsed.data.companyId },
  });

  // Tell the removed user out-of-band so they don't discover the
  // change by suddenly hitting 403s on /employer/*. The role-stale
  // banner will also fire on their next page load if their JWT still
  // says EMPLOYER while DB role got demoted (admin may run that
  // demotion separately via adminSetEmployerRole).
  if (company) {
    await notify({
      userId: parsed.data.userId,
      type: "company.team.removed",
      title: `Removed from ${company.name}'s team`,
      body: `An admin removed you from ${company.name}. If your role was EMPLOYER specifically for this company, sign out and back in once your role is updated.`,
    });
  }

  revalidatePath(`/admin/employers/${parsed.data.companyId}/team`);
}

const adminFlagSchema = z.object({
  companyId: z.string().min(1),
  userId: z.string().min(1),
  isCompanyAdmin: z.union([z.literal("on"), z.literal("off")]).transform((v) => v === "on"),
});

/**
 * Toggle company-admin (multi-admin support). The user's `teamRole`
 * stays whatever it is (RECRUITER / HIRING_MANAGER etc.); only the
 * `isCompanyAdmin` boolean flips. A company can have any number of
 * admins this way.
 *
 * Refuses to demote the company OWNER — `requireCompanyAdmin` only
 * accepts isCompanyAdmin=true OR platform-admin, so demoting the
 * owner would lock them out of managing their own page (they'd have
 * to ask a platform admin to invite teammates etc.). Owners can
 * always be removed from admin via ownership transfer if needed.
 */
export async function adminSetCompanyAdmin(formData: FormData) {
  const session = await requirePlatformAdmin();
  const parsed = adminFlagSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    logger.warn(
      { fieldErrors: parsed.error.flatten().fieldErrors },
      "[admin-team] Zod validation failed — bare form action returns void; user sees no feedback.",
    );
    return;
  }

  // One company lookup — used for the owner-protect guard above and
  // for the notification body further down.
  const company = await db.company.findUnique({
    where: { id: parsed.data.companyId },
    select: { ownerUserId: true, name: true, slug: true },
  });
  if (
    parsed.data.isCompanyAdmin === false &&
    company?.ownerUserId === parsed.data.userId
  ) {
    redirect(
      `/admin/employers/${parsed.data.companyId}/team?error=` +
        encodeURIComponent(
          "Can't demote the company owner — that would leave them unable to manage their own page. Transfer ownership first.",
        ),
    );
  }

  await db.employerProfile.updateMany({
    where: { userId: parsed.data.userId, companyId: parsed.data.companyId },
    data: { isCompanyAdmin: parsed.data.isCompanyAdmin },
  });

  await audit({
    actorId: session.user.id,
    action: parsed.data.isCompanyAdmin ? "admin.team.promoted_admin" : "admin.team.demoted_admin",
    entity: "EmployerProfile",
    entityId: parsed.data.userId,
    meta: { companyId: parsed.data.companyId },
  });

  // Notify the user about their admin-flag change. company-admin is a
  // permission flag on the EmployerProfile, NOT the global User.role,
  // so no JWT refresh is required — the change takes effect on the
  // next page load.
  if (company) {
    await notify({
      userId: parsed.data.userId,
      type: parsed.data.isCompanyAdmin ? "company.admin.granted" : "company.admin.revoked",
      title: parsed.data.isCompanyAdmin
        ? `You're now an admin at ${company.name}`
        : `Admin access at ${company.name} was revoked`,
      body: parsed.data.isCompanyAdmin
        ? `You can now invite teammates and edit ${company.name}'s page.`
        : `You're still on the team but no longer an admin. The remaining admins manage invites and the company page now.`,
      link: `/employer/team`,
    });
  }

  revalidatePath(`/admin/employers/${parsed.data.companyId}/team`);
}

const roleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["CANDIDATE", "EMPLOYER", "ADMIN"]),
});

/**
 * Promote / demote a User's global role. This is what unlocks job
 * posting — `User.role === EMPLOYER` is the gate on createJob etc.
 * Adding someone to a company's team via `adminAddTeamMember` does
 * NOT bump their role; the platform admin has to do it explicitly
 * here. That's the user's stated rule: "a candidate associated with
 * a page cannot add a job; he needs to be an employer".
 */
export async function adminSetEmployerRole(formData: FormData) {
  const session = await requirePlatformAdmin();
  const parsed = roleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    logger.warn(
      { fieldErrors: parsed.error.flatten().fieldErrors },
      "[admin-team] Zod validation failed — bare form action returns void; user sees no feedback.",
    );
    return;
  }

  // Prevent the admin from accidentally demoting themselves —
  // dropping role to CANDIDATE would lock them out of /admin/*
  // entirely (middleware checks role === ADMIN), and they couldn't
  // even reverse the change. Self-promotion to ADMIN is also
  // refused so this action can't be a privilege-escalation path.
  if (parsed.data.userId === session.user.id) {
    return;
  }

  await db.user.update({
    where: { id: parsed.data.userId },
    data: { role: parsed.data.role },
  });

  await audit({
    actorId: session.user.id,
    action: "admin.user.role_changed",
    entity: "User",
    entityId: parsed.data.userId,
    meta: { newRole: parsed.data.role },
  });

  // Tell the target user about the role bump out-of-band. The
  // RoleStaleBanner (mounted under SiteHeader) will ALSO fire on
  // their next page load — that catches the case where they haven't
  // checked email/in-app notifications yet. Two channels reaching
  // the same user is intentional: emails get filed and forgotten;
  // the banner is unmissable.
  const role = parsed.data.role;
  await notify({
    userId: parsed.data.userId,
    type: "user.role_changed",
    title:
      role === "EMPLOYER"
        ? "You now have employer access"
        : role === "ADMIN"
          ? "You're now a platform admin"
          : "Your role was updated to candidate",
    body:
      role === "EMPLOYER"
        ? "An admin promoted your account to EMPLOYER. Sign out and back in to use the Employer dashboard and post jobs."
        : role === "ADMIN"
          ? "An admin promoted your account to ADMIN. Sign out and back in to access /admin."
          : "An admin changed your role to CANDIDATE. Sign out and back in to refresh your session.",
    link: role === "EMPLOYER" ? "/employer" : role === "ADMIN" ? "/admin" : "/me",
  });

  // Revalidate every page under /admin/employers so the team badge
  // updates immediately on this admin's view. The "layout" arg makes
  // Next blow away the segment cache for all nested routes too.
  revalidatePath("/admin/employers", "layout");
  revalidatePath("/admin/users");
}
