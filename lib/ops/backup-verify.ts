import { existsSync, statSync, readdirSync, createReadStream } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createGunzip } from "node:zlib";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";

/**
 * Backup verification + quarterly drill reminder.
 *
 * Layout assumption: `pg_dump` runs nightly on the VPS via a host-level
 * cron (NOT a worker — we want backups even if the app is down). Output
 * lands in `BACKUP_DIR` (default /var/backups/emce) named with an ISO
 * date prefix so the newest file sorts last lexicographically.
 *
 * The worker NEVER takes a backup itself — it only verifies what the OS
 * cron produced. Two reasons:
 *   1. Decoupling — a broken app shouldn't kill backups.
 *   2. Permissions — the host user has direct DB superuser creds; the
 *      app's pooled, app-role creds may not have pg_dump permission.
 *
 * Verification strategy:
 *   • Custom-format (`.dump`)  → run `pg_restore --list` and assert it
 *     reports a non-empty TOC. This is the gold-standard check — it
 *     proves the archive header + every TOC entry are intact.
 *   • Plain (`.sql.gz`)        → gunzip-stream the file and confirm we
 *     can read past the first KB without an error (catches truncation
 *     and corruption). We don't actually re-execute the SQL — that
 *     would need a sandbox DB; the quarterly drill exists for that.
 *
 * Drill reminder:
 *   • Fires once per quarter on the 1st of Jan/Apr/Jul/Oct.
 *   • Sends a checklist to ALERT_RECIPIENT so the on-call human can
 *     actually attempt a restore against the staging DB and record
 *     the outcome in the runbook. Quarter cadence keeps the muscle
 *     memory fresh without becoming busywork.
 */

const BACKUP_DIR = process.env.BACKUP_DIR ?? "/var/backups/emce";
const ALERT_RECIPIENT = process.env.OPS_ALERT_EMAIL ?? "avinash@diyguru.org";
// Anything under this is almost certainly a write that errored mid-flight
// (or an empty schema dump from a failed pg_dump invocation). Real prod
// dumps are megabytes minimum.
const MIN_BACKUP_BYTES = 64 * 1024;
// pg_restore --list runs against the latest dump. On a clean archive
// this completes in well under a second — but TOC corruption on big
// archives can hang the parser. Cap at 60s so the worker doesn't stall.
const PG_RESTORE_TIMEOUT_MS = 60_000;

export interface BackupVerifyResult {
  ok: boolean;
  file?: string;
  sizeBytes?: number;
  ageHours?: number;
  format?: "custom" | "plain";
  error?: string;
  tocEntries?: number;
}

/**
 * Find the freshest backup file in BACKUP_DIR.
 *
 * We accept `.dump` (pg_dump -Fc) and `.sql.gz` (gzipped plain SQL).
 * Sort by mtime descending so a manually-uploaded older snapshot
 * doesn't get verified instead of last night's automated dump.
 */
function findLatestBackup(): { path: string; size: number; mtime: Date; format: "custom" | "plain" } | null {
  if (!existsSync(BACKUP_DIR)) return null;
  let entries: string[];
  try {
    entries = readdirSync(BACKUP_DIR);
  } catch (err) {
    logger.warn({ err, dir: BACKUP_DIR }, "[backup-verify] readdir failed");
    return null;
  }
  const candidates = entries
    .filter((name) => name.endsWith(".dump") || name.endsWith(".sql.gz"))
    .map((name) => {
      const full = join(BACKUP_DIR, name);
      try {
        const s = statSync(full);
        if (!s.isFile()) return null;
        return {
          path: full,
          size: s.size,
          mtime: s.mtime,
          format: name.endsWith(".dump") ? ("custom" as const) : ("plain" as const),
        };
      } catch {
        return null;
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return candidates[0];
}

/**
 * Run `pg_restore --list <file>` and count TOC entries. A custom-format
 * dump that's been truncated or corrupted will error here even though
 * the header looks plausible — the parser actually walks every TOC
 * entry checking the offsets line up.
 */
async function pgRestoreList(file: string): Promise<{ ok: boolean; entries: number; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn("pg_restore", ["--list", file], { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ ok: false, entries: 0, stderr: `pg_restore --list timed out after ${PG_RESTORE_TIMEOUT_MS}ms` });
    }, PG_RESTORE_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, entries: 0, stderr: err.message });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Comments start with `;` — those are header annotations, not TOC
      // entries. Real entries look like "123; 1234 5678 TABLE public ..."
      const entries = stdout
        .split("\n")
        .filter((l) => l.trim() && !l.trim().startsWith(";"))
        .length;
      resolve({ ok: code === 0 && entries > 0, entries, stderr });
    });
  });
}

/**
 * Stream-decode a .sql.gz file partially. If gunzip can produce at
 * least 1KB of output without an error, the gzip framing is intact and
 * the underlying SQL stream isn't truncated at the start. Doesn't
 * validate the SQL itself — the quarterly drill exists for that.
 */
