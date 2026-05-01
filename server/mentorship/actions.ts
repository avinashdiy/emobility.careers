"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { notificationsQueue } from "@/lib/queues";
import {
  createRazorpayOrder,
  verifyCheckoutSignature,
  isRazorpayConfigured,
} from "@/lib/payments/razorpay";
import type { FormState } from "@/lib/form-state";
import { zodErrorsToFieldErrors } from "@/lib/form-state";
import { getBooleanSetting } from "@/lib/settings";
import { sendBookingConfirmationEmail } from "@/lib/calendar/booking-email";
import { logger } from "@/lib/logger";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

// ─── Mentor profile editing (mentor side) ─────────────────────

const MentorProfileSchema = z.object({
  headline: z.string().min(8).max(140),
  bio: z.string().min(50).max(4000),
  expertiseTags: z.array(z.string().min(1).max(30)).max(20).default([]),
  evDomainSlugs: z.array(z.string().min(1)).max(10).default([]),
  languages: z.array(z.string().min(2).max(8)).max(10).default([]),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  pricePerSessionMinor: z.coerce.number().int().min(0).max(10_000_00 * 100), // ≤ ₹10L cap (paranoia)
  currency: z.enum(["INR", "USD"]).default("INR"),
  acceptingFree: z.coerce.boolean().default(false),
  acceptingPaid: z.coerce.boolean().default(false),
  sessionDurations: z.array(z.coerce.number().int().min(15).max(120)).min(1).max(4),
  bufferMinutes: z.coerce.number().int().min(0).max(60).default(15),
  defaultMode: z.enum(["VIDEO", "PHONE", "CHAT"]).default("VIDEO"),
});

export async function upsertMentorProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const userId = session.user.id;

  const parsed = MentorProfileSchema.safeParse({
    headline: formData.get("headline"),
    bio: formData.get("bio"),
    expertiseTags: (formData.get("expertiseTags") as string | null)?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
    evDomainSlugs: formData.getAll("evDomainSlugs").map(String).filter(Boolean),
    languages: formData.getAll("languages").map(String).filter(Boolean),
    yearsExperience: formData.get("yearsExperience"),
    pricePerSessionMinor: formData.get("pricePerSessionMinor"),
    currency: formData.get("currency"),
    acceptingFree: formData.get("acceptingFree"),
    acceptingPaid: formData.get("acceptingPaid"),
    sessionDurations: formData.getAll("sessionDurations").map((v) => Number(v)).filter((n) => Number.isFinite(n)),
    bufferMinutes: formData.get("bufferMinutes"),
    defaultMode: formData.get("defaultMode"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Please fix the errors below.", fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()) };
  }
  if (!parsed.data.acceptingFree && !parsed.data.acceptingPaid) {
    return { ok: false, message: "Pick at least one of free or paid sessions." };
  }
  if (parsed.data.acceptingPaid && parsed.data.pricePerSessionMinor <= 0) {
    return { ok: false, message: "Set a non-zero price for paid sessions." };
  }

  await db.mentorProfile.upsert({
    where: { userId },
    create: { userId, ...parsed.data },
    update: parsed.data,
  });
  revalidatePath("/me/mentor");
  return { ok: true, message: "Saved." };
}

// Submit current profile + evidence for KYC review. Doesn't go live until
// admin flips kycStatus → APPROVED.
export async function submitMentorKyc(): Promise<FormState> {
  const session = await requireUser();
  const profile = await db.mentorProfile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return { ok: false, message: "Save your mentor profile first." };
  if (profile.kycStatus === "PENDING") return { ok: false, message: "Already under review." };
  if (profile.kycStatus === "APPROVED") return { ok: false, message: "You're already approved." };

  await db.mentorProfile.update({
    where: { id: profile.id },
    data: { kycStatus: "PENDING", kycSubmittedAt: new Date(), kycRejectionNote: null },
  });
  await audit({
    actorId: session.user.id,
    action: "mentor.kyc.submit",
    entity: "MentorProfile",
    entityId: profile.id,
  });
  revalidatePath("/me/mentor");
  revalidatePath("/admin/mentors");
  return { ok: true, message: "Submitted for review." };
}

// Toggle published flag once KYC is approved.
export async function setMentorPublished(published: boolean): Promise<FormState> {
  const session = await requireUser();
  const profile = await db.mentorProfile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return { ok: false, message: "No mentor profile." };
  if (profile.kycStatus !== "APPROVED") {
    return { ok: false, message: "KYC must be approved before going live." };
  }
  await db.mentorProfile.update({ where: { id: profile.id }, data: { isPublished: published } });
  revalidatePath("/me/mentor");
  revalidatePath("/mentors");
  return { ok: true };
}

// ─── Availability rules ───────────────────────────────────────

const RecurringRuleSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startMinute: z.coerce.number().int().min(0).max(1440),
  endMinute: z.coerce.number().int().min(0).max(1440),
});

