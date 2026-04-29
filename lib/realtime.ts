import Pusher from "pusher";
import { env } from "@/lib/env";

/**
 * Server-side broadcaster for realtime events. Backed by Soketi
 * (Pusher-protocol compatible) in self-hosted mode.
 */
export const realtime = new Pusher({
  appId: env.SOKETI_APP_ID,
  key: env.SOKETI_APP_KEY,
  secret: env.SOKETI_APP_SECRET,
  cluster: "soketi",
  host: env.NEXT_PUBLIC_SOKETI_HOST,
  port: String(env.NEXT_PUBLIC_SOKETI_PORT),
  useTLS: env.NODE_ENV === "production",
});

export const channels = {
  user: (userId: string) => `private-user-${userId}`,
  thread: (threadId: string) => `private-thread-${threadId}`,
  jobAts: (jobId: string) => `private-ats-${jobId}`,
} as const;

export const events = {
  notification: "notification",
  message: "message",
  stageChange: "stage-change",
} as const;
