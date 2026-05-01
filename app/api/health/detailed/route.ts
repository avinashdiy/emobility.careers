import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import type { Queue } from "bullmq";
import {
  notificationMaintenanceQueue,
  notificationsQueue,
  resumeParseQueue,
  embeddingsQueue,
  broadcastsQueue,
  interviewRemindersQueue,
  mentorshipRemindersQueue,
  competitionTicksQueue,
  resumeDraftQueue,
  whatsappDigestQueue,
} from "@/lib/queues";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Admin-only deep health probe. Goes beyond the public /api/health
 * by exposing internals an on-call human actually needs to debug a
 * degraded instance:
 *
 *   • Postgres connection-pool stats (pg_stat_activity bucketed by
 *     the app role) — finds the "100 idle-in-transaction" bug fast.
 *   • Redis INFO sections (memory, clients, persistence) — reveals
 *     when we're about to OOM the BullMQ host.
 *   • Per-queue depth across all BullMQ queues with backlog age.
 *   • Process-level memory + uptime.
 *
 * Locked down to ADMIN role. Returns 401 to anyone else (not 404 —
 * the existence of the endpoint is documented in the runbook).
 */

interface QueueStat {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  oldestWaitingMs: number | null;
}

// `Queue` from BullMQ is a deeply-generic class; we only need the two
// methods below, so a minimal upcast keeps the queueDefs array easy to
// read (otherwise we'd have to spell out each Queue<T> instantiation).
type AnyBullQueue = Queue<unknown, unknown, string>;

async function getQueueStat(name: string, q: AnyBullQueue): Promise<QueueStat> {
  const counts = await q.getJobCounts();
  // Oldest waiting job — handy for spotting workers that fell behind
  // even before they fully wedge. Fetch one at the head of the queue.
  let oldestWaitingMs: number | null = null;
  try {
    const head = await q.getJobs(["waiting"], 0, 0, true);
    if (head.length > 0 && head[0].timestamp) {
      oldestWaitingMs = Date.now() - head[0].timestamp;
    }
  } catch {
    // getJobs occasionally errors on empty queues; ignore
  }
  return {
    name,
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    delayed: counts.delayed ?? 0,
    failed: counts.failed ?? 0,
    oldestWaitingMs,
  };
}

/**
 * Parse the relevant lines out of `INFO memory` and `INFO clients`.
 * We pluck the fields a humans would actually look at in a 3am
 * incident — used_memory_human, fragmentation, connected_clients,
 * blocked_clients.
 */
function parseRedisInfo(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const interesting = new Set([
    "used_memory_human",
    "used_memory_peak_human",
    "mem_fragmentation_ratio",
    "maxmemory_human",
    "connected_clients",
    "blocked_clients",
    "rejected_connections",
    "evicted_keys",
    "expired_keys",
    "keyspace_hits",
    "keyspace_misses",
    "rdb_last_save_time",
    "rdb_changes_since_last_save",
    "redis_version",
    "uptime_in_seconds",
  ]);
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const k = line.slice(0, idx);
    const v = line.slice(idx + 1);
    if (interesting.has(k)) out[k] = v;
  }
  return out;
}

interface PgConnectionRow {
  state: string | null;
  count: bigint;
}

interface PgSizeRow {
  size_bytes: bigint;
}

