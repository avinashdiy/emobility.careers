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
const RX_LINKEDIN = /^https?:\/\/(?:www\.)?linkedin\.com\/(?:posts|feed\/update|video|pulse)\//;
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

/** Iframe embed URL for providers we can in-place play. */
export function iframeFor(detection: EmbedDetection): string | null {
  if (detection.provider === "YOUTUBE" && detection.videoId) {
    return `https://www.youtube.com/embed/${detection.videoId}`;
  }
  if (detection.provider === "VIMEO" && detection.videoId) {
    return `https://player.vimeo.com/video/${detection.videoId}`;
  }
  return null;
}
