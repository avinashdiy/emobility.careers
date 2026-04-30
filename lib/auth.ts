import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";
import argon2 from "argon2";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { authConfig } from "@/lib/auth.config";
import { sendMail } from "@/lib/mail";
import { logger } from "@/lib/logger";
import { getSettings } from "@/lib/settings";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
  interface User {
    role: Role;
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// NextAuth core uses `emailVerified` (Date | null); our Prisma schema uses
// `emailVerifiedAt`. Wrap the adapter to translate on create/update/get so
// callers see the field NextAuth expects without renaming the column.
// Without this, new users created via OAuth or magic link fail with a
// Prisma "unknown field" error.
//
// The `as never` / `as Adapter` casts are deliberate — the wrapper is a
// type-fuzzy bridge between two slightly different shapes; runtime
// behaviour is straightforward.
function bridgePrismaAdapter() {
  const inner = PrismaAdapter(db) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  type Userish = { emailVerifiedAt?: Date | null; emailVerified?: Date | null } & Record<string, unknown>;
  const toAuth = (u: unknown) => {
    if (!u || typeof u !== "object") return u;
    const row = u as Userish;
    if ("emailVerifiedAt" in row) {
      return { ...row, emailVerified: row.emailVerifiedAt ?? null };
    }
    return row;
  };
  const toPrisma = (data: unknown) => {
    if (!data || typeof data !== "object") return data;
    const { emailVerified, ...rest } = data as Userish;
    return emailVerified !== undefined ? { ...rest, emailVerifiedAt: emailVerified } : rest;
  };
  return {
    ...(inner as object),
    createUser: async (user: unknown) => toAuth(await inner.createUser(toPrisma(user))),
    getUser: async (id: unknown) => toAuth(await inner.getUser(id)),
    getUserByEmail: async (email: unknown) => toAuth(await inner.getUserByEmail(email)),
    getUserByAccount: async (key: unknown) => toAuth(await inner.getUserByAccount(key)),
    updateUser: async (user: unknown) => toAuth(await inner.updateUser(toPrisma(user))),
  } as unknown as ReturnType<typeof PrismaAdapter>;
}

/**
 * Build the Google + LinkedIn provider list at sign-in time so admins
 * can paste OAuth credentials in /admin/settings/auth without
 * redeploying. Settings (DB) take precedence; env vars are the
 * fallback so a fresh deploy with classic env-only config keeps
 * working until an admin overrides.
 *
 * Cached via `lib/settings.ts` (30 s TTL) so the per-request rebuild
 * stays cheap — most requests hit the in-memory map, not Postgres.
 */
async function buildOAuthProviders(): Promise<NextAuthConfig["providers"]> {
  const s = await getSettings(
    "auth.google.client_id",
    "auth.google.client_secret",
    "auth.linkedin.client_id",
    "auth.linkedin.client_secret",
  ).catch(() => ({} as Record<string, string>));

  const providers: NextAuthConfig["providers"] = [];

  const googleId = s["auth.google.client_id"]?.trim() || process.env.AUTH_GOOGLE_ID;
  const googleSecret = s["auth.google.client_secret"]?.trim() || process.env.AUTH_GOOGLE_SECRET;
  if (googleId && googleSecret) {
    providers.push(
      Google({
        clientId: googleId,
        clientSecret: googleSecret,
        // Auto-link this OAuth identity to an existing email/password
        // user when the email matches. Without this NextAuth throws
        // `OAuthAccountNotLinked` whenever a user who already
        // signed up with email/password later tries Google.
        //
        // The flag is named "dangerous" because providers that don't
        // verify email ownership (custom OAuth, self-hosted IdPs)
        // could let an attacker take over an account by claiming the
        // email. Google ALWAYS issues OAuth tokens for emails it has
        // confirmed, so the takeover surface is the same as the
        // attacker already controlling the victim's Google account —
        // a compromise that is out of scope for our threat model.
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  const liId = s["auth.linkedin.client_id"]?.trim() || process.env.AUTH_LINKEDIN_ID;
  const liSecret = s["auth.linkedin.client_secret"]?.trim() || process.env.AUTH_LINKEDIN_SECRET;
  if (liId && liSecret) {
    providers.push(
      LinkedIn({
        clientId: liId,
        clientSecret: liSecret,
        // LinkedIn also issues tokens only for verified emails, so
        // the same reasoning as Google above applies. See the
        // comment on the Google provider for the threat model.
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  return providers;
}

/**
 * Full server-side config: layered on top of authConfig with
 * Credentials + Email + dynamically-resolved OAuth providers and the
 * Prisma adapter. Wrapped in an async function so NextAuth re-evaluates
 * the provider list on each sign-in flow — this is what lets admins
 * change OAuth credentials live from /admin/settings/auth.
 */
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth(async () => ({
  ...authConfig,
  adapter: bridgePrismaAdapter(),
  secret: env.AUTH_SECRET,
  providers: [
    ...(await buildOAuthProviders()),
    // Magic-link sign-in. NextAuth stores the one-time token in the
    // VerificationToken table (already in the schema); the link expires after
    // 24h by default. We hijack `sendVerificationRequest` so the email goes
    // through our SES-backed `sendMail()` instead of the default SMTP path.
    EmailProvider({
      // The "server" + "from" fields are required by the provider but unused
      // because we send via SES through our own client. Keep the from in
      // sync with the env so admins see consistent behaviour.
      server: { host: "unused", port: 587, auth: { user: "", pass: "" } },
      from: env.EMAIL_FROM,
      maxAge: 24 * 60 * 60, // 24h
      sendVerificationRequest: async ({ identifier, url }) => {
        const host = new URL(url).host;
        const subject = `Sign in to ${host}`;
        const html = `
<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f5f7f5;padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:white;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <tr><td>
      <h1 style="font-size:20px;color:#0f172a;margin:0 0 12px 0;">Sign in to ${host}</h1>
      <p style="color:#475569;margin:0 0 24px 0;">Tap the button below to sign in. This link is good for 24 hours and works only once.</p>
      <p style="margin:0 0 24px 0;">
        <a href="${url}" style="display:inline-block;background:#374a47;color:#c1ffb4;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Sign in →</a>
      </p>
      <p style="color:#94a3b8;font-size:12px;margin:0;">If you didn't request this, you can safely ignore this email — no account changes have been made.</p>
    </td></tr>
  </table>
</body></html>`;
        const text = `Sign in to ${host}\n\n${url}\n\nLink expires in 24 hours. If you didn't request this, ignore.`;
        try {
          await sendMail({ to: identifier, subject, html, text });
        } catch (err) {
          logger.error({ err, identifier }, "[auth] magic-link send failed");
          throw err;
        }
      },
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        if (user.status !== "ACTIVE") return null;

        // Hard lockout — if the cool-off window is still active, the
        // signinAction wrapper has already rejected. This is belt-and-
        // braces in case a caller hits this path directly.
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const ok = await argon2.verify(user.passwordHash, password);
        if (!ok) {
          // Increment failed-login counter. After 10 failures lock the
          // account for 15 minutes — the user can wait, or reset password
          // (which clears the lock implicitly via the password-update
          // path; we also clear it on successful sign-in below).
          const next = (user.failedLoginCount ?? 0) + 1;
          const lockedUntil = next >= 10 ? new Date(Date.now() + 15 * 60_000) : user.lockedUntil ?? null;
          await db.user.update({
            where: { id: user.id },
            data: { failedLoginCount: next, lockedUntil },
          }).catch(() => {});
          return null;
        }

        // Successful auth — clear the lockout state and stamp last-login.
        await db.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            failedLoginCount: 0,
            lockedUntil: null,
          },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  events: {
    // OAuth-created users default to CANDIDATE via the schema default; we only
    // record lastLoginAt here. Do NOT clobber an existing role — that breaks
    // employers and admins who later sign in via OAuth.
    //
    // We also seed a stub CandidateProfile here. Without it, /me sees no
    // profile → redirects to /onboarding, /onboarding sees no profile →
    // redirects back to /me — an infinite loop on first Google/LinkedIn
    // sign-in. The email/password signup path already creates a profile in
    // the same transaction; the OAuth path never had an equivalent step.
    async createUser({ user }) {
      if (!user.id) return;

      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      const dbUser = await db.user.findUnique({
        where: { id: user.id },
        select: { role: true, email: true, name: true },
      });
      if (!dbUser || dbUser.role !== "CANDIDATE") return;

      const fullName = (dbUser.name ?? user.name ?? "").trim();
      const [firstName, ...rest] = fullName.split(/\s+/).filter(Boolean);
      const slugSeed = fullName || dbUser.email?.split("@")[0] || "member";

      try {
        const { withUniqueSlug } = await import("@/lib/slug");
        await withUniqueSlug(slugSeed, (slug) =>
          db.candidateProfile.create({
            data: {
              userId: user.id!,
              slug,
              firstName: firstName || "Member",
              lastName: rest.join(" ") || null,
              email: dbUser.email,
            },
          }),
        );
      } catch (err) {
        logger.error({ err, userId: user.id }, "[auth] failed to seed CandidateProfile for OAuth user");
        // Don't throw — the user is still authenticated; they'll hit
        // /onboarding which can render a recovery state.
      }
    },
    async signIn({ user }) {
      if (user.id) {
        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        }).catch(() => {});
        // Stamp wpClaimedAt the first time an imported user signs in so the
        // bulk-claim mailer skips them next run. We use updateMany so the
        // condition (still null AND was a legacy import) lives in the WHERE
        // clause — no read-then-write race.
        await db.user.updateMany({
          where: { id: user.id, wpLegacyId: { not: null }, wpClaimedAt: null },
          data: { wpClaimedAt: new Date() },
        }).catch(() => {});
      }
    },
  },
}));

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}
