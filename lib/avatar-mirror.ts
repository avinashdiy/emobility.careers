import "server-only";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { lookup } from "dns/promises";
import net from "net";
import { s3, buckets, objectKey, publicUrl } from "@/lib/storage";
import { logger } from "@/lib/logger";

/**
 * Mirror an OAuth-provided avatar URL into our own MinIO bucket.
 *
 * Why this exists: LinkedIn's `media.licdn.com` CDN refuses to serve
 * images to outside domains — the OAuth response gives us a URL that
 * works for the immediate moment LinkedIn is signed in, but the
 * moment we hotlink it from emobility.careers, it 403s. The
 * candidate's profile then renders the broken-image placeholder with
 * the alt text (their name) inside it — see the bug ticket from
 * 2026-05.
 *
 * The fix: on every OAuth signup, immediately download the
 * provider-supplied photo server-side, run it through the same Sharp
 * pipeline that `uploadAvatar` uses (resize → webp → 80% quality),
 * and upload to our `avatars` bucket. We then store the resulting
 * `files.emobility.careers/avatars/...` URL on the candidate profile.
 *
 * This is best-effort. If the fetch fails (network, rate limit,
 * provider rotation), we return null and the candidate's profile
 * shows the standard silhouette placeholder. They can still upload a
 * proper avatar later from `/me/profile`. Throwing here would block
 * the entire OAuth signup flow, which is worse than a missing photo.
 */

const AVATAR_MAX_PX = 400;
const AVATAR_WEBP_QUALITY = 80;
// Per-request budget. 2s is well above p99 for a normal avatar fetch
// from Google/LinkedIn (~150-400ms) and bounds OAuth signup latency —
// signup-blocking on avatar mirror was a deploy concern flagged in the
// pre-prod audit. Even 3 redirects × 2s = 6s worst case before the
// total budget hits — the per-call timeout below the loop caps that.
const FETCH_TIMEOUT_MS = 2_000;
const TOTAL_BUDGET_MS = 5_000;
const MAX_REDIRECTS = 2;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

/**
 * SSRF guard. The OAuth provider hands us a string and we fetch it
 * server-side from the Hetzner VPS — anything we don't filter is a
 * gift to a hostile signup. Specifically:
 *   • 169.254.169.254 — cloud metadata endpoint (Hetzner/AWS/GCP)
 *     would leak instance credentials, role tokens, etc.
 *   • 127.0.0.0/8 — internal services (Postgres at 5432, Redis at
 *     6379, MinIO at 9000) all accept localhost connections.
 *   • 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 — RFC-1918 private
 *     networks if the box is in a VPC.
 *   • Link-local, multicast, broadcast, reserved — block everything
 *     that isn't a global-unicast public address.
 *
 * Validated AFTER DNS resolution so a `http://internal.local`
 * hostname pointing at a private IP is still blocked. Re-validated
 * on EVERY redirect (caller walks the chain with redirect:"manual").
 */
function isSafePublicIp(address: string): boolean {
  // net.isIP returns 0 for non-IP strings — block.
  const family = net.isIP(address);
  if (family === 0) return false;
  if (family === 4) {
    const parts = address.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
      return false;
    }
    const [a, b] = parts;
    // 0.0.0.0/8 — "this network"
    if (a === 0) return false;
    // 10.0.0.0/8 — private
    if (a === 10) return false;
    // 100.64.0.0/10 — CGNAT
    if (a === 100 && b >= 64 && b <= 127) return false;
    // 127.0.0.0/8 — loopback
    if (a === 127) return false;
    // 169.254.0.0/16 — link-local, includes cloud metadata 169.254.169.254
    if (a === 169 && b === 254) return false;
    // 172.16.0.0/12 — private
    if (a === 172 && b >= 16 && b <= 31) return false;
    // 192.0.0.0/24, 192.0.2.0/24, 192.88.99.0/24 — reserved/documentation
    if (a === 192 && (b === 0 || b === 88)) return false;
    // 192.168.0.0/16 — private
    if (a === 192 && b === 168) return false;
    // 198.18.0.0/15 — benchmarking
    if (a === 198 && (b === 18 || b === 19)) return false;
    // 198.51.100.0/24, 203.0.113.0/24 — documentation
    if ((a === 198 && b === 51) || (a === 203 && b === 0)) return false;
    // 224.0.0.0/4 — multicast
    if (a >= 224 && a <= 239) return false;
    // 240.0.0.0/4 — reserved/broadcast
    if (a >= 240) return false;
    return true;
  }
  // IPv6 — block a conservative set. The OAuth providers we care
  // about all serve via IPv4 in practice, but if the resolver returns
  // a v6 address we still need to gate it.
  const lower = address.toLowerCase();
  if (lower === "::1" || lower === "::") return false;
  // fe80::/10 link-local; fc00::/7 unique-local; ff00::/8 multicast;
  // 2001:db8::/32 documentation; ::ffff:0:0/96 IPv4-mapped (re-check
  // would be needed — block to be safe).
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return false;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return false;
  if (lower.startsWith("ff")) return false;
  if (lower.startsWith("2001:db8")) return false;
  if (lower.startsWith("::ffff:")) return false;
  return true;
}

async function isSafeHostname(hostname: string): Promise<boolean> {
  // Hostname-as-IP — block private literals directly without DNS.
  if (net.isIP(hostname)) {
    return isSafePublicIp(hostname);
  }
  // Reject names that resolve via /etc/hosts to a private IP — DNS
  // lookup uses the system resolver (including /etc/hosts) which is
  // what `fetch` itself would use.
  try {
    const result = await lookup(hostname, { all: true });
    if (result.length === 0) return false;
    return result.every((r) => isSafePublicIp(r.address));
  } catch {
    // DNS failure — refuse rather than open up. Avatar-mirror is
    // best-effort; a no-mirror outcome is safer than a maybe-mirror.
    return false;
  }
}

