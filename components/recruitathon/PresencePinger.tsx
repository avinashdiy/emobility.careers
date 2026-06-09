"use client";

import { useEffect } from "react";
import { pingPresence } from "@/server/recruitment-drives/registrations";

/**
 * Tiny presence beacon mounted on `/me/fairs/[slug]/pass` for
 * ONLINE / HYBRID candidates. Fires `pingPresence` on mount + every
 * 60 s while the tab is foregrounded. Combined with the >5 min
 * window on the live console's "online active now" query, this
 * gives the placement ops team a real-time headcount of
 * online-engaged candidates without any WebSocket / Soketi infra.
 *
 * The pinger ALSO pings once whenever the tab is brought back to the
 * foreground (visibilitychange) — covers the case where a candidate
 * had the pass open in a background tab and just switched back.
 *
 * No UI; the component returns null. Aria-live region not needed
 * because there's nothing to announce. Failures are silent —
 * pingPresence is best-effort and the user shouldn't see anything
 * when their connection blips.
 */
export function PresencePinger({ driveSlug }: { driveSlug: string }) {
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const fire = () => {
      if (cancelled) return;
      // Don't await — the response is just an ack. Errors swallowed.
      pingPresence(driveSlug).catch(() => undefined);
    };
    // Initial ping plus 60-s heartbeat. We intentionally skip the
    // first heartbeat tick (start the interval AFTER firing) so a
    // page reload doesn't double-ping in the first second.
    fire();
    intervalId = setInterval(fire, 60_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") fire();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [driveSlug]);

  return null;
}
