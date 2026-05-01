import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";

/**
 * Surfaces a sign-out-and-back-in nudge whenever the user's JWT-stamped
 * role disagrees with the role currently in the database. This happens
 * when a platform admin promotes / demotes the user's `User.role`
 * from `/admin/employers/[id]/team` — we use stateless JWT sessions
 * (see lib/auth.config.ts), so we can't refresh another user's cookie
 * server-side. Without this banner, the user would silently 403 on
 * `/employer/*` (or unexpectedly gain access) until their next login.
 *
 * Self-promotions inside the user's own browser don't trip this — those
 * use `unstable_update` to re-stamp the token in-place. This banner is
 * specifically for cross-user changes.
 *
 * Hidden on: anonymous routes, signin/signup/onboarding flows, the
 * /api/auth/signout endpoint itself.
 */
const HIDE_ON_PATHS = [
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/onboarding",
  "/api/auth",
  "/403",
  "/404",
];

function describeChange(sessionRole: Role, dbRole: Role): { title: string; body: string } {
  // Key the lookup on the (from, to) pair as a single string. Avoids
  // the cumulative-narrowing TypeScript pitfall that fires when the
  // chain of `if (sessionRole === "X")` early-returns leaves later
  // branches with an empty intersection.
  const transition = `${sessionRole}->${dbRole}` as const;
  switch (transition) {
    case "CANDIDATE->EMPLOYER":
      return {
        title: "You now have employer access",
        body: "An admin added you to a recruiter team. Sign out and back in to use the Employer dashboard and post jobs.",
      };
    case "EMPLOYER->CANDIDATE":
      return {
        title: "Your employer access was revoked",
        body: "An admin removed you from the recruiter team. Sign out and back in to refresh your session.",
      };
    case "CANDIDATE->ADMIN":
    case "EMPLOYER->ADMIN":
      return {
        title: "You're now a platform admin",
        body: "Sign out and back in to access /admin and admin-only actions.",
      };
    case "ADMIN->CANDIDATE":
    case "ADMIN->EMPLOYER":
      return {
        title: "Your admin access was revoked",
        body: "Sign out and back in to refresh your session — admin pages will reject you on the next request anyway.",
      };
    default:
      // Catch-all for unmodelled transitions (or no-op same-role,
      // which is filtered out by the caller before we get here).
      return {
        title: `Your role changed to ${dbRole}`,
        body: "An admin updated your account. Sign out and back in to refresh your session.",
      };
  }
}

export async function RoleStaleBanner() {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  if (HIDE_ON_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  const session = await auth();
  if (!session?.user) return null;

  const dbUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!dbUser) return null;
  if (dbUser.role === session.user.role) return null;

  const { title, body } = describeChange(session.user.role as Role, dbUser.role);

  return (
    <div className="border-b border-emce-orange bg-emce-orange-light">
      <div className="container flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <p className="text-emce-text">
          <strong className="text-emce-orange">⚠️ {title}</strong>
          <span className="ml-1 text-emce-text-sec">— {body}</span>
        </p>
        <Link
          href="/api/auth/signout"
          className="inline-flex items-center rounded bg-emce-darkest px-3 py-1 text-xs font-bold text-emce-mid hover:bg-emce-dark"
        >
          Sign out & refresh →
        </Link>
      </div>
    </div>
  );
}
