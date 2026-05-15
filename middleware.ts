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

/**
 * Routes that are safe to cache publicly across users — same content
 * for every viewer, no session-dependent rendering.
 *
 *   • OG / Twitter / Apple-touch images — generated per-PAGE (e.g.
 *     /<slug>/opengraph-image) but identical for every visitor, so
 *     Cloudflare caching them is a feature, not a bug.
 *   • The Next.js metadata-route helpers (`icon`, `apple-icon`,
 *     `favicon`, `manifest`) for the same reason.
 *
 * Sitemaps and robots.txt are already excluded at the matcher level
 * (see `config.matcher` below) so we don't need to list them here.
 *
 * Default behaviour for anything NOT in this list: we set
 * `Cache-Control: private, no-store` on the response. The reason is
 * subtle but critical:
 *
 *   Every HTML response in this app renders <SiteHeader />, which
 *   reads the session to render the Me dropdown / avatar /
 *   persona switcher. The HTML body therefore contains user-
 *   specific markup on EVERY route, even routes that look "public"
 *   like /jobs or the marketing homepage. If Cloudflare ever caches
 *   that HTML and serves it to a different user, user A sees user
 *   B's name in the header — that's the privacy bug we hit.
 *
 *   The middleware default closes the door for every HTML route
 *   in one place. Per-route opt-in to public caching is the
 *   explicit path forward (set Cache-Control via headers() in the
 *   route handler), but the SAFE default is private/no-store.
 */
function isPublicCacheableResponse(pathname: string): boolean {
  // Metadata-route images — Next generates these at build time per
  // page and they're identical for every viewer.
  if (pathname.endsWith("/opengraph-image")) return true;
  if (pathname.endsWith("/twitter-image")) return true;
  // Next.js metadata icon routes — `/icon`, `/icon-X.png`,
  // `/apple-icon`, `/apple-icon-X.png`. Match the suffix loosely
  // since Next adds a hash to the filename.
  if (/^\/(apple-)?icon(\.|-|$)/.test(pathname)) return true;
  // Manifest + AI / crawler artifacts — same content for everyone.
  if (pathname === "/manifest" || pathname === "/manifest.webmanifest") return true;
  if (pathname === "/llms.txt") return true;
  return false;
}

/**
 * API routes that handle their own cache policy. We don't want to
 * stomp on a route handler that's deliberately serving a
 * publicly-cacheable JSON feed (e.g. unauthenticated metric
 * endpoints in the future) or a route that streams.
 */
function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

/**
 * Apply the Cache-Control: private, no-store default to a response
 * unless the route handler has explicitly set its own
 * Cache-Control header (we respect any pre-set value so per-route
 * opt-in works).
 */
function applyPrivateCacheHeaders(res: NextResponse, pathname: string): NextResponse {
  if (isApiRoute(pathname)) return res;
  if (isPublicCacheableResponse(pathname)) return res;
  // Respect a value already set by an upstream layer (e.g. a route
  // handler that explicitly opted into public caching).
  if (res.headers.has("Cache-Control")) return res;
  // `private` — CDNs and shared caches must not store the response.
  // `no-store` — the browser must not cache it either; every
  //              navigation re-fetches from the origin.
  // We use both because `private` alone still allows browser-level
  // caching, and a browser cache hit on a public terminal (kiosk,
  // shared family device) leaks the same content. `no-store` makes
  // the policy unambiguous: never write this response to any cache.
  res.headers.set("Cache-Control", "private, no-store");
  // Some CDNs use Vary: Cookie as a coarse signal — set it as
  // belt-and-braces so even a misconfigured CDN won't fan out a
  // single cached response across the cookie space.
  res.headers.set("Vary", "Cookie");
  return res;
}

export default auth((req: NextRequest & { auth: { user?: { role?: string } } | null }) => {
  const { pathname } = req.nextUrl;

  // Surface the request path to server components via a header; the root
  // layout reads this to decide whether the maintenance gate should fire.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  const match = PROTECTED_PREFIXES.find((p) => pathname.startsWith(p.prefix));
  if (!match) {
    // Non-protected route: still apply the cache policy. <SiteHeader />
    // renders user-specific markup on every page so even "public"
    // pages are user-specific responses.
    return applyPrivateCacheHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      pathname,
    );
  }

  const session = req.auth;
  if (!session?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("next", pathname);
    // Redirects to /signin must also be private — otherwise a CDN
    // could memoise a redirect for one user and apply it to another.
    return applyPrivateCacheHeaders(NextResponse.redirect(url), pathname);
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
    return applyPrivateCacheHeaders(NextResponse.redirect(url), pathname);
  }

  return applyPrivateCacheHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    pathname,
  );
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
