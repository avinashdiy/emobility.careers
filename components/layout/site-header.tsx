import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/layout/mobile-nav";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { HeaderSearch } from "@/components/layout/HeaderSearch";
import { DiscoverMenu } from "@/components/layout/DiscoverMenu";
import { HeaderUserMenu } from "@/components/layout/HeaderUserMenu";
import { Logo } from "@/components/brand/Logo";
import { CompleteProfileBanner } from "@/components/profile/CompleteProfileBanner";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

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

  const [unreadNotifs, pendingInvites, viewerCard, viewerUser] = user
    ? await Promise.all([
        db.notification.count({
          where: { userId: user.id, channel: "IN_APP", readAt: null },
        }),
        db.connection.count({
          where: { recipientId: user.id, status: "PENDING" },
        }),
        db.candidateProfile.findUnique({
          where: { userId: user.id },
          select: {
            slug: true,
            firstName: true,
            lastName: true,
            profilePhotoUrl: true,
            isDIYguruVerified: true,
          },
        }),
        // Pull the placement-officer flag so the user menu can surface
        // the /tpo dashboard for trusted DIYguru staff who aren't
        // ADMIN-tier. Cheap query — single bool by primary key.
        db.user.findUnique({
          where: { id: user.id },
          select: { isPlacementOfficer: true },
        }),
      ])
    : [0, 0, null, null];

  const isMentor = user
    ? Boolean(await db.mentorProfile.findUnique({ where: { userId: user.id }, select: { id: true } }))
    : false;
  const isPlacementOfficer = !!viewerUser?.isPlacementOfficer;

  const fullName = viewerCard ? `${viewerCard.firstName} ${viewerCard.lastName ?? ""}`.trim() : (user?.name ?? "");

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
    { href: "/mentors", label: t("nav.mentors", locale) },
    { href: "/people", label: t("nav.people", locale) },
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
            // Primary nav slots — always visible. On phones we drop the
            // text label under each icon so the bar stays narrow; on desktop
            // we show icon + label like LinkedIn. Jobs is promoted to the
            // primary nav (LinkedIn always has Jobs there) — keep the same
            // route in Discover too for redundancy.
            <nav className="flex items-center gap-0.5">
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
                badge={unreadNotifs}
              />
            </nav>
          )}

          <div className="ml-1 flex items-center gap-2 border-l border-emce-border pl-2">
            <LanguageSwitcher current={locale} variant="light" />
            {user ? (
              <HeaderUserMenu
                user={{
                  name: fullName || user.email || "Account",
                  email: user.email ?? "",
                  role: user.role as "ADMIN" | "EMPLOYER" | "CANDIDATE",
                  avatarUrl: viewerCard?.profilePhotoUrl ?? null,
                  publicSlug: viewerCard?.slug ?? null,
                  isMentor,
                  isVerified: viewerCard?.isDIYguruVerified ?? false,
                  isPlacementOfficer,
                }}
              />
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link href="/signin">{t("nav.signIn", locale)}</Link>
                </Button>
                <Button asChild variant="default" size="sm" className="hidden sm:inline-flex">
                  <Link href="/signup">{t("nav.joinFree", locale)}</Link>
                </Button>
              </>
            )}
            <MobileNav items={mobileItems} variant="light" />
          </div>
        </div>
      </div>
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
}: {
  href: string;
  label: string;
  icon: "feed" | "jobs" | "network" | "bell";
  badge?: number;
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
      {badge > 0 && (
        <span className="absolute right-0.5 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-emce-red px-1 text-[9px] font-bold text-white md:right-1 md:top-0.5">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
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
