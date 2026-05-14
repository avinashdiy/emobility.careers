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