async function checkGzipReadable(file: string): Promise<{ ok: boolean; bytesRead: number; error?: string }> {
  return new Promise((resolve) => {
    let bytesRead = 0;
    let settled = false;
    const finish = (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      resolve({ ok, bytesRead, error });
    };
    const stream = createReadStream(file);
    const gunzip = createGunzip();
    stream.on("error", (err) => finish(false, `read: ${err.message}`));
    gunzip.on("error", (err) => finish(false, `gunzip: ${err.message}`));
    gunzip.on("data", (chunk: Buffer) => {
      bytesRead += chunk.length;
      if (bytesRead >= 1024) {
        // Got enough to confirm framing is good — bail out before we
        // burn CPU decoding the whole multi-GB dump.
        stream.destroy();
        gunzip.destroy();
        finish(true);
      }
    });
    gunzip.on("end", () => finish(bytesRead > 0));
    stream.pipe(gunzip);
  });
}

/**
 * Verify the latest backup. Returns a structured result and logs +
 * audits the outcome. On failure, fires an alert email so on-call
 * sees it the same morning.
 */
export async function verifyLatestBackup(): Promise<BackupVerifyResult> {
  const latest = findLatestBackup();
  if (!latest) {
    const result: BackupVerifyResult = {
      ok: false,
      error: `no .dump or .sql.gz files found in ${BACKUP_DIR}`,
    };
    await reportFailure(result);
    return result;
  }
  const ageHours = (Date.now() - latest.mtime.getTime()) / 3_600_000;
  const base: BackupVerifyResult = {
    ok: false,
    file: latest.path,
    sizeBytes: latest.size,
    ageHours: Math.round(ageHours * 10) / 10,
    format: latest.format,
  };

  // Sanity 1 — non-empty (catches `pg_dump > /tmp/foo` that errored at
  // connect time leaving a 0-byte file).
  if (latest.size < MIN_BACKUP_BYTES) {
    const result = { ...base, error: `backup smaller than ${MIN_BACKUP_BYTES} bytes (size=${latest.size})` };
    await reportFailure(result);
    return result;
  }

  // Sanity 2 — recent (older than 36h means last night's cron didn't
  // run; the worker fires weekly so we shouldn't see a delay >7d, but
  // 36h is the alert threshold).
  if (ageHours > 36) {
    const result = { ...base, error: `latest backup is ${base.ageHours}h old — nightly cron likely failed` };
    await reportFailure(result);
    return result;
  }

  // Sanity 3 — actually parse the archive.
  if (latest.format === "custom") {
    const list = await pgRestoreList(latest.path);
    if (!list.ok) {
      const result = { ...base, error: `pg_restore --list failed: ${list.stderr.trim() || "no entries"}`, tocEntries: list.entries };
      await reportFailure(result);
      return result;
    }
    const result = { ...base, ok: true, tocEntries: list.entries };
    await reportSuccess(result);
    return result;
  } else {
    const gz = await checkGzipReadable(latest.path);
    if (!gz.ok) {
      const result = { ...base, error: `gzip readable check failed: ${gz.error ?? "no bytes decoded"}` };
      await reportFailure(result);
      return result;
    }
    const result = { ...base, ok: true };
    await reportSuccess(result);
    return result;
  }
}

async function reportSuccess(result: BackupVerifyResult): Promise<void> {
  logger.info(
    {
      file: result.file,
      sizeBytes: result.sizeBytes,
      ageHours: result.ageHours,
      format: result.format,
      tocEntries: result.tocEntries,
    },
    "[backup-verify] OK",
  );
  await audit({
    action: "ops.backup_verify",
    entity: "BackupFile",
    entityId: result.file ?? null,
    meta: {
      ok: true,
      sizeBytes: result.sizeBytes ?? null,
      ageHours: result.ageHours ?? null,
      format: result.format ?? null,
      tocEntries: result.tocEntries ?? null,
    },
  });
}

async function reportFailure(result: BackupVerifyResult): Promise<void> {
  logger.error({ result }, "[backup-verify] FAILED");
  await audit({
    action: "ops.backup_verify_failed",
    entity: "BackupFile",
    entityId: result.file ?? null,
    meta: {
      ok: false,
      error: result.error ?? null,
      sizeBytes: result.sizeBytes ?? null,
      ageHours: result.ageHours ?? null,
      format: result.format ?? null,
    },
  });
  // Best-effort alert. If the mail layer itself is broken we still want
  // the audit row above to land, so this is wrapped separately.
  try {
    await sendMail({
      kind: "transactional",
      to: ALERT_RECIPIENT,
      subject: "[ALERT] eMobility backup verification FAILED",
      html: `
        <h2 style="color:#b91c1c">Backup verification failed</h2>
        <p>The weekly backup verifier found a problem with the latest Postgres dump in <code>${BACKUP_DIR}</code>.</p>
        <p><strong>Error:</strong> ${escapeHtml(result.error ?? "unknown")}</p>
        ${result.file ? `<p><strong>File:</strong> <code>${escapeHtml(result.file)}</code></p>` : ""}
        ${result.sizeBytes !== undefined ? `<p><strong>Size:</strong> ${result.sizeBytes} bytes</p>` : ""}
        ${result.ageHours !== undefined ? `<p><strong>Age:</strong> ${result.ageHours}h</p>` : ""}
        <h3>Next steps</h3>
        <ol>
          <li>SSH to the VPS and check <code>journalctl -u backup.timer</code> (or whatever the host cron uses).</li>
          <li>Verify <code>${BACKUP_DIR}</code> isn't full: <code>df -h ${BACKUP_DIR}</code>.</li>
          <li>Try a manual <code>pg_dump -Fc -d $DATABASE_URL -f ${BACKUP_DIR}/manual.dump</code> and inspect any error.</li>
          <li>If the backup itself is corrupted, restore from B2 (off-site copy) and re-run pg_dump.</li>
        </ol>
        <p style="color:#6b7280;font-size:12px">This alert was raised by the <code>backup-verify</code> tick in the notification-maintenance worker.</p>
      `,
      text: `Backup verification failed.\n\nError: ${result.error ?? "unknown"}\nFile: ${result.file ?? "(none)"}\nSize: ${result.sizeBytes ?? "?"} bytes\nAge: ${result.ageHours ?? "?"}h\n\nCheck the VPS cron and disk space.`,
    });
  } catch (err) {
    logger.error({ err }, "[backup-verify] alert email send failed");
  }
}

