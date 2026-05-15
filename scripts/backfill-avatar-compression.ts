/**
 * One-shot backfill: re-compress every avatar already in the
 * `emce-avatars` MinIO bucket through the same pipeline new
 * uploads run through (`uploadAvatar` in
 * server/candidates/actions.ts) — sharp resize to 400×400 cover,
 * WebP at quality 80.
 *
 * Why this exists:
 *   Lighthouse audit on 2026-05-15 flagged a single avatar at
 *   979 KB / 1240×1600 px displayed at 112×145 px, blowing the
 *   image-size budget by ~1.2 MB. The upload-time pipeline now
 *   ships fresh uploads at ~30 KB WebP, but every row already in
 *   the DB still points at the bloated original. This script
 *   walks the bucket once and rewrites them in-place.
 *
 * What it does:
 *   1. List every object in `S3_BUCKET_AVATARS`.
 *   2. Skip objects already ending in `.webp` (recompressed already).
 *   3. For each non-WebP object: download → sharp pipeline →
 *      upload as a new `.webp` sibling key.
 *   4. Update `CandidateProfile.profilePhotoUrl` rows pointing at
 *      the old key to point at the new key.
 *   5. Delete the old object only after the DB write succeeds —
 *      that way a re-run can resume cleanly if the DB write fails.
 *
 * Idempotent: re-running over an already-migrated bucket is a
 * no-op (every object is WebP, every URL points at WebP).
 *
 * Run with:
 *   `pnpm tsx scripts/backfill-avatar-compression.ts`
 *   on the VPS, with the same .env as the web container.
 *
 * Add `--dry-run` to print what would change without writing.
 * Add `--keep` to leave old objects in the bucket (audit/safety).
 */

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

interface CliFlags {
  dryRun: boolean;
  keepOld: boolean;
}

function parseFlags(): CliFlags {
  const argv = process.argv.slice(2);
  return {
    dryRun: argv.includes("--dry-run"),
    keepOld: argv.includes("--keep"),
  };
}

async function streamToBuffer(stream: AsyncIterable<Uint8Array> | undefined): Promise<Buffer> {
  if (!stream) throw new Error("Empty object body");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function main() {
  const flags = parseFlags();
  const endpoint = requireEnv("S3_ENDPOINT");
  const region = process.env.S3_REGION ?? "us-east-1";
  const accessKey = requireEnv("S3_ACCESS_KEY");
  const secretKey = requireEnv("S3_SECRET_KEY");
  const bucket = requireEnv("S3_BUCKET_AVATARS");
  const publicUrlBase = requireEnv("S3_PUBLIC_URL").replace(/\/$/, "");
  const forcePathStyle =
    (process.env.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() !== "false";

  const s3 = new S3Client({
    endpoint,
    region,
    forcePathStyle,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
  const prisma = new PrismaClient();

  console.log(`[avatar-backfill] bucket=${bucket} endpoint=${endpoint}`);
  console.log(`[avatar-backfill] dryRun=${flags.dryRun} keepOld=${flags.keepOld}`);
  console.log("");

  let processed = 0;
  let skipped = 0;
  let recompressed = 0;
  let rewroteDb = 0;
  let deleted = 0;
  let totalSavedBytes = 0;
  let failed = 0;

  let continuationToken: string | undefined = undefined;

  do {
    const list: ListObjectsV2CommandOutput = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    const objects = list.Contents ?? [];

    for (const obj of objects) {
      const key = obj.Key;
      if (!key) continue;
      processed += 1;

      // Skip cover banners — different aspect-ratio target,
      // different `bannerUrl` field, different size budget. The
      // script is scoped to round avatars only.
      if (key.startsWith("banners/")) {
        skipped += 1;
        continue;
      }

      // Already WebP → skip (idempotent).
      if (key.toLowerCase().endsWith(".webp")) {
        skipped += 1;
        continue;
      }

      // Build the new sibling key by swapping the extension.
      const newKey = key.replace(/\.[^./]+$/, ".webp");
      if (newKey === key) {
        // No extension at all — unusual; skip rather than guess.
        console.warn(`[avatar-backfill] skipping (no extension): ${key}`);
        skipped += 1;
        continue;
      }

      const originalSize = obj.Size ?? 0;

      try {
        if (flags.dryRun) {
          console.log(`[avatar-backfill] DRY would compress: ${key} (${originalSize} B) -> ${newKey}`);
          continue;
        }

        // 1. Download.
        const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const raw = await streamToBuffer(get.Body as AsyncIterable<Uint8Array> | undefined);

        // 2. Sharp pipeline — same params as uploadAvatar.
        const compressed = await sharp(raw)
          .rotate()
          .resize(400, 400, { fit: "cover", position: "centre" })
          .webp({ quality: 80 })
          .toBuffer();

        // 3. Upload new WebP under the sibling key.
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: newKey,
            Body: compressed,
            ContentType: "image/webp",
            ACL: "public-read",
            CacheControl: "public, max-age=31536000, immutable",
            Metadata: { "x-content-type-options": "nosniff" },
          }),
        );
        recompressed += 1;
        totalSavedBytes += Math.max(0, originalSize - compressed.length);

        // 4. Rewrite any DB rows that point at the old URL. The URL
        //    shape is `${S3_PUBLIC_URL}/${bucket}/${key}` — match
        //    on the key suffix so we don't depend on the exact host
        //    (helps if S3_PUBLIC_URL changed between uploads).
        const oldPublicUrl = `${publicUrlBase}/${bucket}/${key}`;
        const newPublicUrl = `${publicUrlBase}/${bucket}/${newKey}`;

        const updated = await prisma.candidateProfile.updateMany({
          where: { profilePhotoUrl: oldPublicUrl },
          data: { profilePhotoUrl: newPublicUrl },
        });
        rewroteDb += updated.count;

        // Some legacy rows may have URLs with slightly different
        // hostnames (`http://localhost:9000/...` vs the prod
        // `https://files.emobility.careers/...`). Also match by
        // bucket + key suffix as a fallback so the migration
        // doesn't strand them.
        const fallbackUrlMarker = `/${bucket}/${key}`;
        const fallback = await prisma.candidateProfile.updateMany({
          where: { profilePhotoUrl: { endsWith: fallbackUrlMarker } },
          data: { profilePhotoUrl: newPublicUrl },
        });
        rewroteDb += fallback.count;

        // 5. Delete original ONLY if --keep wasn't passed AND the
        //    DB rewrite succeeded above.
        if (!flags.keepOld) {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
          deleted += 1;
        }

        console.log(
          `[avatar-backfill] ${key} -> ${newKey} (${originalSize}B → ${compressed.length}B, saved ${Math.max(0, originalSize - compressed.length)}B, db_rows=${updated.count + fallback.count})`,
        );
      } catch (err) {
        failed += 1;
        console.error(`[avatar-backfill] FAILED ${key}:`, err instanceof Error ? err.message : err);
      }
    }
  } while (continuationToken);

  console.log("");
  console.log(`[avatar-backfill] done`);
  console.log(`  processed:    ${processed}`);
  console.log(`  recompressed: ${recompressed}`);
  console.log(`  skipped:      ${skipped} (already WebP or banner/)`);
  console.log(`  db rewritten: ${rewroteDb} profile rows`);
  console.log(`  deleted old:  ${deleted}`);
  console.log(`  failed:       ${failed}`);
  console.log(`  bytes saved:  ${(totalSavedBytes / 1024 / 1024).toFixed(2)} MB`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
