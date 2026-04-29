"use client";

import { useEffect } from "react";
import { googleTranslateCodeFor, locales } from "@/lib/i18n";

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    google?: any;
  }
}

/**
 * Mounts Google Translate's element widget so the entire page can be
 * machine-translated to whichever locale the user picks in the
 * language switcher (Hindi, Tamil, Telugu, Marathi, German, Arabic,
 * Chinese, French, Japanese — see `lib/i18n.ts`).
 *
 * How it works end-to-end:
 *   1. This component injects the widget script once on first mount.
 *   2. The widget reads a `googtrans` cookie on every page load.
 *      A value like `/en/hi` means "translate the page from English
 *      to Hindi"; an empty/absent cookie means "leave it in English".
 *   3. The language switcher writes that cookie when the user picks a
 *      language, then hard-reloads — so the widget initialises against
 *      the new cookie state and translates the freshly-rendered DOM.
 *
 * The widget itself ships with its own dropdown UI that we don't
 * want a duplicate of — that UI is hidden via CSS in
 * `app/globals.css` (.skiptranslate / .goog-te-* selectors). Our own
 * <LanguageSwitcher/> drives the experience.
 *
 * Caveats:
 *   - Google Translate's accuracy on niche EV terminology
 *     (BMS, OCPP, AIS-156) varies — accept some imperfection.
 *   - The widget runs after hydration, so users on Hindi see a brief
 *     flash of English on first paint. Acceptable for v1.
 *   - If the script fails to load (adblockers / firewalls), the page
 *     stays in English. We fail silent rather than showing an error.
 */
export function GoogleTranslateLoader() {
  useEffect(() => {
    // Already loaded in a previous mount? Don't double-inject the
    // <script>; React 19 strict-mode + client navigation can re-run
    // this effect even though the script tag persists across renders.
    if (document.getElementById("google-translate-script")) return;

    // The widget calls `googleTranslateElementInit()` after load.
    // Define it on `window` first so the script finds it.
    window.googleTranslateElementInit = () => {
      try {
        // Build the widget against every supported locale's GT code.
        const includedLanguages = locales
          .map((l) => googleTranslateCodeFor[l])
          .filter(Boolean)
          .join(",");
        new window.google.translate.TranslateElement(
          {
            pageLanguage: "en",
            includedLanguages,
            layout:
              window.google.translate.TranslateElement.InlineLayout.SIMPLE,
            // Don't auto-pop the "Translate this page?" banner — our
            // own switcher decides when to translate.
            autoDisplay: false,
          },
          "google_translate_element",
        );
      } catch {
        /* widget failed to init; site stays in English */
      }
    };

    const script = document.createElement("script");
    script.id = "google-translate-script";
    script.src =
      "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Hidden host element the widget mounts into. The widget normally
  // renders its own dropdown here — globals.css hides it because we
  // already provide a switcher in the site header.
  return (
    <div
      id="google_translate_element"
      style={{ display: "none" }}
      aria-hidden
    />
  );
}