interface PgIdleTxnRow {
  pid: number;
  duration_seconds: number;
  query: string;
}

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "admin only" }, { status: 401 });
  }

  const start = Date.now();

  // Postgres pool / activity. We bucket by `state` so it's obvious
  // when a flood of `idle in transaction` rows is starving the pool.
  let pgActivity: { state: string; count: number }[] = [];
  let pgDbSizeMb: number | null = null;
  let pgIdleInTxn: PgIdleTxnRow[] = [];
  try {
    const [activity, sizeRow, idleTxn] = await Promise.all([
      db.$queryRaw<PgConnectionRow[]>`
        SELECT state, count(*)::bigint AS count
        FROM pg_stat_activity
        WHERE datname = current_database()
        GROUP BY state
        ORDER BY count DESC
      `,
      db.$queryRaw<PgSizeRow[]>`
        SELECT pg_database_size(current_database())::bigint AS size_bytes
      `,
      db.$queryRaw<PgIdleTxnRow[]>`
        SELECT pid,
               EXTRACT(EPOCH FROM (now() - state_change))::int AS duration_seconds,
               LEFT(query, 200) AS query
        FROM pg_stat_activity
        WHERE state = 'idle in transaction'
          AND datname = current_database()
        ORDER BY state_change ASC
        LIMIT 5
      `,
    ]);
    pgActivity = activity.map((r) => ({ state: r.state ?? "(null)", count: Number(r.count) }));
    pgDbSizeMb = Math.round((Number(sizeRow[0]?.size_bytes ?? 0n) / (1024 * 1024)) * 10) / 10;
    pgIdleInTxn = idleTxn;
  } catch (err) {
    logger.error({ err }, "[health/detailed] pg activity query failed");
  }

  // Redis info — separate INFO calls for memory and clients keep the
  // blocking time on the Redis main thread small.
  let redisInfo: Record<string, string> = {};
  try {
    const [memInfo, clientInfo, statsInfo, persistenceInfo, serverInfo] = await Promise.all([
      redis.info("memory"),
      redis.info("clients"),
      redis.info("stats"),
      redis.info("persistence"),
      redis.info("server"),
    ]);
    redisInfo = {
      ...parseRedisInfo(serverInfo),
      ...parseRedisInfo(memInfo),
      ...parseRedisInfo(clientInfo),
      ...parseRedisInfo(statsInfo),
      ...parseRedisInfo(persistenceInfo),
    };
  } catch (err) {
    logger.error({ err }, "[health/detailed] redis info failed");
  }

  // Per-queue depth. Catch failures so a broken queue doesn't blank
  // out the whole report.
  const queueDefs: { name: string; q: AnyBullQueue }[] = [
    { name: "notification-maintenance", q: notificationMaintenanceQueue as unknown as AnyBullQueue },
    { name: "notifications", q: notificationsQueue as unknown as AnyBullQueue },
    { name: "resume-parse", q: resumeParseQueue as unknown as AnyBullQueue },
    { name: "embeddings", q: embeddingsQueue as unknown as AnyBullQueue },
    { name: "broadcasts", q: broadcastsQueue as unknown as AnyBullQueue },
    { name: "interview-reminders", q: interviewRemindersQueue as unknown as AnyBullQueue },
    { name: "mentorship-reminders", q: mentorshipRemindersQueue as unknown as AnyBullQueue },
    { name: "competition-ticks", q: competitionTicksQueue as unknown as AnyBullQueue },
    { name: "resume-draft", q: resumeDraftQueue as unknown as AnyBullQueue },
    { name: "whatsapp-digest", q: whatsappDigestQueue as unknown as AnyBullQueue },
  ];
  const queueResults = await Promise.all(
    queueDefs.map(async ({ name, q }) => {
      try {
        return await getQueueStat(name, q);
      } catch (err) {
        logger.warn({ err, name }, "[health/detailed] queue stat failed");
        return { name, waiting: -1, active: -1, delayed: -1, failed: -1, oldestWaitingMs: null };
      }
    }),
  );

  // Process-level — useful when comparing instances behind a load
  // balancer to spot the one with a memory leak.
  const mem = process.memoryUsage();
  const processInfo = {
    rssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
    heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
    heapTotalMb: Math.round((mem.heapTotal / (1024 * 1024)) * 10) / 10,
    externalMb: Math.round((mem.external / (1024 * 1024)) * 10) / 10,
    uptimeSec: Math.round(process.uptime()),
    pid: process.pid,
    nodeVersion: process.version,
  };

  return NextResponse.json(
    {
      service: "emce-web",
      version: process.env.npm_package_version ?? "0.1.0",
      time: new Date().toISOString(),
      totalLatencyMs: Date.now() - start,
      postgres: {
        activityByState: pgActivity,
        databaseSizeMb: pgDbSizeMb,
        oldestIdleInTransaction: pgIdleInTxn,
      },
      redis: redisInfo,
      queues: queueResults,
      process: processInfo,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
