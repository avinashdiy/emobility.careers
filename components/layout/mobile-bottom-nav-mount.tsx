import { auth } from "@/lib/auth";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";

/**
 * Server-side mount for the mobile bottom nav. Only renders for
 * signed-in candidates / general visitors; the EmployerShell + admin
 * sidebar already provide primary nav on those routes, so we'd be
 * duplicating with two bars.
 *
 * The actual path-based hiding (admin / signin / onboarding routes)
 * lives in the client component since it needs usePathname() — this
 * wrapper just decides whether to render at all based on session.
 *
 * We render for both signed-in AND signed-out users on mobile. The
 * tabs that require auth (Inbox, Me) gracefully redirect signed-out
 * visitors to /signin via the existing middleware — and a logged-out
 * mobile visitor still benefits from the Feed / Jobs primary tabs.
 */
export async function MobileBottomNavMount() {
  // We keep the auth() call even though we render the bar for everyone —
  // future iterations may want to swap items based on role (e.g. swap
  // "Me" for "Sign in" for anon users, or surface "Post" for employers).
  await auth();
  return <MobileBottomNav />;
}