export async function addRecurringAvailability(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const profile = await db.mentorProfile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return { ok: false, message: "Save your mentor profile first." };

  const parsed = RecurringRuleSchema.safeParse({
    dayOfWeek: formData.get("dayOfWeek"),
    startMinute: formData.get("startMinute"),
    endMinute: formData.get("endMinute"),
  });
  if (!parsed.success) return { ok: false, message: "Invalid time range." };
  if (parsed.data.endMinute <= parsed.data.startMinute) {
    return { ok: false, message: "End must be after start." };
  }

  await db.mentorAvailability.create({
    data: { mentorId: profile.id, kind: "RECURRING", ...parsed.data },
  });
  revalidatePath("/me/mentor/availability");
  return { ok: true };
}

export async function removeAvailabilityRule(ruleId: string): Promise<FormState> {
  const session = await requireUser();
  const rule = await db.mentorAvailability.findUnique({
    where: { id: ruleId },
    include: { mentor: { select: { userId: true } } },
  });
  if (!rule || rule.mentor.userId !== session.user.id) {
    return { ok: false, message: "Not found." };
  }
  await db.mentorAvailability.delete({ where: { id: ruleId } });
  revalidatePath("/me/mentor/availability");
  return { ok: true };
}

const DateOverrideSchema = z.object({
  kind: z.enum(["OVERRIDE", "BLOCKED"]),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
});

export async function addDateOverride(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const profile = await db.mentorProfile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return { ok: false, message: "Save your mentor profile first." };
  const parsed = DateOverrideSchema.safeParse({
    kind: formData.get("kind"),
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt"),
  });
  if (!parsed.success) return { ok: false, message: "Invalid date range." };
  if (parsed.data.endAt <= parsed.data.startAt) {
    return { ok: false, message: "End must be after start." };
  }
  await db.mentorAvailability.create({
    data: {
      mentorId: profile.id,
      kind: parsed.data.kind,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
    },
  });
  revalidatePath("/me/mentor/availability");
  return { ok: true };
}

// ─── Booking ──────────────────────────────────────────────────

const BookingSchema = z.object({
  mentorId: z.string().min(1),
  scheduledAt: z.coerce.date(),
  durationMins: z.coerce.number().int().min(15).max(120),
  topic: z.string().min(10).max(500),
  menteeNotes: z.string().max(2000).optional(),
  mode: z.enum(["VIDEO", "PHONE", "CHAT"]).default("VIDEO"),
});

export interface BookingResult extends FormState {
  sessionId?: string;
  razorpayOrderId?: string;
  amountMinor?: number;
  currency?: string;
  isFree?: boolean;
  razorpayKeyId?: string;
}

