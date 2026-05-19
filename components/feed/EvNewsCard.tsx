import { getEvNews } from "@/lib/news/ev-news";
import { Card } from "@/components/ui/card";
import { Newspaper } from "lucide-react";

/**
 * "What's happening in EV industry" widget for the feed right rail.
 *
 * Server component — fetches Google News RSS via the cached
 * `getEvNews` helper (15-min TTL) so the widget doesn't add cost to
 * the feed render at scale. Returns null when the upstream fails or
 * has zero items so we don't show an empty placeholder.
 *
 * Each headline opens the publisher's article in a new tab. We use
 * the wrapped news.google.com/articles/CBM... URL because Google
 * News blocks server-side redirect-following — better to let the
 * user's browser follow the ~200ms hop than to fail trying to
 * resolve it ourselves.
 */
export async function EvNewsCard() {
  const items = await getEvNews(5);
  if (items.length === 0) return null;

  return (
    <Card>
      {/* Header — title on its own line so it never wraps + clashes
          with the attribution tag at the right. The attribution sits
          below as a small subtitle next to the section icon. Same
          pattern LinkedIn uses on its "LinkedIn News" widget. The
          underline divider gives the header a defined box feel
          without nesting another Card. */}
      <div className="flex items-start gap-2 border-b border-emce-border pb-2.5">
        <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-emce-darkest" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-section text-emce-text">EV industry news</h2>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-emce-mid-muted">
            via Google News · updated every 15 min
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item.url}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md p-2 -mx-2 transition hover:bg-emce-light-soft"
            >
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-emce-text group-hover:underline">
                {item.title}
              </p>
              <p className="mt-0.5 line-clamp-1 text-hint text-emce-text-muted">
                {item.sourceName ? item.sourceName : "EV news"}
                {" · "}
                {relativeShort(item.publishedAt)}
              </p>
            </a>
          </li>
        ))}
      </ul>
      <a
        href="https://news.google.com/search?q=electric+vehicle+EV+India"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block text-center text-xs font-semibold text-emce-dark hover:underline"
      >
        More on Google News →
      </a>
    </Card>
  );
}

/**
 * Compact "5m ago / 2h ago / 3d ago" formatter. The shared
 * `relativeTime` helper accepts Date; this wrapper takes an ISO
 * string + always returns short-form labels for sidebar density.
 */
function relativeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}
