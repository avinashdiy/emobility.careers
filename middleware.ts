import { NextResponse, type NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PROTECTED_PREFIXES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/employer", roles: ["EMPLOYER", "ADMIN"] },
  { prefix: "/me", roles: ["CANDIDATE", "EMPLOYER", "ADMIN"] },
];

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
  if (!role || !match.roles.includes(role)) {
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
