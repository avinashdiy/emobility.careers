import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3, buckets, type BucketName } from "@/lib/storage";

/**
 * Streams an object from MinIO/S3 back as a public HTTP Response.
 *
 * Why this exists: avatar / logo / post-attachment URLs are stored in
 * the DB as `${S3_PUBLIC_URL}/${bucket}/${key}`. In production
 * `S3_PUBLIC_URL` is the platform's own domain (e.g.
 * `https://emobility.careers`), so the URL ends up looking like
 * `https://emobility.careers/emce-avatars/avatars/.../*.jpg`.
 *
 * For that URL to resolve, *something* has to forward
 * `/emce-{bucket}/...` to MinIO. The Caddyfile that ships with this
 * repo does that for `/static/*`, but if a deployment hasn't been
 * configured with the `/static` prefix, requests fall through to the
 * Next.js app and 404. Rather than make every operator hand-edit
 * Caddy, we add a Next.js route handler that proxies the request —
 * works in dev (no Caddy) and in any deployment where Next.js is
 * reachable. In setups where Caddy *does* serve the bucket directly,
 * Caddy still wins because it intercepts the request before it
 * reaches the Next.js app.
 */
export async function proxyStorageObject(
  bucket: BucketName,
  key: string,
): Promise<Response> {
  if (!key) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const obj = await s3.send(
      new GetObjectCommand({
        Bucket: buckets[bucket],
        Key: key,
      }),
    );
    if (!obj.Body) {
      return new Response("Not found", { status: 404 });
    }
    // AWS SDK v3 exposes a web-standard ReadableStream via this
    // helper — pipe straight into the Response so we don't buffer
    // the whole file in memory.
    const stream = obj.Body.transformToWebStream();
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": obj.ContentType ?? "application/octet-stream",
        // Avatar / logo / attachment keys include an 8-byte random
        // prefix — every upload writes to a new key, so the URL is
        // effectively immutable. 1-day public cache + immutable so
        // CDNs / browsers don't bother revalidating.
        "Cache-Control": "public, max-age=86400, immutable",
        ...(obj.ContentLength
          ? { "Content-Length": String(obj.ContentLength) }
          : {}),
        // Stop browsers from sniffing a non-image upload into
        // something executable. We MIME-validate at upload time
        // already, but defence in depth is cheap.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
