"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendMail, activeMailProvider } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { FormState } from "@/lib/form-state";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Sends the "claim your account" magic-link email to every imported user
 * that hasn't signed in yet (`wpLegacyId IS NOT NULL AND wpClaimedAt IS NULL`).
 * Used for the bulk-invite step at the end of a WordPress migration.
 *
 * The button on /admin/import calls this; the same payload + token TTL is
 * also used by `scripts/send-claim-emails.ts` (CLI variant) so admins can
 * pick whichever interface they prefer.
 */
export async function sendClaimEmailsToAll(_prev: FormState, _formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const provider = activeMailProvider();
  if (provider === "none") {
    return { ok: false, message: "Configure SES (or Resend) before sending claim emails." };
  }

  const targets = await db.user.findMany({
    where: { wpLegacyId: { not: null }, wpClaimedAt: null },
    select: { id: true, email: true, name: true },
  });

  if (targets.length === 0) {
    return { ok: true, message: "All imported users have already claimed their accounts." };
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  let sent = 0, failed = 0;
  for (const u of targets) {
    try {
      const token = crypto.randomBytes(24).toString("hex");
      await db.verificationToken.create({
        data: { identifier: u.email, token, expires: new Date(Date.now() + TTL_MS) },
      });
      const url = `${appUrl}/api/auth/callback/email?token=${token}&email=${encodeURIComponent(u.email)}`;
      const greet = u.name ? `Hi ${u.name.split(" ")[0]}` : "Hi";
      const subject = `Claim your eMobility Careers account`;
      const html = `
<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f5f7f5;padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:white;border-radius:12px;padding:32px;">
    <tr><td>
      <h1 style="font-size:22px;color:#0f172a;margin:0 0 12px 0;">${greet}, your account moved 🎉</h1>
      <p style="color:#475569;margin:0 0 16px 0;">We've upgraded eMobility Careers. Your profile is already in the new system — just click below to claim your account. No password needed.</p>
      <p style="margin:0 0 24px 0;"><a href="${url}" style="display:inline-block;background:#374a47;color:#c1ffb4;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Claim my account →</a></p>
      <p style="color:#94a3b8;font-size:12px;margin:0;">This link is good for 7 days and works only once.</p>
    </td></tr>
  </table>
</body></html>`;
      const text = `${greet},\n\nClaim your eMobility Careers account: ${url}\n\nLink expires in 7 days.`;
      await sendMail({ to: u.email, subject, html, text });
      sent++;
    } catch (err) {
      failed++;
      logger.warn({ err, email: u.email }, "[admin-import] claim email failed");
    }
  }

  await audit({
    actorId: session.user.id,
    action: "import.claim_emails_sent",
    entity: "User",
    meta: { sent, failed, total: targets.length },
  });
  revalidatePath("/admin/import");
  return {
    ok: true,
    message: `Sent ${sent} claim email${sent === 1 ? "" : "s"}${failed > 0 ? ` · ${failed} failed (see server logs)` : ""}.`,
  };
}

/**
 * Sends a single claim email to a specific user. Useful for admins to
 * resend on demand when one user reports they didn't get the bulk email.
 */
export async function sendClaimEmailToOne(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
  if (!u) return { ok: false, message: "User not found." };

  const provider = activeMailProvider();
  if (provider === "none") return { ok: false, message: "Configure SES (or Resend) first." };

  try {
    const token = crypto.randomBytes(24).toString("hex");
    await db.verificationToken.create({
      data: { identifier: u.email, token, expires: new Date(Date.now() + TTL_MS) },
    });
    const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/auth/callback/email?token=${token}&email=${encodeURIComponent(u.email)}`;
    const greet = u.name ? `Hi ${u.name.split(" ")[0]}` : "Hi";
    await sendMail({
      to: u.email,
      subject: "Sign in to eMobility Careers",
      html: `<p>${greet}, click here to sign in: <a href="${url}">${url}</a></p>`,
      text: `${greet}, sign in: ${url}`,
    });
  } catch (err) {
    logger.warn({ err, email: u.email }, "[admin-import] resend claim failed");
    return { ok: false, message: "Send failed — check server logs." };
  }
  await audit({
    actorId: session.user.id,
    action: "import.claim_email_resent",
    entity: "User",
    entityId: u.id,
    meta: { email: u.email },
  });
  return { ok: true, message: `Claim email re-sent to ${u.email}.` };
}
