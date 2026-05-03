/**
 * Single source of truth for hashtag normalisation. Used by:
 *   • subscribe / unsubscribe server actions (we accept any user
 *     input — `#Battery Engineering`, `BMS`, `lfp` — and route them
 *     all to the same canonical row).
 *   • Display logic on /tag/[slug] when we want to render the
 *     "pretty" form alongside the slug-shape.
 *   • Bulk-subscribe in onboarding so a list pasted from a Slack
 *     channel (`battery, BMS, charging`) becomes a clean tag set.
 *
 * Storage shape matches `lib/social/extract.ts` — lower-case
 * alphanumerics + dash/underscore, 2–30 chars. Anything weirder
 * gets rejected (returns null) so the caller can show a friendly
 * "tag must be 2–30 chars, letters/numbers/dashes only" message.
 *
 * Examples:
 *   "#Battery Engineering" → "battery-engineering"
 *   "BMS"                  → "bms"
 *   "  charging "          → "charging"
 *   "🔋"                   → null   (no alphanumerics)
 *   "ev/india"             → "evindia"   (slash stripped)
 *   "ai_ml"                → "ai_ml"     (underscore preserved)
 *   "a"                    → null   (too short — < 2 chars)
 *   ""                     → null
 */

const MIN_LEN = 2;
const MAX_LEN = 30;

export function normalizeHashtag(input: string): string | null {
  if (!input) return null;
  // Lowercase, strip leading # and surrounding whitespace.
  let s = input.trim().toLowerCase();
  if (s.startsWith("#")) s = s.slice(1);
  // Whitespace + slashes + most punctuation collapse to dashes;
  // we keep alphanumerics + underscores + dashes. The replace runs
  // before the strict character filter so "battery engineering"
  // becomes "battery-engineering" rather than "batteryengineering".
  s = s.replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
  // Collapse adjacent dashes (e.g. "ev—india" → "ev-india" not
  // "ev--india") and trim them off the ends.
  s = s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length < MIN_LEN || s.length > MAX_LEN) return null;
  // First char must be alphanumeric — same shape as extract.ts so
  // a tag stored from a post body and a tag typed by the user are
  // guaranteed to match exactly.
  if (!/^[a-z0-9]/.test(s)) return null;
  return s;
}

/**
 * Normalise + dedupe a list of inputs in one call. Used by the
 * onboarding bulk-subscribe step + the /me/topics manage page.
 * Drops nulls (failed normalisation) and caps the result at the
 * supplied limit so a malicious bulk paste can't blow up the
 * caller.
 */
export function normalizeHashtags(inputs: string[], limit = 50): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const input of inputs) {
    const norm = normalizeHashtag(input);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Display-friendly version of a stored slug — capitalises the
 * first letter of each dash-separated segment so `battery-bms` reads
 * as "Battery Bms" rather than "battery-bms" in chip headlines.
 * Doesn't try to be smart about acronyms (BMS / LFP / EV) — if we
 * need that, we'll add a small allowlist in v2.
 */
export function prettifyHashtag(slug: string): string {
  return slug
    .split("-")
    .map((p) => (p.length > 0 ? p[0].toUpperCase() + p.slice(1) : ""))
    .join(" ");
}
