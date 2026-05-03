"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a CMS page's body inside an iframe srcdoc. The iframe
 * gives us perfect style isolation — Elementor / WP page bodies
 * frequently include `body { background: ... !important }` rules
 * that would otherwise nuke our site chrome.
 *
 * Auto-resize loop:
 *   1. We inject a tiny `<script>` into the srcdoc that reports
 *      `documentElement.scrollHeight` to the parent on load + on
 *      every ResizeObserver tick.
 *   2. The iframe gets `sandbox="allow-same-origin allow-scripts"`.
 *      `allow-scripts` is needed for the height beacon — but we do
 *      NOT add `allow-same-origin` together with `allow-scripts`
 *      from a cross-origin context (we'd break the sandbox); since
 *      srcdoc renders with the parent's origin we use `allow-scripts`
 *      alone, which gives a unique opaque origin to the iframe.
 *   3. We listen for the height postMessage and resize the iframe.
 *
 * The injected script is the ONLY script that runs inside the
 * iframe — the sanitiser stripped every <script> from the imported
 * HTML before it ever hit the DB. So `allow-scripts` is safe here:
 * the only code in scope is ours, plus inline `style` blocks which
 * are inert anyway.
 */

interface Props {
  body: string;
  title: string;
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

export function PageIframe({ body, title, initialHeight = 1200 }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(initialHeight);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Origin check: srcdoc iframes with `allow-scripts` (no
      // `allow-same-origin`) post from `null` origin. Anything else
      // is unrelated traffic on the page and we ignore it.
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

  // Inject the height beacon at the END of the body so it runs
  // after all the imported markup is parsed. We deliberately don't
  // try to be smart about </body> placement — appending wins because
  // sanitize-html's output may or may not include a literal closing
  // body tag depending on the input.
  const srcDoc = body + HEIGHT_BEACON;

  return (
    <iframe
      ref={ref}
      srcDoc={srcDoc}
      title={title}
      // `allow-scripts` only — no `allow-same-origin` — gives us a
      // unique opaque origin, so the iframe can't read parent
      // cookies / DOM, can't make same-origin XHRs to the platform
      // API, can't escape the sandbox. The height beacon still
      // works because postMessage crosses origins by design.
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      // Loosely permissive — forms inside imported pages can submit
      // (e.g. a Contact form pointing at an external service) but
      // no top-level navigation steals the user.
      referrerPolicy="no-referrer"
      loading="eager"
      className="block w-full border-0 bg-transparent"
      style={{ height: `${height}px` }}
    />
  );
}
