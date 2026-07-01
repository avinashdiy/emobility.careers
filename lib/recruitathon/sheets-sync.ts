import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Push Recruitathon test scores into the team's Google Sheet via an
 * Apps Script Web App (deployed on the sheet itself). The script writes
 * each row into a dedicated "Test Scores" tab, keyed by the candidate's
 * email, and appends any email it can't find in the master registration
 * tab to an "Unmatched Scores" tab.
 *
 * Config (set on prod .env — the app owner adds these):
 *   RECRUITATHON_SHEETS_WEBHOOK_URL  — the Apps Script Web App /exec URL
 *   RECRUITATHON_SHEETS_SECRET       — shared token the script checks
 *
 * Best-effort by design: a sheet outage never blocks or fails a test
 * submission. The admin "re-sync all scores" action backfills any misses.
 */

const WEBHOOK_URL = process.env.RECRUITATHON_SHEETS_WEBHOOK_URL;
const SECRET = process.env.RECRUITATHON_SHEETS_SECRET;
const POST_TIMEOUT_MS = 8000;
const CHUNK = 200;

export interface ScoreRow {
  email: string;
  name: string | null;
  company: string;
  role: string;
  jdSlug: string;
  score: number;
  result: "PASS" | "FAIL";
  // Proctoring integrity signals for review.
  focusFlags: number; // tab-switch / full-screen-exit / paste / copy / devtools (the terminating budget)
  cameraFlags: number; // sustained look-away / multiple-face / camera-off (non-terminating)
  terminated: boolean;
  submittedAt: string; // ISO
  attemptId: string;
}

async function postToSheet(rows: ScoreRow[]): Promise<{ ok: boolean; error?: string }> {
  if (!WEBHOOK_URL || !SECRET) {
    logger.warn("[recruitathon-sheets] webhook not configured (RECRUITATHON_SHEETS_WEBHOOK_URL / _SECRET); skipping");
    return { ok: false, error: "not_configured" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: SECRET, rows }),
      signal: controller.signal,
      redirect: "follow", // Apps Script /exec 302-redirects to script.googleusercontent.com
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Build a sheet row from a submitted attempt, or null if it isn't a
 *  gradable Recruitathon attempt (no JD link, not submitted, no email). */
async function buildRow(attemptId: string): Promise<ScoreRow | null> {
  const a = await db.assessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      score: true,
      passed: true,
      submittedAt: true,
      proctorMeta: true,
      candidate: { select: { firstName: true, lastName: true, user: { select: { email: true } } } },
      assessment: { select: { recruitathonJd: { select: { role: true, company: true, slug: true } } } },
    },
  });
  if (!a || a.submittedAt == null || a.score == null) return null;
  const email = a.candidate?.user?.email;
  const jd = a.assessment?.recruitathonJd;
  if (!email || !jd) return null;

  const name = [a.candidate?.firstName, a.candidate?.lastName].filter(Boolean).join(" ") || null;
  const pm = a.proctorMeta as { terminated?: boolean; flags?: number; cameraFlags?: number } | null;

  return {
    email: email.trim().toLowerCase(),
    name,
    company: jd.company,
    role: jd.role,
    jdSlug: jd.slug,
    score: a.score,
    result: a.passed ? "PASS" : "FAIL",
    focusFlags: typeof pm?.flags === "number" ? pm.flags : 0,
    cameraFlags: typeof pm?.cameraFlags === "number" ? pm.cameraFlags : 0,
    terminated: Boolean(pm?.terminated),
    submittedAt: a.submittedAt.toISOString(),
    attemptId: a.id,
  };
}

/**
 * Push a single attempt's score to the sheet. Best-effort — logs and
 * swallows any failure so exam submission is never blocked.
 */
export async function syncAttemptScore(attemptId: string): Promise<void> {
  if (!WEBHOOK_URL || !SECRET) return; // sheet sync not configured yet — no-op
  try {
    const row = await buildRow(attemptId);
    if (!row) return;
    const res = await postToSheet([row]);
    if (!res.ok) {
      logger.warn({ attemptId, error: res.error }, "[recruitathon-sheets] score push failed (will backfill via re-sync)");
    }
  } catch (err) {
    logger.warn({ attemptId, err: err instanceof Error ? err.message : String(err) }, "[recruitathon-sheets] score push threw");
  }
}

/**
 * Backfill: re-push every submitted Recruitathon attempt. Idempotent on
 * the sheet side (upsert by email+role), so safe to run repeatedly.
 * Admin-triggered safety net for anything the live push missed.
 */
export async function syncAllRecruitathonScores(): Promise<{
  ok: boolean;
  total: number;
  pushed: number;
  error?: string;
}> {
  if (!WEBHOOK_URL || !SECRET) return { ok: false, total: 0, pushed: 0, error: "not_configured" };
  const attempts = await db.assessmentAttempt.findMany({
    where: { submittedAt: { not: null }, assessment: { recruitathonJd: { isNot: null } } },
    select: { id: true },
    orderBy: { submittedAt: "asc" },
  });

  const rows: ScoreRow[] = [];
  for (const at of attempts) {
    const r = await buildRow(at.id);
    if (r) rows.push(r);
  }
  if (rows.length === 0) return { ok: true, total: attempts.length, pushed: 0 };

  let pushed = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const res = await postToSheet(chunk);
    if (!res.ok) return { ok: false, total: attempts.length, pushed, error: res.error };
    pushed += chunk.length;
  }
  return { ok: true, total: attempts.length, pushed };
}
