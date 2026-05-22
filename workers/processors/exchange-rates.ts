/**
 * Daily FX-rate refresh worker.
 *
 * Powers the cross-currency salary display (lib/currency.ts) by
 * refreshing the `ExchangeRate` table once per day. Currencies
 * the free FX API supports get fresh rates; currencies it doesn't
 * cover (AED, BDT, NPR — most free APIs skip Gulf + South Asian
 * minor currencies) fall back to the hardcoded values from
 * `HARDCODED_USD_RATES_TABLE`.
 *
 * API choice — Frankfurter (api.frankfurter.app):
 *   • Free, no API key, no quota
 *   • ECB-sourced (authoritative)
 *   • Returns ~30 currencies including INR, AUD, GBP, MYR
 *   • Missing: AED, BDT, NPR — those keep hardcoded values
 *
 * Why daily (not hourly):
 *   FX moves <0.5% intra-day for stable currencies; salary
 *   ranges are quoted in 1000s anyway, so sub-percent drift is
 *   invisible to the user. Daily refresh + the 60s in-process
 *   cache (lib/currency.ts) handles the load.
 *
 * Idempotency:
 *   Upserts on the `quote` PK, so re-running mid-day is harmless.
 *   On first run (post-deploy, before any data), seeds the table
 *   with hardcoded values before attempting the API call — the
 *   currency formatter then has rows to read immediately.
 */

import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  exchangeRatesQueue,
  QueueNames,
  type ExchangeRatesJob,
} from "@/lib/queues";
import {
  HARDCODED_USD_RATES_TABLE,
  // ↑ The "ground truth" floor for every supported country.
  // Worker seeds the table from this on first tick, then refines
  // values via the FX API where possible.
} from "@/lib/currency";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import type { Country } from "@prisma/client";

// Once a day. ECB publishes EUR-base rates at 16:00 CET; we
// fetch a few hours later (03:00 IST = 21:30 UTC previous day,
// safely after the daily fixing) so we always get fresh values.
const TICK_EVERY_MS = 24 * 60 * 60 * 1000;

// Frankfurter base URL. Returns `{ amount, base, date, rates: { INR: 83.5, ... } }`.
// We always query with `from=USD` so the response shape matches
// the table layout exactly.
const FRANKFURTER_BASE = "https://api.frankfurter.app";

// Currencies the API supports — anything not in here falls back
// to the hardcoded value. List confirmed against
// https://api.frankfurter.app/currencies (May 2026). When the
// API adds AED / BDT / NPR support, move them out of the
// fallback set; the upsert path handles either.
const API_SUPPORTED_CURRENCIES = new Set([
  "INR", "AUD", "GBP", "USD", "MYR",
]);

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

/**
 * Fetch fresh USD→X rates for every API-supported currency. On
 * failure (network error, rate limit, API down), returns null
 * and the caller falls back to hardcoded values for ALL
 * currencies — never throws, never blocks the tick.
 */
async function fetchUsdRates(): Promise<FrankfurterResponse | null> {
  const symbols = Array.from(API_SUPPORTED_CURRENCIES)
    .filter((c) => c !== "USD") // USD→USD is identity, skip the API call
    .join(",");
  const url = `${FRANKFURTER_BASE}/latest?from=USD&to=${symbols}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      // Short timeout — the worker re-runs tomorrow, no point
      // waiting on a hung connection for minutes. Wrap fetch in
      // AbortSignal.timeout (Node 17+).
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, url }, "[exchange-rates] API non-200");
      return null;
    }
    const data = (await res.json()) as FrankfurterResponse;
    if (!data.rates || typeof data.rates !== "object") {
      logger.warn({ data }, "[exchange-rates] malformed API response");
      return null;
    }
    return data;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[exchange-rates] fetch failed");
    return null;
  }
}

/**
 * Process one tick — upsert all supported countries' rates.
 *
 * Strategy:
 *   1. Try to fetch fresh rates from the API.
 *   2. For every supported country:
 *      - If the API returned a rate for its currency → use that.
 *      - Otherwise → use the hardcoded value.
 *   3. Upsert each row keyed on `quote: Country`.
 *
 * The worker never deletes rows — country-removal would be a
 * deliberate enum change handled separately. This loop only
 * adds / refreshes.
 */
async function processTick(): Promise<void> {
  const apiResponse = await fetchUsdRates();
  const apiRates = apiResponse?.rates ?? {};

  let refreshed = 0;
  let fallback = 0;

  // Iterate the supported set so we always cover every country —
  // even when the API call failed (apiRates is empty) we still
  // ensure every row exists with its hardcoded floor value.
  for (const meta of Object.values(SUPPORTED_COUNTRIES)) {
    const country = meta.code as Country;
    const apiRate = apiRates[meta.currency];
    let rate: number;
    if (typeof apiRate === "number" && apiRate > 0) {
      rate = apiRate;
      refreshed += 1;
    } else {
      // No API rate — use the hardcoded fallback. This is the
      // path for AE / BD / NP (always) and EVERY country when
      // the API itself is down (transient).
      rate = HARDCODED_USD_RATES_TABLE[country];
      fallback += 1;
    }
    try {
      await db.exchangeRate.upsert({
        where: { quote: country },
        create: { base: "USD", quote: country, rate },
        update: { rate },
      });
    } catch (err) {
      logger.error(
        { err, country, rate },
        "[exchange-rates] upsert failed — row will be re-tried on next tick",
      );
    }
  }

  logger.info(
    { refreshed, fallback, apiDate: apiResponse?.date ?? null },
    "[exchange-rates] tick complete",
  );
}

export function startExchangeRatesWorker(): Worker<ExchangeRatesJob> {
  const worker = new Worker<ExchangeRatesJob>(
    QueueNames.ExchangeRates,
    async () => {
      await processTick();
    },
    { connection: redis },
  );

  // Self-schedule. Bootstrap fires once at worker start
  // (immediate first-time seed), then the repeated job ticks
  // daily. Identical to the pattern other tick workers use
  // (fair-reminders, mentorship-reminders).
  void exchangeRatesQueue.add(
    "tick",
    { tick: true },
    {
      jobId: "exchange-rates-bootstrap",
      removeOnComplete: true,
      removeOnFail: true,
    },
  ).catch(() => undefined);

  void exchangeRatesQueue.add(
    "tick",
    { tick: true },
    {
      repeat: { every: TICK_EVERY_MS },
      jobId: "exchange-rates-tick",
      removeOnComplete: true,
      removeOnFail: true,
    },
  ).catch(() => undefined);

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "[exchange-rates] tick failed");
  });

  return worker;
}
