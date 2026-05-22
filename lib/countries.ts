/**
 * Country reference data for onboarding pickers, profile flags, job
 * filters, etc. Codes are ISO 3166-1 alpha-2 (the 2-letter form).
 *
 * This module exposes two layers:
 *
 *   1. A WIDE list of ~50 countries (`COUNTRIES`, `countryByCode`,
 *      `flagOf`) — used for "user can claim to live anywhere" UX
 *      surfaces like the profile-page country picker and phone
 *      input. Free-form, not tied to any platform feature.
 *
 *   2. A NARROW set of fully-supported countries (`SUPPORTED_COUNTRIES`,
 *      `isSupportedCountry`, `coerceCountry`) — matches the `Country`
 *      enum in Prisma. These are the markets the platform is BUILT
 *      for: dedicated GSC subfolders, sitemap shards, hreflang
 *      alternates, currency formatting, default time zones. Adding
 *      a country to this set is a four-step ritual (enum value +
 *      this file + sitemap shard + GSC property).
 *
 * The wide list intentionally INCLUDES the narrow set (so a user
 * from a non-supported market can still pick their country on
 * their profile — we just don't operate there yet).
 *
 * The `flag` is a literal flag emoji generated from the country code
 * (each ASCII letter mapped to its Regional Indicator Symbol). We
 * keep it inline so the icon component never needs a network round
 * trip; modern browsers + iOS / Android render the emoji natively.
 *
 * `dialCode` carries the international phone prefix — handy for the
 * phone-number editor if we ever want to autodetect from country.
 */

import type { Country } from "@prisma/client";

/**
 * Reference shape for the WIDE country list — free-form data used
 * by the long country pickers. Renamed from `Country` to
 * `CountryRef` to avoid colliding with the Prisma `Country` enum
 * used by the NARROW supported-countries layer.
 */
export interface CountryRef {
  code: string;       // ISO alpha-2
  name: string;
  dialCode: string;   // E.164-style "+91"
  flag: string;       // 🇮🇳
}

/**
 * Convert a 2-letter country code into the matching flag emoji by
 * shifting each ASCII letter into the Regional Indicator Symbol
 * range (U+1F1E6 – U+1F1FF). Cheap, no font/asset dependency.
 */
export function flagOf(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "🌐";
  const base = 0x1f1e6;
  const upper = code.toUpperCase();
  const cp1 = base + (upper.charCodeAt(0) - 65);
  const cp2 = base + (upper.charCodeAt(1) - 65);
  if (cp1 < base || cp2 < base) return "🌐";
  return String.fromCodePoint(cp1, cp2);
}

