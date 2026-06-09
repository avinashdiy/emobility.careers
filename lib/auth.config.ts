import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

/**
 * Edge-safe NextAuth config used by both:
 *  - middleware.ts (Edge runtime — no Node-only deps allowed)
 *  - lib/auth.ts (extended with Credentials, Email, OAuth + Prisma adapter)
 *
 * Anything Node-only (argon2, Prisma, settings DB lookups) MUST live in
 * lib/auth.ts, not here. OAuth provider construction used to live in this
 * file via env vars but moved out — see `buildOAuthProviders` in
 * lib/auth.ts which reads admin-set credentials from the SiteSetting
 * table at sign-in time, with AUTH_GOOGLE_* / AUTH_LINKEDIN_* env vars
 * as a fallback.
 *
 * Middleware doesn't need OAuth providers: it only verifies JWT sessions,
 * which is signed with AUTH_SECRET — independent of which OAuth client
 * issued the original token.
 */

export const authConfig: NextAuthConfig = {
  providers: [],
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/signin",
    newUser: "/onboarding",
    // Custom branded sign-out page. Without this, a GET to
    // /api/auth/signout renders Auth.js's default unstyled
    // confirmation (blank page + a lone blue "Sign out" button) —
    // every logout link in the app navigates there. Pointing
    // pages.signOut at /signout makes Auth.js redirect those GETs to
    // our branded page instead, so we fix the experience for ALL
    // entry points without touching each individual link.
    signOut: "/signout",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Bracket access on `token` for our custom fields — Auth.js v5
      // doesn't ship the @auth/core/jwt subpath that would let us
      // declare a typed `JWT` augmentation. Runtime behaviour is fine;
      // we just lose autocomplete on these particular fields.
      const t = token as Record<string, unknown>;
      if (user) {
        t.role = (user as { role?: Role }).role;
        token.sub = user.id;
      }
      // The persona-opt-in flow (CANDIDATE → EMPLOYER promotion in
      // createCompany / joinExistingCompany) calls `unstable_update`
      // with a fresh role. Without this branch the JWT keeps the
      // sign-in-time role and the user 403s on /employer/* until
      // they sign out and back in.
      //
      // Admin impersonation reuses the same hook: when an admin starts
      // impersonating a candidate, we call unstable_update with the
      // target user's id/role plus an `impersonatedBy` field carrying
      // the admin's id. The JWT subject silently becomes the target,
      // every server action sees the candidate as the actor (so we get
      // a true reproduction of their bug), and ImpersonationBanner
      // reads `impersonatedBy` to render the "Back to admin" pill.
      // stopImpersonation() runs the same flow in reverse.
      if (trigger === "update" && session && typeof session === "object" && "user" in session) {
        const next = (session as {
          user?: { id?: string; role?: Role; impersonatedBy?: string | null };
        }).user;
        if (next?.role) t.role = next.role;
        if (next?.id) token.sub = next.id;
        if (Object.prototype.hasOwnProperty.call(next ?? {}, "impersonatedBy")) {
          t.impersonatedBy = next?.impersonatedBy ?? null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as Record<string, unknown>;
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = t.role as Role;
        // Surface impersonation to server components so they can
        // render the banner + audit-log "actor" headers correctly.
        session.user.impersonatedBy =
          (t.impersonatedBy as string | null | undefined) ?? null;
      }
      return session;
    },
  },
};
