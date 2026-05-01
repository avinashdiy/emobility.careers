import type { EmbedProvider } from "@prisma/client";

/**
 * URL → embed metadata. Used by the post composer to detect a video URL
 * the user pastes, normalise the canonical URL (e.g. extract the YouTube
 * id), and render the right iframe / link card on the feed.
 *
 * Supported providers (LinkedIn-style):
 *   - YouTube  — full iframe embed
 *   - Vimeo    — full iframe embed
 *   - Instagram — link card only (their oEmbed is auth-gated since 2020)
 *   - LinkedIn  — link card only (their video pages don't expose iframes
 *                 outside paid platforms)
 *   - Twitter / X — link card only
 *
 * For "link card only" providers we still recognise the URL so the card
 * gets the right favicon + label; the actual video plays via the user
 * clicking through to the source.
 */

export interface EmbedDetection {
  provider: EmbedProvider;
  url: string; // canonical
  videoId?: string; // for iframe-capable providers
  /// LinkedIn-only — the full URN that goes into the embed URL.
  /// Example: "urn:li:ugcPost:7455501453592424448". Other providers
  /// derive the iframe URL from `videoId` directly.
  linkedInUrn?: string;
  iframe: boolean; // can we render an iframe?
}

const RX_YT_FULL = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/;
const RX_VIMEO = /vimeo\.com\/(?:video\/)?(\d+)/;
const RX_INSTAGRAM = /^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;
const RX_LINKEDIN = /^https?:\/\/(?:www\.)?linkedin\.com\/(?:posts|feed\/update|video|pulse|embed)\//;
// Extract the LinkedIn URN from any of LinkedIn's URL shapes. We need
// BOTH the URN type (activity / share / ugcPost) AND the numeric ID
// because the embed iframe URL is keyed on the FULL URN. Using the
// wrong URN type returns LinkedIn's "Page not found" page in the
// iframe — which is the bug this regex fix addresses.
//
// URL shapes we accept:
//   • /posts/{slug}-activity-{NUMERIC}-{HASH}/         → urn:li:activity:{N}
//   • /posts/{slug}-ugcPost-{NUMERIC}-{HASH}/          → urn:li:ugcPost:{N}
//   • /feed/update/urn:li:activity:{NUMERIC}           → urn:li:activity:{N}
//   • /feed/update/urn:li:share:{NUMERIC}              → urn:li:share:{N}
//   • /feed/update/urn:li:ugcPost:{NUMERIC}            → urn:li:ugcPost:{N}
//   • /embed/feed/update/urn:li:activity:{NUMERIC}     → urn:li:activity:{N}
//   • /video/live/urn:li:ugcPost:{NUMERIC}             → urn:li:ugcPost:{N}
//
// Group 1 = URN type (case-preserved so we can map to the canonical
// LinkedIn keyword); group 2 = numeric ID.
const RX_LINKEDIN_URN = /(activity|share|ugcPost)[:-](\d{15,25})/i;
const RX_TWITTER = /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/;

/**
 * Normalise the URN-type token to LinkedIn's canonical keyword
 * (case-sensitive in their URN scheme — `ugcPost` is camelCase,
 * `activity` and `share` are lowercase). The regex matches
 * case-insensitively to be tolerant of whatever case the URL had,
 * but the embed URL must use the canonical form or LinkedIn 404s.
 */
function canonicalLinkedInUrnType(raw: string): "activity" | "share" | "ugcPost" {
  const lower = raw.toLowerCase();
  if (lower === "ugcpost") return "ugcPost";
  if (lower === "share") return "share";
  return "activity";
}

/**
 * Pull a (urnType, numericId, fullUrn) tuple out of any LinkedIn
 * URL we recognise. Returns null when the URL doesn't carry a URN
 * (e.g. /pulse/ articles, profile pages without an attached post).
 *
 * Exported so the post-card render path (which works from a stored
 * `embedUrl` string, not the original `EmbedDetection`) can derive
 * the same URN without re-implementing the regex.
 */
