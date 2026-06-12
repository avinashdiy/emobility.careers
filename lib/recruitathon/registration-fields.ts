/**
 * Shared option lists for the Recruitathon candidate-registration form.
 *
 * Plain module (no "use client" / "server-only") so BOTH the client
 * form (components/recruitathon/CandidateRegisterForm) and the server
 * action (server/recruitathon/register-actions) import the SAME source
 * of truth — the form renders the options, the action validates against
 * them. Keeping them here prevents the two from drifting apart.
 */

/** Highest-qualification options (matches the placement team's form). */
export const QUALIFICATION_OPTIONS = [
  "Diploma",
  "B.Tech / B.E.",
  "M.Tech / M.E.",
  "B.Sc.",
  "M.Sc.",
  "MBA",
  "Other",
] as const;
export type Qualification = (typeof QUALIFICATION_OPTIONS)[number];

/**
 * Preferred EV-domain options. `slug` matches the canonical EVDomain
 * rows in the DB so the registration action can seed CandidateEVDomain
 * links (the platform's EV-matching signal — previously never populated
 * at signup). `label` is what the student sees.
 */
export const RECRUITATHON_EV_DOMAINS = [
  { slug: "battery-tech", label: "Battery Tech (BMS, cells)" },
  { slug: "charging-infra", label: "Charging Infrastructure" },
  { slug: "powertrain", label: "Powertrain" },
  { slug: "motor-control", label: "Motor & Power Electronics" },
  { slug: "vehicle-engineering", label: "Vehicle Engineering" },
  { slug: "software-iot", label: "Software & IoT" },
  { slug: "manufacturing", label: "EV Manufacturing" },
  { slug: "fleet-mobility", label: "Fleet & Mobility" },
] as const;

export const RECRUITATHON_EV_DOMAIN_SLUGS: readonly string[] =
  RECRUITATHON_EV_DOMAINS.map((d) => d.slug);

export const RECRUITATHON_EV_DOMAIN_LABEL: Record<string, string> =
  Object.fromEntries(RECRUITATHON_EV_DOMAINS.map((d) => [d.slug, d.label]));

/** Max EV domains a candidate may pick (mirrors the old Google form). */
export const MAX_EV_DOMAINS = 3;

/**
 * Graduation-year dropdown range — current-year-minus-8 through
 * current-year-plus-6, newest first. Computed from a passed-in year so
 * the value stays stable for any caller (server actions can't call
 * `new Date()` at module load in some contexts; the form passes the
 * client year, the action validates a 4-digit string).
 */
export function graduationYearOptions(currentYear: number): number[] {
  const years: number[] = [];
  for (let y = currentYear + 6; y >= currentYear - 8; y--) years.push(y);
  return years;
}
