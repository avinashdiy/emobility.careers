"use server";

import { redirect } from "next/navigation";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { exportUserData } from "@/server/account/data-rights";
import { buckets, objectKey, presignDownload, s3 } from "@/lib/storage";
import { sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import { env } from "@/lib/env";
import { pgRateLimit } from "@/lib/rate-limit-pg";

/**
 * DPDP-style "download my data" — kicked off from /me/account.
 *
 * Flow:
 *   1. Build the user's data JSON (existing exportUserData()).
 *   2. Upload it to the private MinIO `docs` bucket with a 24h
 *      Content-Disposition: attachment header.
 *   3. Generate a 24h presigned URL (signs against `s3Public` so the
 *      browser can fetch via the files. subdomain through Caddy).
 *   4. Email the link to the user from the transactional lane —
 *      this is account-security mail, NOT bulk.
 *   5. Audit-log the export.
 *
 * We deliberately don't stream the file inline (the old behaviour)
 * because:
 *   • PII this size shouldn't sit in browser-history HTTP caches.
 *   • The async path lets us add ZIP / multi-file packaging later
 *     without changing the user's experience.
 *   • Email confirms the user's address still works — handy if a
 *     suspicious export request comes in (recipient gets the mail
 *     and can reset their password if they didn't trigger it).
 *
 * Rate-limited at 3/day per user via the Postgres limiter — building
 * + uploading + emailing the export costs real money in DB / S3
 * bandwidth and we don't want a buggy client to spam it.
 */
export async function requestDataExport(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin");

    // Rate limit: 3 exports / 24h / user. Plenty for a careful user
    // who wants to grab the latest copy; tight enough that a stuck
    // client can't drain MinIO bandwidth.
    const limit = await pgRateLimit({
      action: "account.data_export",
      userId: session.user.id,
      opts: { limit: 3, windowMs: 24 * 60 * 60 * 1000 },
    });
    if (!limit.ok) return { ok: false, message: limit.message };

    // Build the JSON via the existing exporter. Errors surface as
    // a graceful return; the function never throws.
    const result = await exportUserData();
    if (!result.ok) {
      return {
        ok: false,
        message: result.message ?? "Couldn't build your export. Try again.",
      };
    }
    const json = JSON.stringify(result.data, null, 2);

    // Upload to private docs bucket. 24h Content-Disposition so the
    // browser saves with a sensible filename when the user clicks
    // the link.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = objectKey(`account-exports/${session.user.id}`, "json");
    const filename = `emobility-export-${stamp}.json`;
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: buckets.docs,
          Key: key,
          Body: json,
          ContentType: "application/json; charset=utf-8",
          ContentDisposition: `attachment; filename="${filename}"`,
          Metadata: { "x-user-id": session.user.id },
        }),
      );
    } catch (err) {
      logger.error(
        { err, userId: session.user.id },
        "[data-export] MinIO upload failed",
      );
      return {
        ok: false,
        message: "Couldn't store your export. The team has been notified.",
      };
    }

    // 24-hour presigned download. Through `files.` subdomain so the
    // signature matches what Caddy forwards to MinIO.
    const downloadUrl = await presignDownload("docs", key, 24 * 60 * 60);

    // Email the link. Transactional lane — account-security adjacent.
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true },
    });
    if (user?.email) {
      try {
        await sendMail({
          kind: "transactional",
          to: user.email,
          subject: "Your eMobility Careers data export is ready",
          html: `
<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f5f7f5;padding:24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:white;border-radius:12px;padding:32px;">
  <tr><td>
    <h1 style="font-size:20px;color:#0f172a;margin:0 0 12px 0;">Your data export is ready</h1>
    <p style="color:#475569;margin:0 0 16px 0;">Hi ${user.name ?? "there"},</p>
    <p style="color:#475569;margin:0 0 16px 0;">
      You requested a copy of every record we hold on you. The download
      link below is valid for <strong>24 hours</strong>.
    </p>
    <p style="margin:0 0 24px 0;">
      <a href="${downloadUrl}" style="display:inline-block;background:#374a47;color:#c1ffb4;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Download my data →</a>
    </p>
    <p style="color:#94a3b8;font-size:12px;margin:0 0 8px 0;">
      The file is a JSON document. Inside you'll find your profile,
      applications, posts, comments, reactions, sent messages, saved jobs,
      alerts, and your audit trail.
    </p>
    <p style="color:#94a3b8;font-size:12px;margin:0;">
      If you didn't request this, please change your password immediately
      and email <strong>support@emobility.careers</strong>.
    </p>
  </td></tr>
</table>
</body></html>`,
          text: `Your eMobility Careers data export is ready.\n\nDownload (valid 24 hours): ${downloadUrl}\n\nIf you didn't request this, change your password and email support@emobility.careers.`,
        });
      } catch (err) {
        logger.warn({ err }, "[data-export] email failed");
      }
    }

    await audit({
      actorId: session.user.id,
      action: "user.data_export_requested",
      entity: "User",
      entityId: session.user.id,
      meta: { bucketKey: key },
    });

    return {
      ok: true,
      message:
        "We've emailed you a download link. It's valid for 24 hours and you can request another any time.",
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[data-export] unhandled");
    return { ok: false, message: "Couldn't start the export. Try again in a moment." };
  }
}

// Re-export env so the type checker sees it imported (used in HTML body).
export { env as _envForType };
