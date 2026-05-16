"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom-bar nav — V2 polish (#7).
 *
 * Thumb-reachable primary nav for candidates on mobile. Visible only
 * under `sm` (768px) and hidden on auth / onboarding / admin /
 * employer routes (where it'd compete with the EmployerShell / AdminSidebar
 * which serve the same purpose).
 *
 * LinkedIn's app uses Home, Network, Post, Notifications, Jobs at
 * the bottom. We mirror that pattern but tuned to our IA — the
 * platform's gravity is Jobs + Inbox + Feed, with Profile as the
 * "me" tab on the right. We omit a "Post" centre button since
 * candidates don't post often; recruiters get that via EmployerShell.
 *
 * Server gate (visibility based on auth + path) lives in
 * `MobileBottomNavMount` below; this client component is purely
 * visual + active-tab matching.
 */

interface Item {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: (path: string) => boolean;
}

const ITEMS: Item[] = [
  {
    href: "/feed",
    label: "Feed",
    icon: <IconHome />,
    match: (p) => p === "/feed" || p.startsWith("/feed/"),
  },
  {
    href: "/jobs",
    label: "Jobs",
    icon: <IconBriefcase />,
    match: (p) => p === "/jobs" || p.startsWith("/jobs/") || p === "/" || p.startsWith("/job/"),
  },
  {
    href: "/me/messages",
    label: "Inbox",
    icon: <IconMessage />,
    match: (p) => p.startsWith("/me/messages"),
  },
  {
    href: "/me",
    label: "Me",
    icon: <IconUser />,
    match: (p) => p === "/me" || p.startsWith("/me/profile") || p.startsWith("/me/applications") || p === "/me/network",
  },
];

const HIDE_PREFIXES = [
  "/admin",
  "/employer",
  "/tpo",
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/onboarding",
  // Hide on full-bleed reading routes (the bar would cover content
  // and there's already a back-link in PageHeader for navigation).
  "/skills/", // /skills/[slug]/take/[attemptId] runner — chrome-free
];

export function MobileBottomNav() {
  const pathname = usePathname() ?? "/";
  if (HIDE_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    // Wrap in a fragment so we can ship a sibling spacer alongside
    // the fixed bar. Pre-fix we put bottom-padding on `<body>`
    // unconditionally, which left phantom 3.5rem of dead space at
    // the bottom of every page where the bar is hidden (admin,
    // employer, /onboarding, /skills/.../take, etc.). Bundling the
    // spacer with the bar means they appear and disappear together.
    <>
      <div
        aria-hidden
        className="h-14 sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      />
      <nav
      aria-label="Primary"
      // env(safe-area-inset-bottom) keeps the bar above the iOS home
      // indicator without us hardcoding the 34px. Tailwind's
      // pb-[env(safe-area-inset-bottom)] does that inline; combined
      // with min-h means short Androids still get a tappable strip.
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-emce-border bg-white/95 backdrop-blur sm:hidden",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="grid grid-cols-4">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors",
                  active
                    ? "text-emce-dark"
                    : "text-emce-text-muted hover:text-emce-text",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center transition-transform",
                    active && "scale-110",
                  )}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      </nav>
    </>
  );
}

/* ─── Icons (stroke 1.75, 20x20, inherit `currentColor`) ─────── */

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

function IconBriefcase() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  );
}

function IconMessage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M21 11.5a8.38 8.38 0 0 1-9.86 8.27L4 21l1.23-7.14A8.5 8.5 0 1 1 21 11.5z" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.5 4-7 8-7s8 2.5 8 7" />
    </svg>
  );
}
