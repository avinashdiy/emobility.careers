"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Globe } from "lucide-react";
import type { Country } from "@prisma/client";
import { SUPPORTED_COUNTRY_LIST, SUPPORTED_COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";
import { countryUrl } from "@/lib/seo/hreflang";

/**
 * Header country switcher — mirrors LinkedIn's globe icon in the
 * top right, lets a visitor jump between country surfaces with one
 * click. Cookies the chosen country so the next visit hydrates on
 * the right URL.
 *
 * Three behaviours:
 *
 *   1. **Visual signal** — the currently-active country's flag is
 *      always visible in the trigger button, so a UAE user
 *      browsing /uk knows their "primary" is still UAE without
 *      opening the menu.
 *
 *   2. **Cross-country navigation** — clicking a country
 *      navigates to that country's landing page (`/uk`, `/ae`,
 *      etc.). Lighter touch than a routing middleware that
 *      rewrites every URL — for v1 the country pages are enough
 *      to satisfy the "GSC global presence" goal without forcing
 *      every existing URL to change.
 *
 *   3. **Preference persistence** — selection writes a
 *      `emce_country` cookie (1-year max-age, SameSite=Lax) so
 *      future surfaces (currency display, default job filters,
 *      time-zone for interviews) can honour the user's chosen
 *      country without re-asking.
 *
 * Server component callers pass `currentCountry` — usually the
 * logged-in user's `User.country`, falling back to
 * `DEFAULT_COUNTRY` for anonymous visitors. Authenticated users
 * who change here ALSO get a server-side persistence write later
 * (PR 3 wires the /me/settings sync); for v1, the cookie is the
 * source of truth on every visit.
 */

interface CountrySelectorProps {
  /**
   * The country whose flag shows in the trigger. Pass the
   * authenticated user's `User.country`, or `DEFAULT_COUNTRY` for
   * anonymous visitors. Optional — defaults to `DEFAULT_COUNTRY`.
   */
  currentCountry?: Country;
}

export function CountrySelector({
  currentCountry = DEFAULT_COUNTRY,
}: CountrySelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const meta = SUPPORTED_COUNTRIES[currentCountry];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      window.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /**
   * Set the cookie + close the menu. Returns true so the Link's
   * default navigation behaviour proceeds (we DON'T preventDefault
   * — we want the page to load on the target country).
   */
  function handlePick(country: Country) {
    // 1 year = 31536000 seconds. SameSite=Lax so navigation cookies
    // attach but cross-site POSTs don't (CSRF defence). Path=/ so
    // every surface reads the same value.
    document.cookie = `emce_country=${country}; path=/; max-age=31536000; samesite=lax`;
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Country: ${meta.name}. Click to change.`}
        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-semibold text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
      >
        {/* Flag glyph reads visually first; the globe icon below
            is the universal-recognition fallback for users whose
            font doesn't render the regional-indicator emoji. */}
        <span aria-hidden className="text-base leading-none">
          {meta.flag}
        </span>
        <Globe className="h-3.5 w-3.5 sm:hidden" aria-hidden />
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-md border border-emce-border bg-white shadow-emce-lg"
        >
          <div className="border-b border-emce-border px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emce-text-muted">
              Choose your region
            </p>
            <p className="mt-0.5 text-[11px] text-emce-text-sec">
              Drives the jobs we surface and your default currency.
            </p>
          </div>
          <ul>
            {SUPPORTED_COUNTRY_LIST.map((c) => {
              const isActive = c.code === currentCountry;
              return (
                <li key={c.code}>
                  <Link
                    href={countryUrl(c.code)}
                    onClick={() => handlePick(c.code)}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-2 px-3 py-2 text-sm ${
                      isActive
                        ? "bg-emce-light-soft font-bold text-emce-darkest"
                        : "text-emce-text hover:bg-emce-light-soft/60"
                    }`}
                  >
                    <span aria-hidden className="text-base">
                      {c.flag}
                    </span>
                    <span className="flex-1">{c.name}</span>
                    {isActive && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emce-dark">
                        Current
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
