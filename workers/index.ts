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
];

logger.info(`[worker] eMC worker process online (${workers.length} processors registered).`);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "[worker] shutdown signal — draining in-flight jobs");
  // Pass `true` to wait for active jobs to complete before closing the worker.
  // Cap total drain at 25s so a stuck job can't block container teardown
  // forever (Docker default stop-grace is 10s; bump it to 30 in compose).
  const timer = setTimeout(() => {
    logger.warn("[worker] drain timeout — forcing exit");
    process.exit(1);
  }, 25_000);
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