export async function createMentorshipBooking(_prev: BookingResult, formData: FormData): Promise<BookingResult> {
  const session = await requireUser();
  await rateLimitOrThrow(`mentorship-book:${session.user.id}`, "ats");

  const parsed = BookingSchema.safeParse({
    mentorId: formData.get("mentorId"),
    scheduledAt: formData.get("scheduledAt"),
    durationMins: formData.get("durationMins"),
    topic: formData.get("topic"),
    menteeNotes: formData.get("menteeNotes") || undefined,
    mode: formData.get("mode") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: "Invalid booking request.", fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()) };
  }

  const mentor = await db.mentorProfile.findUnique({ where: { id: parsed.data.mentorId } });
  if (!mentor || !mentor.isPublished || mentor.kycStatus !== "APPROVED") {
    return { ok: false, message: "Mentor not available." };
  }
  if (mentor.userId === session.user.id) {
    return { ok: false, message: "You can't book a session with yourself." };
  }
  if (!mentor.sessionDurations.includes(parsed.data.durationMins)) {
    return { ok: false, message: "Duration not offered by this mentor." };
  }
  if (parsed.data.scheduledAt.getTime() < Date.now() + 60 * 60 * 1000) {
    return { ok: false, message: "Pick a slot at least 1h from now." };
  }

  // Conflict check: any active session overlapping?
  const slotEnd = new Date(parsed.data.scheduledAt.getTime() + parsed.data.durationMins * 60 * 1000);
  const conflict = await db.mentorshipSession.findFirst({
    where: {
      mentorId: mentor.id,
      status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
      scheduledAt: { lt: slotEnd },
      // crude overlap check; we trust the slot picker to have called getMentorSlots
    },
    orderBy: { scheduledAt: "desc" },
    take: 1,
  });
  if (conflict) {
    const conflictEnd = new Date(conflict.scheduledAt.getTime() + conflict.durationMins * 60 * 1000);
    if (conflictEnd > parsed.data.scheduledAt) {
      return { ok: false, message: "That slot was just taken. Please pick another." };
    }
  }

  // Pricing: free-only mentor → free; paid-only → priced; both → mentee chooses
  // a free request only if mentor's accepting it (formData.get("payFree") === "1")
  const requestedFree = formData.get("requestFree") === "1";
  let isFree =
    requestedFree && mentor.acceptingFree
      ? true
      : !mentor.acceptingPaid
      ? mentor.acceptingFree
      : false;

  // Platform-wide payments kill switch. When admins flip
  // `feature.payments_enabled` off (Razorpay outage, regulatory
  // pause), every booking is forced to free regardless of the
  // mentor's pricing — provided the mentor accepts free sessions.
  // If they don't, we refuse the booking with a friendly message
  // rather than putting them in an unbillable limbo.
  const paymentsEnabled = await getBooleanSetting("feature.payments_enabled");
  if (!paymentsEnabled && !isFree) {
    if (!mentor.acceptingFree) {
      return {
        ok: false,
        message:
          "Paid bookings are temporarily disabled platform-wide. Please try again later or pick a mentor offering free sessions.",
      };
    }
    isFree = true;
  }

  const priceMinor = isFree ? 0 : mentor.pricePerSessionMinor;
  if (!isFree && priceMinor <= 0) return { ok: false, message: "Mentor pricing misconfigured — try again later." };

  // Create the session row first (PENDING_PAYMENT for paid, CONFIRMED for free)
  const icsUid = `mentorship-${crypto.randomBytes(8).toString("hex")}@emobility.careers`;
  const created = await db.mentorshipSession.create({
    data: {
      mentorId: mentor.id,
      menteeUserId: session.user.id,
      scheduledAt: parsed.data.scheduledAt,
      durationMins: parsed.data.durationMins,
      mode: parsed.data.mode,
      topic: parsed.data.topic,
      menteeNotes: parsed.data.menteeNotes,
      status: isFree ? "CONFIRMED" : "PENDING_PAYMENT",
      paymentStatus: isFree ? "FREE" : "PENDING",
      priceMinor,
      currency: mentor.currency,
      icsUid,
    },
  });

  if (isFree) {
    // Notify mentor immediately for free bookings.
    await notificationsQueue.add("mentorship.free-booking", {
      userId: mentor.userId,
      type: "mentorship.booking-confirmed",
      title: "New free mentorship session booked",
      body: `${parsed.data.topic.slice(0, 80)}…`,
      link: `/me/mentor/sessions`,
      payload: { sessionId: created.id },
    });
    await audit({
      actorId: session.user.id,
      action: "mentorship.booking.free",
      entity: "MentorshipSession",
      entityId: created.id,
    });
    // Fire the calendar invite + booking-confirmation email out-of-band
    // so the booking response time isn't gated on email send latency.
    void sendCalendarInviteForSession(created.id).catch((err) =>
      logger.warn({ err, sessionId: created.id }, "[booking] calendar email failed"),
    );
    return { ok: true, sessionId: created.id, isFree: true };
  }

  // Paid path — create a Razorpay order.
  const order = await createRazorpayOrder({
    amountMinor: priceMinor,
    currency: mentor.currency,
    receipt: created.id,
    notes: { sessionId: created.id, mentorId: mentor.id, menteeUserId: session.user.id },
  }).catch((err) => {
    return { error: err instanceof Error ? err.message : "Order create failed" } as const;
  });
  if ("error" in order) {
    await db.mentorshipSession.update({
      where: { id: created.id },
      data: { status: "CANCELLED", paymentStatus: "FAILED", cancelledAt: new Date() },
    });
    return { ok: false, message: `Could not create payment order: ${order.error}` };
  }

  await db.mentorshipSession.update({
    where: { id: created.id },
    data: { razorpayOrderId: order.id },
  });
  await audit({
    actorId: session.user.id,
    action: "mentorship.booking.paid-init",
    entity: "MentorshipSession",
    entityId: created.id,
    meta: { orderId: order.id, amountMinor: priceMinor },
  });
  return {
    ok: true,
    sessionId: created.id,
    razorpayOrderId: order.id,
    amountMinor: priceMinor,
    currency: mentor.currency,
    isFree: false,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  };
}

