/**
 * WordPress eXtended RSS (WXR) → platform content parser + sanitiser.
 *
 * Two surfaces this module exports:
 *   • `parseWordPressXml(xml)` — pure parse. Returns a normalised
 *     list of items with `kind: "page" | "post" | "attachment"`.
 *     Attachments are parsed but the importer just counts them; we
 *     don't auto-rehost remote WordPress media in v1 (the URLs in
 *     each post body still point at the legacy WP host, so they
 *     keep working until that host disappears).
 *   • `sanitizeWordPressBody(html)` — strict HTML sanitisation for
 *     the body before it lands in the DB. Strips <script> +
 *     event-handler attributes; allows <style> + class/id so
 *     scoped landing-page CSS survives. The sanitiser is the
 *     trust boundary — once a row exists in `Page` or `Article`,
 *     the renderer trusts it.
 *
 * Why WP XML and not JSON: the standard WordPress export format
 * IS WXR (XML), and most users run "Tools → Export" which produces
 * exactly this shape. Asking admins to convert via a plugin first
 * would gate the whole feature.
 */

import { XMLParser } from "fast-xml-parser";
import sanitizeHtml from "sanitize-html";

export type WordPressItemKind = "page" | "post" | "attachment" | "other";

export interface WordPressItem {
  kind: WordPressItemKind;
  /// `<wp:post_id>` from the export. Stable across re-exports of the
  /// same WP install — used as the dedup key so re-running an import
  /// updates rows in place rather than creating duplicates.
  wpPostId: number;
  title: string;
  slug: string;
  /// `publish` | `draft` | `private` | `pending` | `trash` etc. We
  /// don't trust this for visibility — every imported row lands as
  /// DRAFT regardless. Kept for the audit log only.
  wpStatus: string;
  /// Raw `content:encoded` body. Unsanitised — call
  /// `sanitizeWordPressBody` before persisting.
  bodyRaw: string;
  /// `excerpt:encoded` if present.
  excerpt: string;
  publishedAt: Date | null;
  /// First image URL spotted in the body — used as a fallback
  /// `coverImageUrl` when the WP post had no featured image.
  firstImageUrl: string | null;
  /// Author from `<dc:creator>` — informational only.
  authorLogin: string;
}

export interface WordPressParseResult {
  channelTitle: string;
  baseUrl: string;
  items: WordPressItem[];
  counts: Record<WordPressItemKind, number>;
}

interface RawItem {
  title?: string;
  link?: string;
  pubDate?: string;
  "dc:creator"?: string;
  "content:encoded"?: string;
  "excerpt:encoded"?: string;
  "wp:post_id"?: number | string;
  "wp:post_name"?: string;
  "wp:post_type"?: string;
  "wp:status"?: string;
  "wp:post_date"?: string;
  "wp:post_date_gmt"?: string;
}

interface RawChannel {
  title?: string;
  "wp:base_site_url"?: string;
  item?: RawItem | RawItem[];
}

