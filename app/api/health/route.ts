import { NextResponse } from "next/server";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { statfs } from "node:fs/promises";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { s3, buckets } from "@/lib/storage";
import { logger } from "@/lib/logger";
import {
  notificationMaintenanceQueue,
  notificationsQueue,
  resumeParseQueue,
  embeddingsQueue,
} from "@/lib/queues";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public health endpoint — used by Caddy upstream checks, the deploy
 * script, and uptime monitors. Returns 200 only when every check
 * passes; degraded checks bump the response to 503 so a load balancer
 * actually rotates the bad instance out.
 *
 * Each sub-check has its own short timeout so a single slow dependency
 * (e.g. SES degradation pulling MinIO down with it) doesn't stall the
 * whole probe past the orchestrator's read timeout.
 */

const DISK_WARN_THRESHOLD = 0.8; // 80% used → warn but still healthy
const DISK_FAIL_THRESHOLD = 0.95; // 95% used → unhealthy (DB or backups will start failing)
const WORKER_HEARTBEAT_MAX_AGE_MS = 15 * 60 * 1000; // BullMQ workers should heartbeat at least every minute; 15min is a generous staleness threshold

interface CheckResult {
  ok: boolean;
  latencyMs?: number;
  detail?: string;
  warn?: boolean;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function checkDb(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await withTimeout(db.$queryRaw`SELECT 1`, 2000, "db");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    logger.error({ err: e }, "[health] db check failed");
    return { ok: false, latencyMs: Date.now() - start, detail: (e as Error).message };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await withTimeout(redis.ping().then(() => undefined), 2000, "redis");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    logger.error({ err: e }, "[health] redis check failed");
    return { ok: false, latencyMs: Date.now() - start, detail: (e as Error).message };
  }
}

async function checkStorage(): Promise<CheckResult> {
  const start = Date.now();
  try {
    // HeadBucket on the AVATARS bucket (not resumes) so the probe
    // exercises the public-read bucket as well — that's the one a
    // browser hits for profile photos and the most common 502 source.
    await withTimeout(
      s3.send(new HeadBucketCommand({ Bucket: buckets.avatars })).then(() => undefined),
      3000,
      "storage",
    );
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    logger.error({ err: e }, "[health] storage check failed");
    return { ok: false, latencyMs: Date.now() - start, detail: (e as Error).message };
  }
}

/**
 * Disk space on the volume that backs the writable areas (uploads
 * staging, BullMQ tmp). On the prod VPS that's `/` because everything
 * is on the root volume; on dev / Mac it's the developer's home disk.
 * `statfs` returns block counts; convert to a used-fraction.
 */
async function checkDisk(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const path = process.env.DISK_HEALTH_PATH ?? "/";
    const s = await withTimeout(statfs(path), 1000, "statfs");
    const total = Number(s.blocks) * Number(s.bsize);
    const free = Number(s.bavail) * Number(s.bsize);
    const usedFraction = total > 0 ? (total - free) / total : 0;
    const detail = `${(usedFraction * 100).toFixed(1)}% used (${path})`;
    if (usedFraction >= DISK_FAIL_THRESHOLD) {
      return { ok: false, latencyMs: Date.now() - start, detail };
    }
    if (usedFraction >= DISK_WARN_THRESHOLD) {
      return { ok: true, latencyMs: Date.now() - start, detail, warn: true };
    }
    return { ok: true, latencyMs: Date.now() - start, detail };
  } catch (e) {
    logger.warn({ err: e }, "[health] disk check failed");
    // Don't fail the whole probe on disk-stat errors — `statfs` can
    // return ENOENT in some Docker setups even when the disk is fine.
    return { ok: true, latencyMs: Date.now() - start, detail: `statfs unavailable: ${(e as Error).message}`, warn: true };
  }
}

/**
 * Worker liveness via BullMQ. `Queue.getWorkers()` reads the registry
 * Redis writes when each worker boots; if the worker process is dead
 * the entry stays around briefly but its `lastActiveAt` stops
 * advancing. We assert at least one worker per queue is heartbeating
 * within WORKER_HEARTBEAT_MAX_AGE_MS.
 */
async function checkWorkers(): Promise<CheckResult> {
  const start = Date.now();
  try {
    // Spot-check the most critical queues. We don't probe every queue
    // (some are dev-only or fire rarely); the four below cover the
    // user-facing paths. A worker process typically attaches to all
    // queues, so if any one shows liveness, the others do too —
    // checking a representative subset keeps the probe fast.
    const queues = [
      { q: notificationMaintenanceQueue, name: "notification-maintenance" },
      { q: notificationsQueue, name: "notifications" },
      { q: resumeParseQueue, name: "resume-parse" },
      { q: embeddingsQueue, name: "embeddings" },
    ];
    const results = await Promise.all(
      queues.map(async ({ q, name }) => {
        const ws = await withTimeout(q.getWorkers(), 2000, `getWorkers(${name})`);
        // BullMQ's WorkerData has a `started` and a `idle` epoch; we
        // care about whichever is most recent (a worker idling without
        // jobs is still healthy; a worker actively processing is even
        // more healthy).
        let mostRecentMs = 0;
        for (const w of ws) {
          const wAny = w as unknown as { started?: number; idle?: number };
          const ts = Math.max(wAny.started ?? 0, wAny.idle ?? 0);
          if (ts > mostRecentMs) mostRecentMs = ts;
        }
        const ageMs = mostRecentMs > 0 ? Date.now() - mostRecentMs : Infinity;
        return { name, count: ws.length, ageMs };
      }),
    );
    const stale = results.filter((r) => r.count === 0 || r.ageMs > WORKER_HEARTBEAT_MAX_AGE_MS);
    if (stale.length > 0) {
      const detail = stale
        .map((r) =>
          r.count === 0 ? `${r.name}: no workers` : `${r.name}: stale ${Math.round(r.ageMs / 60000)}m`,
        )
        .join(", ");
      return { ok: false, latencyMs: Date.now() - start, detail };
    }
    const detail = results.map((r) => `${r.name}×${r.count}`).join(", ");
    return { ok: true, latencyMs: Date.now() - start, detail };
  } catch (e) {
    logger.warn({ err: e }, "[health] worker check failed");
    // Worker check failure isn't a hard fail — Redis is reachable
    // (we just checked) and the probe shouldn't yo-yo on transient
    // BullMQ registry hiccups. Mark warn instead.
    return { ok: true, latencyMs: Date.now() - start, detail: `getWorkers failed: ${(e as Error).message}`, warn: true };
  }
}

export async function GET() {
  const overallStart = Date.now();
  const [dbR, redisR, storageR, diskR, workersR] = await Promise.all([
    checkDb(),
    checkRedis(),
    checkStorage(),
    checkDisk(),
    checkWorkers(),
  ]);
  const checks = { db: dbR, redis: redisR, storage: storageR, disk: diskR, workers: workersR };
  const ok = Object.values(checks).every((c) => c.ok);
  const anyWarn = Object.values(checks).some((c) => c.warn);
  const status = ok ? (anyWarn ? "warn" : "ok") : "degraded";

  return NextResponse.json(
    {
      status,
      service: "emce-web",
      version: process.env.npm_package_version ?? "0.1.0",
      uptimeSec: Math.round(process.uptime()),
      checks,
      totalLatencyMs: Date.now() - overallStart,
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
