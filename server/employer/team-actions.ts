"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { auth, unstable_update } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { CompanyTeamRole } from "@prisma/client";

async function requireCompanyAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    include: { company: true },
  });
  if (!employer) redirect("/employer/onboarding");
  if (!employer.isCompanyAdmin && session.user.role !== "ADMIN") redirect("/403");
  return { session, employer };
}

const inviteSchema = z.object({
  email: z.string().email().toLowerCase(),
  role: z.nativeEnum(CompanyTeamRole),
});

export async function inviteTeammate(formData: FormData) {
  const { session, employer } = await requireCompanyAdmin();
  await rateLimitOrThrow(`invite:${session.user.id}`, "invite");
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.teamInvite.upsert({
    where: { companyId_email: { companyId: employer.companyId, email: parsed.data.email } },
    create: {
      companyId: employer.companyId,
      email: parsed.data.email,
      role: parsed.data.role,
      token,
      invitedById: session.user.id,
      expiresAt,
    },
    update: {
      role: parsed.data.role,
      token,
      expiresAt,
      acceptedAt: null,
    },
  });

  const link = `${env.NEXT_PUBLIC_APP_URL}/invite/${token}`;
  await sendMail({
    to: parsed.data.email,
    subject: `You've been invited to join ${employer.company.name} on eMobility Careers`,
    html: `<p>${session.user.name ?? "A teammate"} invited you to join <strong>${employer.company.name}</strong> on eMobility Careers as a <strong>${parsed.data.role}</strong>.</p>
      <p><a href="${link}">Accept invite →</a></p>
      <p>This link expires in 7 days.</p>`,
  });

  revalidatePath("/employer/team");
}

export async function revokeInvite(formData: FormData) {
  const { employer } = await requireCompanyAdmin();
  const id = z.string().parse(formData.get("id"));
  await db.teamInvite.deleteMany({
    where: { id, companyId: employer.companyId, acceptedAt: null },
  });
  revalidatePath("/employer/team");
}

export async function acceptInvite(formData: FormData) {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin?next=" + encodeURIComponent("/invite/" + formData.get("token")));
  }
  const token = z.string().parse(formData.get("token"));
  const invite = await db.teamInvite.findUnique({
    where: { token },
    include: { company: true },
  });
  if (!invite) redirect("/?error=invite-not-found");
  if (invite.acceptedAt) redirect("/employer?notice=already-accepted");
  if (invite.expiresAt < new Date()) redirect("/?error=invite-expired");
  if (invite.email !== session.user.email?.toLowerCase()) {
    redirect("/?error=invite-email-mismatch");
  }

  // Track whether we need to bump role so we can also refresh the JWT.
  // If the user was already an EMPLOYER (e.g. they're moving from
  // Company A to Company B), no role update is needed and we skip the
  // JWT refresh as a small win.
  const needsRoleBump = session.user.role === "CANDIDATE";

  await db.$transaction([
    ...(needsRoleBump
      ? [
          db.user.update({
            where: { id: session.user.id },
            data: { role: "EMPLOYER" },
          }),
        ]
      : []),
    db.employerProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        companyId: invite.companyId,
        teamRole: invite.role,
        isCompanyAdmin: false,
      },
      update: {
        companyId: invite.companyId,
        teamRole: invite.role,
      },
    }),
    db.teamInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);

  // Refresh the JWT in-place so the user lands on /employer without a
  // 403 on the very next request. Without this, role=EMPLOYER is in
  // the DB but the cookie still says CANDIDATE until next sign-in.
  if (needsRoleBump) {
    await unstable_update?.({ user: { role: "EMPLOYER" } }).catch(() => undefined);
  }

  redirect("/employer?notice=joined");
}

export async function removeTeammate(formData: FormData) {
  const { employer } = await requireCompanyAdmin();
  const userId = z.string().parse(formData.get("userId"));
  // Don't allow removing yourself or the company owner
  if (userId === employer.userId) return;
  // Refuse to remove the company owner — Company.ownerUserId would
  // dangle. Owners can only be removed via ownership transfer (TODO)
  // or by a platform admin's explicit action.
  const company = await db.company.findUnique({
    where: { id: employer.companyId },
    select: { ownerUserId: true },
  });
  if (company?.ownerUserId === userId) return;
  await db.employerProfile.deleteMany({
    where: { userId, companyId: employer.companyId },
  });
  revalidatePath("/employer/team");
}

const promoteSchema = z.object({
  userId: z.string().min(1),
  isCompanyAdmin: z.union([z.literal("on"), z.literal("off")]).transform((v) => v === "on"),
});

/**
 * Company-admin self-service to grant or revoke admin status on a
 * teammate. Underlies the user's "more than one admin per page"
 * requirement — without this, multi-admin would only be possible
 * via the platform admin's panel, which is friction. Refuses to
 * demote the company owner so the page can never be left adminless.
 */
export async function setTeammateAdmin(formData: FormData) {
  const { employer } = await requireCompanyAdmin();
  const parsed = promoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  // Self-toggle off is allowed (you can step down) but only if
  // there's at least one other admin on the team. Self-toggle on
  // is a no-op — you're already admin if you got past the gate.
  if (parsed.data.userId === employer.userId && !parsed.data.isCompanyAdmin) {
    const otherAdmins = await db.employerProfile.count({
      where: {
        companyId: employer.companyId,
        isCompanyAdmin: true,
        userId: { not: employer.userId },
      },
    });
    if (otherAdmins === 0) return;
  }

  // Demoting the owner would orphan team management. Refused.
  const company = await db.company.findUnique({
    where: { id: employer.companyId },
    select: { ownerUserId: true },
  });
  if (
    company?.ownerUserId === parsed.data.userId &&
    !parsed.data.isCompanyAdmin
  ) {
    return;
  }

  await db.employerProfile.updateMany({
    where: { userId: parsed.data.userId, companyId: employer.companyId },
    data: { isCompanyAdmin: parsed.data.isCompanyAdmin },
  });
  revalidatePath("/employer/team");
}
