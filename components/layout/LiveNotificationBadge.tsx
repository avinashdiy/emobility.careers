"use client";

import { useEffect, useState } from "react";
import PusherClient from "pusher-js";

interface Props {
  /** Server-rendered count at request time. The component takes over
      after mount and increments on each live event. */
  initialCount: number;
  /** Recipient user id — drives the private channel subscription. */
  userId: string;
  /** Pusher / Soketi public config — passed in so the parent server
      component can read it once and the child stays a clean client. */
  pusherKey: string;
  pusherHost: string;
  pusherPort: number;
}

/**
 * Live counter for the header bell. Renders the same red pill the old
 * server-rendered badge did, but mounts as a client component so it
 * can subscribe to `private-user-{id}` over Soketi and increment on
 * every incoming notification. Falls back gracefully (just shows the
 * server-rendered number) if Soketi is offline.
 *
 * The component also exposes a custom DOM event `notifications:reset`
 * so the inbox's "Mark all read" action can zero the badge without a
 * full page reload — see `dispatchEvent(new CustomEvent(...))` from
 * `/me/notifications/page.tsx`.
 */
export function LiveNotificationBadge({
  initialCount,
  userId,
  pusherKey,
  pusherHost,
  pusherPort,
}: Props) {
  const [count, setCount] = useState(initialCount);

  // Live increment via Soketi.
  useEffect(() => {
    if (!userId || !pusherKey) return;
    let pusher: PusherClient | null = null;
    try {
      pusher = new PusherClient(pusherKey, {
        wsHost: pusherHost,
        wsPort: pusherPort,
        wssPort: pusherPort,
        forceTLS: false,
        enabledTransports: ["ws", "wss"],
        cluster: "soketi",
        channelAuthorization: {
          endpoint: "/api/realtime/auth",
          transport: "ajax",
        },
      });
      const ch = pusher.subscribe(`private-user-${userId}`);
      ch.bind("notification", () => {
        setCount((c) => c + 1);
      });
    } catch {
      // Soketi outage — keep showing the SSR count, no blow-up.
    }
    return () => {
      pusher?.disconnect();
    };
  }, [userId, pusherKey, pusherHost, pusherPort]);

  // Cross-component reset signal. The inbox's "Mark all read" button
  // dispatches `notifications:reset` on `window`, which any rendered
  // badge picks up and resets to zero. Avoids prop-drilling state
  // through the entire layout tree.
  useEffect(() => {
    function onReset() {
      setCount(0);
    }
    window.addEventListener("notifications:reset", onReset);
    return () => window.removeEventListener("notifications:reset", onReset);
  }, []);

  if (count <= 0) return null;
  return (
    <span className="absolute right-0.5 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-emce-red px-1 text-[9px] font-bold text-white md:right-1 md:top-0.5">
      {count > 99 ? "99+" : count}
    </span>
  );
}
