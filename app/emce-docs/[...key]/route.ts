import { proxyStorageObject } from "@/lib/storage-proxy";

// AWS SDK v3 needs the Node runtime — it depends on `crypto` and the
// stream APIs that aren't on the Edge runtime.
export const runtime = "nodejs";

/**
 * Proxies `/emce-docs/<key>` through to the MinIO `emce-docs`
 * bucket. Used for rich-post attachments (images / PDFs that show
 * up on social posts in the feed). Same rationale as
 * `/emce-avatars/...`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  return proxyStorageObject("docs", key.join("/"));
}
