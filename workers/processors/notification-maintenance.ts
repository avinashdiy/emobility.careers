import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import {
  notificationMaintenanceQueue,
  QueueNames,
  type NotificationMaintenanceJob,
} from "@/lib/queues";

/**
 * Notification maintenance worker. Runs two scheduled tasks:
 *
 *   1. CLEANUP — delete notifications past their `expiresAt` (default
 *      90 days from createdAt; some senders set tighter values).
 *      Runs every 6 hours.
 *
 *   2. DIGEST — once a day, send an email summary of unread IN_APP
 *      notifications to users who have at least one unread item AND
 *      a verified email AND haven't opted out of marketing emails.
 *      Runs every 24 hours, anchored to ~07:30 IST so people see it
 *      with morning coffee.
 *
 * Both are scheduled as repeat jobs from `startNotificationMaintenanceWorker`
 * — see the bottom of this file.
 */

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DIGEST_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STALE_JOB_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day is plenty
const PURGE_DELETED_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STALE_JOB_DAYS = 90; // OPEN jobs untouched for 90 days auto-CLOSE
const PURGE_DELETED_DAYS = 30; // soft-deleted accounts hard-delete after 30d
const DIGEST_MAX_USERS_PER_TICK = 500; // safety cap; real send happens via batched inserts below

async function runCleanup() {
  const now = new Date();
  const result = await db.notification.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        // Belt-and-braces: also delete anything older than 180 days
        // even if expiresAt is null (legacy rows from before this
        // column was added).
        { expiresAt: null, createdAt: { lt: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });

  // Expire stale ContactShareRequest rows. PENDINGs older than their
  // `expiresAt` flip to `EXPIRED` so the candidate's inbox stops
  // showing them as actionable + the recruiter dashboard can offer
  // a clean "re-request" path. We don't delete the row — keeping
  // EXPIRED preserves the audit trail and supports the cool-off
  // logic in `requestContactShare`.
  const expired = await db.contactShareRequest.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  logger.info(
    { deleted: result.count, expiredContactShares: expired.count },
    "[notif-maintenance] cleanup tick",
  );
  return { deleted: result.count, expiredContactShares: expired.count };
}

