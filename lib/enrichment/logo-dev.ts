/**
 * Logo.dev fetcher — pulls a company logo by domain and persists it
 * into our S3/MinIO `logos` bucket, returning the public URL.
 *
 * Why we host the asset ourselves: a hot-link to logo.dev means every
 * pageview hits a third-party CDN and breaks the moment they change
 * their URL format or rate-limit us. Fetch-once, store-once = pages
 * render fast and we're immune to upstream outages.
 *
 * Free tier docs: https://logo.dev/
 * Auth: query-string token (no header). Without LOGO_DEV_TOKEN this
 * module returns null instead of throwing, so the enrichment worker
 * can still produce a Wikipedia-only proposal during local dev.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3, buckets, publicUrl } from "@/lib/storage";
import { env } from "@/lib/env";

/**
 * Extracts a clean domain from a company website URL.
 *
 *   "https://www.atherenergy.com/about"  → "atherenergy.com"
 *   "atherenergy.com"                    → "atherenergy.com"
 *   "https://www.example.co.uk"          → "example.co.uk"
 *
 * Returns null for unparseable inputs.
 */
export function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  const s = website.trim();
  if (!s) return null;
  // Prepend protocol if missing so URL() accepts it.
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    // Strip leading www. — logo.dev keys by registrable domain.
    return u.hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

export interface LogoFetchResult {
  /// Public URL of the logo as stored in our bucket. Hand this straight
  /// to Company.logoUrl on approval.
  url: string;
  /// MinIO/S3 object key. Useful if we ever want to delete the asset.
  key: string;
  /// Size of the fetched payload (bytes). Sanity-checked against tiny
  /// blank placeholder responses (logo.dev returns a 1x1 PNG for some
  /// unknown domains — we filter those out before persisting).
  bytes: number;
  /// MIME type as reported by logo.dev (usually image/png).
  contentType: string;
}

/**
 * Fetches a logo by domain via Logo.dev, validates it, and uploads it
 * to S3. Returns null when:
 *   • LOGO_DEV_TOKEN is unset (the worker skips the fetch with a log)
 *   • the response is <500 bytes (placeholder / 404)
 *   • the response isn't an image
 *   • the upstream HTTP call fails
 *
 * Never throws — failure is signalled by null + a console.warn so the
 * enrichment worker continues with the remaining sources.
 */
export async function fetchLogoToS3(domain: string, slug: string): Promise<LogoFetchResult | null> {
  if (!env.LOGO_DEV_TOKEN) {
    console.warn(`[logo-dev] LOGO_DEV_TOKEN unset — skipping logo fetch for ${domain}`);
    return null;
  }

  // 400px is the sweet spot — sharp on retina logo chips (rendered at
  // ~96–128px) without bloating storage. `format=png` ensures we get a
  // raster suitable for an <img> tag, not an SVG which can carry
  // tracking pixels.
  const url = `https://img.logo.dev/${encodeURIComponent(domain)}?token=${encodeURIComponent(env.LOGO_DEV_TOKEN)}&size=400&format=png`;

  let res: Response;
  try {
    res = await fetch(url, {
      // Short timeout — logo.dev is fast (<500ms p99). Anything longer
      // is probably an outage and we shouldn't block the worker on it.
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    console.warn(`[logo-dev] fetch failed for ${domain}:`, err);
    return null;
  }

  if (!res.ok) {
    console.warn(`[logo-dev] non-OK response for ${domain}: ${res.status}`);
    return null;
  }

  const contentType = res.headers.get("content-type") ?? "image/png";
  if (!contentType.startsWith("image/")) {
    console.warn(`[logo-dev] non-image content-type for ${domain}: ${contentType}`);
    return null;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 500) {
    // logo.dev returns a tiny placeholder when the domain has no logo.
    // Treat anything under 500 bytes as a miss to avoid littering S3
    // with blank PNGs.
    console.warn(`[logo-dev] placeholder-sized response for ${domain} (${buffer.length} bytes) — treating as miss`);
    return null;
  }

  // Object key embeds the slug + a fetched-at suffix so re-fetches
  // produce a new key (cache-buster) instead of overwriting the
  // previous version. Old keys can be garbage-collected later.
  const key = `company-logos/${slug}-${Date.now()}.png`;

  await s3.send(
    new PutObjectCommand({
      Bucket: buckets.logos,
      Key: key,
      Body: buffer,
      ContentType: "image/png",
      // ~1 day max-age — logos rarely change but we shouldn't pin
      // forever in case we re-fetch a corrected version.
      CacheControl: "public, max-age=86400, s-maxage=86400",
    }),
  );

  return {
    url: publicUrl("logos", key),
    key,
    bytes: buffer.length,
    contentType: "image/png",
  };
}
