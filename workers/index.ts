/**
 * BullMQ worker entry point.
 * Run: pnpm worker
 */
import { logger } from "@/lib/logger";
import { startResumeParseWorker } from "@/workers/processors/resume-parse";
import { startEmbeddingsWorker } from "@/workers/processors/embeddings";
import { startNotificationsWorker } from "@/workers/processors/notifications";
import { startBroadcastsWorker } from "@/workers/processors/broadcasts";
import { startInterviewRemindersWorker } from "@/workers/processors/interview-reminders";
import { startMentorshipRemindersWorker } from "@/workers/processors/mentorship-reminders";
import { startCompetitionTicksWorker } from "@/workers/processors/competition-ticks";
import { startResumeDraftWorker } from "@/workers/processors/resume-draft";
import { startWhatsAppDigestWorker } from "@/workers/processors/whatsapp-digest";
import { startNotificationMaintenanceWorker } from "@/workers/processors/notification-maintenance";
import { startFairRemindersWorker } from "@/workers/processors/fair-reminders";
import { startExchangeRatesWorker } from "@/workers/processors/exchange-rates";

const workers = [
  startResumeParseWorker(),
  startEmbeddingsWorker(),
  startNotificationsWorker(),
  startBroadcastsWorker(),
  startInterviewRemindersWorker(),
  startMentorshipRemindersWorker(),
  startCompetitionTicksWorker(),
  startResumeDraftWorker(),
  startWhatsAppDigestWorker(),
  startNotificationMaintenanceWorker(),
  startFairRemindersWorker(),
  // Daily FX-rate refresh — populates ExchangeRate table so the
  // cross-currency salary formatter has fresh data. First tick
  // fires immediately on worker start (seeds the table with
  // hardcoded fallback values + tries the API), then daily.
  startExchangeRatesWorker(),
];

logger.info(`[worker] eMC worker process online (${workers.length} processors registered).`);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "[worker] shutdown signal — draining in-flight jobs");
  // Pass `true` to wait for active jobs to complete before closing the worker.
  // Cap total drain so a stuck job can't block teardown forever. Made
  // env-configurable because the right value depends on the process
  // manager's own kill grace period: PM2's `kill_timeout` (ecosystem
  // .config.js) and Docker's stop-grace must be >= this, or the
  // supervisor SIGKILLs us mid-drain. Set WORKER_DRAIN_TIMEOUT_MS to
  // match. Default 25s.
  const drainTimeoutMs = Number(process.env.WORKER_DRAIN_TIMEOUT_MS ?? 25_000);
  const timer = setTimeout(() => {
    logger.warn({ drainTimeoutMs }, "[worker] drain timeout — forcing exit");
    process.exit(1);
  }, drainTimeoutMs);
  try {
    await Promise.allSettled(workers.map((w) => w.close(true)));
  } finally {
    clearTimeout(timer);
  }
  logger.info("[worker] drained, exiting cleanly");
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  logger.error({ err }, "[worker] uncaught exception");
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "[worker] unhandled rejection");
});
