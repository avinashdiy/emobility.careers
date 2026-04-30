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
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as { role?: Role }).role;
        token.sub = user.id;
      }
      // The persona-opt-in flow (CANDIDATE → EMPLOYER promotion in
      // createCompany / joinExistingCompany) calls `unstable_update`
      // with a fresh role. Without this branch the JWT keeps the
      // sign-in-time role and the user 403s on /employer/* until
      // they sign out and back in.
      if (trigger === "update" && session && typeof session === "object" && "user" in session) {
        const next = (session as { user?: { role?: Role } }).user;
        if (next?.role) token.role = next.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
};