// Called by the Razorpay Checkout success callback (client → server action).
const VerifySchema = z.object({
  sessionId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

export async function confirmMentorshipPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const parsed = VerifySchema.safeParse({
    sessionId: formData.get("sessionId"),
    razorpayPaymentId: formData.get("razorpayPaymentId"),
    razorpaySignature: formData.get("razorpaySignature"),
  });
  if (!parsed.success) return { ok: false, message: "Invalid verification payload." };

  const sessionRow = await db.mentorshipSession.findUnique({
    where: { id: parsed.data.sessionId },
    include: { mentor: { select: { userId: true } } },
  });
  if (!sessionRow || sessionRow.menteeUserId !== session.user.id) {
    return { ok: false, message: "Booking not found." };
  }
  if (!sessionRow.razorpayOrderId) {
    return { ok: false, message: "No order to verify." };
  }
  const valid =
    !isRazorpayConfigured()
      ? true
      : verifyCheckoutSignature(sessionRow.razorpayOrderId, parsed.data.razorpayPaymentId, parsed.data.razorpaySignature);
  if (!valid) {
    await db.mentorshipSession.update({
      where: { id: sessionRow.id },
      data: { paymentStatus: "FAILED", status: "CANCELLED", cancelledAt: new Date() },
    });
    return { ok: false, message: "Payment signature mismatch — booking cancelled." };
  }
  await db.mentorshipSession.update({
    where: { id: sessionRow.id },
    data: {
      status: "CONFIRMED",
      paymentStatus: "PAID",
      razorpayPaymentId: parsed.data.razorpayPaymentId,
    },
  });
  await notificationsQueue.add("mentorship.paid-booking", {
    userId: sessionRow.mentor.userId,
    type: "mentorship.booking-confirmed",
    title: "New paid mentorship session booked",
    body: `${sessionRow.topic.slice(0, 80)}…`,
    link: `/me/mentor/sessions`,
    payload: { sessionId: sessionRow.id },
  });
  await audit({
    actorId: session.user.id,
    action: "mentorship.booking.paid-confirm",
    entity: "MentorshipSession",
    entityId: sessionRow.id,
  });
  // Fire the calendar invite once payment lands. Out-of-band so the
  // payment-confirmation response time is unaffected by email send.
  void sendCalendarInviteForSession(sessionRow.id).catch((err) =>
    logger.warn({ err, sessionId: sessionRow.id }, "[booking] calendar email failed"),
  );
  revalidatePath("/me/sessions");
  return { ok: true, message: "Booking confirmed." };
}

/**
 * Fetch the session with mentor + mentee email/name, build the ICS,
 * upload it to MinIO, send the confirmation email to both sides, and
 * stamp `calendarInviteSentAt` so the reminder worker doesn't fire
 * a duplicate. Idempotent — short-circuits if already sent (used by
 * both the booking flow and the T-24h reminder worker).
 */
export async function sendCalendarInviteForSession(sessionId: string, opts?: { sequence?: number; force?: boolean }): Promise<void> {
  const row = await db.mentorshipSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      icsUid: true,
      scheduledAt: true,
      durationMins: true,
      topic: true,
      meetingUrl: true,
      status: true,
      calendarInviteSentAt: true,
      mentor: {
        select: {
          userId: true,
          user: { select: { name: true, email: true } },
        },
      },
      mentee: { select: { name: true, email: true } },
    },
  });
  if (!row || !row.icsUid) return;
  if (!opts?.force && row.calendarInviteSentAt) return;
  if (row.status === "CANCELLED") return;
  const mentorName = row.mentor.user.name ?? "Your mentor";
  const menteeName = row.mentee.name ?? "Your mentee";
  if (!row.mentor.user.email || !row.mentee.email) return;
  const result = await sendBookingConfirmationEmail({
    sessionId: row.id,
    icsUid: row.icsUid,
    scheduledAt: row.scheduledAt,
    durationMins: row.durationMins,
    topic: row.topic,
    meetingUrl: row.meetingUrl,
    sequence: opts?.sequence ?? 0,
    mentor: { name: mentorName, email: row.mentor.user.email },
    mentee: { name: menteeName, email: row.mentee.email },
  });
  if (result.ok) {
    await db.mentorshipSession.update({
      where: { id: row.id },
      data: { calendarInviteSentAt: new Date() },
    });
  }
}

