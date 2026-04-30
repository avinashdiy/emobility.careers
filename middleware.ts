import { NextResponse, type NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PROTECTED_PREFIXES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/employer", roles: ["EMPLOYER", "ADMIN"] },
  { prefix: "/me", roles: ["CANDIDATE", "EMPLOYER", "ADMIN"] },
];

// Onboarding paths candidates can hit even though their role is still
// CANDIDATE. Adding the employer persona happens here: the page itself
// gates on signed-in (any role) and the action layer bumps the user's
// role from CANDIDATE → EMPLOYER on completion. Without this exception
// candidates clicking "Hire on eMobility" would get a 403 before the
// page ever rendered.
const PERSONA_OPTIN_PATHS = ["/employer/onboarding"];

export default auth((req: NextRequest & { auth: { user?: { role?: string } } | null }) => {
  const { pathname } = req.nextUrl;

  // Surface the request path to server components via a header; the root
  // layout reads this to decide whether the maintenance gate should fire.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  const match = PROTECTED_PREFIXES.find((p) => pathname.startsWith(p.prefix));
  if (!match) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const session = req.auth;
  if (!session?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const role = session.user.role;
  // Persona-opt-in paths (e.g. /employer/onboarding for a CANDIDATE)
  // bypass the prefix's role list. Any signed-in user can land there;
  // the page itself does fine-grained checks and the server action
  // handles role transitions.
  const isOptIn = PERSONA_OPTIN_PATHS.some((p) => pathname.startsWith(p));
  if (!isOptIn && (!role || !match.roles.includes(role))) {
    const url = req.nextUrl.clone();
    url.pathname = "/403";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: [
    // Match everything except Next internals, static files, and the API
    // routes. The pathname header is set on every match so the maintenance
    // gate can inspect it. Auth role gates only fire on the prefixes listed
    // in PROTECTED_PREFIXES above.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sitemap_index.xml|sitemap-jobs.xml|jobs.xml|api/health|api/auth|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?)$).*)",
  ],
};
