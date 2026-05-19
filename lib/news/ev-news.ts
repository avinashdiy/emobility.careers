/**
 * Google News RSS fetcher for the EV-industry widget on the feed
 * page right rail.
 *
 * Why Google News (not a paid API):
 *   • Zero cost, no API key, no quota gymnastics
 *   • Google News RSS is stable enough for a sidebar widget — it's
 *     been the same URL pattern for ~15 years
 *   • The aggregator already deduplicates near-identical stories
 *     across publishers, so the top-5 results are usually distinct
 *     real stories vs. wire-feed echoes
 *
 * Caching strategy:
 *   • `unstable_cache` with a 15-minute TTL (`revalidate: 900`).
 *     Same pattern as `lib/salary-compass.ts`. Per-region fetch is
 *     cheap (Google's CDN serves the RSS in ~150ms) but we avoid
 *     hitting it on every feed render — at 10k DAUs that would be
 *     ~10k req/min, plenty to get rate-limited.
 *   • Cache key includes the query string so future variants (e.g.
 *     a TPO-only feed using a different query) don't share buckets.
 *
 * Error handling:
 *   • Network / parse failures return [] (empty list) — caller
 *     renders no widget when the list is empty. Better than throwing
 *     and bringing down /feed for an upstream issue we don't control.
 */

import { XMLParser } from "fast-xml-parser";
import { unstable_cache } from "next/cache";
import { logger } from "@/lib/logger";

export interface EvNewsItem {
  /** Headline. Google News sometimes appends " - Publisher Name" —
      we strip that to a clean title + separate sourceName. */
  title: string;
  /** Publisher display name parsed out of the title suffix. Falls
      back to the empty string when no " - " separator is present. */
  sourceName: string;
  /** Outbound URL. Google News wraps everything in a
      news.google.com/articles/CBM... redirect — we keep that wrapped
      URL since the redirect-resolver flow on Google's side is more
      reliable than us trying to follow it ourselves (Google blocks
      most CORS / server-side redirect-follows). The user sees the
      Google News redirect for ~200ms then lands on the publisher. */
  url: string;
  /** ISO-8601 publish timestamp from the RSS pubDate. */
  publishedAt: string;
}

const QUERY = "electric vehicle EV India OR battery";
const FEED_URL = `https://news.google.com/rss/search?q=${encodeURIComponent(QUERY)}&hl=en-IN&gl=IN&ceid=IN:en`;

// Lazy-singleton — XMLParser is stateless but the construction does
// some setup; one instance per process is fine.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Many RSS readers normalise <description> CDATA — we don't use
  // description here so don't pay the parse cost on it.
  trimValues: true,
});

interface RssParsedShape {
  rss?: {
    channel?: {
      item?: RssItem | RssItem[];
    };
  };
}

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  source?: string | { "#text"?: string; "@_url"?: string };
}

/**
 * Split "Tata Motors launches new EV - Times of India" into
 * { title: "Tata Motors launches new EV", sourceName: "Times of India" }.
 *
 * Google News always appends " - <Publisher>" to RSS titles. If the
 * delimiter is missing (rare — usually means malformed entry) we
 * return the raw title + empty source.
 */
function splitTitleSource(raw: string): { title: string; sourceName: string } {
  const idx = raw.lastIndexOf(" - ");
  if (idx === -1) return { title: raw.trim(), sourceName: "" };
  return {
    title: raw.slice(0, idx).trim(),
    sourceName: raw.slice(idx + 3).trim(),
  };
}

async function fetchEvNewsImpl(): Promise<EvNewsItem[]> {
  let xml: string;
  try {
    const res = await fetch(FEED_URL, {
      // Pretend to be a real browser — Google News occasionally
      // serves a degraded feed to obvious server fetchers.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; emobility.careers/1.0)" },
      // Bound the request so a slow upstream doesn't slow down the
      // entire feed render. 5s is generous for what's usually a
      // ~200ms response.
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[ev-news] non-200 from Google News");
      return [];
    }
    xml = await res.text();
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, "[ev-news] fetch failed");
    return [];
  }

  let parsed: RssParsedShape;
  try {
    parsed = parser.parse(xml) as RssParsedShape;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, "[ev-news] parse failed");
    return [];
  }

  const rawItems = parsed.rss?.channel?.item;
  if (!rawItems) return [];
  const list = Array.isArray(rawItems) ? rawItems : [rawItems];

  const items: EvNewsItem[] = [];
  for (const raw of list) {
    if (!raw.title || !raw.link) continue;
    const { title, sourceName } = splitTitleSource(raw.title);
    // Resolve source either from the title suffix (most reliable)
    // or fall back to the <source> tag when present.
    let resolvedSource = sourceName;
    if (!resolvedSource && raw.source) {
      resolvedSource = typeof raw.source === "string"
        ? raw.source
        : raw.source["#text"] ?? "";
    }
    items.push({
      title,
      sourceName: resolvedSource,
      url: raw.link,
      publishedAt: raw.pubDate
        ? new Date(raw.pubDate).toISOString()
        : new Date().toISOString(),
    });
    // Stop early — caller only ever asks for 5, no point parsing
    // the full feed (Google returns ~100 items).
    if (items.length >= 10) break;
  }
  return items;
}

/**
 * Public accessor. 15-minute cache so feed renders don't all hit
 * Google. Pass `limit` to trim the slice — we always over-fetch
 * a buffer so a future "next page" surface is one cache hit away.
 */
export const getEvNews = unstable_cache(
  async (limit: number = 5): Promise<EvNewsItem[]> => {
    const all = await fetchEvNewsImpl();
    return all.slice(0, limit);
  },
  ["ev-news"],
  {
    revalidate: 60 * 15, // 15 min
    tags: ["ev-news"],
  },
);
