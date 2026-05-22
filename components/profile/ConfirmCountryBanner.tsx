import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SUPPORTED_COUNTRY_LIST, SUPPORTED_COUNTRIES } from "@/lib/countries";
import { coerceCountry } from "@/lib/countries";
import {
  confirmCountry,
  snoozeCountryConfirmation,
} from "@/server/account/country-actions";

/**
 * One-question country-confirmation banner — rendered under the
 * site header for any signed-in user whose `countryConfirmedAt`
 * is null. The two populations that match:
 *
 *   1. The ~50k existing users whose `User.country` was backfilled
 *      to IN by PR 1 without their explicit input. ~99% are
 *      correctly Indian, but the 1% diaspora is sticky-stuck on
 *      the wrong default until we ask.
 *
 *   2. OAuth signups (Google + LinkedIn). They bypass the signup
 *      form's country dropdown (PR 1) and inherit the User-row
 *      default of IN. A Google-OAuth signup from UAE is currently
 *      tagged as Indian — wrong, sticky, invisible until this
 *      banner asks.
 *
 * UX shape:
 *   • Thin top-bordered strip mirroring CompleteProfileBanner +
 *     VerifyEmailBanner — fits the established "site-header
 *     notification rail" pattern.
 *   • Pre-fills the dropdown from `CF-IPCountry` (or the existing
 *     `User.country` if no IP signal) so the recommended answer
 *     is one-click confirm for 95% of users.
 *   • Two CTAs: "Save" (primary) and "Not now" (snoozes
 *     permanently). The pattern explicitly trades "we'll never
 *     ask again" for "tell us once" — re-prompting after dismiss
 *     would feel like nagging for a question that's already
 *     answered (silent confirmation of the default).
 *   • Submitted via native form action (no client JS) — works
 *     in degraded networks, screen readers, and the no-JS edge
 *     cases the platform serves in tier-2 / tier-3 markets.
 *
 * Hide-rules:
 *   • Auth routes (signin, signup, etc.) — banner would shadow
 *     the actual flow there.
 *   • Onboarding — user is mid-flow; don't interrupt.
 *   • Admin routes — admins have their own attention sinks;
 *     country isn't admin-relevant.
 *   • The /me/settings page itself once we add it — they're
 *     literally about to confirm there.
 *
 * Same `x-pathname` header trick the other banners use — no
 * useRouter, no client JS, zero CLS.
 */

const HIDE_ON_PATHS = [
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/onboarding",
  "/employer/onboarding",
  "/admin",
  "/me/settings",
  "/403",
  "/404",
];

export async function ConfirmCountryBanner() {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  if (HIDE_ON_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { country: true, countryConfirmedAt: true },
  });
  if (!user) return null;
  // Confirmed already → never re-prompt. The "Not now" snooze
  // also stamps this so dismissals are permanent (see action-file
  // comments for the rationale).
  if (user.countryConfirmedAt) return null;

  // Pre-fill the dropdown with the SMARTER of two signals: the
  // request's IP-geo country (live signal — where they are right
  // now), falling back to their stored `country` (the backfilled
  // default). IP wins when available because that's the real
  // "where I am". For the 99% of correctly-Indian users, both
  // signals agree and the dropdown shows IN — one-click confirm.
  const ipCountryHeader =
    h.get("cf-ipcountry") ?? h.get("x-vercel-ip-country");
  const recommended = ipCountryHeader
    ? coerceCountry(ipCountryHeader)
    : user.country;
  const recommendedMeta = SUPPORTED_COUNTRIES[recommended];

  return (
    <div
      role="status"
      className="border-b border-emce-border border-t-2 border-t-emce-mid bg-emce-light-bg"
    >
      <div className="container flex flex-wrap items-center gap-3 py-2 text-sm">
        <span aria-hidden="true" className="text-base">
          {recommendedMeta.flag}
        </span>
        <p className="min-w-0 flex-1 text-emce-text">
          <span className="font-bold">Confirm your country</span>{" "}
          <span className="text-emce-text-sec">
            so we show jobs, salaries, and time zones in your local format.
          </span>
        </p>
        <form
          action={confirmCountry}
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="returnTo" value={pathname || "/me"} />
          <label htmlFor="cc-banner-select" className="sr-only">
            Country
          </label>
          <select
            id="cc-banner-select"
            name="country"
            defaultValue={recommended}
            className="h-8 rounded-md border border-emce-border bg-white px-2 text-xs font-semibold text-emce-text focus:border-emce-mid focus:outline-none"
          >
            {SUPPORTED_COUNTRY_LIST.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded-md bg-emce-dark px-3 text-xs font-bold text-white hover:bg-emce-darkest"
          >
            Save
          </button>
        </form>
        {/* "Not now" — separate form so the click doesn't carry
            the country select value. Snooze permanently (see
            action-file rationale). */}
        <form action={snoozeCountryConfirmation}>
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded-md px-2 text-xs font-semibold text-emce-text-sec hover:text-emce-dark"
          >
            Not now
          </button>
        </form>
      </div>
    </div>
  );
}
