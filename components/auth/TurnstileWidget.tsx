"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile invisible widget. Renders a managed checkbox the
 * user solves once; the resulting token is set on a hidden input named
 * `cf-turnstile-response` which the surrounding <form> submits along
 * with everything else. The server action calls verifyTurnstile() with
 * that token before doing any DB work.
 *
 * If `siteKey` is null (i.e. NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset),
 * this component renders nothing. The server-side verify is a no-op in
 * that mode too, so the rest of the form continues to work uninterrupted.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        target: HTMLElement,
        opts: {
          sitekey: string;
          theme?: "light" | "dark" | "auto";
          appearance?: "always" | "execute" | "interaction-only";
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export function TurnstileWidget({ siteKey }: { siteKey: string | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !ref.current) return;

    function render() {
      if (!window.turnstile || !ref.current || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(ref.current, {
        sitekey: siteKey!,
        theme: "light",
        appearance: "always",
      });
    }

    if (window.turnstile) {
      render();
    } else {
      // Inject the script once. The Turnstile API auto-discovers any
      // .cf-turnstile element after load, but we render explicitly above
      // for tighter control over lifecycle.
      const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-loader]');
      if (!existing) {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.defer = true;
        s.dataset.turnstileLoader = "1";
        s.onload = render;
        document.head.appendChild(s);
      } else {
        existing.addEventListener("load", render);
      }
    }

    return () => {
      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore — Turnstile sometimes complains if the widget was
          // already removed by a parent unmount.
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={ref} className="my-2" />;
}
