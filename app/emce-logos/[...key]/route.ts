import { proxyStorageObject } from "@/lib/storage-proxy";

// AWS SDK v3 needs the Node runtime — it depends on `crypto` and the
// stream APIs that aren't on the Edge runtime.
export const runtime = "nodejs";

/**
 * Proxies `/emce-logos/<key>` through to the MinIO `emce-logos`
 * bucket. Used for company logos + banner images uploaded from the
 * employer console. Same rationale as `/emce-avatars/...`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  return proxyStorageObject("logos", key.join("/"));
}