// ─── Session lifecycle (mentor side) ─────────────────────────

export async function setSessionMeetingUrl(sessionId: string, url: string): Promise<FormState> {
  const session = await requireUser();
  const row = await db.mentorshipSession.findUnique({
    where: { id: sessionId },
    include: { mentor: { select: { userId: true } } },
  });
  if (!row || row.mentor.userId !== session.user.id) return { ok: false, message: "Not found." };
  const valid = z.string().url().safeParse(url);
  if (!valid.success) return { ok: false, message: "Provide a valid URL." };
  await db.mentorshipSession.update({ where: { id: sessionId }, data: { meetingUrl: url } });
  await notificationsQueue.add("mentorship.meeting-url", {
    userId: row.menteeUserId,
    type: "mentorship.meeting-url",
    title: "Meeting link added to your mentorship session",
    body: "Open the session to join.",
    link: `/me/sessions`,
  });
  revalidatePath("/me/mentor/sessions");
  return { ok: true };
}

export async function markSessionCompleted(sessionId: string, notes: string | null): Promise<FormState> {
  const session = await requireUser();
  const row = await db.mentorshipSession.findUnique({
    where: { id: sessionId },
    include: { mentor: { select: { userId: true, id: true } } },
  });
  if (!row || row.mentor.userId !== session.user.id) return { ok: false, message: "Not found." };
  if (row.status === "COMPLETED") return { ok: false, message: "Already marked completed." };
  await db.$transaction([
    db.mentorshipSession.update({
      where: { id: sessionId },
      data: { status: "COMPLETED", completedAt: new Date(), mentorNotes: notes ?? undefined },
    }),
    db.mentorProfile.update({
      where: { id: row.mentor.id },
      data: {
        totalSessions: { increment: 1 },
        totalEarningsMinor: row.paymentStatus === "PAID" ? { increment: row.priceMinor } : undefined,
      },
    }),
  ]);
  await notificationsQueue.add("mentorship.completed", {
    userId: row.menteeUserId,
    type: "mentorship.session-complete",
    title: "Mentorship session marked complete",
    body: "Leave your mentor a review.",
    link: `/me/sessions`,
  });
  revalidatePath("/me/mentor/sessions");
  revalidatePath("/me/sessions");
  return { ok: true };
}