// India is intentionally first — primary market. The remainder is
// loosely grouped: South Asia → ASEAN battery hubs → Greater China →
// Gulf → EU → North America → ANZ → rest of world (alphabetical).
export const COUNTRIES: CountryRef[] = [
  { code: "IN", name: "India", dialCode: "+91", flag: "🇮🇳" },
  { code: "BD", name: "Bangladesh", dialCode: "+880", flag: "🇧🇩" },
  { code: "BT", name: "Bhutan", dialCode: "+975", flag: "🇧🇹" },
  { code: "LK", name: "Sri Lanka", dialCode: "+94", flag: "🇱🇰" },
  { code: "NP", name: "Nepal", dialCode: "+977", flag: "🇳🇵" },
  { code: "PK", name: "Pakistan", dialCode: "+92", flag: "🇵🇰" },
  { code: "ID", name: "Indonesia", dialCode: "+62", flag: "🇮🇩" },
  { code: "MY", name: "Malaysia", dialCode: "+60", flag: "🇲🇾" },
  { code: "PH", name: "Philippines", dialCode: "+63", flag: "🇵🇭" },
  { code: "SG", name: "Singapore", dialCode: "+65", flag: "🇸🇬" },
  { code: "TH", name: "Thailand", dialCode: "+66", flag: "🇹🇭" },
  { code: "VN", name: "Vietnam", dialCode: "+84", flag: "🇻🇳" },
  { code: "CN", name: "China", dialCode: "+86", flag: "🇨🇳" },
  { code: "HK", name: "Hong Kong", dialCode: "+852", flag: "🇭🇰" },
  { code: "JP", name: "Japan", dialCode: "+81", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", dialCode: "+82", flag: "🇰🇷" },
  { code: "TW", name: "Taiwan", dialCode: "+886", flag: "🇹🇼" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966", flag: "🇸🇦" },
  { code: "QA", name: "Qatar", dialCode: "+974", flag: "🇶🇦" },
  { code: "BH", name: "Bahrain", dialCode: "+973", flag: "🇧🇭" },
  { code: "KW", name: "Kuwait", dialCode: "+965", flag: "🇰🇼" },
  { code: "OM", name: "Oman", dialCode: "+968", flag: "🇴🇲" },
  { code: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪" },
  { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" },
  { code: "IT", name: "Italy", dialCode: "+39", flag: "🇮🇹" },
  { code: "NL", name: "Netherlands", dialCode: "+31", flag: "🇳🇱" },
  { code: "ES", name: "Spain", dialCode: "+34", flag: "🇪🇸" },
  { code: "SE", name: "Sweden", dialCode: "+46", flag: "🇸🇪" },
  { code: "NO", name: "Norway", dialCode: "+47", flag: "🇳🇴" },
  { code: "FI", name: "Finland", dialCode: "+358", flag: "🇫🇮" },
  { code: "DK", name: "Denmark", dialCode: "+45", flag: "🇩🇰" },
  { code: "CH", name: "Switzerland", dialCode: "+41", flag: "🇨🇭" },
  { code: "AT", name: "Austria", dialCode: "+43", flag: "🇦🇹" },
  { code: "BE", name: "Belgium", dialCode: "+32", flag: "🇧🇪" },
  { code: "PL", name: "Poland", dialCode: "+48", flag: "🇵🇱" },
  { code: "PT", name: "Portugal", dialCode: "+351", flag: "🇵🇹" },
  { code: "IE", name: "Ireland", dialCode: "+353", flag: "🇮🇪" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧" },
  { code: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" },
  { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
  { code: "MX", name: "Mexico", dialCode: "+52", flag: "🇲🇽" },
  { code: "BR", name: "Brazil", dialCode: "+55", flag: "🇧🇷" },
  { code: "AR", name: "Argentina", dialCode: "+54", flag: "🇦🇷" },
  { code: "CL", name: "Chile", dialCode: "+56", flag: "🇨🇱" },
  { code: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺" },
  { code: "NZ", name: "New Zealand", dialCode: "+64", flag: "🇳🇿" },
  { code: "ZA", name: "South Africa", dialCode: "+27", flag: "🇿🇦" },
  { code: "KE", name: "Kenya", dialCode: "+254", flag: "🇰🇪" },
  { code: "NG", name: "Nigeria", dialCode: "+234", flag: "🇳🇬" },
  { code: "EG", name: "Egypt", dialCode: "+20", flag: "🇪🇬" },
  { code: "MA", name: "Morocco", dialCode: "+212", flag: "🇲🇦" },
  { code: "TR", name: "Turkey", dialCode: "+90", flag: "🇹🇷" },
  { code: "IL", name: "Israel", dialCode: "+972", flag: "🇮🇱" },
  { code: "RU", name: "Russia", dialCode: "+7", flag: "🇷🇺" },
];

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** Look up a country by ISO alpha-2 code. Returns null if unknown. */
export function countryByCode(code: string | null | undefined): CountryRef | null {
  if (!code) return null;
  return COUNTRY_BY_CODE.get(code.toUpperCase()) ?? null;
}

/** Display "City, Country" or just one when the other is missing. */
export function formatLocation(opts: {
  city?: string | null;
  country?: string | null;
  fallback?: string | null;
}): string | null {
  const c = opts.country ? countryByCode(opts.country) : null;
  if (opts.city && c) return `${opts.city}, ${c.name}`;
  if (opts.city) return opts.city;
  if (c) return c.name;
  return opts.fallback ?? null;
}

// ─── Narrow supported-country layer ─────────────────────────────
//
// The countries below are the markets the platform is BUILT for.
// They get:
//   • Dedicated URL subfolder (e.g. /uk/jobs)
//   • Their own sitemap shard
//   • A property + geo-target in Google Search Console
//   • hreflang alternates on every cross-country surface
//   • Currency formatting via the daily-refreshed ExchangeRate table
//   • Default time-zone for interview scheduling
//
// Adding a country is a four-step ritual (enum + this metadata +
// sitemap shard + GSC property). The wide `COUNTRIES` list above
// stays untouched — users can still claim residence in any country
// for their profile.

export interface SupportedCountryMeta {
  /** ISO 3166-1 alpha-2 code. Matches the Prisma enum value. */
  code: Country;
  /** Human-readable country name for UI labels. */
  name: string;
  /** Unicode flag glyph — used in the country selector dropdown. */
  flag: string;
  /** Phone country code (e.g. "+91"). Used by the phone input. */
  phoneCode: string;
  /** ISO 4217 currency code (e.g. "INR"). Used by `formatSalary()`. */
  currency: string;
  /** Display symbol (e.g. "₹"). May differ from currency for clarity. */
  currencySymbol: string;
  /** IANA time-zone name. Used for default interview-scheduling TZ. */
  timezone: string;
  /**
   * URL subfolder for this country's content (e.g. "uk" / "ae").
   * Empty string for the default country (India) since India
   * content stays at the root to preserve existing indexed URLs +
   * link equity for the ~50k existing user base.
   */
  subfolder: string;
  /** Display locale for `Intl.*` formatters. */
  locale: string;
}

/**
 * Metadata table for every country the platform officially
 * supports. Keep ordered with India first (default), then the
 * active expansion markets in launch-priority order: UAE → UK →
 * Australia → US, then DIYguru-center markets in South + SE Asia.
 *
 * One row per Prisma `Country` enum value — exhaustive at the type
 * level, so adding an enum value without a row is a TS error.
 */
export const SUPPORTED_COUNTRIES: Record<Country, SupportedCountryMeta> = {
  IN: {
    code: "IN",
    name: "India",
    flag: "🇮🇳",
    phoneCode: "+91",
    currency: "INR",
    currencySymbol: "₹",
    timezone: "Asia/Kolkata",
    // Empty subfolder — India stays at the root. Moving existing
    // Indian URLs into `/in/...` would break every backlink and
    // tank existing SEO for the ~50k-user base. New markets get
    // prefixes; India keeps the canonical root.
    subfolder: "",
    locale: "en-IN",
  },
  AE: {
    code: "AE",
    name: "United Arab Emirates",
    flag: "🇦🇪",
    phoneCode: "+971",
    currency: "AED",
    currencySymbol: "AED",
    timezone: "Asia/Dubai",
    subfolder: "ae",
    locale: "en-AE",
  },
  GB: {
    code: "GB",
    name: "United Kingdom",
    flag: "🇬🇧",
    phoneCode: "+44",
    currency: "GBP",
    currencySymbol: "£",
    timezone: "Europe/London",
    subfolder: "uk",
    locale: "en-GB",
  },
  AU: {
    code: "AU",
    name: "Australia",
    flag: "🇦🇺",
    phoneCode: "+61",
    currency: "AUD",
    currencySymbol: "A$",
    timezone: "Australia/Sydney",
    subfolder: "au",
    locale: "en-AU",
  },
  US: {
    code: "US",
    name: "United States",
    flag: "🇺🇸",
    phoneCode: "+1",
    currency: "USD",
    currencySymbol: "$",
    timezone: "America/New_York",
    subfolder: "us",
    locale: "en-US",
  },
  MY: {
    code: "MY",
    name: "Malaysia",
    flag: "🇲🇾",
    phoneCode: "+60",
    currency: "MYR",
    currencySymbol: "RM",
    timezone: "Asia/Kuala_Lumpur",
    subfolder: "my",
    locale: "en-MY",
  },
  BD: {
    code: "BD",
    name: "Bangladesh",
    flag: "🇧🇩",
    phoneCode: "+880",
    currency: "BDT",
    currencySymbol: "৳",
    timezone: "Asia/Dhaka",
    subfolder: "bd",
    locale: "en-BD",
  },
  NP: {
    code: "NP",
    name: "Nepal",
    flag: "🇳🇵",
    phoneCode: "+977",
    currency: "NPR",
    currencySymbol: "रु",
    timezone: "Asia/Kathmandu",
    subfolder: "np",
    locale: "en-NP",
  },
};

/**
 * Ordered list of supported countries — iteration order matches
 * `SUPPORTED_COUNTRIES` declaration order (India first, then
 * expansion-priority). Used by every UI surface that renders a
 * supported-country dropdown — signup form, settings, job-post
 * editor, country selector in the header.
 */
export const SUPPORTED_COUNTRY_LIST: readonly SupportedCountryMeta[] =
  Object.values(SUPPORTED_COUNTRIES);

/**
 * The default country for users we can't otherwise identify —
 * mirrors `User.country @default(IN)` in the Prisma schema. Use
 * this constant instead of the literal "IN" so a future "we
 * changed the default" is one find-and-replace.
 */
export const DEFAULT_COUNTRY: Country = "IN";

/**
 * Type-narrowing guard. Use when accepting a country code from an
 * untrusted source (HTTP header, URL param, form field) — narrows
 * the input to the closed Prisma `Country` enum or returns false.
 * Replaces ad-hoc `if (code === "IN" || code === "AE" …)` chains.
 *
 * Case-insensitive: Cloudflare's `CF-IPCountry` header is upper,
 * some IP-geo services return lower. Normalising here avoids
 * subtle "default to IN even though the user is in 'ae'" bugs.
 */
export function isSupportedCountry(value: unknown): value is Country {
  if (typeof value !== "string") return false;
  return Object.prototype.hasOwnProperty.call(
    SUPPORTED_COUNTRIES,
    value.toUpperCase(),
  );
}

/**
 * Coerce an untrusted input into a valid `Country`, falling back
 * to `DEFAULT_COUNTRY`. Convenience for the common "give me a
 * country, any country" use case (e.g. picking the signup form's
 * pre-filled default from an IP-geo header).
 */
export function coerceCountry(value: unknown): Country {
  if (typeof value !== "string") return DEFAULT_COUNTRY;
  const upper = value.toUpperCase();
  return isSupportedCountry(upper) ? (upper as Country) : DEFAULT_COUNTRY;
}

/** Short for `SUPPORTED_COUNTRIES[country].name`. */
export function supportedCountryName(country: Country): string {
  return SUPPORTED_COUNTRIES[country].name;
}

/**
 * URL subfolder for a supported country — e.g. "ae" for UAE, ""
 * (empty string) for India. Returns the path SEGMENT only, no
 * leading slash. Used when building cross-country canonical URLs
 * and hreflang alternates.
 */
export function countrySubfolder(country: Country): string {
  return SUPPORTED_COUNTRIES[country].subfolder;
}
