"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a CMS page's body inside an iframe srcdoc. The iframe
 * gives us perfect style isolation — Elementor / WP page bodies
 * frequently include `body { background: ... !important }` rules
 * that would otherwise nuke our site chrome.
 *
 * Two trust modes:
 *   • allowScripts=false (default) — sandbox is `allow-scripts` only.
 *     iframe gets a unique opaque origin; can't read parent cookies
 *     / DOM. Imported page <script> tags were stripped at the
 *     sanitiser layer, so the only JS that runs is our height beacon.
 *   • allowScripts=true — sandbox adds `allow-same-origin`. iframe
 *     shares the parent's origin, which lets pasted tools call our
 *     same-origin endpoints (`/api/ai/proxy`) without CORS, and lets
 *     relative URLs resolve. Use ONLY for admin-trusted pages — the
 *     iframe can read parent.document.cookie in this mode.
 *
 * Auto-resize loop:
 *   1. We inject a tiny `<script>` into the srcdoc that reports
 *      `documentElement.scrollHeight` to the parent on load + on
 *      every ResizeObserver tick.
 *   2. We listen for the height postMessage and resize the iframe.
 *
 * Base href injection:
 *   When the page is loaded via srcdoc, the iframe's base URL is
 *   `about:srcdoc` and relative URLs resolve to nothing useful.
 *   We inject `<base href="<originUrl>/">` into <head> so things
 *   like `fetch('/api/ai/proxy')` actually hit our origin.
 */

interface Props {
  body: string;
  title: string;
  /// True for admin-trusted pages (AI tools that call our proxy).
  /// False for "render this Elementor HTML safely in isolation".
  allowScripts?: boolean;
  /// Origin URL for the <base href="..."> injection. Defaults to
  /// the runtime origin via window.location, so passing this in is
  /// only needed when the parent isn't aware of where it lives
  /// (e.g. SSR previews).
  baseHref?: string;
  /// Initial height before the auto-resize loop kicks in. Picking a
  /// generous viewport-ish height avoids a flash of "tiny iframe"
  /// during first paint.
  initialHeight?: number;
}

const HEIGHT_BEACON = `<script>
(function(){
  function send(){
    try {
      var h = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      parent.postMessage({type:'cms-iframe-height',h:h}, '*');
    } catch(e){}
  }
  send();
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(send).observe(document.documentElement);
  }
  window.addEventListener('load', send);
  // Backstop for slow-loading images / fonts that change layout
  // after the initial ResizeObserver tick.
  setTimeout(send, 500);
  setTimeout(send, 1500);
  setTimeout(send, 3000);
})();
</script>`;

export function PageIframe({
  body,
  title,
  allowScripts = false,
  baseHref,
  initialHeight = 1200,
}: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(initialHeight);
  const [resolvedBase, setResolvedBase] = useState(baseHref ?? "");

  // Resolve the base href on the client when not passed in. We
  // can't read window.location at module-load time (RSC boundary),
  // so this useEffect fires once after mount.
  useEffect(() => {
    if (!baseHref && typeof window !== "undefined") {
      setResolvedBase(window.location.origin + "/");
    }
  }, [baseHref]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== ref.current?.contentWindow) return;
      const data = e.data as { type?: string; h?: number } | undefined;
      if (!data || data.type !== "cms-iframe-height" || typeof data.h !== "number") return;
      // Clamp to a sane range — guards against a 0 from a transient
      // "before-load" tick (collapsing to 0 looks like a broken
      // page) and against a runaway report (a bug report we got on
      // similar code once was a 99999px iframe).
      const clamped = Math.max(400, Math.min(20000, Math.round(data.h)));
      setHeight(clamped);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Inject <base href> at the very top of the srcdoc. This makes
  // relative URLs (`/api/ai/proxy`, `./image.png`, etc) inside
  // pasted tool HTML resolve to our origin even though the
  // iframe's effective base URL is `about:srcdoc`.
  //
  // The HEIGHT_BEACON goes at the END so it runs after all of the
  // pasted DOM is parsed.
  const baseTag = resolvedBase
    ? `<base href="${escapeHtmlAttr(resolvedBase)}">`
    : "";
  const srcDoc = baseTag + body + HEIGHT_BEACON;

  // Sandbox flags. `allow-scripts` is always set (we need the
  // height beacon). `allow-same-origin` is conditional on the
  // trust toggle — see the docstring.
  const sandboxFlags = [
    "allow-scripts",
    "allow-popups",
    "allow-popups-to-escape-sandbox",
    "allow-forms",
    ...(allowScripts ? ["allow-same-origin"] : []),
  ].join(" ");

  return (
    <iframe
      ref={ref}
      srcDoc={srcDoc}
      title={title}
      sandbox={sandboxFlags}
      referrerPolicy="no-referrer"
      loading="eager"
      className="block w-full border-0 bg-transparent"
      style={{ height: `${height}px` }}
    />
  );
}

/** Minimal HTML-attribute escape — no full HTML rendering needed. */
function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
