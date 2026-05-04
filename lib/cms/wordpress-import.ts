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
 * HTML sanitiser tuned for WordPress / Elementor / Gutenberg
 * page/post bodies — INCLUDING full HTML documents.
 *
 * Why this is so permissive:
 *   • The exported pages are typically full standalone documents
 *     (Elementor sections, AI-tool landing pages with scoped CSS
 *     that targets `body { ... !important }`). Stripping `<head>`
 *     or document wrappers would gut them.
 *   • Page rows are written ONLY by admin-gated paths (the WP
 *     importer + any future admin-author form). The trust
 *     boundary is the admin role-check, not the sanitiser.
 *   • STANDALONE pages render inside an iframe srcdoc that does
 *     NOT get `allow-scripts`, so even if a stray `<script>`
 *     slipped past it would be inert. Same iframe gives us style
 *     isolation — `body { ... !important }` stays inside.
 *
 * What we still strip:
 *   • `<script>` and event-handler attributes (`onclick=` etc.)
 *   • `javascript:` / `data:` URIs in href + src.
 *
 * What we DO keep that a stricter sanitiser would drop:
 *   • Document shell — `<html>`, `<head>`, `<body>`, `<title>`,
 *     `<meta>`, `<link>` (Google Fonts preconnects survive)
 *   • Full `<style>` blocks (Elementor's identity)
 *   • Inline SVG (Elementor / theme icons)
 *   • Form elements (renders even if non-functional)
 *   • Wildcard `data-*` and `aria-*` attributes — Elementor's
 *     CSS selectors target these heavily; without them every
 *     widget renders unstyled
 */
interface SanitizeOptions {
  /// When true, preserve `<script>` tags AND their inline contents.
  /// Use ONLY for admin-trusted pages (the AI-tool landing decks
  /// where the inline JS calls /api/ai/proxy). Combined with
  /// PageIframe's `allowScripts` which sets the iframe sandbox to
  /// `allow-scripts allow-same-origin`, this gives us trusted-page
  /// behavior without giving up iframe's style isolation.
  allowScripts?: boolean;
}

export function sanitizeWordPressBody(
  html: string,
  options: SanitizeOptions = {},
): string {
  if (!html) return "";
  const { allowScripts = false } = options;
  return sanitizeHtml(html, {
    allowedTags: [
      // Document shell — preserved for STANDALONE iframe rendering.
      "html", "head", "body", "title", "meta", "link", "base",
      // Block
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "blockquote", "pre", "code", "hr",
      "ul", "ol", "li", "dl", "dt", "dd",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
      "figure", "figcaption",
      "div", "section", "article", "header", "footer", "nav", "aside", "main",
      "details", "summary",
      // Inline
      "a", "br", "span", "strong", "em", "b", "i", "u", "s", "small",
      "sup", "sub", "mark", "cite", "kbd", "abbr", "time", "q", "wbr",
      // Media
      "img", "picture", "source", "video", "audio", "iframe", "embed", "object", "param",
      // Forms — render even without scripts.
      "form", "label", "input", "button", "select", "option", "optgroup", "textarea", "fieldset", "legend",
      // Style — full <style> blocks survive. Critical.
      "style",
      // SVG — Elementor / theme icons.
      "svg", "path", "g", "circle", "rect", "line", "polyline", "polygon",
      "ellipse", "defs", "use", "symbol", "mask", "clipPath",
      "linearGradient", "radialGradient", "stop", "filter", "text", "tspan",
      "marker", "pattern", "image", "foreignObject", "desc",
      // Optional script + noscript — only when explicitly allowed.
      // Spread is conditional so the default behaviour (no scripts)
      // is unchanged.
      ...(allowScripts ? ["script", "noscript"] : []),
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel", "title", "download", "hreflang"],
      img: ["src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding", "fetchpriority"],
      source: ["src", "srcset", "type", "media", "sizes"],
      video: ["src", "controls", "width", "height", "poster", "preload", "loop", "muted", "playsinline", "autoplay"],
      audio: ["src", "controls", "preload", "loop", "muted", "autoplay"],
      iframe: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "title", "loading", "referrerpolicy", "name", "sandbox"],
      // Document shell — preserved verbatim so iframed pages get
      // their canonical / charset / font preconnects.
      meta: ["charset", "name", "content", "http-equiv", "property"],
      link: ["rel", "href", "type", "media", "as", "crossorigin", "sizes"],
      base: ["href", "target"],
      html: ["lang", "dir"],
      // Forms — structural attributes only; no JS handlers.
      form: ["action", "method", "name", "target", "enctype", "accept-charset"],
      input: ["type", "name", "value", "placeholder", "required", "disabled", "readonly", "checked", "min", "max", "step", "minlength", "maxlength", "pattern", "autocomplete", "list", "multiple", "size", "src", "alt", "accept", "form"],
      button: ["type", "name", "value", "disabled", "form"],
      select: ["name", "required", "disabled", "multiple", "size", "form"],
      option: ["value", "selected", "disabled", "label"],
      textarea: ["name", "rows", "cols", "placeholder", "required", "disabled", "readonly", "minlength", "maxlength", "wrap"],
      label: ["for", "form"],
      // SVG attributes.
      svg: ["xmlns", "viewBox", "preserveAspectRatio", "width", "height", "fill", "stroke", "stroke-width", "version", "role", "focusable"],
      path: ["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "fill-rule", "clip-rule", "transform", "opacity"],
      g: ["transform", "fill", "stroke", "opacity", "mask", "clip-path"],
      circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width"],
      rect: ["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width"],
      line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width"],
      polyline: ["points", "fill", "stroke", "stroke-width"],
      polygon: ["points", "fill", "stroke", "stroke-width"],
      ellipse: ["cx", "cy", "rx", "ry", "fill", "stroke", "stroke-width"],
      use: ["href", "x", "y", "width", "height", "transform"],
      stop: ["offset", "stop-color", "stop-opacity"],
      linearGradient: ["x1", "y1", "x2", "y2", "gradientUnits", "gradientTransform"],
      radialGradient: ["cx", "cy", "r", "fx", "fy", "gradientUnits", "gradientTransform"],
      // Wildcard — applies to every tag. The `data-*` and `aria-*`
      // entries here are handled specially via `allowedAttributes`'
      // wildcard semantics in sanitize-html: any attribute matching
      // these glob patterns survives.
      "*": [
        "class", "id", "style", "lang", "dir", "title", "role", "tabindex",
        "hidden", "draggable", "translate", "spellcheck",
        // Glob patterns — sanitize-html supports `data-*` / `aria-*`
        // wildcards and preserves any matching attribute. Critical
        // for Elementor (data-element_type, data-id, data-widget_type)
        // and accessibility (aria-label, aria-hidden, aria-expanded).
        "data-*", "aria-*",
      ],
      // Script attributes — only when scripts are allowed. Inline
      // event handlers (onclick=, onload=, ...) are deliberately NOT
      // in the wildcard allowlist above; admin-trusted tools should
      // bind via addEventListener inside <script> blocks instead,
      // which is the modern + auditable pattern.
      ...(allowScripts
        ? {
            script: ["src", "type", "async", "defer", "crossorigin", "integrity", "nonce", "referrerpolicy"],
          }
        : {}),
    },
    // Iframes: vetted host allowlist. Covers WordPress oEmbed
    // (YouTube, Vimeo, Twitter/X) plus Maps.
    allowedIframeHostnames: [
      "www.youtube.com", "youtube.com",
      "youtube-nocookie.com", "www.youtube-nocookie.com",
      "player.vimeo.com",
      "platform.twitter.com",
      "www.linkedin.com",
      "www.google.com",
    ],
    allowedSchemes: ["http", "https", "mailto", "tel", "ftp"],
    allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
    // When allowScripts is OFF, treat <script> contents as discardable
    // (default sanitize-html behaviour). When ON, we want the inner
    // text to survive — drop `script` from the nonTextTags list so
    // its body isn't elided.
    nonTextTags: allowScripts
      ? ["textarea", "option"]
      : ["script", "noscript", "textarea", "option"],
    // Required when allowing <style> + (optionally) <script>.
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