export function parseLinkedInUrn(
  url: string,
): { urn: string; numericId: string; type: "activity" | "share" | "ugcPost" } | null {
  const m = url.match(RX_LINKEDIN_URN);
  if (!m) return null;
  const type = canonicalLinkedInUrnType(m[1]);
  const numericId = m[2];
  return { urn: `urn:li:${type}:${numericId}`, numericId, type };
}

export function detectEmbed(input: string): EmbedDetection | null {
  const url = input.trim();
  if (!url) return null;

  let match;
  if ((match = url.match(RX_YT_FULL))) {
    return {
      provider: "YOUTUBE",
      url: `https://www.youtube.com/watch?v=${match[1]}`,
      videoId: match[1],
      iframe: true,
    };
  }
  if ((match = url.match(RX_VIMEO))) {
    return {
      provider: "VIMEO",
      url: `https://vimeo.com/${match[1]}`,
      videoId: match[1],
      iframe: true,
    };
  }
  if (RX_INSTAGRAM.test(url)) {
    return { provider: "INSTAGRAM", url, iframe: false };
  }
  if (RX_LINKEDIN.test(url)) {
    // Try to extract the URN — when we get it, LinkedIn's official
    // iframe endpoint will render the post inline. Without it
    // (e.g. /pulse/ articles, profile slugs without an attached
    // activity), we fall back to a link card.
    const parsed = parseLinkedInUrn(url);
    if (parsed) {
      return {
        provider: "LINKEDIN",
        // Canonical form so renderers / dedup work uniformly. We
        // store the FULL URN in the path so the post-card renderer
        // (which reads `embedUrl` only) can recover both the URN
        // type and the numeric ID later.
        url: `https://www.linkedin.com/feed/update/${parsed.urn}`,
        videoId: parsed.numericId,
        linkedInUrn: parsed.urn,
        iframe: true,
      };
    }
    return { provider: "LINKEDIN", url, iframe: false };
  }
  if ((match = url.match(RX_TWITTER))) {
    return { provider: "TWITTER", url, videoId: match[1], iframe: false };
  }
  return null;
}

/**
 * Best-effort thumbnail URL derivation. YouTube + Vimeo expose stable image
 * endpoints; Instagram/LinkedIn don't (need an oEmbed call). We return
 * null for those and fall back to a provider logo on the rendering side.
 */
export function thumbnailFor(detection: EmbedDetection): string | null {
  if (detection.provider === "YOUTUBE" && detection.videoId) {
    return `https://i.ytimg.com/vi/${detection.videoId}/hqdefault.jpg`;
  }
  // Vimeo's stable thumbnail URL requires an oEmbed call which is async +
  // requires the API; defer.
  return null;
}

/** Iframe embed URL for providers we can in-place play / render. */
export function iframeFor(detection: EmbedDetection): string | null {
  if (detection.provider === "YOUTUBE" && detection.videoId) {
    return `https://www.youtube.com/embed/${detection.videoId}`;
  }
  if (detection.provider === "VIMEO" && detection.videoId) {
    return `https://player.vimeo.com/video/${detection.videoId}`;
  }
  if (detection.provider === "LINKEDIN") {
    // LinkedIn's official iframe — same one the "Embed this post"
    // button on linkedin.com produces. Renders the post body, author
    // header, reactions, and a "view on LinkedIn" CTA.
    //
    // Critical: the embed URL is keyed on the FULL URN (urn:li:activity,
    // urn:li:share, or urn:li:ugcPost). Using the wrong URN type — e.g.
    // building urn:li:activity for a URL that's actually a ugcPost —
    // returns LinkedIn's "Page not found" page inside the iframe.
    // Hence we prefer the precomputed `linkedInUrn`; if it's missing
    // (legacy detection rows from before this field existed), fall
    // back to re-parsing the canonical URL we stored.
    const urn =
      detection.linkedInUrn ?? parseLinkedInUrn(detection.url)?.urn;
    if (!urn) return null;
    return `https://www.linkedin.com/embed/feed/update/${urn}`;
  }
  return null;
}
