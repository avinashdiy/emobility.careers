"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, signIn } from "@/lib/auth";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { withUniqueSlug } from "@/lib/slug";
import { audit } from "@/lib/audit";
import { type FormState, zodErrorsToFieldErrors } from "@/lib/form-state";
import { Role } from "@prisma/client";

const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  email: z.string().email("Enter a valid email address").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters").max(120),
  role: z.enum(["CANDIDATE", "EMPLOYER"], { errorMap: () => ({ message: "Pick a role" }) }),
});

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the errors below.",
      fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()),
    };
  }

  // Rate limit by email to prevent enumeration / abuse
  try {
    await rateLimitOrThrow(`signup:${parsed.data.email}`, "signup");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Too many attempts" };
  }

  const { name, email, password, role } = parsed.data;

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return {
      ok: false,
      message: "An account with that email already exists.",
      fieldErrors: { email: "Email already in use" },
    };
  }

  const passwordHash = await hashPassword(password);
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name, email, passwordHash, role: role as Role },
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
    meta: { role },
  });

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
  const parsed = signinSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()),
    };
  }

  try {
    await rateLimitOrThrow(`signin:${parsed.data.email}`, "signin");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Too many attempts" };
  }

  const next = String(formData.get("next") ?? "/me");
  try {
    await signIn("credentials", {
      email: parsed.data.email,
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
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) {
    return { ok: false, fieldErrors: { email: "Enter a valid email address" } };
  }
  try {
    await rateLimitOrThrow(`magic-link:${email.data}`, "signup");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Too many attempts" };
  }
  const next = String(formData.get("next") ?? "/me");
  try {
    await signIn("email", { email: email.data, redirectTo: next });
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
  await db.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  return { ok: true, email };
}

// Force fresh redirect compile path — re-export so Next sees actions
void redirect;
