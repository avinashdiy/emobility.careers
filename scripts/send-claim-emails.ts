#!/usr/bin/env tsx
/**
 * Bulk-send "Claim your account" magic-link emails to imported users.
 *
 * Targets every User with `wpLegacyId IS NOT NULL` and `wpClaimedAt IS NULL`.
 * Uses the same email pipeline as the live magic-link sign-in flow, so
 * recipients get an email styled identically to the regular sign-in mailer.
 *
 *   USAGE
 *     pnpm tsx scripts/send-claim-emails.ts                 # send to everyone
 *     pnpm tsx scripts/send-claim-emails.ts --dry-run       # list recipients only
 *     pnpm tsx scripts/send-claim-emails.ts --batch=50      # rate-limit per minute
 *     pnpm tsx scripts/send-claim-emails.ts --to=foo@x.com  # single recipient (testing)
 *
 *   ENV
 *     NEXT_PUBLIC_APP_URL  Public URL — used to construct the claim link
 *     AUTH_SECRET          Required to sign the verification token
 *     AWS_SES_*            SES sending credentials (or RESEND_API_KEY fallback)
 *
 * Idempotency:
 *   The script does NOT mark `wpClaimedAt` on send — only on actual sign-in
 *   (handled by the auth events in `lib/auth.ts`). So you can re-run this
 *   safely; users who haven't claimed yet will get another reminder.
 *
 * Rate-limit:
 *   Defaults to 50 emails per minute, well below SES per-second caps for a
 *   freshly-out-of-sandbox account. Bump --batch carefully if you have a
 *   higher SES quota.
 */

import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sendMail, activeMailProvider } from "../lib/mail";

interface Args {
  dryRun: boolean;
  batch: number;
  to: string | null;
}
function parseArgs(): Args {
  const out: Args = { dryRun: false, batch: 50, to: null };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg.startsWith("--batch=")) out.batch = Math.max(1, Math.min(500, Number(arg.slice(8))));
    else if (arg.startsWith("--to=")) out.to = arg.slice(5).toLowerCase();
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const provider = activeMailProvider();
  if (provider === "none") {
    console.error("[claim] no email provider configured (set AWS_SES_* or RESEND_API_KEY).");
    process.exit(1);
  }
  console.log(`[claim] provider=${provider}${args.dryRun ? " (DRY-RUN)" : ""}`);

  const db = new PrismaClient();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl) {
    console.error("[claim] NEXT_PUBLIC_APP_URL must be set.");
    process.exit(1);
  }

  const where = args.to
    ? { email: args.to, wpLegacyId: { not: null }, wpClaimedAt: null }
    : { wpLegacyId: { not: null }, wpClaimedAt: null };
  const targets = await db.user.findMany({
    where,
    select: { id: true, email: true, name: true },
    orderBy: { id: "asc" },
  });
  console.log(`[claim] ${targets.length} user${targets.length === 1 ? "" : "s"} to email`);

  if (args.dryRun) {
    for (const t of targets.slice(0, 50)) console.log(`  → ${t.email}`);
    if (targets.length > 50) console.log(`  … and ${targets.length - 50} more`);
    await db.$disconnect();
    return;
  }

  // Token TTL chosen so a single batch can be sent and claimed over a few
  // days without expiring. Mirrors the EmailProvider maxAge (24h) but we
  // allow 7 days here since these are legacy users who may not check email
  // promptly.
  const TTL_MS = 7 * 24 * 60 * 60 * 1000;
  let sent = 0, failed = 0;

  for (let i = 0; i < targets.length; i += args.batch) {
    const slice = targets.slice(i, i + args.batch);
    await Promise.all(
      slice.map(async (u) => {
        try {
          const token = crypto.randomBytes(24).toString("hex");
          const expires = new Date(Date.now() + TTL_MS);
          await db.verificationToken.create({
            data: { identifier: u.email, token, expires },
          });
          const url = `${appUrl}/api/auth/callback/email?token=${token}&email=${encodeURIComponent(u.email)}`;
          const greet = u.name ? `Hi ${u.name.split(" ")[0]}` : "Hi";
          const subject = `Claim your eMobility Careers account`;
          const html = `
<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f5f7f5;padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:white;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <tr><td>
      <h1 style="font-size:22px;color:#0f172a;margin:0 0 12px 0;">${greet}, your account moved 🎉</h1>
      <p style="color:#475569;margin:0 0 16px 0;line-height:1.55;">
        We've upgraded eMobility Careers. Your profile, jobs, and applications are already in the new system — just click below to claim your account. No password needed.
      </p>
      <p style="margin:0 0 24px 0;">
        <a href="${url}" style="display:inline-block;background:#374a47;color:#c1ffb4;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Claim my account →</a>
      </p>
      <p style="color:#94a3b8;font-size:12px;margin:0 0 8px 0;">This link is good for 7 days and only works once. If you didn't have an account on eMobility Careers, you can safely ignore this email.</p>
    </td></tr>
  </table>
</body></html>`;
          const text = `${greet},\n\nYour eMobility Careers account moved to the new platform. Claim it here:\n\n${url}\n\nLink expires in 7 days. If you don't recognise this, ignore.`;
          await sendMail({ to: u.email, subject, html, text });
          sent++;
        } catch (err) {
          failed++;
          console.error(`  ✗ ${u.email}:`, (err as Error).message);
        }
      }),
    );
    if (i + args.batch < targets.length) {
      console.log(`[claim] ${sent}/${targets.length} sent — pausing 60s before next batch`);
      await new Promise((r) => setTimeout(r, 60_000));
    }
  }

  console.log(`[claim] done. sent=${sent} failed=${failed}`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error("[claim] fatal:", err);
  process.exit(1);
});
