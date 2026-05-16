import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/layout/mobile-nav";
import { HeaderUserMenu } from "@/components/layout/HeaderUserMenu";
import { LiveNotificationBadge } from "@/components/layout/LiveNotificationBadge";
import { Logo } from "@/components/brand/Logo";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getUserMenuViewerData } from "@/lib/header-user-menu-data";
import { Bell } from "lucide-react";

const NAV = [
  { href: "/employer", label: "Dashboard" },
  { href: "/employer/jobs", label: "Jobs" },
  { href: "/employer/candidates", label: "Candidates" },
  // Wave B + C — recruiter-superpowers cluster. These three live
  // next to each other on the bar so a recruiter exploring the
  // "automation" surface area lands in the right neighbourhood
  // (cadences = scheduled outreach, automations = if-this-then-that
  // rules, calling = vernacular phone screen).
  { href: "/employer/cadences", label: "Cadences" },
  { href: "/employer/automations", label: "Automations" },
  { href: "/employer/calling", label: "Calling" },
  { href: "/employer/drives", label: "Drives" },
  { href: "/employer/competitions", label: "Competitions" },
  { href: "/employer/events", label: "Events" },
  { href: "/employer/verifications", label: "Verify" },
  { href: "/employer/saved", label: "Saved" },
  { href: "/employer/messages", label: "Messages" },
  { href: "/employer/contact-requests", label: "Contact requests" },
  { href: "/employer/team", label: "Team" },
  { href: "/employer/company", label: "Company" },
];

/**
 * Recruiter-side chrome. Mirrors the public site-header's right-side
 * pattern (notifications bell + Me dropdown) so an employer can
 *   - see who they're signed in as
 *   - jump back to the public site or their candidate persona
 *   - sign out
 *   - reach notifications
 * without leaving the dashboard. Before this, those flows required
 * a manual URL edit or a sign-out-via-API call — a real UX trap
 * the user reported.
 */
export async function EmployerShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  const [viewer, unreadNotifs] = user
    ? await Promise.all([
        getUserMenuViewerData(user),
        db.notification.count({
          where: { userId: user.id, channel: "IN_APP", readAt: null },
        }),
      ])
    : [null, 0];

  return (
    <div className="min-h-screen bg-emce-light-bg">
      <header className="border-b border-emce-border bg-white">
        <div className="container flex h-14 items-center justify-between gap-3">
          {/* Brand wordmark + a small "Employer" suffix so the chrome
              still reads as the employer console. */}
          <Link
            href="/employer"
            className="flex items-center gap-2 font-extrabold text-emce-text"
            aria-label="Employer console home"
          >
            <Logo size="md" priority />
            <span className="hidden text-emce-text-sec sm:inline">·</span>
            <span className="hidden sm:inline">Employer</span>
          </Link>
          <nav className="hidden gap-1 lg:flex">
            {NAV.slice(0, 6).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-1.5 text-sm font-bold text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-dark"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="default"
              size="sm"
              className="hidden sm:inline-flex"
            >
              <Link href="/employer/jobs/new">+ Post a job</Link>
            </Button>

            {/* Notifications bell — same component the public site uses,
                so a single Soketi channel drives both. Hidden when the
                viewer somehow has no user (shouldn't happen on /employer
                because middleware redirects, but defends the render path). */}
            {user && (
              <Link
                href="/me/notifications"
                aria-label="Notifications"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
              >
                <Bell className="h-4 w-4" />
                <LiveNotificationBadge
                  initialCount={unreadNotifs}
                  userId={user.id}
                  pusherKey={env.NEXT_PUBLIC_SOKETI_KEY}
                  pusherHost={env.NEXT_PUBLIC_SOKETI_HOST}
                  pusherPort={env.NEXT_PUBLIC_SOKETI_PORT}
                  pusherTls={env.NEXT_PUBLIC_SOKETI_TLS}
                />
              </Link>
            )}

            {/* The user menu carries Sign out + persona switch + every
                cross-console jump (back to /me, /admin, /tpo). Without
                it, the only way out of the employer console used to be
                a manual URL edit. */}
            {viewer && <HeaderUserMenu user={viewer} />}

            <MobileNav items={NAV} variant="light" />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
