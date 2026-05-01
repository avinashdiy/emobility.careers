/**
 * Idempotent MinIO / S3 bucket initialiser.
 *
 * Creates every bucket the platform writes to and sets the right
 * access policy on each one. Safe to run repeatedly — uses HeadBucket
 * to skip existing buckets and only sets policies when they're not
 * already in place.
 *
 * Run via: `pnpm setup:buckets` (after `pnpm prisma:generate` has
 * produced node_modules), or invoked through scripts/setup-vps.sh
 * which orchestrates this together with the schema sync.
 *
 * Bucket access policy:
 *
 *   avatars   — public-read (every user's profile photo is fetched
 *               directly from MinIO via the URL we store; no presign).
 *   logos     — public-read (company logos render the same way).
 *   resumes   — PRIVATE (presigned URLs only — recruiters get short-
 *               lived links via the resume-download server action).
 *   docs      — PRIVATE (Aadhar uploads, identity-verification docs,
 *               mentorship ICS files — all presigned).
 *
 * If you change a bucket's policy after a user uploads a file to it,
 * existing files inherit the new policy automatically — there's no
 * per-object ACL to migrate.
 */

import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  GetBucketPolicyCommand,
} from "@aws-sdk/client-s3";

interface BucketSpec {
  name: string;
  access: "public-read" | "private";
}

function publicReadPolicy(bucketName: string): string {
  // Standard "anyone can s3:GetObject" policy. The action allows
  // anonymous reads of every key inside the bucket; no other actions
  // are granted, so anonymous users still can't list, write, or
  // delete. Mirrors the "AWS bucket policy generator" output.
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicReadObject",
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucketName}/*`],
      },
    ],
  });
}

async function ensureBucket(s3: S3Client, spec: BucketSpec): Promise<void> {
  const tag = `[${spec.name}]`;
  // 1. Does it exist?
  let exists = false;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: spec.name }));
    exists = true;
  } catch (err) {
    const meta = (err as { $metadata?: { httpStatusCode?: number } }).$metadata;
    if (meta?.httpStatusCode === 404) {
      exists = false;
    } else if (meta?.httpStatusCode === 403) {
      // Some MinIO configs return 403 for "no access" on existing
      // buckets owned by another credential set. Fail loud — the
      // operator needs to know the credentials are wrong.
      throw new Error(
        `${tag} HeadBucket returned 403. Either the bucket exists under different credentials or the role lacks s3:ListBucket. Check S3_ACCESS_KEY / S3_SECRET_KEY.`,
      );
    } else {
      throw err;
    }
  }

  // 2. Create if missing.
  if (!exists) {
    console.log(`${tag} creating…`);
    await s3.send(new CreateBucketCommand({ Bucket: spec.name }));
    console.log(`${tag} ✓ created`);
  } else {
    console.log(`${tag} ✓ already exists`);
  }

  // 3. Reconcile policy.
  if (spec.access === "public-read") {
    const desired = publicReadPolicy(spec.name);
    let current = "";
    try {
      const got = await s3.send(new GetBucketPolicyCommand({ Bucket: spec.name }));
      current = got.Policy ?? "";
    } catch {
      current = ""; // No policy yet — fall through to set.
    }
    if (normalisePolicy(current) === normalisePolicy(desired)) {
      console.log(`${tag} ✓ policy already public-read`);
    } else {
      await s3.send(
        new PutBucketPolicyCommand({ Bucket: spec.name, Policy: desired }),
      );
      console.log(`${tag} ✓ policy set to public-read`);
    }
  } else {
    // Private: we don't actively delete an existing policy because
    // a custom policy might be set deliberately by the operator. We
    // just don't write a public-read one. If you want to scrub a
    // policy explicitly, run `mc anonymous set none local/<bucket>`
    // — the SDK doesn't have a clean "delete policy" verb anyway.
    console.log(`${tag} ✓ private (no public policy applied)`);
  }
}

/** JSON.stringify can produce different whitespace for the same
    semantic policy; normalise via parse + stringify before compare. */
function normalisePolicy(s: string): string {
  if (!s.trim()) return "";
  try {
    return JSON.stringify(JSON.parse(s));
  } catch {
    return s;
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env var ${name}. Set it in .env on the VPS.`);
  }
  return v;
}

async function main() {
  // Read env directly — we deliberately don't import @/lib/env here
  // because the lib/env.ts validator is strict (boots fast and dies
  // on missing keys), and this script wants to give a friendlier
  // error message specifically about the buckets it's about to make.
  const endpoint = requireEnv("S3_ENDPOINT");
  const region = process.env.S3_REGION ?? "us-east-1";
  const accessKey = requireEnv("S3_ACCESS_KEY");
  const secretKey = requireEnv("S3_SECRET_KEY");
  const forcePathStyle =
    (process.env.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() !== "false";

  const s3 = new S3Client({
    endpoint,
    region,
    forcePathStyle,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  // Bucket names default to the ones from lib/env.ts. Override via
  // env in non-default deploys.
  const buckets: BucketSpec[] = [
    { name: process.env.S3_BUCKET_RESUMES ?? "emce-resumes", access: "private" },
    { name: process.env.S3_BUCKET_AVATARS ?? "emce-avatars", access: "public-read" },
    { name: process.env.S3_BUCKET_LOGOS ?? "emce-logos", access: "public-read" },
    { name: process.env.S3_BUCKET_DOCS ?? "emce-docs", access: "private" },
  ];

  console.log(`[setup-buckets] target: ${endpoint}`);
  console.log(`[setup-buckets] reconciling ${buckets.length} buckets…\n`);

  for (const spec of buckets) {
    try {
      await ensureBucket(s3, spec);
    } catch (err) {
      console.error(`[${spec.name}] ✗ failed:`, err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  }

  if (process.exitCode === 1) {
    console.error("\n[setup-buckets] one or more buckets failed. See errors above.");
  } else {
    console.log("\n[setup-buckets] ✓ all buckets healthy");
  }
}

main().catch((err) => {
  console.error("[setup-buckets] fatal:", err);
  process.exit(1);
});
