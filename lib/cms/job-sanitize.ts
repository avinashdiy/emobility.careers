import sanitizeHtml from "sanitize-html";

/**
 * Server-side HTML sanitiser for the rich-text fields on job
 * postings — description / responsibilities / requirements /
 * benefits.
 *
 * Strict allowlist tuned to what the RichTextEditor toolbar
 * exposes (bold / italic / headings / lists / links). Anything
 * else is stripped at write-time so the DB column never holds
 * markup the renderer can't trust.
 *
 * Why this is its own module (not reused from
 * `wordpress-import.ts`):
 *   - The WP sanitiser is intentionally permissive (full HTML
 *     documents, <style>, optional <script>) for admin-uploaded
 *     pages.
 *   - Job-posting content is recruiter-authored — we want a much
 *     tighter ceiling so a copy-paste from a weird source can't
 *     bring in iframes, images, or surprising classes.
 *
 * Empty-content normalisation:
 *   Tiptap emits a single `<p></p>` for an empty editor. We strip
 *   that to "" so the Zod `min()` checks on description fire
 *   correctly. Whitespace-only paragraphs are also collapsed.
 */
export function sanitizeJobHtml(html: string | null | undefined): string {
  if (!html) return "";
  const stripped = sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "em", "b", "i", "u", "s",
      "h2", "h3",
      "ul", "ol", "li",
      "blockquote",
      "a",
      "code",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
    },
    // No data: or javascript: URIs ever.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href"],
    transformTags: {
      // External links always open in a new tab with a safe rel
      // attribute — recruiter forms shouldn't be able to bypass
      // either when they paste from somewhere else.
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        const isExternal = /^https?:\/\//i.test(href);
        const next = { ...attribs };
        if (isExternal) {
          next.target = "_blank";
          next.rel = "noopener noreferrer";
        }
        return { tagName, attribs: next };
      },
      // Tiptap occasionally emits <b>/<i> instead of <strong>/<em>
      // depending on paste source. Normalise to the semantic
      // versions so the rendered output is consistent.
      b: () => ({ tagName: "strong", attribs: {} }),
      i: () => ({ tagName: "em", attribs: {} }),
    },
  });

  // Strip an empty-document `<p></p>` (or `<p> </p>` etc.) so
  // description Zod min-length rules fire correctly.
  const collapsed = stripped
    .replace(/<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")
    .trim();
  return collapsed;
}

/**
 * Plain-text length of HTML content — used for the `description
 * min(20)` Zod rule so 30 characters of formatting markup don't
 * accidentally count as 30 characters of body.
 */
export function plainTextLength(html: string | null | undefined): number {
  if (!html) return 0;
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

/**
 * Strip all HTML tags and collapse whitespace. Used by surfaces that
 * need a *plain-text* version of a rich-text field — list-card
 * previews (`line-clamp-2`), meta-description tags, OG / Twitter
 * cards, SMS digests, etc.
 *
 * Do NOT use for trusted render — pair with `htmlOrFallback` +
 * `dangerouslySetInnerHTML` for full rendering instead.
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Render-time helper for any field that USED TO BE plain text and
 * is now stored as sanitised HTML.
 *
 *   • Post-2026-05: write paths run user input through the
 *     RichTextEditor + `sanitizeRichTextHtml`, so the column holds
 *     HTML. Pass-through.
 *   • Legacy rows (jobs, articles, mentor bios, competition
 *     descriptions) still hold plain text with `\n` separators.
 *     We HTML-escape + wrap them in a `<p>` with
 *     `white-space:pre-line` so paragraphs render the same as
 *     they did before the migration.
 *
 * Returns a string that the caller should drop into
 * `dangerouslySetInnerHTML`. The HTML branch is already sanitiser-
 * blessed at write time, so this helper does NOT re-sanitise.
 *
 * Always pair with a `prose` wrapper on the parent so headings /
 * lists / blockquotes pick up the typography ramp.
 */
export function htmlOrFallback(body: string | null | undefined): string {
  if (!body) return "";
  // Looks like HTML (contains any tag) → trust the write-path
  // sanitiser and pass through.
  if (/<[a-z][^>]*>/i.test(body)) return body;
  // Legacy plain text — escape, then wrap.
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<p style="white-space:pre-line">${escaped}</p>`;
}

/**
 * Alias of `sanitizeJobHtml` for non-job rich-text surfaces
 * (articles, mentor bios, competition descriptions, events,
 * fairs). The allowlist is identical because the same toolbar
 * (bold / italic / h2-3 / lists / links) drives every editor.
 * If a future surface needs a wider / narrower allowlist, fork
 * this helper rather than relaxing the job version.
 */
export const sanitizeRichTextHtml = sanitizeJobHtml;
