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
 * Lazy-loaded Google Translate widget.
 *
 * Lighthouse-driven change: the widget script (~93 KB JS, ~193 ms
 * long task) used to load on every page render — including the
 * 95%+ of homepage visits from English-locale users who never
 * touch the language switcher. We now defer injection until one
 * of two signals fires:
 *
 *   1. The `googtrans` cookie is already set → the user has
 *      previously switched to a non-English locale, so the page
 *      genuinely needs translation. Inject on mount.
 *   2. The user actively changes the language via the
 *      <LanguageSwitcher> → it dispatches a
 *      `cms:request-translate` window event before its reload,
 *      and we listen for it. (Belt-and-braces — the reload
 *      path 1 covers it too once the cookie is set, but the
 *      event makes it a noop on first switch instead of waiting
 *      for the reload-then-cookie-read round trip.)
 *
 * The widget itself ships with its own dropdown UI that we don't
 * want a duplicate of — globals.css hides it. Our own
 * <LanguageSwitcher/> drives the experience.
 *
 * Caveats:
 *   - Google Translate's accuracy on niche EV terminology varies.
 *   - The widget runs after hydration, so users on Hindi see a
 *     brief flash of English on first paint. Acceptable for v1.
 *   - If the script fails to load, the page stays in English.
 *     Fail silent — no error UI.
 */

const SCRIPT_ID = "google-translate-script";
const REQUEST_EVENT = "cms:request-translate";

function hasGoogTransCookie(): boolean {
  if (typeof document === "undefined") return false;
  // Cookie format `googtrans=/en/<target>` — any non-empty value
  // counts as "user wants translation".
  const match = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
  if (!match) return false;
  const value = decodeURIComponent(match[1]);
  return value.length > 0 && value !== "/en/en";
}

function injectScript() {
  if (typeof document === "undefined") return;
  // Already injected? Don't double-load — React 19 strict-mode +
  // client navigation can re-run the effect even though the
  // script tag persists across renders.
  if (document.getElementById(SCRIPT_ID)) return;

  // The widget calls `googleTranslateElementInit()` after load.
  // Define it on `window` first so the script finds it.
  window.googleTranslateElementInit = () => {
    try {
      const includedLanguages = locales
        .map((l) => googleTranslateCodeFor[l])
        .filter(Boolean)
        .join(",");
      new window.google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages,
          layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
          autoDisplay: false,
        },
        "google_translate_element",
      );
    } catch {
      /* widget failed to init; site stays in English */
    }
  };

  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src =
    "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  script.async = true;
  document.head.appendChild(script);
}

export function GoogleTranslateLoader() {
  useEffect(() => {
    // Path 1 — cookie already set on mount.
    if (hasGoogTransCookie()) {
      injectScript();
      return;
    }
    // Path 2 — wait for the language switcher to ask for it.
    const onRequest = () => injectScript();
    window.addEventListener(REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(REQUEST_EVENT, onRequest);
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

/**
 * Public event name used by <LanguageSwitcher> to ask the loader
 * to inject. Exported so the switcher doesn't string-match the
 * event name in two places.
 */
export const REQUEST_TRANSLATE_EVENT = REQUEST_EVENT;
