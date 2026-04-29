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
}: {
  current: Locale;
  variant?: "light" | "dark";
}) {
  const [pending, start] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newLocale = e.target.value as Locale;
    // Cookie has to flip BEFORE the reload so Google Translate's
    // widget reads the new value on next page load and translates
    // the freshly-rendered DOM. Doing this client-side avoids
    // round-tripping a cookie write through a server action.
    writeGoogleTranslateCookie(newLocale);

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

  return (
    <label
      className={`inline-flex items-center gap-1 rounded-md px-2 text-xs font-bold ${
        variant === "dark" ? "text-white/80 hover:text-white" : "text-emce-text-sec hover:text-emce-dark"
      } ${pending ? "opacity-60" : ""}`}
      aria-label="Language"
      title="Language"
    >
      <Globe className="h-4 w-4" />
      <select
        value={current}
        disabled={pending}
        onChange={handleChange}
        className={`bg-transparent text-xs font-bold uppercase tracking-wide outline-none ${
          variant === "dark" ? "text-white/80" : "text-emce-text-sec"
        }`}
      >
        {/* Closed-state label: ISO code (EN / HI / TA / TE / MR /
            DE / AR / ZH / FR / JA). Compact enough for mobile
            headers but still recognisable. Open dropdown shows the
            language name in its native script next to the code so a
            user who can't read English still finds their language. */}
        {locales.map((l) => (
          <option key={l} value={l} className="text-emce-text">
            {l.toUpperCase()} · {localeNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
