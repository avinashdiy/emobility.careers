import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";
import type { Role } from "@prisma/client";

/**
 * Edge-safe NextAuth config used by both:
 *  - middleware.ts (Edge runtime — no Node-only deps allowed)
 *  - lib/auth.ts (extended with Credentials + Prisma adapter)
 *
 * Anything Node-only (argon2, Prisma) MUST live in lib/auth.ts, not here.
 */

const oauthProviders: NextAuthConfig["providers"] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  oauthProviders.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Account linking is opt-in: users must explicitly link OAuth providers
      // from their account settings after first sign-in with credentials.
      allowDangerousEmailAccountLinking: false,
    }),
  );
}

if (process.env.AUTH_LINKEDIN_ID && process.env.AUTH_LINKEDIN_SECRET) {
  oauthProviders.push(
    LinkedIn({
      clientId: process.env.AUTH_LINKEDIN_ID,
      clientSecret: process.env.AUTH_LINKEDIN_SECRET,
      // Account linking is opt-in: users must explicitly link OAuth providers
      // from their account settings after first sign-in with credentials.
      allowDangerousEmailAccountLinking: false,
    }),
  );
}

export const authConfig: NextAuthConfig = {
  providers: oauthProviders,
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/signin",
    newUser: "/onboarding",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: Role }).role;
        token.sub = user.id;
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
