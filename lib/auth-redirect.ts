import "server-only";

import { headers } from "next/headers";

/**
 * Build the sign-in URL with the current request path preserved
 * as `?next=<encoded-path>`. Pair it with `redirect()` at the
 * call site:
 *
 *     if (!session?.user) redirect(await signinNextUrl());
 *
 * Why this shape and not `await redirectToSignin()`:
 *   TypeScript doesn't narrow control flow through an awaited
 *   async function that returns `Promise<never>` — `session` stays
 *   typed as `Session | null` afterwards. Doing `redirect(await
 *   signinNextUrl())` keeps `redirect()` as the throw expression
 *   TS understands, so the post-check `session.user` access type-
 *   narrows cleanly without a non-null assertion.
 *
 * Why this matters:
 *   Pages all over the app were calling `redirect("/signin")`
 *   bare, dropping the user on /signin and losing the destination.
 *   Result: bookmarks, email-notification links, and back-after-
 *   session-expiry all dump the user on /me (or /employer) instead
 *   of the page they were trying to reach.
 *
 * How it knows the current path:
 *   `middleware.ts` sets the `x-pathname` header on every matched
 *   request. We read it here. If it's missing (shouldn't happen
 *   in production, but possible in tests or for routes the
 *   middleware matcher skips), we fall back to /me.
 */
export async function signinNextUrl(fallback = "/me"): Promise<string> {
  const h = await headers();
  const next = h.get("x-pathname") ?? fallback;
  return `/signin?next=${encodeURIComponent(next)}`;
}
