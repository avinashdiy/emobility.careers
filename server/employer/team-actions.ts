"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
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

  await db.$transaction([
    db.user.update({ where: { id: session.user.id }, data: { role: "EMPLOYER" } }),
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

  redirect("/employer?notice=joined");
}

export async function removeTeammate(formData: FormData) {
  const { employer } = await requireCompanyAdmin();
  const userId = z.string().parse(formData.get("userId"));
  // Don't allow removing yourself or the company owner
  if (userId === employer.userId) return;
  await db.employerProfile.deleteMany({
    where: { userId, companyId: employer.companyId },
  });
  revalidatePath("/employer/team");
}
