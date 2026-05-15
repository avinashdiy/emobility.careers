import { redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Logo } from "@/components/brand/Logo";
import { HeaderUserMenu } from "@/components/layout/HeaderUserMenu";
import { getUserMenuViewerData } from "@/lib/header-user-menu-data";

/**
 * TPO (Training & Placement Officer) shell.
 *
 * Access rule: ADMIN role OR `User.isPlacementOfficer = true`. Admins
 * grant the latter to trusted DIYguru staff via /admin/users so the
 * coordinator can run cohort dashboards without seeing the rest of
 * /admin (moderation, settings, billing, etc.).
 *
 * Visual style mirrors the admin shell — dark teal top bar, white
 * pill-wrapped wordmark + an orange "TPO" tag so the chrome reads as
 * the placement console. Same pattern, different role badge.
 */
export default async function TpoLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/tpo");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isPlacementOfficer: true, name: true, email: true },
  });
  if (!user) redirect(await signinNextUrl());
  if (user.role !== "ADMIN" && !user.isPlacementOfficer) redirect("/403");

  const viewer = await getUserMenuViewerData(session.user);

  return (
    <div className="min-h-screen bg-emce-light-bg">
      {/* White header to match the rest of the platform — recruiters /
          TPOs hop between /admin, /employer, /me, and /tpo, and shifting
          the chrome contrast at every jump felt jarring. The orange TPO
          chip is what differentiates this console; the rest stays neutral. */}
      <header className="sticky top-0 z-30 border-b border-emce-border bg-white">
        <div className="container flex h-14 items-center justify-between gap-3">
          <Link href="/tpo" className="flex items-center gap-2" aria-label="TPO home">
            <Logo size="md" priority />
            <span className="rounded-md bg-emce-orange px-2 py-0.5 text-xs font-extrabold text-white">
              TPO
            </span>
          </Link>
          <div className="flex items-center gap-1 text-sm">
            <nav className="flex items-center gap-1">
              <NavLink href="/tpo">Dashboard</NavLink>
              <NavLink href="/tpo/cohorts">Cohorts</NavLink>
              <NavLink href="/tpo/unplaced">Unplaced</NavLink>
            </nav>
            <span className="hidden h-4 w-px bg-emce-border sm:mx-2 sm:block" />
            <Link
              href="/"
              className="hidden rounded-md px-2 py-1 text-emce-text-sec hover:bg-emce-light-soft sm:inline-block"
            >
              Visit site →
            </Link>
            {/* Switched from the old bare "email | Sign out" pair to the
                shared HeaderUserMenu so the persona switcher, admin
                jumps, and verified-badge surface here too. The
                /tpo console viewer is typically a placement officer
                who ALSO needs to flip into their candidate profile
                (DIYguru staff are usually alumni). */}
            {viewer && <HeaderUserMenu user={viewer} />}
          </div>
        </div>
      </header>
      <main className="container max-w-6xl py-6">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 font-bold text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
    >
      {children}
    </Link>
  );
}
