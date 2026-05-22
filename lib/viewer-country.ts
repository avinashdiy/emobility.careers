import "server-only";
import { headers, cookies } from "next/headers";
import type { Country } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { coerceCountry, isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

/**
 * Resolve the viewing user's country for purposes of localised
 * display (currency formatting, default time-zone, "trending in
 * your country" feed lens). Server-only — uses the auth session,
 * cookies, and request headers.
 *
 * Four-step precedence (highest priority first):
 *
 *   1. **Logged-in user's `User.country`** — captured at signup
 *      (PR 1), so a UK candidate who signed up from London sees
 *      UK formatting even when browsing from a holiday in India.
 *      This is the strongest signal: it's their declared home.
 *
 *   2. **`emce_country` cookie** — set by the header
 *      `CountrySelector` (PR 2) when the visitor explicitly
 *      changes country. Wins over IP because it's a deliberate
 *      choice. Anonymous visitors mostly travel through this
 *      path after their first session.
 *
 *   3. **IP geolocation header** — `cf-ipcountry` from
 *      Cloudflare (production) or `x-vercel-ip-country` (Vercel
 *      preview). The first-visit signal for anonymous users.
 *
 *   4. **`DEFAULT_COUNTRY` (India)** — local dev, exotic CDN
 *      paths, unknown geo. Matches the platform's primary user
 *      base so the wrong default isn't a damaging one.
 *
 * Returns a valid `Country` enum value always — every step
 * gracefully falls through to the next on failure, so callers
 * never have to handle null.
 */
export async function getViewerCountry(): Promise<Country> {
  // 1. Logged-in user
  try {
    const session = await auth();
    if (session?.user?.id) {
      const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { country: true },
      });
      if (user?.country) return user.country;
    }
  } catch {
    // Auth lookup failed — keep going, anonymous-fallback path
    // is still valid.
  }

  // 2. Cookie (set by CountrySelector in PR 2)
  try {
    const ck = await cookies();
    const cookieCountry = ck.get("emce_country")?.value;
    if (isSupportedCountry(cookieCountry)) {
      return cookieCountry as Country;
    }
  } catch {
    // cookies() throws outside a request context — fall through.
  }

  // 3. IP header
  try {
    const h = await headers();
    const ipCountry = h.get("cf-ipcountry") ?? h.get("x-vercel-ip-country");
    if (ipCountry) {
      const coerced = coerceCountry(ipCountry);
      // coerceCountry falls back to DEFAULT_COUNTRY for unsupported
      // values, so this branch only "wins" when the header gave us
      // a supported one. (Otherwise we don't distinguish IP-fallback
      // from no-IP-signal-at-all, which is fine — both should land
      // on DEFAULT_COUNTRY below.)
      if (isSupportedCountry(ipCountry.toUpperCase())) {
        return coerced;
      }
    }
  } catch {
    // headers() outside request context.
  }

  // 4. Platform default
  return DEFAULT_COUNTRY;
}
