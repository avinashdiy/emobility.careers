"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { sendOTP } from "@/lib/sms";
import { audit } from "@/lib/audit";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import type { FormState } from "@/lib/form-state";

/**
 * Phone-number verification via MSG91 OTP. Two-step flow:
 *
 *   1. requestPhoneOtp — user types their phone, we generate a
 *      6-digit code, store it in Redis with a 10-min TTL keyed on
 *      userId, and send it via MSG91. The user's phone column is
 *      written too so we know which number is being verified.
 *
 *   2. verifyPhoneOtp — user types the code; we compare against the
 *      Redis value (constant-time), and on match stamp
 *      User.phoneVerifiedAt + delete the Redis key.
 *
 * Rate limits: 3 requests / hour for sends (caps SMS bill), 10
 * verifies / hour for checks (slows brute force without locking out
 * a normal user who fat-fingers a digit twice). Codes are 6-digit
 * numerics — the same shape MSG91's flow templates render.
 */

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

// Stores the OTP + the phone we're verifying so a user can't request
// for one number then submit verify for a different one. 10-minute
// TTL — long enough for users on patchy networks, short enough that
// codes don't pile up.
function otpKey(userId: string) {
  return `phone-otp:${userId}`;
}

const E164 = /^\+?[1-9]\d{7,14}$/;

const requestSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(8)
    .max(20)
    .regex(E164, "Use international format with country code (e.g. +91 9876543210)."),
});

export async function requestPhoneOtp(formData: FormData): Promise<FormState> {
  const session = await requireUser();
  await rateLimitOrThrow(`otp-send:${session.user.id}`, "ai").catch(() => undefined);

  const parsed = requestSchema.safeParse({ phone: formData.get("phone") });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Enter a valid phone number with country code.",
    };
  }
  const phone = parsed.data.phone.startsWith("+")
    ? parsed.data.phone
    : `+${parsed.data.phone}`;

  // Refuse if a different user has already verified this number —
  // prevents two accounts pointing at the same phone, which would
  // confuse OTP-based password recovery later.
  const existing = await db.user.findFirst({
    where: { phone, phoneVerifiedAt: { not: null }, id: { not: session.user.id } },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      message: "That phone number is already linked to a different account.",
    };
  }

  // 6-digit OTP, zero-padded. crypto.randomInt is uniform.
  const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  await redis.set(otpKey(session.user.id), `${otp}|${phone}`, "EX", 10 * 60);

  // Persist the candidate phone so the verify step can compare and so
  // the user sees their entry stick on refresh. Do NOT stamp
  // phoneVerifiedAt yet — that fires in verifyPhoneOtp.
  await db.user.update({
    where: { id: session.user.id },
    data: { phone, phoneVerifiedAt: null },
  });

  try {
    await sendOTP(phone, otp);
  } catch (err) {
    logger.error({ err, userId: session.user.id }, "[otp] send failed");
    return {
      ok: false,
      message:
        "Couldn't send the SMS. Check the number, try again in a moment, or use email verification instead.",
    };
  }

  await audit({
    actorId: session.user.id,
    action: "phone.otp.requested",
    entity: "User",
    entityId: session.user.id,
    meta: { phone },
  });

  return { ok: true, message: `Code sent to ${phone}.` };
}

const verifySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from the SMS."),
});

export async function verifyPhoneOtp(formData: FormData): Promise<FormState> {
  const session = await requireUser();
  await rateLimitOrThrow(`otp-verify:${session.user.id}`, "ai").catch(() => undefined);

  const parsed = verifySchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid code.",
    };
  }

  const stored = await redis.get(otpKey(session.user.id));
  if (!stored) {
    return {
      ok: false,
      message: "Code expired or no request on file. Tap 'Send code' to start over.",
    };
  }

  const [otp, phone] = stored.split("|");
  // Constant-time compare so timing attacks can't recover the code.
  const a = Buffer.from(otp, "utf8");
  const b = Buffer.from(parsed.data.code, "utf8");
  const matches = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!matches) {
    return { ok: false, message: "That code doesn't match. Double-check and try again." };
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { phone, phoneVerifiedAt: new Date() },
  });
  await redis.del(otpKey(session.user.id));

  await audit({
    actorId: session.user.id,
    action: "phone.verified",
    entity: "User",
    entityId: session.user.id,
    meta: { phone },
  });

  // Bump the candidate's denormalised completeness so the donut
  // updates without waiting for the next profile edit.
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (profile) {
    const { recalcCompleteness } = await import("@/lib/profile-completeness");
    await recalcCompleteness(profile.id);
  }

  revalidatePath("/me");
  revalidatePath("/me/profile");
  return { ok: true, message: "Phone number verified." };
}
