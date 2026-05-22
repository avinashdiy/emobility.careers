import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/layout/mobile-nav";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { CountrySelector } from "@/components/layout/CountrySelector";
import { HeaderSearch } from "@/components/layout/HeaderSearch";
import { DiscoverMenu } from "@/components/layout/DiscoverMenu";
import { HeaderUserMenu } from "@/components/layout/HeaderUserMenu";
import { Logo } from "@/components/brand/Logo";
import { CompleteProfileBanner } from "@/components/profile/CompleteProfileBanner";
import { ConfirmCountryBanner } from "@/components/profile/ConfirmCountryBanner";
import { RoleStaleBanner } from "@/components/auth/RoleStaleBanner";
import { LiveNotificationBadge } from "@/components/layout/LiveNotificationBadge";
import { env } from "@/lib/env";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { getUserMenuViewerData } from "@/lib/header-user-menu-data";

/**
 * Top navigation — LinkedIn-style: WHITE background, thin bottom border,
 * dark text. Sits above the slightly-greenish page background so the seam
 * reads as a clean horizontal rule rather than a dramatic colour swap.
 *
 *   logo · Discover ▾ · search · | · Feed · Network · Notifications · lang · Me ▾
 *
 * Brand accents (lime + dark teal) appear only on the logo tile and inside
 * pills/badges — the chrome itself stays neutral so cards and content cards
 * are the visual focus, just like LinkedIn's UI.
 */
export async function SiteHeader() {
  const [session, locale] = await Promise.all([auth(), getLocale()]);
  const user = session?.user;

  // Two cheap counts (used directly in nav) + the shared viewer-menu
  // payload (used by HeaderUserMenu and by the mobile nav for the
  // EMPLOYER/ADMIN flags).
  const [unreadNotifs, pendingInvites, viewer] = user
    ? await Promise.all([
        db.notification.count({
          where: { userId: user.id, channel: "IN_APP", readAt: null },
        }),
        db.connection.count({
          where: { recipientId: user.id, status: "PENDING" },
        }),
        getUserMenuViewerData(user),
      ])
    : [0, 0, null];

  const isPlacementOfficer = viewer?.isPlacementOfficer ?? false;

  const PUBLIC_NAV = [
    // Pulse goes first — it's the platform's most viral, public surface
    // and its prominence here primes the brand as "the address of EV
    // careers" rather than "yet another job board".
    { href: "/pulse", label: "Pulse" },
    // Roast — public, no-auth viral hook (free EV resume scoring).
    // Sits next to Pulse so both viral surfaces lead the nav.
    { href: "/roast", label: "🔥 Roast" },
    // Salary Compass — Levels.fyi for India EV. Public teasers; users
    // unlock the full database by submitting one anonymously.
    { href: "/salaries", label: "💰 Salaries" },
    // WhatsApp daily digest — high-conversion CTA aimed at India's
    // mobile-first job-seeker. Skips the inbox entirely.
    { href: "/digest", label: "📱 Digest" },
    { href: "/jobs", label: t("nav.findJobs", locale) },
    { href: "/competitions", label: t("nav.competitions", locale) },
    { href: "/events", label: "Events" },
    { href: "/mentors", label: t("nav.mentors", locale) },
    { href: "/people", label: t("nav.people", locale) },
    // Wave A #5 — EV community groups (battery, charging, BMS, etc.).
    // Sits between People (who) and Companies (where) since groups are
    // the "what topics are people talking about" axis.
    { href: "/groups", label: "Groups" },
    { href: "/companies", label: t("nav.companies", locale) },
    { href: "/employer", label: t("nav.forEmployers", locale) },
    { href: "/diyguru", label: t("nav.diyguru", locale) },
    { href: "/about", label: t("nav.about", locale) },
  ];

  const mobileItems = [
    ...PUBLIC_NAV,
    ...(user
      ? [
          { href: "/feed", label: t("nav.feed", locale) },
          { href: "/me/network", label: t("nav.network", locale) },
          { href: "/me/notifications", label: t("nav.notifications", locale) },
          { href: "/me", label: t("nav.myProfile", locale) },
          { href: "/me/applications", label: "My applications" },
          { href: "/me/sessions", label: "My mentorship sessions" },
          { href: "/me/competitions", label: "My competitions" },
          ...(user.role === "EMPLOYER"
            ? [
                { href: "/employer", label: t("nav.dashboard", locale) },
                { href: "/employer/drives", label: "Campus drives" },
              ]
            : []),
          ...(user.role === "ADMIN" ? [{ href: "/admin", label: t("nav.admin", locale) }] : []),
          // /tpo for admins + DIYguru placement officers — same gate the
          // user-menu dropdown uses.
          ...(user.role === "ADMIN" || isPlacementOfficer
            ? [{ href: "/tpo", label: "Placement (TPO)" }]
            : []),
          { href: "/api/auth/signout", label: t("nav.signOut", locale) },
        ]
      : [
          { href: "/signin", label: t("nav.signIn", locale) },
          { href: "/signup", label: t("nav.joinFree", locale) },
        ]),
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-emce-border bg-white text-emce-text">
      {/* Skip-to-content link — invisible until keyboard-focused.
          Critical for keyboard + screen-reader users so they don't
          have to tab through the full nav on every page. The
          `focus:not-sr-only` + `focus:fixed` pattern keeps it out
          of the visual flow until needed, then lifts it above the
          sticky header at z-50. The destination id="main" must
          exist in each layout shell — see the audit notes. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-emce-dark focus:px-3 focus:py-2 focus:text-sm focus:font-bold focus:text-emce-light focus:shadow-emce-modal focus:outline-none focus:ring-2 focus:ring-emce-mid"
      >
        Skip to content
      </a>
      <div className="container flex h-14 items-center gap-3 py-2 md:gap-4 md:py-2.5">
        {/* Brand mark — full wordmark at every breakpoint, but a
            tighter `sm` size on phones so it fits next to the rest of
            the nav. Earlier we collapsed to an icon-only mark on
            mobile, but that read as a missing logo to first-time
            visitors who didn't recognise it as the brand. */}
        <Link href={user ? "/feed" : "/"} className="flex shrink-0 items-center" aria-label="Home">
          {/* Same `md` size at every breakpoint — `sm` (20px tall)
              read as a hairline-thin wordmark on phones and users
              kept asking where the logo went. md (28px) is the
              minimum that reads as a confident brand mark. */}
          <Logo size="md" priority />
        </Link>

        <nav className="hidden items-center md:flex">
          <DiscoverMenu label="Discover" />
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <HeaderSearch placeholder="Search people, jobs, mentors, competitions…" />

          {user && (
            // Primary nav slots — visible from `sm` (640px) and up.
            // Below that the four icons + the language switcher + the
            // user menu + the hamburger pile up wider than a 390px
            // iPhone viewport, which on iOS Safari triggers a global
            // shrink-to-fit and the page renders ~80% width with a
            // tinted strip on the right. Same items remain reachable
            // through the hamburger MobileNav (Feed/Network/
            // Notifications already listed there). LinkedIn does the
            // same — phones get the icons in a bottom bar instead of
            // the top.
            <nav className="hidden items-center gap-0.5 sm:flex">
              <SocialNavLink href="/feed" label={t("nav.feed", locale)} icon="feed" />
              <SocialNavLink href="/jobs" label={t("nav.findJobs", locale)} icon="jobs" />
              <SocialNavLink
                href="/me/network"
                label={t("nav.network", locale)}
                icon="network"
                badge={pendingInvites}
              />
              <SocialNavLink
                href="/me/notifications"
                label={t("nav.notifications", locale)}
                icon="bell"
                badge={0}
                liveBadge={
                  <LiveNotificationBadge
                    initialCount={unreadNotifs}
                    userId={user.id}
                    pusherKey={env.NEXT_PUBLIC_SOKETI_KEY}
                    pusherHost={env.NEXT_PUBLIC_SOKETI_HOST}
                    pusherPort={env.NEXT_PUBLIC_SOKETI_PORT}
                    pusherTls={env.NEXT_PUBLIC_SOKETI_TLS}
                  />
                }
              />
            </nav>
          )}

          <div className="ml-1 flex items-center gap-2 border-l border-emce-border pl-2">
            {/* Country selector — flags-and-globe dropdown that
                jumps the visitor to the chosen country's landing
                page AND cookies the choice for the next visit.
                Sits next to the language switcher because both are
                "what regional version of the site am I on" controls
                and users expect them clustered. */}
            <CountrySelector currentCountry={viewer?.country} />
            <LanguageSwitcher current={locale} variant="light" />
            {user && viewer ? (
              <HeaderUserMenu user={viewer} />
            ) : !user ? (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link href="/signin">{t("nav.signIn", locale)}</Link>
                </Button>
                <Button asChild variant="default" size="sm" className="hidden sm:inline-flex">
                  <Link href="/signup">{t("nav.joinFree", locale)}</Link>
                </Button>
              </>
            ) : null}
            <MobileNav items={mobileItems} variant="light" />
          </div>
        </div>
      </div>
      {/* Role-stale strip — fires when an admin promoted / demoted this
          user from /admin/employers/[id]/team but the JWT cookie still
          reflects the old role. Component returns null in the common
          case (DB role === session role). */}
      <RoleStaleBanner />
      {/* Country-confirmation banner — one-question nudge for the
          ~50k existing users who were defaulted to IN by PR 1's
          backfill + every OAuth (Google / LinkedIn) signup that
          bypasses the form's country dropdown. Short-circuits
          when countryConfirmedAt is non-null. */}
      <ConfirmCountryBanner />
      {/* Profile-completeness reminder strip — short-circuits server-side
          when the user is signed-out / on auth routes / already ≥ 90%. */}
      <CompleteProfileBanner />
    </header>
  );
}

