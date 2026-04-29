import { NextResponse } from "next/server";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { s3, buckets } from "@/lib/storage";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number }> = {};

  // DB
  {
    const start = Date.now();
    try {
      await withTimeout(db.$queryRaw`SELECT 1`, 2000);
      checks.db = { ok: true, latencyMs: Date.now() - start };
    } catch (e) {
      logger.error({ err: e }, "[health] db check failed");
      checks.db = { ok: false };
    }
  }

  // Redis
  {
    const start = Date.now();
    try {
      await withTimeout(redis.ping().then(() => undefined), 2000);
      checks.redis = { ok: true, latencyMs: Date.now() - start };
    } catch (e) {
      logger.error({ err: e }, "[health] redis check failed");
      checks.redis = { ok: false };
    }
  }

  // MinIO / S3 — head_bucket on resumes (cheapest reachability check)
  {
    const start = Date.now();
    try {
      await withTimeout(
        s3.send(new HeadBucketCommand({ Bucket: buckets.resumes })).then(() => undefined),
        3000,
      );
      checks.storage = { ok: true, latencyMs: Date.now() - start };
    } catch (e) {
      logger.error({ err: e }, "[health] storage check failed");
      checks.storage = { ok: false };
    }
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      service: "emce-web",
      version: process.env.npm_package_version ?? "0.1.0",
      checks,
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
