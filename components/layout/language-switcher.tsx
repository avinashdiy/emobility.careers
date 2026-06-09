"use client";

import { useTransition } from "react";
import { Globe } from "lucide-react";
import { setLocale } from "@/server/i18n/actions";
import {
  locales,
  localeNames,
  googleTranslateCodeFor,
  type Locale,
} from "@/lib/i18n";
import { REQUEST_TRANSLATE_EVENT } from "@/components/translate/GoogleTranslate";

/**
 * Sets the cookie that Google Translate's element widget reads on
 * every page load. Format: `/{src}/{target}` — e.g. `/en/hi` means
 * "translate the page from English to Hindi". Empty value (English)
 * clears the cookie across every domain/path scope Google might have
 * written it on, so we cleanly revert.
 */
function writeGoogleTranslateCookie(locale: Locale) {
  const target = googleTranslateCodeFor[locale];
  if (!target) {
    // Switching back to English — clear the cookie. Google sets it
    // on multiple scopes (root + bare host + leading-dot host), so
    // we have to clear them all to fully revert.
    const expire = "Thu, 01 Jan 1970 00:00:00 GMT";
    const host = window.location.hostname;
    document.cookie = `googtrans=; path=/; expires=${expire}`;
    document.cookie = `googtrans=; path=/; expires=${expire}; domain=${host}`;
    document.cookie = `googtrans=; path=/; expires=${expire}; domain=.${host}`;
    return;
  }
  // Persist for a year — matches our `emce_locale` cookie lifetime.
  document.cookie = `googtrans=/en/${target}; path=/; max-age=${365 * 24 * 60 * 60}`;
}

export function LanguageSwitcher({
  current,
  variant = "dark",
  displayMode = "icon",
}: {
  current: Locale;
  variant?: "light" | "dark";
  /**
   * "icon" — the original 9x9 globe-only trigger used in the header.
   * "pill" — wider trigger that renders the active locale's display
   * name next to the globe (e.g. "🌐 English"). Matches the footer's
   * inline-pill rhythm (Terms / Privacy / Cookies / Sitemap all read
   * as text). Defaults to "icon" so existing call-sites keep their
   * compact chrome.
   */
  displayMode?: "icon" | "pill";
}) {
  const [pending, start] = useTransition();
  const isPill = displayMode === "pill";

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newLocale = e.target.value as Locale;
    // Cookie has to flip BEFORE the reload so Google Translate's
    // widget reads the new value on next page load and translates
    // the freshly-rendered DOM. Doing this client-side avoids
    // round-tripping a cookie write through a server action.
    writeGoogleTranslateCookie(newLocale);

    // Ask the lazy GoogleTranslateLoader to inject the widget
    // script if it isn't already. Lighthouse flagged the eager
    // script load as a ~93 KB / 193 ms drag on every page —
    // including the 95%+ of homepage visits that stay in English.
    // The loader now sits idle until either the googtrans cookie
    // is present on mount, OR this event fires.
    if (newLocale !== "en" && typeof window !== "undefined") {
      window.dispatchEvent(new Event(REQUEST_TRANSLATE_EVENT));
    }

    start(async () => {
      // Server-side locale tracking — used by emails / WhatsApp
      // digest workers / any server-rendered string we hand-translate.
      await setLocale(newLocale);
      // Hard reload so the Google Translate widget re-initialises
      // against the new cookie. A soft Next.js navigation wouldn't
      // re-run the widget's bootstrap.
      window.location.reload();
    });
  }

  // Tone tokens for dark vs light surface. Pill mode adds a border so
  // it reads as a clickable target without hover (the footer is dark,
  // so the border alone has to carry "this is interactive").
  const toneClasses =
    variant === "dark"
      ? "text-white/85 hover:bg-white/10 hover:text-white focus-within:ring-offset-emce-darkest"
      : "text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-dark focus-within:ring-offset-white";

  const sizingClasses = isPill
    ? `gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold border ${
        variant === "dark" ? "border-white/20" : "border-emce-border"
      }`
    : "h-9 w-9 rounded-md";

  return (
    // Both modes overlay a native <select> on top of the visible
    // trigger so a tap/click opens the system picker. Options inside
    // the picker show the full language names ("EN · English") so
    // users know what they're choosing.
    <label
      className={`relative inline-flex items-center justify-center transition-colors focus-within:ring-2 focus-within:ring-emce-mid focus-within:ring-offset-2 ${toneClasses} ${sizingClasses} ${
        pending ? "opacity-60" : ""
      }`}
      aria-label="Choose your language"
      title="Choose your language — translates the site"
    >
      <Globe className={isPill ? "h-3 w-3" : "h-4 w-4"} aria-hidden />
      {isPill && <span className="leading-none">{localeNames[current]}</span>}
      <select
        value={current}
        disabled={pending}
        onChange={handleChange}
        className="absolute inset-0 cursor-pointer appearance-none bg-transparent text-transparent outline-none"
        aria-label="Choose language"
      >
        {locales.map((l) => (
          <option key={l} value={l} className="text-emce-text">
            {l.toUpperCase()} · {localeNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