async function runDigest() {
  // Find users with unread notifications. We only digest IN_APP rows
  // because those are the canonical "what happened to you today" feed
  // — EMAIL rows are already in their inbox and don't need echoing.
  // Note: User.email is required by the schema, so no { not: null }
  // filter needed for it. The marketing-email opt-out gates this off
  // by default — opt-in only.
  const users = await db.user.findMany({
    where: {
      emailVerifiedAt: { not: null },
      status: "ACTIVE",
      notifications: {
        some: { channel: "IN_APP", readAt: null },
      },
      // Opt-in: only users who explicitly enabled marketingEmail get
      // the daily digest. We're being conservative — sending unwanted
      // batch email is the surest way to torch sender reputation.
      notificationPrefs: { marketingEmail: true },
    },
    take: DIGEST_MAX_USERS_PER_TICK,
    select: {
      id: true,
      email: true,
      name: true,
      notifications: {
        where: { channel: "IN_APP", readAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, type: true, title: true, body: true, link: true, createdAt: true },
      },
      _count: {
        select: { notifications: { where: { channel: "IN_APP", readAt: null } } },
      },
    },
  });

  let sent = 0;
  let failed = 0;
  for (const u of users) {
    if (!u.email || u.notifications.length === 0) continue;
    try {
      const total = u._count.notifications;
      const greeting = u.name ? `Hi ${u.name.split(" ")[0]}` : "Hi";
      const itemsHtml = u.notifications
        .map(
          (n) => `
          <li style="margin:0 0 12px 0;padding-bottom:12px;border-bottom:1px solid #d4e8d8">
            <strong style="color:#191919;font-size:14px">${escapeHtml(n.title)}</strong>
            <div style="color:#5e676b;font-size:13px;margin-top:2px">${escapeHtml(n.body.slice(0, 200))}</div>
            ${n.link ? `<a href="${env.NEXT_PUBLIC_APP_URL}${n.link}" style="color:#374a47;font-weight:700;text-decoration:none;font-size:12px">Open →</a>` : ""}
          </li>`,
        )
        .join("");
      const html = `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#191919">
          <div style="background:#374a47;color:#c1ffb4;padding:18px 22px;border-radius:14px 14px 0 0">
            <strong style="font-size:18px">eMobility Careers</strong>
          </div>
          <div style="background:#fff;border:1px solid #d4e8d8;border-top:0;padding:22px;border-radius:0 0 14px 14px">
            <h2 style="margin:0 0 6px">${greeting}, here's your digest</h2>
            <p style="color:#5e676b;margin:0 0 16px">${total} unread update${total === 1 ? "" : "s"} on your dashboard. The latest:</p>
            <ul style="list-style:none;padding:0;margin:0">${itemsHtml}</ul>
            <div style="margin-top:18px">
              <a href="${env.NEXT_PUBLIC_APP_URL}/me/notifications" style="display:inline-block;background:#374a47;color:#c1ffb4;padding:10px 22px;border-radius:10px;text-decoration:none;font-weight:700">Open inbox →</a>
            </div>
            <hr style="border:none;border-top:1px solid #d4e8d8;margin:18px 0">
            <p style="color:#8b95a0;font-size:11px;margin:0">
              You're getting this because you have unread notifications. Turn off these summaries in
              <a href="${env.NEXT_PUBLIC_APP_URL}/me/preferences" style="color:#374a47">your preferences</a>.
            </p>
          </div>
        </div>`;
      await sendMail({
        to: u.email,
        subject: `${total} update${total === 1 ? "" : "s"} on eMobility Careers`,
        html,
        text: `You have ${total} unread updates. Open ${env.NEXT_PUBLIC_APP_URL}/me/notifications to read them.`,
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      logger.warn({ err, userId: u.id }, "[notif-maintenance] digest send failed");
    }
  }
  logger.info({ sent, failed, considered: users.length }, "[notif-maintenance] digest tick");
  return { sent, failed };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Auto-archive stale jobs. We close JobPostings whose `updatedAt` is
 * more than STALE_JOB_DAYS ago AND status is still OPEN — recruiters
 * routinely forget to close roles after hiring, and these zombie
 * listings degrade the candidate's experience (they apply, the
 * recruiter never responds). The audit log shows the auto-action so
 * recruiters can re-open from /admin/jobs if it was filled but kept
 * for sourcing.
 */
async function runStaleJobArchival() {
  const cutoff = new Date(Date.now() - STALE_JOB_DAYS * 24 * 60 * 60 * 1000);
  const stale = await db.jobPosting.findMany({
    where: {
      status: "OPEN",
      updatedAt: { lt: cutoff },
    },
    select: { id: true, title: true, postedById: true, companyId: true },
    take: 200, // bound per-tick work
  });
  if (stale.length === 0) {
    logger.info({ closed: 0 }, "[notif-maintenance] stale-jobs tick");
    return { closed: 0 };
  }
  await db.jobPosting.updateMany({
    where: { id: { in: stale.map((j) => j.id) } },
    data: { status: "CLOSED" },
  });
  // Audit each closure individually so recruiters can search for what
  // happened to a specific job. Bulk write because per-row creates
  // would 200x our DB round-trips.
  await db.auditLog.createMany({
    data: stale.map((j) => ({
      action: "job.auto_closed_stale",
      entity: "JobPosting",
      entityId: j.id,
      meta: {
        title: j.title,
        companyId: j.companyId,
        ageDays: STALE_JOB_DAYS,
        reason: "no updates in 90+ days",
      } as object,
    })),
  });
  logger.info({ closed: stale.length }, "[notif-maintenance] stale-jobs tick");
  return { closed: stale.length };
}

/**
 * Hard-delete users that were soft-deleted more than PURGE_DELETED_DAYS
 * ago. Soft-delete already scrubbed PII (see
 * server/account/data-rights.ts → softDeleteAccount); this step
 * removes the User row entirely, cascading deletes through every FK
 * that points at it. We bound to 50 deletes per tick so a backlog
 * doesn't lock the DB.
 */
async function runPurgeDeletedAccounts() {
  const cutoff = new Date(Date.now() - PURGE_DELETED_DAYS * 24 * 60 * 60 * 1000);
  // We don't have an `accountClosedAt` column — but the AuditLog row
  // for the soft-delete carries that timestamp. Find the candidates
  // by scanning recent soft-delete audits whose User is still
  // status=DELETED and the audit is older than the cutoff.
  const deletions = await db.auditLog.findMany({
    where: {
      action: { in: ["user.self_soft_deleted", "admin.user_soft_deleted"] },
      createdAt: { lt: cutoff },
    },
    select: { entityId: true },
    take: 50,
  });
  let purged = 0;
  for (const d of deletions) {
    if (!d.entityId) continue;
    const u = await db.user.findUnique({
      where: { id: d.entityId },
      select: { id: true, status: true },
    });
    if (!u || u.status !== "DELETED") continue;
    try {
      await db.user.delete({ where: { id: u.id } });
      purged += 1;
    } catch (err) {
      // Most likely a residual FK that doesn't cascade; log and skip
      // so one stuck row doesn't block the whole tick.
      logger.warn({ err, userId: u.id }, "[notif-maintenance] purge failed");
    }
  }
  logger.info({ purged }, "[notif-maintenance] purge-deleted tick");
  return { purged };
}

export function startNotificationMaintenanceWorker() {
  const worker = new Worker<NotificationMaintenanceJob>(
    QueueNames.NotificationMaintenance,
    async (job) => {
      if (job.data.kind === "cleanup") return runCleanup();
      if (job.data.kind === "digest") return runDigest();
      if (job.data.kind === "stale-jobs") return runStaleJobArchival();
      if (job.data.kind === "purge-deleted") return runPurgeDeletedAccounts();
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, "[notif-maintenance] failed"),
  );

  // Self-scheduling repeat jobs. Stable jobIds mean BullMQ won't add a
  // duplicate if the worker restarts.
  void notificationMaintenanceQueue.add(
    "cleanup-tick",
    { tick: true, kind: "cleanup" },
    { repeat: { every: CLEANUP_INTERVAL_MS }, jobId: "notif-cleanup-tick" },
  );
  void notificationMaintenanceQueue.add(
    "digest-tick",
    { tick: true, kind: "digest" },
    { repeat: { every: DIGEST_INTERVAL_MS }, jobId: "notif-digest-tick" },
  );
  void notificationMaintenanceQueue.add(
    "stale-jobs-tick",
    { tick: true, kind: "stale-jobs" },
    { repeat: { every: STALE_JOB_INTERVAL_MS }, jobId: "stale-jobs-tick" },
  );
  void notificationMaintenanceQueue.add(
    "purge-deleted-tick",
    { tick: true, kind: "purge-deleted" },
    { repeat: { every: PURGE_DELETED_INTERVAL_MS }, jobId: "purge-deleted-tick" },
  );

  return worker;
}
