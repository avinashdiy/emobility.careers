import type { Country } from "@prisma/client";
import { SUPPORTED_COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";

/**
 * Currency utilities — the layer that translates between the
 * recruiter's posted-in-local-currency salary and the candidate's
 * see-it-in-my-local-currency display.
 *
 * Three jobs this module does:
 *
 *   1. **Hardcoded fallback rates.** ExchangeRate may be empty on
 *      day-one launch (the daily worker hasn't ticked yet) or
 *      missing rows for currencies the FX API doesn't cover
 *      (Frankfurter / ECB doesn't return AED, BDT, NPR). The
 *      fallbacks below let every conversion resolve to SOMETHING
 *      reasonable instead of throwing or rendering blank salaries.
 *
 *   2. **Canonical USD computation.** Jobs store
 *      `salaryUsdCanonical` (midpoint converted to USD) so we can
 *      rank / compare / filter across countries with a single
 *      sortable column. This module does the conversion at
 *      create/update time + on FX refresh.
 *
 *   3. **Local-currency display.** A UK candidate browsing /jobs
 *      sees a Dubai job's `AED 18,000–24,000/month` as
 *      `£3,800–£5,100/month (AED 18,000–24,000)` — local first,
 *      original in parens for transparency.
 *
 * Why hardcoded + DB fallback (and not "always DB"):
 *   • Production may take 24 hours to populate the table; we
 *     can't have salaries render as "N/A" for a day.
 *   • Some currencies (AED, BDT, NPR) aren't on free FX APIs.
 *     Hardcoded values are 95% accurate and stable month-over-
 *     month for these — recruiters and candidates won't notice
 *     the few-percent drift.
 *   • The DB is the source of truth WHEN populated; hardcoded
 *     is the floor.
 */

/**
 * USD → local-currency rates. Updated periodically by hand when
 * the values drift by >5%. Last verified 2026-05.
 *
 * Format: 1 USD = N {currency}.
 *
 * IMPORTANT: pinned to USD as the base. The FX worker queries the
 * same base, so rates upserted into ExchangeRate are
 * "1 USD = rate * quote-currency". Keep that contract — every
 * caller in this module assumes it.
 */
const HARDCODED_USD_RATES: Record<Country, number> = {
  IN: 83.5, // INR
  AE: 3.67, // AED (pegged to USD)
  AU: 1.5, // AUD
  US: 1.0, // USD (identity)
  GB: 0.8, // GBP
  MY: 4.7, // MYR
  BD: 121, // BDT
  NP: 133, // NPR
};

/**
 * In-process cache so a page that renders 20 JobCards doesn't fan
 * out to 20 DB lookups for the same FX rate. TTL is 60 seconds —
 * short enough that a fresh worker upsert is visible in under a
 * minute, long enough to absorb a burst of card renders. The
 * worker itself runs daily so 60s TTL doesn't risk staleness.
 */
type CacheEntry = { rate: number; expiresAt: number };
const rateCache = new Map<Country, CacheEntry>();
const CACHE_TTL_MS = 60_000;

/**
 * Resolve the USD → country-currency rate. Three-step precedence:
 *   1. In-process cache (under TTL)
 *   2. ExchangeRate table (when the row exists)
 *   3. Hardcoded fallback
 *
 * Never throws. Returns the hardcoded value as the floor — every
 * caller can assume the result is a real positive number.
 *
 * Lazy DB import so this module is safe to import from edge /
 * client contexts where `@/lib/db` would fail.
 */
export async function getUsdRate(quote: Country): Promise<number> {
  // 1. Cache
  const cached = rateCache.get(quote);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  // 2. DB
  let rate = HARDCODED_USD_RATES[quote];
  try {
    const { db } = await import("@/lib/db");
    const row = await db.exchangeRate.findUnique({
      where: { quote },
      select: { rate: true },
    });
    if (row && row.rate > 0) {
      rate = row.rate;
    }
  } catch {
    // DB unreachable / module not available — fall through to
    // hardcoded. Logging here would spam at hot-path frequency;
    // the worker logs its own failures.
  }

  rateCache.set(quote, { rate, expiresAt: Date.now() + CACHE_TTL_MS });
  return rate;
}

/**
 * Synchronous variant — uses cache or hardcoded only. Useful in
 * tight render loops where you've already pre-warmed the cache
 * (e.g. a page that called `prewarmRates(["IN", "GB"])` before
 * rendering its JobCard list).
 *
 * Returns the hardcoded fallback if the cache is cold; never
 * throws. Don't use this in code paths where freshness matters —
 * call `getUsdRate` async instead.
 */
export function getUsdRateSync(quote: Country): number {
  const cached = rateCache.get(quote);
  if (cached) return cached.rate;
  return HARDCODED_USD_RATES[quote];
}

/**
 * Pre-fill the cache for the given countries with a single DB
 * roundtrip. Call this in a page's data-fetch step BEFORE rendering
 * a list of jobs so each `getUsdRateSync` call inside the render
 * tree is a free memory lookup.
 */
export async function prewarmRates(quotes: Country[]): Promise<void> {
  if (quotes.length === 0) return;
  const unique = Array.from(new Set(quotes));
  try {
    const { db } = await import("@/lib/db");
    const rows = await db.exchangeRate.findMany({
      where: { quote: { in: unique } },
      select: { quote: true, rate: true },
    });
    const byQuote = new Map(rows.map((r) => [r.quote, r.rate]));
    for (const q of unique) {
      const rate = byQuote.get(q) ?? HARDCODED_USD_RATES[q];
      rateCache.set(q, { rate, expiresAt: Date.now() + CACHE_TTL_MS });
    }
  } catch {
    // Same fallback shape as getUsdRate — never block render on
    // FX availability.
    for (const q of unique) {
      rateCache.set(q, {
        rate: HARDCODED_USD_RATES[q],
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    }
  }
}

/**
 * Convert a local-currency amount to USD. Used when the recruiter
 * saves a job — we compute `salaryUsdCanonical = midpoint × rate`
 * once at save time so cross-country ranking is a single
 * sortable column instead of a per-query conversion. Returns null
 * when the input is null/zero so the caller can write null into
 * `salaryUsdCanonical` directly.
 */
export async function convertToUsd(
  amount: number | null | undefined,
  fromCountry: Country,
): Promise<number | null> {
  if (!amount || amount <= 0) return null;
  const rate = await getUsdRate(fromCountry);
  if (rate <= 0) return null;
  return amount / rate;
}

/**
 * Compute the canonical USD midpoint for a salary band. Used by
 * the job-create/update path. If both min and max are present,
 * uses (min+max)/2; otherwise falls back to whichever is set.
 *
 * Returns null when the band is empty or hidden — `salaryHidden`
 * jobs intentionally don't surface a comparable USD figure.
 */
export async function computeSalaryUsdCanonical(opts: {
  min: number | null;
  max: number | null;
  /**
   * Country whose currency the min/max are expressed in. We pass
   * a Country (not a raw currency string) to leverage the closed
   * supported-country set + its hardcoded fallback table. For
   * legacy jobs where currency might be something exotic like
   * "EUR" without a matching Country, the caller can pass `null`
   * here and we'll skip the conversion (returns null).
   */
  country: Country | null;
  salaryHidden: boolean;
}): Promise<number | null> {
  if (opts.salaryHidden) return null;
  if (!opts.country) return null;
  const midpoint =
    opts.min && opts.max
      ? (opts.min + opts.max) / 2
      : (opts.max ?? opts.min ?? null);
  if (midpoint == null) return null;
  return convertToUsd(midpoint, opts.country);
}

/**
 * The result shape `formatLocalSalary` returns. Two strings the
 * caller can render independently — the JobCard typically shows
 * both on one line; the detail page splits them.
 */
export interface FormattedSalary {
  /** "₹3.6L–₹5.2L /mo" — viewer's local currency. */
  local: string;
  /** "AED 18,000–24,000 /mo" — exactly what the recruiter posted. */
  original: string;
  /** Convenience: `"${local} (${original})"` when local !== original. */
  display: string;
}

/**
 * Format a salary band in BOTH the viewer's local currency AND
 * the recruiter's original currency. The local-first framing
 * matches what every cross-border platform does (LinkedIn,
 * Glassdoor) — primary value is what makes sense to the viewer,
 * paren shows the source of truth.
 *
 * When viewer and recruiter share a currency (same country, or
 * cross-country with happens-to-match currency), `local` and
 * `original` are identical and `display` collapses to just one
 * string with no parens.
 *
 * Uses `getUsdRateSync` so this function is synchronous —
 * callers must `prewarmRates` for the relevant countries first
 * if rendering many of these.
 */
export function formatLocalSalary(opts: {
  min: number | null;
  max: number | null;
  originalCurrency: string;
  /** The country the salary was posted in — for fallback to
   *  hardcoded rate when the currency code doesn't match any
   *  supported country (legacy data). */
  postedFromCountry: Country | null;
  /** Country the viewer wants to see the salary in. Defaults to
   *  the platform default (India) when no signal is available. */
  viewerCountry?: Country;
  period?: "YEARLY" | "MONTHLY" | null;
  salaryHidden?: boolean;
}): FormattedSalary | null {
  if (opts.salaryHidden) return null;
  if (!opts.min && !opts.max) return null;

  const period = opts.period;
  const suffix = period === "MONTHLY" ? " /mo" : period === "YEARLY" ? " /yr" : "";

  const original = formatBand(opts.min, opts.max, opts.originalCurrency, suffix);
  const viewerCountry = opts.viewerCountry ?? DEFAULT_COUNTRY;
  const viewerCurrency = SUPPORTED_COUNTRIES[viewerCountry].currency;

  // No conversion when the viewer's currency matches what the
  // recruiter posted in (most common case for single-country
  // platforms). Skip the round-trip.
  if (viewerCurrency === opts.originalCurrency) {
    return { local: original, original, display: original };
  }

  // Conversion path. We use:
  //   posted → USD → viewer
  // via the hardcoded / cached USD rates. If the posted currency
  // doesn't have a matching country mapping (exotic legacy
  // data — e.g. a job with currency=EUR), we skip and show
  // original only.
  const postedCountry = opts.postedFromCountry;
  if (!postedCountry) {
    return { local: original, original, display: original };
  }
  const postedToUsd = getUsdRateSync(postedCountry);
  const usdToViewer = getUsdRateSync(viewerCountry);
  if (postedToUsd <= 0 || usdToViewer <= 0) {
    return { local: original, original, display: original };
  }
  const convert = (n: number) => (n / postedToUsd) * usdToViewer;

  const localMin = opts.min != null ? convert(opts.min) : null;
  const localMax = opts.max != null ? convert(opts.max) : null;
  const local = formatBand(localMin, localMax, viewerCurrency, suffix);

  const display = local === original ? local : `${local} (${original})`;
  return { local, original, display };
}

/**
 * Render a band of two numbers in one currency. Used internally
 * by `formatLocalSalary` for both the original AND local sides.
 *
 * INR gets the lakh/crore treatment (`₹3.6L`); other currencies
 * use `Intl.NumberFormat` with the right symbol and a rounding
 * scheme that keeps the printed number legible (no trailing
 * `.00` on whole numbers, two decimals on fractions, kilo-grouping
 * via locale defaults).
 */
function formatBand(
  min: number | null,
  max: number | null,
  currency: string,
  suffix: string,
): string {
  if (min == null && max == null) return "Not disclosed";
  if (currency === "INR") {
    if (min != null && max != null) return `${formatINR(min)} – ${formatINR(max)}${suffix}`;
    return `${formatINR(min ?? max!)}${suffix}`;
  }
  const formatOne = (n: number) => formatGenericCurrency(n, currency);
  if (min != null && max != null) return `${formatOne(min)}–${formatOne(max)}${suffix}`;
  return `${formatOne(min ?? max!)}${suffix}`;
}

/**
 * INR-specific formatter — lakh / crore. ₹3.5L = ₹350,000;
 * ₹1.2Cr = ₹12,000,000. Familiar to any Indian candidate; jarring
 * to anyone else, which is why we only use it for currency=INR.
 */
function formatINR(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(amount % 10_000_000 === 0 ? 0 : 1)}Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(amount % 100_000 === 0 ? 0 : 1)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(amount % 1_000 === 0 ? 0 : 0)}k`;
  return `₹${amount}`;
}

/**
 * Generic currency formatter for non-INR currencies. Uses
 * `Intl.NumberFormat` with the right locale for nice grouping +
 * compact display when amounts are large (e.g. `$120k` vs
 * `$120,000`). Rounds to integer for whole-number inputs so we
 * don't print `£3,500.00` when the recruiter typed `3500`.
 */
function formatGenericCurrency(amount: number, currency: string): string {
  const meta = Object.values(SUPPORTED_COUNTRIES).find((c) => c.currency === currency);
  // Use compact notation for amounts ≥ 10,000 — keeps cards tight.
  // The recruiter-side ATS / job-detail page still gets the full
  // value because they use the `original` string (not the `local`).
  const compact = amount >= 10_000;
  try {
    const formatter = new Intl.NumberFormat(meta?.locale ?? "en-US", {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 1,
      minimumFractionDigits: 0,
    });
    return formatter.format(amount);
  } catch {
    // Unknown currency code — fall back to `{symbol} {amount}`.
    return `${meta?.currencySymbol ?? currency} ${Math.round(amount).toLocaleString()}`;
  }
}

/**
 * Public export of the hardcoded table — the FX worker reads
 * this on first run to seed any missing rows. Frozen so a
 * caller can't accidentally mutate the source-of-truth values.
 */
export const HARDCODED_USD_RATES_TABLE: Readonly<Record<Country, number>> =
  Object.freeze({ ...HARDCODED_USD_RATES });
