import { z } from "zod";

/**
 * Lenient URL Zod field for any form a user types into.
 *
 * Strict `z.string().url()` rejects common-but-fixable input the
 * user expects to "just work":
 *
 *   • leading / trailing whitespace from a paste
 *   • `linkedin.com/in/foo` without the `https://` prefix
 *   • a stray newline from a copy-out-of-PDF flow
 *
 * Bare `.url()` was the most common cause of the "Save changes does
 * nothing" bug recruiters and candidates reported on the profile
 * editor. The action's `parsed.success` check failed silently when
 * any URL field tripped Zod, and the bare-form-action pattern gave
 * the client no feedback.
 *
 * This helper pre-trims and auto-prefixes `https://` before piping
 * through `.url()` validation, then accepts empty string so empty
 * inputs survive untouched (callers usually normalise empty → null
 * on the way to the DB).
 *
 * Use `optionalUrl` for any "social / portfolio / homepage" style
 * field where the user is allowed to leave it blank. Use the
 * stricter `optionalUrl.refine((v) => v.length > 0, …)` shape when
 * a URL is mandatory.
 *
 *   schema = z.object({
 *     linkedinUrl: optionalUrl,
 *     ...
 *   })
 *
 * Trades correctness-strictness for usability. A typo'd domain
 * still passes URL parsing (it's syntactically valid) — that's a
 * deliberate ergonomics call. The cost of false-positives (a bad
 * domain saved) is much lower than the cost of false-negatives
 * (the entire Save button silently failing).
 */
export const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return "";
    return /^https?:\/\//i.test(v) || /^mailto:/i.test(v) ? v : `https://${v}`;
  })
  .pipe(z.string().url().or(z.literal("")));
