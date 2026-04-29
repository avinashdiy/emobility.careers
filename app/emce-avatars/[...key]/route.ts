import { proxyStorageObject } from "@/lib/storage-proxy";

// AWS SDK v3 needs the Node runtime — it depends on `crypto` and the
// stream APIs that aren't on the Edge runtime.
export const runtime = "nodejs";

/**
 * Proxies `/emce-avatars/<key>` through to the MinIO `emce-avatars`
 * bucket. Keeps the existing avatar URLs in the DB working without
 * forcing every operator to hand-edit their Caddy config.
 *
 * The folder name `emce-avatars` matches the default value of
 * `S3_BUCKET_AVATARS` in `.env.example`. Operators who customised
 * the bucket name must rename this route folder to match.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  return proxyStorageObject("avatars", key.join("/"));
}
