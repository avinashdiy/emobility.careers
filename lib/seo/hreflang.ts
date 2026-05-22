import type { Country } from "@prisma/client";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import { env } from "@/lib/env";

/**
 * Builds the `alternates.languages` map for Next's `Metadata` API
 * so every cross-country surface ships hreflang tags Google can use.
 *
 * What hreflang does (and why you should care):
 *   • Tells Google "this page has equivalent versions in other
 *     country/language combinations — show the right one to each
 *     user."
 *   • Without hreflang, Google may show your /uk page to an Indian
 *     user (wasted impression) or your /ae page to a UK user
 *     (mismatch, lower CTR).
 *   • The `x-default` entry tells Google what to fall back to when
 *     no other version matches — we use the India root, since
 *     that's where the canonical 50k-user dataset lives.
 *
 * Two callers:
 *   1. Country landing pages — pass `kind: "landing"`. Generates
 *      `/uk` ↔ `/ae` ↔ `/us` etc. alternates.
 *   2. Country-scoped resource pages (e.g. /uk/jobs in PR 3) —
 *      pass `kind: "path"` with the path tail.
 *
 * Output is `alternates.languages` shaped for
 * `Metadata.alternates.languages`. Values are absolute URLs because
 * Google's hreflang spec requires fully-qualified targets.
 */

export interface HreflangOptions {
  /**
   * "landing"  → country root pages (/uk, /ae, etc.)
   *   The India equivalent is the site root `/`.
   *
   * "path"     → country-scoped path under each subfolder.
   *   `pathTail` is appended after each country's subfolder.
   *   e.g. pathTail="/jobs" produces /jobs (IN), /uk/jobs, /ae/jobs.
   */
  kind: "landing" | "path";
  /**
   * Path tail (with leading slash) for `kind: "path"`. Ignored when
   * `kind === "landing"`. E.g. "/jobs" or "/companies".
   */
  pathTail?: string;
}

/**
 * Build absolute URL for a country + path.
 *
 * Examples:
 *   countryUrl("IN", "")            → "https://emobility.careers"
 *   countryUrl("IN", "/jobs")       → "https://emobility.careers/jobs"
 *   countryUrl("GB", "")            → "https://emobility.careers/uk"
 *   countryUrl("GB", "/jobs")       → "https://emobility.careers/uk/jobs"
 *   countryUrl("AE", "/companies")  → "https://emobility.careers/ae/companies"
 */
export function countryUrl(country: Country, pathTail: string = ""): string {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const sub = SUPPORTED_COUNTRIES[country].subfolder;
  const prefix = sub ? `/${sub}` : "";
  return `${base}${prefix}${pathTail}`;
}

/**
 * Returns the hreflang alternates map for the given page kind.
 * Use as `alternates: { languages: hreflangAlternates({...}) }` in
 * the page's `generateMetadata`.
 *
 * Every supported country gets a row + an `x-default` row that
 * points at India (root). Google reads `x-default` when no other
 * locale matches; sending traffic to the established Indian user
 * base + index is the right "I don't know who you are" fallback.
 */
export function hreflangAlternates(opts: HreflangOptions): Record<string, string> {
  const tail = opts.kind === "landing" ? "" : (opts.pathTail ?? "");
  const map: Record<string, string> = {};
  for (const meta of Object.values(SUPPORTED_COUNTRIES)) {
    map[meta.locale] = countryUrl(meta.code, tail);
  }
  // x-default → India root. Google falls back to this when none of
  // the per-locale rules above match the user (e.g. a Brazilian
  // visitor; Brazil isn't in our supported set).
  map["x-default"] = countryUrl("IN", tail);
  return map;
}
