import {
  resumeParseQueue,
  embeddingsQueue,
  notificationsQueue,
  broadcastsQueue,
  interviewRemindersQueue,
  mentorshipRemindersQueue,
  competitionTicksQueue,
  resumeDraftQueue,
  whatsappDigestQueue,
  notificationMaintenanceQueue,
} from "@/lib/queues";
import type { Queue, JobsOptions, Job } from "bullmq";

/**
 * Centralised registry of BullMQ queues so the admin operations
 * dashboard can introspect every queue without each page importing
 * the lot. Adding a new queue? Add it here and it shows up in the
 * dashboard automatically.
 *
 * `description` is shown in the operations UI so admins (and future
 * us) understand what each queue does without spelunking the worker
 * source.
 */
export interface QueueDescriptor {
  name: string;
  description: string;
  queue: Queue<unknown, unknown, string>;
}

export const QUEUE_REGISTRY: QueueDescriptor[] = [
  {
    name: "resume-parse",
    description: "PDF/DOCX → structured profile via GPT-4o-mini.",
    queue: resumeParseQueue as Queue<unknown, unknown, string>,
  },
  {
    name: "embeddings",
    description: "Re-embed candidate / job vectors when fields change.",
    queue: embeddingsQueue as Queue<unknown, unknown, string>,
  },
  {
    name: "notifications",
    description: "In-app + email + SMS + WhatsApp fanout for app events.",
    queue: notificationsQueue as Queue<unknown, unknown, string>,
  },
  {
    name: "broadcasts",
    description: "Admin-initiated mass messages (multi-channel).",
    queue: broadcastsQueue as Queue<unknown, unknown, string>,
  },
  {
    name: "interview-reminders",
    description: "Scheduled tick — candidate + recruiter T-24h reminders.",
    queue: interviewRemindersQueue as Queue<unknown, unknown, string>,
  },
  {
    name: "mentorship-reminders",
    description: "Scheduled tick — booking confirmations + post-session prompts.",
    queue: mentorshipRemindersQueue as Queue<unknown, unknown, string>,
  },
  {
    name: "competition-ticks",
    description: "Scheduled tick — competition open/close transitions.",
    queue: competitionTicksQueue as Queue<unknown, unknown, string>,
  },
  {
    name: "resume-draft",
    description: "Async AI résumé regeneration after profile edits.",
    queue: resumeDraftQueue as Queue<unknown, unknown, string>,
  },
  {
    name: "whatsapp-digest",
    description: "Scheduled tick — daily WhatsApp digest of new matches.",
    queue: whatsappDigestQueue as Queue<unknown, unknown, string>,
  },
  {
    name: "notification-maintenance",
    description: "Scheduled tick — clean expired rows + send daily email digest.",
    queue: notificationMaintenanceQueue as Queue<unknown, unknown, string>,
  },
];

export interface QueueSnapshot {
  name: string;
  description: string;
  paused: boolean;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    /** Repeat jobs (cron-like ticks) — separate from `delayed` because
        BullMQ keeps them in their own state. */
    waitingChildren?: number;
    paused?: number;
  };
  /** Last 5 failed jobs for inline troubleshooting. Keeps the snapshot
      lightweight; full failure browsing lives behind the queue's own
      page. */
  recentFailures: Array<{
    id: string;
    name: string;
    failedReason: string | null;
    attemptsMade: number;
    timestamp: number;
  }>;
}

/** Fetch state + job-count tuple for every registered queue in parallel. */
export async function getAllQueueSnapshots(): Promise<QueueSnapshot[]> {
  return Promise.all(
    QUEUE_REGISTRY.map(async (d) => {
      const [counts, paused, recentFailed] = await Promise.all([
        d.queue.getJobCounts(),
        d.queue.isPaused(),
        d.queue.getJobs(["failed"], 0, 4, false),
      ]);
      return {
        name: d.name,
        description: d.description,
        paused,
        counts: {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
          waitingChildren: counts["waiting-children"] ?? 0,
          paused: counts.paused ?? 0,
        },
        recentFailures: recentFailed.map((j: Job) => ({
          id: j.id ?? "",
          name: j.name,
          failedReason: j.failedReason ?? null,
          attemptsMade: j.attemptsMade,
          timestamp: j.timestamp,
        })),
      };
    }),
  );
}

/** Look up a single registered queue by name (returns null if unknown). */
export function queueByName(name: string): Queue<unknown, unknown, string> | null {
  return QUEUE_REGISTRY.find((d) => d.name === name)?.queue ?? null;
}

/** Detail-page payload — failed job details + a few completed for
    sanity reference. We cap at 50 so a misbehaving queue doesn't push
    multi-MB into the response. */
export async function getQueueDetail(name: string): Promise<{
  snapshot: QueueSnapshot;
  failed: Array<{
    id: string;
    name: string;
    data: unknown;
    failedReason: string | null;
    stacktrace: string[];
    attemptsMade: number;
    timestamp: number;
  }>;
} | null> {
  const queue = queueByName(name);
  if (!queue) return null;
  const [counts, paused, failed] = await Promise.all([
    queue.getJobCounts(),
    queue.isPaused(),
    queue.getJobs(["failed"], 0, 49, false),
  ]);
  const desc = QUEUE_REGISTRY.find((d) => d.name === name)?.description ?? "";
  const snapshot: QueueSnapshot = {
    name,
    description: desc,
    paused,
    counts: {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      waitingChildren: counts["waiting-children"] ?? 0,
      paused: counts.paused ?? 0,
    },
    recentFailures: failed.slice(0, 5).map((j: Job) => ({
      id: j.id ?? "",
      name: j.name,
      failedReason: j.failedReason ?? null,
      attemptsMade: j.attemptsMade,
      timestamp: j.timestamp,
    })),
  };
  return {
    snapshot,
    failed: failed.map((j: Job) => ({
      id: j.id ?? "",
      name: j.name,
      data: j.data,
      failedReason: j.failedReason ?? null,
      stacktrace: j.stacktrace ?? [],
      attemptsMade: j.attemptsMade,
      timestamp: j.timestamp,
    })),
  };
}

// Re-export so admin actions can grab the JobsOptions type.
export type { JobsOptions };