/**
 * Quarterly restore-drill reminder. The actual restore is a human-in-
 * the-loop exercise: the on-call SSHs to staging, restores the
 * weekend's backup against the staging DB, runs the smoke checklist,
 * and records the outcome in the runbook. We just nudge them on the
 * 1st of each quarter.
 *
 * Tick fires daily; this function decides whether today is the day.
 */
export async function sendQuarterlyDrillReminder(): Promise<{ sent: boolean; reason: string }> {
  const now = new Date();
  const month = now.getUTCMonth(); // 0=Jan
  const day = now.getUTCDate();
  const isQuarterStart = day === 1 && (month === 0 || month === 3 || month === 6 || month === 9);
  if (!isQuarterStart) {
    return { sent: false, reason: `not a quarter-start day (today=${now.toISOString().slice(0, 10)})` };
  }
  // Idempotency — we tick daily, so on the 1st we'd otherwise fire
  // every retry. Check audit log for today's already-sent row.
  const { db } = await import("@/lib/db");
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const existing = await db.auditLog.findFirst({
    where: {
      action: "ops.drill_reminder_sent",
      createdAt: { gte: startOfDay },
    },
    select: { id: true },
  });
  if (existing) {
    return { sent: false, reason: "already sent today" };
  }

  const quarter = Math.floor(month / 3) + 1; // 1..4
  const year = now.getUTCFullYear();
  try {
    await sendMail({
      kind: "transactional",
      to: ALERT_RECIPIENT,
      subject: "Quarterly backup restore drill due",
      html: `
        <h2>Q${quarter} ${year} backup restore drill</h2>
        <p>It's the first of the quarter — time to actually restore a backup and prove the dumps are usable end-to-end. The weekly verifier confirms archives are <em>readable</em>; this drill confirms they <em>restore</em>.</p>
        <h3>Checklist</h3>
        <ol>
          <li>SSH to the staging VPS.</li>
          <li>Pull the latest production dump from off-site (B2): <code>aws s3 cp s3://emce-backups/$(date -u +%Y-%m)/latest.dump ./</code></li>
          <li>Drop-and-recreate the staging DB: <code>dropdb emce_staging &amp;&amp; createdb emce_staging</code></li>
          <li>Restore: <code>pg_restore --no-owner --no-privileges -d emce_staging latest.dump</code> — note start + end times.</li>
          <li>Sanity counts: <code>SELECT count(*) FROM "User"; SELECT count(*) FROM "JobPosting"; SELECT count(*) FROM "Application";</code> — compare to prod.</li>
          <li>Boot the staging app pointing at the restored DB. Sign in as a known account; open /me, /jobs, /admin/dashboard.</li>
          <li>Record outcome in <code>docs/runbooks/backup-drills.md</code>: date, dump-size, restore-time, problems found, follow-ups.</li>
          <li>If anything broke, file an issue tagged <code>ops/backups</code> before next quarter.</li>
        </ol>
        <p>Target: full drill done within 7 days of this email. If it slips past 14 days, escalate.</p>
        <p style="color:#6b7280;font-size:12px">This reminder fires automatically on Jan 1 / Apr 1 / Jul 1 / Oct 1 from the notification-maintenance worker.</p>
      `,
      text: `Q${quarter} ${year} backup restore drill is due. Restore the latest production dump to staging, run the smoke checklist, record the outcome in docs/runbooks/backup-drills.md. Target: complete within 7 days. Escalate if it slips past 14.`,
    });
    await audit({
      action: "ops.drill_reminder_sent",
      entity: "Drill",
      entityId: `Q${quarter}-${year}`,
      meta: { quarter, year },
    });
    logger.info({ quarter, year }, "[backup-verify] drill reminder sent");
    return { sent: true, reason: `Q${quarter} ${year}` };
  } catch (err) {
    logger.error({ err }, "[backup-verify] drill reminder email failed");
    return { sent: false, reason: `email failed: ${(err as Error).message}` };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
