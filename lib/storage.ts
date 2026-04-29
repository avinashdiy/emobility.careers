import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import crypto from "node:crypto";

export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

export const buckets = {
  resumes: env.S3_BUCKET_RESUMES,
  avatars: env.S3_BUCKET_AVATARS,
  logos: env.S3_BUCKET_LOGOS,
  docs: env.S3_BUCKET_DOCS,
} as const;

export type BucketName = keyof typeof buckets;

export function publicUrl(bucket: BucketName, key: string): string {
  return `${env.S3_PUBLIC_URL}/${buckets[bucket]}/${key}`;
}

export async function presignUpload(
  bucket: BucketName,
  key: string,
  contentType: string,
  expiresIn = 60 * 5,
): Promise<{ url: string; key: string }> {
  const cmd = new PutObjectCommand({
    Bucket: buckets[bucket],
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn });
  return { url, key };
}

export async function presignDownload(
  bucket: BucketName,
  key: string,
  expiresIn = 60 * 5,
): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: buckets[bucket], Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

export async function deleteObject(bucket: BucketName, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: buckets[bucket], Key: key }));
}

export function objectKey(prefix: string, ext: string): string {
  const random = crypto.randomBytes(8).toString("hex");
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}/${date}/${random}.${ext.replace(/^\./, "")}`;
}