export async function cancelSession(sessionId: string, reason: string): Promise<FormState> {
  const session = await requireUser();
  const row = await db.mentorshipSession.findUnique({
    where: { id: sessionId },
    include: { mentor: { select: { userId: true } } },
  });
  if (!row) return { ok: false, message: "Not found." };
  const isMentor = row.mentor.userId === session.user.id;
  const isMentee = row.menteeUserId === session.user.id;
  if (!isMentor && !isMentee) return { ok: false, message: "Not your session." };
  if (row.status === "COMPLETED") return { ok: false, message: "Session already completed." };
  if (row.status === "CANCELLED") return { ok: false, message: "Already cancelled." };

  await db.mentorshipSession.update({
    where: { id: sessionId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledByUserId: session.user.id,
      cancellationReason: reason,
      // If paid and >24h before slot, mark for refund; admin processes manually
      paymentStatus:
        row.paymentStatus === "PAID" && row.scheduledAt.getTime() - Date.now() > 24 * 3600 * 1000
          ? "REFUNDED"
          : row.paymentStatus,
      refundAt:
        row.paymentStatus === "PAID" && row.scheduledAt.getTime() - Date.now() > 24 * 3600 * 1000
          ? new Date()
          : undefined,
    },
  });
  await notificationsQueue.add("mentorship.cancelled", {
    userId: isMentor ? row.menteeUserId : row.mentor.userId,
    type: "mentorship.cancelled",
    title: "Mentorship session cancelled",
    body: reason || "The other party cancelled.",
    link: isMentor ? `/me/sessions` : `/me/mentor/sessions`,
  });
  revalidatePath("/me/mentor/sessions");
  revalidatePath("/me/sessions");
  return { ok: true };
}

// ─── Reviews ──────────────────────────────────────────────────

const ReviewSchema = z.object({
  sessionId: z.string(),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().max(2000).optional(),
  isPublic: z.coerce.boolean().default(true),
});

export async function submitReview(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const parsed = ReviewSchema.safeParse({
    sessionId: formData.get("sessionId"),
    rating: formData.get("rating"),
    body: formData.get("body") || undefined,
    isPublic: formData.get("isPublic") || false,
  });
  if (!parsed.success) return { ok: false, message: "Invalid review." };
  const row = await db.mentorshipSession.findUnique({
    where: { id: parsed.data.sessionId },
    include: { review: true },
  });
  if (!row || row.menteeUserId !== session.user.id) return { ok: false, message: "Not your session." };
  if (row.status !== "COMPLETED") return { ok: false, message: "Review after the session is completed." };
  if (row.review) return { ok: false, message: "You've already reviewed this session." };

  await db.$transaction(async (tx) => {
    await tx.mentorshipReview.create({
      data: {
        sessionId: row.id,
        mentorId: row.mentorId,
        reviewerUserId: session.user.id,
        rating: parsed.data.rating,
        body: parsed.data.body,
        isPublic: parsed.data.isPublic,
      },
    });
    const agg = await tx.mentorshipReview.aggregate({
      where: { mentorId: row.mentorId },
      _avg: { rating: true },
      _count: true,
    });
    await tx.mentorProfile.update({
      where: { id: row.mentorId },
      data: { avgRating: agg._avg.rating ?? 0, totalRatings: agg._count },
    });
  });
  revalidatePath("/me/sessions");
  return { ok: true, message: "Thanks for the review." };
}

