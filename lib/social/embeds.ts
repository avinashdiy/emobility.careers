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
  iframe: boolean; // can we render an iframe?
}

const RX_YT_FULL = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/;
const RX_VIMEO = /vimeo\.com\/(?:video\/)?(\d+)/;
const RX_INSTAGRAM = /^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;
const RX_LINKEDIN = /^https?:\/\/(?:www\.)?linkedin\.com\/(?:posts|feed\/update|video|pulse|embed)\//;
// Extract the LinkedIn activity-numeric ID from any of LinkedIn's URL
// shapes. The numeric ID is the join key for the official iframe at
// `linkedin.com/embed/feed/update/urn:li:activity:{ID}`.
//   • /posts/{slug}-activity-{NUMERIC}-{HASH}/
//   • /feed/update/urn:li:activity:{NUMERIC}
//   • /feed/update/urn:li:share:{NUMERIC}
//   • /embed/feed/update/urn:li:activity:{NUMERIC}
//   • /video/live/urn:li:ugcPost:{NUMERIC}
const RX_LINKEDIN_ACTIVITY =
  /(?:activity[:-]|share[:-]|ugcPost[:-])(\d{15,25})/i;
const RX_TWITTER = /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/;

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
    // Try to extract the activity URN — when we get it, LinkedIn's
    // public iframe endpoint will render the post inline. Without it
    // (e.g. /pulse/ articles, profile slugs without an attached
    // activity), we fall back to a link card.
    const m = url.match(RX_LINKEDIN_ACTIVITY);
    if (m) {
      const activityId = m[1];
      return {
        provider: "LINKEDIN",
        // Canonical form so renderers / dedup work uniformly. The
        // original URL is fine to keep too, but normalising to the
        // post URL avoids storing 30 variants of the same post.
        url: `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`,
        videoId: activityId,
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
  if (detection.provider === "LINKEDIN" && detection.videoId) {
    // LinkedIn's official iframe — same one the "Embed this post"
    // button on linkedin.com produces. Renders the post body, author
    // header, reactions, and a "view on LinkedIn" CTA. Must be at
    // least ~504px wide; we let the parent grid clamp it so it
    // shrinks responsively below that.
    return `https://www.linkedin.com/embed/feed/update/urn:li:activity:${detection.videoId}`;
  }
  return null;
}
