import { Queue, type QueueOptions } from "bullmq";
import { redis } from "@/lib/redis";

const baseOpts: QueueOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { age: 24 * 3600, count: 1_000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
};

export const QueueNames = {
  ResumeParse: "resume-parse",
  Embeddings: "embeddings",
  Notifications: "notifications",
  Matching: "matching",
  Broadcasts: "broadcasts",
  InterviewReminders: "interview-reminders",
  MentorshipReminders: "mentorship-reminders",
  CompetitionTicks: "competition-ticks",
  ResumeDraft: "resume-draft",
} as const;

export type ResumeParseJob = {
  candidateId: string;
  bucket: string;
  key: string;
  mimeType: string;
};

export type EmbeddingsJob =
  | { kind: "candidate"; candidateId: string }
  | { kind: "job"; jobId: string };

export type NotificationsJob = {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  channels?: ("IN_APP" | "EMAIL" | "SMS" | "WHATSAPP" | "PUSH")[];
  payload?: Record<string, unknown>;
};

export type BroadcastJob = { broadcastId: string };
export type InterviewReminderJob = { tick: true };
export type MentorshipReminderJob = { tick: true };
export type CompetitionTickJob = { tick: true };
export type ResumeDraftJob = { candidateId: string };

export const resumeParseQueue = new Queue<ResumeParseJob>(QueueNames.ResumeParse, baseOpts);
export const embeddingsQueue = new Queue<EmbeddingsJob>(QueueNames.Embeddings, baseOpts);
export const notificationsQueue = new Queue<NotificationsJob>(QueueNames.Notifications, baseOpts);
export const broadcastsQueue = new Queue<BroadcastJob>(QueueNames.Broadcasts, baseOpts);
export const interviewRemindersQueue = new Queue<InterviewReminderJob>(QueueNames.InterviewReminders, baseOpts);
export const mentorshipRemindersQueue = new Queue<MentorshipReminderJob>(QueueNames.MentorshipReminders, baseOpts);
export const competitionTicksQueue = new Queue<CompetitionTickJob>(QueueNames.CompetitionTicks, baseOpts);
export const resumeDraftQueue = new Queue<ResumeDraftJob>(QueueNames.ResumeDraft, {
  ...baseOpts,
  defaultJobOptions: {
    ...baseOpts.defaultJobOptions,
    // Coalesce repeated edits: if a candidate saves experience three times in
    // a row, we only want to draft once. BullMQ's `jobId` deduplication kicks
    // in if the same id is enqueued while a previous one is still pending.
    attempts: 2,
  },
});
