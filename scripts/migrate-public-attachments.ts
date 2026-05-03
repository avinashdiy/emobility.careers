/**
 * One-shot backfill for the bucket-split fix.
 *
 * Context: post attachments and event covers were uploaded to the
 * `emce-docs` bucket (intended for Aadhar uploads + GDPR exports,
 * which is correctly PRIVATE). When the bucket policy got reverted
 * to private, every public <img src=...> went AccessDenied. The
 * code now writes new uploads to a new public `emce-posts` bucket,
 * but rows already in the database still point at the old keys.
 *
 * What this script does:
 *   1. Lists `emce-docs/posts/*` and `emce-docs/events/*`.
 *   2. For each object, CopyObject → `emce-posts/<same key>`.
 *   3. Updates `PostAttachment.url` and `Event.coverImageUrl` rows
 *      whose URL contains `/{S3_BUCKET_DOCS}/` to use the new
 *      bucket name in the path.
 *   4. Does NOT delete the source objects — keeps them as a safety
 *      net. Run scripts/migrate-public-attachments-cleanup.ts
 *      manually after verifying the new URLs render.
 *
 * Idempotent: copying an object that already exists at the
 * destination is a no-op cost-wise on MinIO; URL rewrites use
 * Prisma's `updateMany` with a `contains` filter so re-running
 * doesn't double-rewrite.
 *
 * Run via: `pnpm tsx scripts/migrate-public-attachments.ts` on the
 * VPS (needs the same .env as the web container).
 */

import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function main() {
  const endpoint = requireEnv("S3_ENDPOINT");
  const region = process.env.S3_REGION ?? "us-east-1";
  const accessKey = requireEnv("S3_ACCESS_KEY");
  const secretKey = requireEnv("S3_SECRET_KEY");
  const forcePathStyle =
    (process.env.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() !== "false";
  const docsBucket = process.env.S3_BUCKET_DOCS ?? "emce-docs";
  const postsBucket = process.env.S3_BUCKET_POSTS ?? "emce-posts";

  const s3 = new S3Client({
    endpoint,
    region,
    forcePathStyle,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
  const prisma = new PrismaClient();

  console.log(`[migrate] ${docsBucket} → ${postsBucket}`);

  // ── (1) + (2): walk + copy ───────────────────────────────────
  let copied = 0;
  let skipped = 0;
  for (const prefix of ["posts/", "events/"]) {
    let continuationToken: string | undefined = undefined;
    do {
      const list: ListObjectsV2CommandOutput = await s3.send(
        new ListObjectsV2Command({
          Bucket: docsBucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of list.Contents ?? []) {
        if (!obj.Key) continue;
        try {
          await s3.send(
            new CopyObjectCommand({
              Bucket: postsBucket,
              Key: obj.Key,
              // CopySource is bucket+key URL-encoded. SDK handles encoding
              // for us when we pass `${bucket}/${key}` directly.
              CopySource: `/${docsBucket}/${encodeURIComponent(obj.Key).replace(/%2F/g, "/")}`,
            }),
          );
          copied += 1;
        } catch (err) {
          skipped += 1;
          console.warn(`[migrate] copy failed ${obj.Key}:`, err instanceof Error ? err.message : err);
        }
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
  }
  console.log(`[migrate] objects copied: ${copied}, skipped: ${skipped}`);

  // ── (3): URL rewrites ────────────────────────────────────────
  // We rewrite `/<docsBucket>/` → `/<postsBucket>/` inside the URL.
  // Two columns: PostAttachment.url + Event.coverImageUrl. We do
  // this with raw SQL because Prisma's `update` doesn't support
  // string-replace expressions. Both queries are idempotent: rows
  // already pointing at postsBucket aren't matched.
  const docsMarker = `/${docsBucket}/`;
  const postsMarker = `/${postsBucket}/`;

  const attachmentRows = await prisma.$executeRawUnsafe(
    `UPDATE "PostAttachment"
       SET "url" = REPLACE("url", $1, $2)
     WHERE "url" LIKE '%' || $1 || '%'`,
    docsMarker,
    postsMarker,
  );
  console.log(`[migrate] PostAttachment URLs rewritten: ${attachmentRows}`);

  const eventRows = await prisma.$executeRawUnsafe(
    `UPDATE "Event"
       SET "coverImageUrl" = REPLACE("coverImageUrl", $1, $2)
     WHERE "coverImageUrl" LIKE '%' || $1 || '%'`,
    docsMarker,
    postsMarker,
  );
  console.log(`[migrate] Event.coverImageUrl rewritten: ${eventRows}`);

  // Article cover images live in the avatars bucket historically;
  // we don't touch them here. If you ever moved articles to docs,
  // add a third UPDATE for "Article"."coverImageUrl" with the same
  // pattern.

  await prisma.$disconnect();
  console.log("[migrate] ✓ done. Source objects in emce-docs are still there as a safety net.");
}

main().catch((err) => {
  console.error("[migrate] fatal:", err);
  process.exit(1);
});