interface RawDoc {
  rss?: { channel?: RawChannel };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // CDATA is unwrapped automatically as plain text — that's what we
  // want; the inner HTML lives inside `<![CDATA[...]]>` blocks.
  cdataPropName: false,
  // Keep ALL tag values as strings. WordPress titles like
  // "20+ Pics That Prove…" or "EV Mock Interview V2.0" otherwise
  // get auto-coerced to numbers and crash on `.trim()`. We do
  // explicit `Number(r["wp:post_id"])` for the only numeric field
  // we actually need.
  parseTagValue: false,
  parseAttributeValue: false,
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function classifyKind(postType?: string): WordPressItemKind {
  switch (postType) {
    case "page":
      return "page";
    case "post":
      return "post";
    case "attachment":
      return "attachment";
    default:
      return "other";
  }
}

function parseDate(raw?: string): Date | null {
  if (!raw) return null;
  // WP exports `2025-11-13 04:30:00` (no timezone) for `wp:post_date`
  // and the same for `_gmt`. Treat the GMT one as UTC; otherwise
  // attempt RFC 822 (pubDate format). Fall back to null on parse
  // failure rather than throwing so one malformed date doesn't kill
  // the whole batch.
  const cleaned = raw.replace(" ", "T");
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

function findFirstImage(html: string): string | null {
  // Cheap regex — we don't need a full DOM walk just to grab the
  // first src=. A handful of false positives (URLs in <code>
  // blocks) are fine since the renderer falls back to the
  // brand-gradient cover when this is unfetchable.
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return m?.[1] ?? null;
}

function deriveExcerpt(rawHtml: string, fallback: string): string {
  if (fallback?.trim()) return fallback.trim().slice(0, 180);
  // Strip tags + collapse whitespace, then truncate.
  const text = rawHtml
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 180);
}

export function parseWordPressXml(xml: string): WordPressParseResult {
  const doc = parser.parse(xml) as RawDoc;
  const channel = doc?.rss?.channel;
  if (!channel) {
    throw new Error("Not a WordPress WXR file — missing <rss><channel>.");
  }
  const rawItems = asArray<RawItem>(channel.item);
  // String() defensively — `parseTagValue: false` should prevent
  // numeric coercion, but a mis-typed RawItem from a future schema
  // change shouldn't crash the whole loop. `String(undefined)` is
  // "undefined" which we reject downstream, but `String(20)` works.
  const s = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
  const items: WordPressItem[] = rawItems.map((r) => {
    const kind = classifyKind(s(r["wp:post_type"]));
    const bodyRaw = s(r["content:encoded"]);
    const excerptRaw = s(r["excerpt:encoded"]);
    return {
      kind,
      wpPostId: Number(r["wp:post_id"] ?? 0) || 0,
      title: s(r.title).trim(),
      slug: s(r["wp:post_name"]).trim(),
      wpStatus: s(r["wp:status"]).trim(),
      bodyRaw,
      excerpt: excerptRaw.trim(),
      publishedAt:
        parseDate(s(r["wp:post_date_gmt"])) ??
        parseDate(s(r["wp:post_date"])) ??
        parseDate(s(r.pubDate)),
      firstImageUrl: findFirstImage(bodyRaw),
      authorLogin: s(r["dc:creator"]).trim(),
    };
  });

  const counts: Record<WordPressItemKind, number> = {
    page: 0,
    post: 0,
    attachment: 0,
    other: 0,
  };
  for (const it of items) counts[it.kind] += 1;

  return {
    channelTitle: (channel.title ?? "").trim(),
    baseUrl: (channel["wp:base_site_url"] ?? "").trim(),
    items,
    counts,
  };
}

/**
 * Strict HTML sanitiser tuned for WordPress page/post bodies.
 *
 *   • Allows the structural tags WP authors actually use (headings,
 *     lists, tables, blockquotes, figures, images, embeds).
 *   • Allows `<style>` so the scoped CSS in the AI-tool landing
 *     pages survives — without this, every page in the user's
 *     export would render as raw text.
 *   • Strips `<script>` and every event-handler attribute. Inline
 *     `<style>` content stays but is still a string, not executable.
 *   • Drops `javascript:` / `data:` URIs in href + src.
 *
 * This is the trust boundary. The DB column never holds anything
 * the sanitiser hasn't passed; the renderer can dangerouslySetInnerHTML.
 */
export function sanitizeWordPressBody(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: [
      // Block
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "blockquote", "pre", "code", "hr",
      "ul", "ol", "li",
      "table", "thead", "tbody", "tr", "th", "td", "caption", "colgroup", "col",
      "figure", "figcaption",
      "div", "section", "article", "header", "footer", "nav", "aside", "main",
      // Inline
      "a", "br", "span", "strong", "em", "b", "i", "u", "s", "small",
      "sup", "sub", "mark", "cite", "kbd", "abbr", "time",
      // Media
      "img", "picture", "source", "video", "audio", "iframe",
      // Style — explicitly allowed; sanitize-html will keep its
      // contents as inert text. The CSS still applies to the page
      // when rendered.
      "style",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel", "title"],
      img: ["src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding", "class", "id", "style"],
      picture: ["class", "id"],
      source: ["src", "srcset", "type", "media", "sizes"],
      video: ["src", "controls", "width", "height", "poster", "preload", "loop", "muted", "playsinline"],
      audio: ["src", "controls", "preload", "loop", "muted"],
      iframe: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "title", "loading", "referrerpolicy"],
      "*": ["class", "id", "style", "lang", "dir", "title"],
    },
    // Iframes: only allow embeds from a vetted host list. Everything
    // else gets stripped. WordPress oEmbed mostly produces YouTube,
    // Vimeo, and Twitter/X frames — that covers ~all real cases.
    allowedIframeHostnames: [
      "www.youtube.com",
      "youtube.com",
      "youtube-nocookie.com",
      "www.youtube-nocookie.com",
      "player.vimeo.com",
      "platform.twitter.com",
      "www.linkedin.com",
      "www.google.com", // Google Maps embeds
    ],
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
    // Drop empty <p></p> blocks WP loves to insert between blocks.
    nonTextTags: ["script", "noscript", "textarea", "option"],
    // Suppress sanitize-html's stderr warning about <style>. We DO
    // allow it deliberately — many imported WP landing pages ship
    // their own scoped CSS, and stripping <style> would leave them
    // as unstyled walls of text. The trust boundary is the admin
    // role-gate on the importer + on every other write path that
    // touches Page.body (no public-user content lands here).
    allowVulnerableTags: true,
    transformTags: {
      // Force external links to open safely. WP's editor doesn't
      // reliably set `rel=noopener`, so add it ourselves.
      a: (tagName, attribs) => {
        const next: Record<string, string> = { ...attribs };
        if (next.target === "_blank") {
          next.rel = (next.rel ? next.rel + " " : "") + "noopener noreferrer";
        }
        return { tagName, attribs: next };
      },
    },
  });
}

/** Slug normaliser — used when `wp:post_name` is empty or weird. */
export function fallbackSlug(title: string, wpPostId: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || `wp-${wpPostId}`;
}

/** Estimate reading time the same way Article does — 220 wpm. */
export function readingTimeMins(plainText: string): number {
  const words = plainText.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export { deriveExcerpt };
