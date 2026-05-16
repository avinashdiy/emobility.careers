import Link from "next/link";
import { getSetting } from "@/lib/settings";
import { IconMark } from "@/components/brand/IconMark";

/**
 * Compact, LinkedIn-style footer for logged-in / inside pages. Renders as
 * an inline list of links + a small copyright line — the four-column
 * marketing footer would dominate on a feed/profile/jobs view, so we use
 * this lighter version everywhere except the public marketing pages.
 *
 * Visual reference: LinkedIn shows a wrapping list of small links
 * (About · Accessibility · Help Center · Privacy & Terms · …) below the
 * profile sidebar. Same pattern here.
 */
export async function CompactFooter() {
  const siteName = (await getSetting("site.name").catch(() => "")) || "eMobility Careers";
  const year = new Date().getFullYear();

  return (
    <footer className="mt-8 border-t border-emce-border bg-emce-light-bg py-4 dark:border-border dark:bg-background">
      <div className="container flex flex-col items-center gap-2">
        <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-emce-text-sec dark:text-muted-foreground">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="hover:text-emce-text hover:underline dark:hover:text-foreground">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1.5 text-[11px] text-emce-text-muted dark:text-muted-foreground">
          {/* Icon-only marker — the wordmark would be too heavy at this
              size and the row label already says the brand name. */}
          <IconMark size="xs" />
          <span>© {year} {siteName} · Powered by DIYguru</span>
        </div>
      </div>
    </footer>
  );
}

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/contact", label: "Help Center" },
  { href: "/privacy", label: "Privacy & Terms" },
  { href: "/jobs", label: "Browse jobs" },
  { href: "/companies", label: "Companies" },
  { href: "/ai-tools", label: "AI tools" },
  { href: "/diyguru", label: "DIYguru" },
  { href: "/employer", label: "For employers" },
];