// ─── Admin actions ────────────────────────────────────────────

async function requireAdmin() {
  const session = await requireUser();
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

export async function approveMentorKyc(mentorId: string): Promise<FormState> {
  const session = await requireAdmin();
  const profile = await db.mentorProfile.findUnique({ where: { id: mentorId } });
  if (!profile) return { ok: false, message: "Not found." };
  await db.mentorProfile.update({
    where: { id: mentorId },
    data: {
      kycStatus: "APPROVED",
      kycReviewedAt: new Date(),
      kycReviewerId: session.user.id,
      kycRejectionNote: null,
    },
  });
  await audit({ actorId: session.user.id, action: "mentor.kyc.approve", entity: "MentorProfile", entityId: mentorId });
  await notificationsQueue.add("mentor.kyc.approved", {
    userId: profile.userId,
    type: "mentor.kyc.approved",
    title: "You're approved as a mentor",
    body: "Set your availability and publish your profile to start receiving bookings.",
    link: "/me/mentor",
  });
  revalidatePath("/admin/mentors");
  return { ok: true };
}

export async function rejectMentorKyc(mentorId: string, note: string): Promise<FormState> {
  const session = await requireAdmin();
  const profile = await db.mentorProfile.findUnique({ where: { id: mentorId } });
  if (!profile) return { ok: false, message: "Not found." };
  await db.mentorProfile.update({
    where: { id: mentorId },
    data: {
      kycStatus: "REJECTED",
      kycReviewedAt: new Date(),
      kycReviewerId: session.user.id,
      kycRejectionNote: note,
      isPublished: false,
    },
  });
  await audit({ actorId: session.user.id, action: "mentor.kyc.reject", entity: "MentorProfile", entityId: mentorId, meta: { note } });
  await notificationsQueue.add("mentor.kyc.rejected", {
    userId: profile.userId,
    type: "mentor.kyc.rejected",
    title: "Mentor application needs changes",
    body: note,
    link: "/me/mentor",
  });
  revalidatePath("/admin/mentors");
  return { ok: true };
}

const PayoutSchema = z.object({
  mentorId: z.string(),
  amountMinor: z.coerce.number().int().min(1),
  externalRef: z.string().min(1).max(100),
  notes: z.string().max(2000).optional(),
});

export async function recordMentorPayout(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = PayoutSchema.safeParse({
    mentorId: formData.get("mentorId"),
    amountMinor: formData.get("amountMinor"),
    externalRef: formData.get("externalRef"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Invalid payout entry." };
  const profile = await db.mentorProfile.findUnique({ where: { id: parsed.data.mentorId } });
  if (!profile) return { ok: false, message: "Mentor not found." };

  const now = new Date();
  await db.mentorshipPayout.create({
    data: {
      mentorId: parsed.data.mentorId,
      amountMinor: parsed.data.amountMinor,
      currency: profile.currency,
      periodStart: new Date(now.getTime() - 30 * 24 * 3600 * 1000),
      periodEnd: now,
      status: "PAID",
      paidAt: now,
      externalRef: parsed.data.externalRef,
      notes: parsed.data.notes,
    },
  });
  await audit({
    actorId: session.user.id,
    action: "mentor.payout.recorded",
    entity: "MentorProfile",
    entityId: parsed.data.mentorId,
    meta: { amountMinor: parsed.data.amountMinor, externalRef: parsed.data.externalRef },
  });
  revalidatePath(`/admin/mentors/${parsed.data.mentorId}`);
  return { ok: true, message: "Payout recorded." };
}
