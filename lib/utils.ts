import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function formatINR(amount: number | null | undefined): string {
  if (amount == null) return "—";
  if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(1)} Cr`;
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(1)} L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(0)}K`;
  return `₹${amount}`;
}

/**
 * Render a salary band for display on job cards / detail pages.
 *
 * `period` is the cadence the band is quoted against:
 *   - "YEARLY" → suffix "/yr" (default — matches the pre-migration
 *     assumption that every row in the DB was annual).
 *   - "MONTHLY" → suffix "/mo" (used for internships, contract
 *     stipends, part-time gigs).
 *
 * Pass `null`/`undefined` to skip the suffix entirely (e.g. when the
 * caller renders its own "per month / per year" label nearby).
 */
export function formatSalaryRange(
  min?: number | null,
  max?: number | null,
  currency: string = "INR",
  period?: "YEARLY" | "MONTHLY" | null,
): string {
  if (!min && !max) return "Not disclosed";
  const suffix =
    period === "MONTHLY" ? " /mo" : period === "YEARLY" ? " /yr" : "";
  if (currency === "INR") {
    if (min && max) return `${formatINR(min)} – ${formatINR(max)}${suffix}`;
    return `${formatINR(min ?? max)}${suffix}`;
  }
  return `${currency} ${min ?? max}${suffix}`;
}

export function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatMonthYear(d);
}

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-IN", { year: "numeric", month: "short" });
const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", { year: "numeric", month: "short", day: "numeric" });
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});

/** "Mar 2024" — used on experience timelines and certifications. */
export function formatMonthYear(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return MONTH_FORMATTER.format(d);
}

/** "5 Mar 2024" — used for application dates etc. */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return DATE_FORMATTER.format(d);
}

/** "5 Mar 2024, 3:30 pm" — used for interview times. */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return DATE_TIME_FORMATTER.format(d);
}