function SocialNavLink({
  href,
  label,
  icon,
  badge = 0,
  liveBadge,
}: {
  href: string;
  label: string;
  icon: "feed" | "jobs" | "network" | "bell";
  badge?: number;
  /** Optional client-component slot rendered in place of the static
      badge. Used by the bell icon to subscribe to realtime
      notification events. When supplied, `badge` is ignored. */
  liveBadge?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // Icon-only on phones (no label), icon-with-label on md+. Padding
      // shrinks on mobile so 4 icons + logo + search + me-menu fit.
      className="relative flex flex-col items-center justify-center rounded-md px-2 py-1 text-emce-text-sec hover:text-emce-text md:px-3"
      aria-label={label}
      title={label}
    >
      <SocialIcon name={icon} />
      <span className="mt-0.5 hidden text-[11px] font-semibold leading-none md:block">{label}</span>
      {liveBadge ?? (badge > 0 && (
        <span className="absolute right-0.5 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-emce-red px-1 text-[9px] font-bold text-white md:right-1 md:top-0.5">
          {badge > 99 ? "99+" : badge}
        </span>
      ))}
    </Link>
  );
}

function SocialIcon({ name }: { name: "feed" | "jobs" | "network" | "bell" }) {
  if (name === "feed") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
      </svg>
    );
  }
  if (name === "jobs") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M2 13h20" />
      </svg>
    );
  }
  if (name === "network") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
        <circle cx="17" cy="6" r="2" />
        <path d="M21 14a4 4 0 0 0-4-4" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}
