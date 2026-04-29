"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, signIn } from "@/lib/auth";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { withUniqueSlug } from "@/lib/slug";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { type FormState, zodErrorsToFieldErrors } from "@/lib/form-state";
import {
  clientIp,
  clientUserAgent,
  honeypotTriggered,
  isDisposableEmail,
  looksLikeSpamName,
  tooFast,
  verifyTurnstile,
} from "@/lib/anti-spam";
import { Role } from "@prisma/client";

const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  email: z.string().email("Enter a valid email address").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters").max(120),
  role: z.enum(["CANDIDATE", "EMPLOYER"], { errorMap: () => ({ message: "Pick a role" }) }),
  acceptTerms: z.literal("on", { errorMap: () => ({ message: "Please agree to the Terms" }) }),
});

/**
 * The single rejection message we return for any anti-spam trip. Keeping
 * the user-facing copy generic on purpose — telling a bot "honeypot
 * triggered" or "your IP is over quota" lets the operator iterate. Real
 * humans hitting this can email support.
 */
const SPAM_REJECTION_MSG =
  "We couldn't create your account. If this is a mistake, email hello@emobility.careers and we'll sort it out.";

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // ─── Layer 1: honeypot + timing — silent reject before we touch the DB ───
  // These checks are done first because they're free and they reject the
  // dumbest bot traffic without ever putting load on Redis or Postgres.
  if (honeypotTriggered(formData.get("website"))) {
    logger.info({ ip: await clientIp() }, "[signup] honeypot triggered");
    return { ok: false, message: SPAM_REJECTION_MSG };
  }
  if (tooFast(formData.get("startedAt"))) {
    logger.info({ ip: await clientIp() }, "[signup] form submitted too fast");
    return { ok: false, message: SPAM_REJECTION_MSG };
  }

  // ─── Layer 2: Turnstile (when configured) ───
  const turnstileOk = await verifyTurnstile(formData.get("cf-turnstile-response") as string | null);
  if (!turnstileOk) {
    return { ok: false, message: "Please complete the verification challenge and try again." };
  }

  // ─── Layer 3: Schema validation ───
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the errors below.",
      fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()),
    };
  }
  const { name, email, password, role } = parsed.data;

  // ─── Layer 4: Disposable-email + spammy-name heuristic ───
  if (isDisposableEmail(email)) {
    return {
      ok: false,
      message: "Please use a permanent email address.",
      fieldErrors: { email: "Disposable email addresses aren't allowed." },
    };
  }
  if (looksLikeSpamName(name)) {
    return {
      ok: false,
      message: "That name doesn't look right.",
      fieldErrors: { name: "Use your real name (no URLs or random strings)." },
    };
  }

  // ─── Layer 5: Rate-limit per email AND per IP ───
  // Per-email caps account-creation retries on the same address; per-IP
  // caps how many fresh accounts a single network can spin up regardless
  // of how many emails it rotates through.
  const ip = await clientIp();
  try {
    await rateLimitOrThrow(`signup:${email}`, "signup");
    if (ip) await rateLimitOrThrow(`signup-ip:${ip}`, "signupIp");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Too many attempts" };
  }

  // ─── Layer 6: Account creation ───
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return {
      ok: false,
      message: "An account with that email already exists.",
      fieldErrors: { email: "Email already in use" },
    };
  }

  const userAgent = await clientUserAgent();
  const passwordHash = await hashPassword(password);
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: role as Role,
        signupIp: ip,
        signupUserAgent: userAgent?.slice(0, 500) ?? null,
      },
    });
    if (role === "CANDIDATE") {
      const [firstName, ...rest] = name.split(" ");
      await withUniqueSlug(name, (slug) =>
        tx.candidateProfile.create({
          data: {
            userId: created.id,
            slug,
            firstName: firstName ?? name,
            lastName: rest.join(" ") || null,
            email,
          },
        }),
      );
    }
    return created;
  });

  await audit({
    actorId: user.id,
    action: "user.signup",
    entity: "User",
    entityId: user.id,
    meta: { role, ip, userAgent: userAgent?.slice(0, 200) },
  });

  // Send the verification email straight away. Posting / messaging /
  // applying / connecting all gate on emailVerifiedAt; until they click,
  // the account exists but can't do anything that pollutes other users'
  // experience.
  try {
    const { issueToken } = await import("@/lib/auth-tokens");
    const { emailVerificationEmail } = await import("@/lib/emails/templates");
    const { sendMail } = await import("@/lib/mail");
    const { token } = await issueToken("email-verify", email);
    const tpl = emailVerificationEmail(email, token);
    await sendMail({ to: email, ...tpl });
  } catch (err) {
    logger.warn({ err, userId: user.id }, "[signup] verification email failed");
    // Don't block signup — the user can request another from the dashboard banner.
  }

  await signIn("credentials", {
    email,
    password,
    redirectTo: role === "EMPLOYER" ? "/employer/onboarding" : "/onboarding",
  });
  // signIn either redirects or throws; control should never reach here
  return { ok: true };
}

const signinSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function signinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Honeypot — silently reject obvious bot signin attempts. We don't time-
  // gate signin because password managers fill the form too fast.
  if (honeypotTriggered(formData.get("website"))) {
    logger.info({ ip: await clientIp() }, "[signin] honeypot triggered");
    return { ok: false, message: "Invalid email or password." };
  }

  const parsed = signinSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()),
    };
  }
  const email = parsed.data.email.toLowerCase();
  const ip = await clientIp();

  // Per-email + per-IP rate-limit. Per-email caps brute-force on a known
  // address; per-IP caps credential-stuffing across many addresses from
  // the same network.
  try {
    await rateLimitOrThrow(`signin:${email}`, "signin");
    if (ip) await rateLimitOrThrow(`signin-ip:${ip}`, "signinIp");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Too many attempts" };
  }

  // Hard lockout — if the account has tripped the failed-login counter
  // (set inside Credentials.authorize), refuse to even attempt a verify.
  // The counter resets on successful login; lockedUntil is a cool-off.
  const u = await db.user.findUnique({
    where: { email },
    select: { id: true, lockedUntil: true },
  });
  if (u?.lockedUntil && u.lockedUntil > new Date()) {
    const mins = Math.ceil((u.lockedUntil.getTime() - Date.now()) / 60_000);
    return {
      ok: false,
      message: `This account is temporarily locked after too many failed sign-ins. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or reset your password.`,
    };
  }

  const next = String(formData.get("next") ?? "/me");
  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirectTo: next,
    });
  } catch (e) {
    // NextAuth throws a redirect "error" on success — re-throw so Next.js can intercept
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    return {
      ok: false,
      message: "Invalid email or password.",
      fieldErrors: { password: "Check your password and try again" },
    };
  }
  return { ok: true };
}

export async function googleSignIn() {
  await signIn("google", { redirectTo: "/me" });
}

export async function linkedinSignIn() {
  await signIn("linkedin", { redirectTo: "/me" });
}

// Helper for the "next" param-aware OAuth start
export async function googleSignInWithNext(formData: FormData) {
  const next = String(formData.get("next") ?? "/me");
  await signIn("google", { redirectTo: next });
}

export async function linkedinSignInWithNext(formData: FormData) {
  const next = String(formData.get("next") ?? "/me");
  await signIn("linkedin", { redirectTo: next });
}

export async function signOutAction() {
  const { signOut } = await import("@/lib/auth");
  await signOut({ redirectTo: "/" });
}

// ─── Password reset ─────────────────────────────────────────

const requestResetSchema = z.object({
  email: z.string().email("Enter a valid email address").toLowerCase(),
});

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = requestResetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()) };
  }
  try {
    await rateLimitOrThrow(`pwreset:${parsed.data.email}`, "signup");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Too many attempts" };
  }

  const { issueToken } = await import("@/lib/auth-tokens");
  const { passwordResetEmail } = await import("@/lib/emails/templates");
  const { sendMail } = await import("@/lib/mail");

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  // Always return ok — don't leak whether the email exists.
  if (user) {
    const { token } = await issueToken("password-reset", parsed.data.email);
    const tpl = passwordResetEmail(parsed.data.email, token);
    await sendMail({ to: parsed.data.email, ...tpl });
  }
  return {
    ok: true,
    message: "If that email is registered, you'll get a reset link in a minute.",
  };
}

const resetSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8, "Password must be at least 8 characters").max(120),
});

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()) };
  }
  const { consumeToken } = await import("@/lib/auth-tokens");
  const email = await consumeToken("password-reset", parsed.data.token);
  if (!email) {
    return { ok: false, message: "This reset link has expired or is invalid. Request a new one." };
  }

  const { hashPassword } = await import("@/lib/auth");
  const passwordHash = await hashPassword(parsed.data.password);
  await db.user.update({ where: { email }, data: { passwordHash } });

  await signIn("credentials", {
    email,
    password: parsed.data.password,
    redirectTo: "/me",
  });
  return { ok: true };
}

// ─── Email verification ─────────────────────────────────────

export async function requestEmailVerification(): Promise<FormState> {
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  if (!session?.user?.email) return { ok: false, message: "Sign in first." };

  const u = await db.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerifiedAt: true, email: true },
  });
  if (u?.emailVerifiedAt) return { ok: true, message: "Your email is already verified." };

  try {
    await rateLimitOrThrow(`emailverify:${session.user.email}`, "signup");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Too many attempts" };
  }

  const { issueToken } = await import("@/lib/auth-tokens");
  const { emailVerificationEmail } = await import("@/lib/emails/templates");
  const { sendMail } = await import("@/lib/mail");
  const { token } = await issueToken("email-verify", session.user.email);
  const tpl = emailVerificationEmail(session.user.email, token);
  await sendMail({ to: session.user.email, ...tpl });
  return { ok: true, message: "Verification email sent. Check your inbox." };
}

/**
 * Magic-link sign-in. Sends a one-time link to the email; clicking it
 * signs the user in (creating an account on first click). Doesn't require
 * a password, so it doubles as a passwordless sign-up flow.
 *
 * Rate-limited per email + IP-equivalent so a hostile actor can't pump
 * mail through SES.
 */
export async function magicLinkSignIn(_prev: FormState, formData: FormData): Promise<FormState> {
  // Honeypot — bots that pump email through this endpoint to burn SES
  // credits hit this first. Pretend we sent the link.
  if (honeypotTriggered(formData.get("website"))) {
    logger.info({ ip: await clientIp() }, "[magic-link] honeypot triggered");
    return {
      ok: true,
      message: "Check your inbox for a sign-in link. If you don't see it within a minute, peek in spam.",
    };
  }

  const turnstileOk = await verifyTurnstile(formData.get("cf-turnstile-response") as string | null);
  if (!turnstileOk) {
    return { ok: false, message: "Please complete the verification challenge and try again." };
  }

  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) {
    return { ok: false, fieldErrors: { email: "Enter a valid email address" } };
  }
  const lower = email.data.toLowerCase();

  // Reject disposable email addresses on magic-link too — otherwise a bot
  // can sign-up-via-magic-link with a throwaway and dodge the explicit
  // signup flow's check.
  if (isDisposableEmail(lower)) {
    return { ok: false, fieldErrors: { email: "Disposable email addresses aren't allowed." } };
  }

  // Per-email + per-IP rate-limit — caps both per-address abuse and SES
  // burn-through from a single IP cycling addresses.
  const ip = await clientIp();
  try {
    await rateLimitOrThrow(`magic-link:${lower}`, "signup");
    if (ip) await rateLimitOrThrow(`magic-link-ip:${ip}`, "magicLinkIp");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Too many attempts" };
  }
  const next = String(formData.get("next") ?? "/me");
  try {
    await signIn("email", { email: lower, redirectTo: next });
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    return {
      ok: true,
      message: "Check your inbox for a sign-in link. If you don't see it within a minute, peek in spam.",
    };
  }
  return {
    ok: true,
    message: "Check your inbox for a sign-in link. If you don't see it within a minute, peek in spam.",
  };
}

export async function verifyEmail(token: string): Promise<{ ok: boolean; email?: string }> {
  const { consumeToken } = await import("@/lib/auth-tokens");
  const email = await consumeToken("email-verify", token);
  if (!email) return { ok: false };
  const u = await db.user.update({
    where: { email },
    data: { emailVerifiedAt: new Date() },
    select: { candidateProfile: { select: { id: true } } },
  });
  // Email-verified counts toward profile completeness — recompute so the
  // 50% / 90% gates flip immediately without waiting for the next edit.
  if (u.candidateProfile) {
    const { recalcCompleteness } = await import("@/lib/profile-completeness");
    await recalcCompleteness(u.candidateProfile.id);
  }
  return { ok: true, email };
}

// Force fresh redirect compile path — re-export so Next sees actions
void redirect;
