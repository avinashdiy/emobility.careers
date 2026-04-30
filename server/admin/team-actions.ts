"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CompanyTeamRole } from "@prisma/client";

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
  const { companyId, identifier, teamRole, isCompanyAdmin, designation } = parsed.data;

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
    meta: { companyId, teamRole, isCompanyAdmin, addedVia: "admin_panel" },
  });

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
  if (!parsed.success) return;

  // Refuse to remove the company owner — that would leave the
  // company orphaned (Company.ownerUserId is required). Platform
  // admin should transfer ownership first if they really need to
  // remove the original creator.
  const company = await db.company.findUnique({
    where: { id: parsed.data.companyId },
    select: { ownerUserId: true },
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
  if (!parsed.success) return;

  if (parsed.data.isCompanyAdmin === false) {
    const company = await db.company.findUnique({
      where: { id: parsed.data.companyId },
      select: { ownerUserId: true },
    });
    if (company?.ownerUserId === parsed.data.userId) {
      redirect(
        `/admin/employers/${parsed.data.companyId}/team?error=` +
          encodeURIComponent(
            "Can't demote the company owner — that would leave them unable to manage their own page. Transfer ownership first.",
          ),
      );
    }
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
  if (!parsed.success) return;

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

  // KNOWN LIMITATION: the target user's JWT cookie is stale until
  // their next sign-in (we use stateless JWT sessions, see
  // lib/auth.config.ts). This means a freshly-promoted user will
  // still see role=CANDIDATE on their session and 403 on /employer/*
  // until they sign back in. Migrating to DB-backed sessions would
  // fix this; for now the admin sees a flash that says so.

  // Revalidate every page under /admin/employers so the team badge
  // updates immediately on this admin's view. The "layout" arg makes
  // Next blow away the segment cache for all nested routes too.
  revalidatePath("/admin/employers", "layout");
  revalidatePath("/admin/users");
}