/**
 * Walk an HTTP redirect chain manually, re-validating the destination
 * hostname (DNS-resolved) against the SSRF guard at every hop. We
 * can't use `redirect: "follow"` here because fetch follows redirects
 * BEFORE we can intercept them — a 302 from a trusted CDN to
 * 169.254.169.254 would silently hit the metadata endpoint.
 */
async function safeFetch(initialUrl: string, deadlineMs: number): Promise<Response | null> {
  let url = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (Date.now() > deadlineMs) {
      logger.warn({ url, hop }, "[avatar-mirror] total budget exceeded");
      return null;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      logger.warn({ protocol: parsed.protocol, url }, "[avatar-mirror] non-http scheme blocked");
      return null;
    }
    if (!(await isSafeHostname(parsed.hostname))) {
      logger.warn({ hostname: parsed.hostname, url }, "[avatar-mirror] SSRF guard blocked private/loopback target");
      return null;
    }

    const ctrl = new AbortController();
    const remaining = Math.max(0, deadlineMs - Date.now());
    const timer = setTimeout(() => ctrl.abort(), Math.min(FETCH_TIMEOUT_MS, remaining));
    let res: Response;
    try {
      res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "user-agent": "emobility.careers/1.0 (avatar mirror)" },
        // Manual mode — we re-validate every hop against the SSRF
        // guard before following. `fetch` exposes the `Location`
        // header on the response object when redirect is "manual".
        redirect: "manual",
      });
    } finally {
      clearTimeout(timer);
    }

    // 3xx — walk the redirect, re-validating.
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return null;
      // Resolve relative redirects against the current URL.
      try {
        url = new URL(next, url).toString();
      } catch {
        return null;
      }
      continue;
    }

    return res;
  }
  // Exhausted MAX_REDIRECTS without a non-3xx response.
  return null;
}

export async function mirrorOAuthPhoto(
  sourceUrl: string | null | undefined,
): Promise<string | null> {
  if (!sourceUrl || typeof sourceUrl !== "string") return null;
  // Validate URL shape before fetching — defense against
  // OAuth-provider responses that smuggle in non-http schemes.
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  try {
    const deadline = Date.now() + TOTAL_BUDGET_MS;
    const res = await safeFetch(sourceUrl, deadline);
    if (!res) return null;
    if (!res.ok) {
      logger.warn(
        { status: res.status, sourceUrl },
        "[avatar-mirror] upstream fetch failed",
      );
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      logger.warn(
        { contentType, sourceUrl },
        "[avatar-mirror] upstream returned non-image",
      );
      return null;
    }
    // Defend against decompression bombs / huge responses: cap at
    // MAX_RESPONSE_BYTES BEFORE we ever materialise the buffer.
    const declaredLen = Number(res.headers.get("content-length") ?? "0");
    if (declaredLen > MAX_RESPONSE_BYTES) {
      logger.warn({ declaredLen, sourceUrl }, "[avatar-mirror] response too large");
      return null;
    }
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > MAX_RESPONSE_BYTES) {
      return null;
    }
    const raw = Buffer.from(arrayBuf);

    // Same pipeline as `uploadAvatar` in server/candidates/actions.ts —
    // EXIF baked in via rotate(), cover-crop to a square, webp at 80
    // quality. Keeps every avatar on the platform visually consistent
    // regardless of source.
    let buffer: Buffer;
    try {
      buffer = await sharp(raw)
        .rotate()
        .resize(AVATAR_MAX_PX, AVATAR_MAX_PX, {
          fit: "cover",
          position: "centre",
        })
        .webp({ quality: AVATAR_WEBP_QUALITY })
        .toBuffer();
    } catch (err) {
      logger.warn({ err, sourceUrl }, "[avatar-mirror] sharp encode failed");
      return null;
    }

    // `oauth` prefix instead of `${candidateId}` because in the
    // OAuth-createUser flow the candidate profile row hasn't been
    // created yet — we mint the URL first, then persist it on the
    // about-to-be-created row.
    const key = objectKey("avatars/oauth", "webp");
    await s3.send(
      new PutObjectCommand({
        Bucket: buckets.avatars,
        Key: key,
        Body: buffer,
        ContentType: "image/webp",
        ACL: "public-read",
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: { "x-content-type-options": "nosniff" },
      }),
    );
    return publicUrl("avatars", key);
  } catch (err) {
    // Catch-all — the OAuth signup flow must NEVER fail just because
    // we couldn't mirror an avatar. Worst case the candidate shows
    // the silhouette and uploads their own photo later.
    logger.warn({ err, sourceUrl }, "[avatar-mirror] unexpected failure");
    return null;
  }
}

/**
 * Predicate: should this URL be mirrored?
 *
 * URLs already on our own `files.emobility.careers` domain don't need
 * mirroring — they're ours. URLs from Google's `googleusercontent.com`
 * are stable and serve to outside referers, but mirroring them anyway
 * isolates us from any future policy change Google might make.
 *
 * LinkedIn's `media.licdn.com` MUST be mirrored — the whole reason
 * this helper exists. We err on the side of always mirroring external
 * URLs so we never depend on a third-party CDN for a critical UI
 * element. Returns false only for URLs we definitely own.
 */
export function shouldMirrorPhoto(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.hostname.endsWith(".emobility.careers")) return false;
    if (u.hostname === "emobility.careers") return false;
    return true;
  } catch {
    return false;
  }
}
