/**
 * Country reference data for onboarding pickers, profile flags, job
 * filters, etc. Codes are ISO 3166-1 alpha-2 (the 2-letter form).
 *
 * The list is curated, not exhaustive — we surface the EV-industry
 * core markets first (India + South Asia, then ASEAN battery hubs,
 * then EU/US/Gulf/East Asia where Indian engineers commonly relocate).
 * Anything else falls through to "Other" — when we eventually need a
 * specific country we add it here without a migration.
 *
 * The `flag` is a literal flag emoji generated from the country code
 * (each ASCII letter mapped to its Regional Indicator Symbol). We
 * keep it inline so the icon component never needs a network round
 * trip; modern browsers + iOS / Android render the emoji natively.
 *
 * `dialCode` carries the international phone prefix — handy for the
 * phone-number editor if we ever want to autodetect from country.
 */

export interface Country {
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
export const COUNTRIES: Country[] = [
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
export function countryByCode(code: string | null | undefined): Country | null {
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
