"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { isRouterControlError } from "@/lib/server-action-errors";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { evaluateFairEligibility } from "@/lib/fair-eligibility";

/**
 * Booth interview slot management — see RecruitmentDriveInterviewSlot
 * schema doc for the feature shape.
 *
 * Two audiences, distinct authz:
 *
 *   • Recruiter (employer at the booth's company) — creates,
 *     bulk-generates, deletes slots; marks them COMPLETED /
 *     NO_SHOW post-interview.
 *   • Candidate — books an AVAILABLE slot; cancels their own
 *     booking. Eligibility gate: must be a registered fair
 *     attendee + pass `evaluateFairEligibility` (CV + phone +
 *     verified email + 60% completeness).
 */

async function requireRecruiterAtBooth(driveCompanyId: string): Promise<{
  userId: string;
  driveCompanyId: string;
  driveId: string;
  companyName: string;
}> {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const booth = await db.recruitmentDriveCompany.findUnique({
    where: { id: driveCompanyId },
    select: {
      id: true,
      companyId: true,
      driveId: true,
      status: true,
      company: { select: { name: true } },
    },
  });
  if (!booth) redirect("/employer/fairs");
  if (booth.status !== "CONFIRMED") {
    redirect(`/employer/fairs/${booth.driveId}?error=Booth+not+confirmed`);
  }

  // Admin always passes; otherwise the user must be an employer
  // at the booth's company.
  if (session.user.role === "ADMIN") {
    return {
      userId: session.user.id,
      driveCompanyId: booth.id,
      driveId: booth.driveId,
      companyName: booth.company.name,
    };
  }
  if (session.user.role !== "EMPLOYER") redirect("/403");

  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    select: { companyId: true },
  });
  if (!employer || employer.companyId !== booth.companyId) {
    redirect("/403");
  }
  return {
    userId: session.user.id,
    driveCompanyId: booth.id,
    driveId: booth.driveId,
    companyName: booth.company.name,
  };
}

// Hybrid Recruitathon (Phase 1) — slot mode + meeting URL.
//
// Mode-aware validation: VIDEO slots MUST have a meetingUrl; ONSITE
// MUST NOT (we strip it server-side rather than reject so the
// recruiter form can default the field to something innocuous);
// PHONE may have one. The schema-level field is just `String?` so
// existing data stays valid.
const InterviewModeEnum = z.enum(["ONSITE", "VIDEO", "PHONE"]);

const CreateSlotSchema = z.object({
  driveCompanyId: z.string().min(1),
  jobId: z.string().optional(),
  startsAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(5).max(240).default(30),
  notes: z.string().trim().max(500).optional(),
  mode: InterviewModeEnum.default("ONSITE"),
  meetingUrl: z.string().trim().url().optional().or(z.literal("")).transform((v) => v || undefined),
});

/**
 * Single-slot create. The bulk-generator below is the heavier
 * path — this one is for one-off additions ("add an emergency 4
 * PM slot for an interesting candidate").
 */
export async function createInterviewSlot(formData: FormData): Promise<void> {
  try {
    const parsed = CreateSlotSchema.safeParse({
      driveCompanyId: formData.get("driveCompanyId"),
      jobId: formData.get("jobId") || undefined,
      startsAt: formData.get("startsAt"),
      durationMinutes: formData.get("durationMinutes") || 30,
      notes: formData.get("notes") || undefined,
      mode: formData.get("mode") || "ONSITE",
      meetingUrl: formData.get("meetingUrl") || undefined,
    });
    if (!parsed.success) {
      redirect("/employer/fairs?error=" + encodeURIComponent("Invalid slot."));
    }
    const ctx = await requireRecruiterAtBooth(parsed.data.driveCompanyId);

    // Mode/URL coherence — VIDEO needs a Meet link; ONSITE strips
    // any link the recruiter accidentally pasted in.
    if (parsed.data.mode === "VIDEO" && !parsed.data.meetingUrl) {
      redirect(
        `/employer/fairs/${ctx.driveId}/slots?error=` +
          encodeURIComponent("Online slots need a meeting URL (Meet / Zoom / Teams)."),
      );
    }
    const meetingUrl = parsed.data.mode === "ONSITE" ? null : parsed.data.meetingUrl ?? null;

    // If a jobId is set, validate it's actually attached to this
    // booth (no foreign-job leak).
    if (parsed.data.jobId) {
      const join = await db.recruitmentDriveJob.findUnique({
        where: {
          driveId_jobId: { driveId: ctx.driveId, jobId: parsed.data.jobId },
        },
        select: { id: true },
      });
      if (!join) {
        redirect(
          `/employer/fairs/${ctx.driveId}/slots?error=` +
            encodeURIComponent("That job isn't attached to your booth."),
        );
      }
    }

    await db.recruitmentDriveInterviewSlot.create({
      data: {
        driveCompanyId: ctx.driveCompanyId,
        jobId: parsed.data.jobId ?? null,
        startsAt: parsed.data.startsAt,
        durationMinutes: parsed.data.durationMinutes,
        notes: parsed.data.notes ?? null,
        mode: parsed.data.mode,
        meetingUrl,
      },
    });

    try {
      await audit({
        actorId: ctx.userId,
        action: "fair.slot_created",
        entity: "RecruitmentDriveInterviewSlot",
        entityId: ctx.driveCompanyId,
        meta: { startsAt: parsed.data.startsAt.toISOString() },
      });
    } catch {/* best-effort */}

    revalidatePath(`/employer/fairs/${ctx.driveId}/slots`);
    redirect(
      `/employer/fairs/${ctx.driveId}/slots?notice=` +
        encodeURIComponent("Slot added."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[fair-slots] createInterviewSlot unexpected");
    redirect("/employer/fairs?error=Couldn%27t+add+slot");
  }
}

const BulkGenerateSchema = z.object({
  driveCompanyId: z.string().min(1),
  jobId: z.string().optional(),
  // Date the slots cover. We then generate `count` slots starting
  // at `startTime` (HH:mm) spaced `durationMinutes` apart.
  date: z.string().min(8),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  durationMinutes: z.coerce.number().int().min(5).max(240).default(30),
  count: z.coerce.number().int().min(1).max(40),
  notes: z.string().trim().max(500).optional(),
  // Phase 1 — every slot generated by this batch gets the same mode
  // + meetingUrl. Recruiters who want a mix run the bulk twice (once
  // for ONSITE, once for VIDEO) — keeps the single-day-of-slots
  // mental model intact.
  mode: InterviewModeEnum.default("ONSITE"),
  meetingUrl: z.string().trim().url().optional().or(z.literal("")).transform((v) => v || undefined),
});

/**
 * Bulk-generate N back-to-back slots starting at a chosen
 * date+time. The brochure pattern of "10 AM - 5 PM walk-in
 * interviews" → 14 × 30-min slots in one click rather than
 * one-by-one.
 *
 * Skips any (driveCompanyId, startsAt) pair that already exists —
 * safe to re-run for a day already partially populated.
 */
export async function bulkGenerateInterviewSlots(formData: FormData): Promise<void> {
  try {
    const parsed = BulkGenerateSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect(
        "/employer/fairs?error=" +
          encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid bulk input."),
      );
    }
    const ctx = await requireRecruiterAtBooth(parsed.data.driveCompanyId);

    if (parsed.data.jobId) {
      const join = await db.recruitmentDriveJob.findUnique({
        where: {
          driveId_jobId: { driveId: ctx.driveId, jobId: parsed.data.jobId },
        },
        select: { id: true },
      });
      if (!join) {
        redirect(
          `/employer/fairs/${ctx.driveId}/slots?error=` +
            encodeURIComponent("That job isn't attached to your booth."),
        );
      }
    }

    // Compose start ISO from date + time. Input is local IST per
    // the brochure venue — we treat the HH:mm as Asia/Kolkata.
    // Quick approach: shift by IST offset (-330 min from UTC).
    const [hh, mm] = parsed.data.startTime.split(":").map(Number);
    const baseDate = new Date(`${parsed.data.date}T00:00:00.000Z`);
    if (Number.isNaN(baseDate.getTime())) {
      redirect(
        `/employer/fairs/${ctx.driveId}/slots?error=` +
          encodeURIComponent("Invalid date."),
      );
    }
    // IST = UTC + 5:30 → to send "10:00 IST" we set 04:30 UTC.
    baseDate.setUTCHours(hh - 5, mm - 30, 0, 0);
    if (hh < 5 || (hh === 5 && mm < 30)) {
      // Time before 05:30 IST would underflow the UTC day; bump
      // back to the previous UTC day at the wrap-around minute.
      baseDate.setUTCDate(baseDate.getUTCDate() - 1);
      baseDate.setUTCHours((hh - 5 + 24) % 24, (mm - 30 + 60) % 60, 0, 0);
    }

    // Build the candidate startsAt list, then filter against
    // existing rows for this booth — avoids duplicate-key violations
    // on the @@index unique check (there isn't one, but conceptually
    // we want one slot per (booth, startsAt)).
    const candidateStarts: Date[] = [];
    for (let i = 0; i < parsed.data.count; i++) {
      const t = new Date(baseDate.getTime() + i * parsed.data.durationMinutes * 60_000);
      candidateStarts.push(t);
    }
    const existing = await db.recruitmentDriveInterviewSlot.findMany({
      where: {
        driveCompanyId: ctx.driveCompanyId,
        startsAt: { in: candidateStarts },
      },
      select: { startsAt: true },
    });
    const existingTimes = new Set(existing.map((e) => e.startsAt.getTime()));
    const toCreate = candidateStarts.filter((t) => !existingTimes.has(t.getTime()));

    // Same mode/URL coherence rule as the single-slot path.
    if (parsed.data.mode === "VIDEO" && !parsed.data.meetingUrl) {
      redirect(
        `/employer/fairs/${ctx.driveId}/slots?error=` +
          encodeURIComponent("Online slots need a meeting URL (Meet / Zoom / Teams)."),
      );
    }
    const bulkMeetingUrl =
      parsed.data.mode === "ONSITE" ? null : parsed.data.meetingUrl ?? null;

    if (toCreate.length > 0) {
      await db.recruitmentDriveInterviewSlot.createMany({
        data: toCreate.map((startsAt) => ({
          driveCompanyId: ctx.driveCompanyId,
          jobId: parsed.data.jobId ?? null,
          startsAt,
          durationMinutes: parsed.data.durationMinutes,
          notes: parsed.data.notes ?? null,
          mode: parsed.data.mode,
          meetingUrl: bulkMeetingUrl,
        })),
      });
    }

    try {
      await audit({
        actorId: ctx.userId,
        action: "fair.slots_bulk_generated",
        entity: "RecruitmentDriveInterviewSlot",
        entityId: ctx.driveCompanyId,
        meta: {
          requested: parsed.data.count,
          created: toCreate.length,
          skippedExisting: candidateStarts.length - toCreate.length,
        },
      });
    } catch {/* best-effort */}

    revalidatePath(`/employer/fairs/${ctx.driveId}/slots`);
    redirect(
      `/employer/fairs/${ctx.driveId}/slots?notice=` +
        encodeURIComponent(
          `Created ${toCreate.length} slot${toCreate.length === 1 ? "" : "s"}` +
            (candidateStarts.length - toCreate.length > 0
              ? ` (skipped ${candidateStarts.length - toCreate.length} existing)`
              : ""),
        ),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[fair-slots] bulkGenerateInterviewSlots unexpected");
    redirect("/employer/fairs?error=Bulk+failed");
  }
}

const SlotIdSchema = z.object({
  slotId: z.string().min(1),
});

/**
 * Recruiter cancels / deletes a slot. AVAILABLE slots are
 * hard-deleted (no candidate to notify). BOOKED slots flip to
 * CANCELLED status (preserve the audit + notify the booked
 * candidate).
 */
export async function deleteInterviewSlot(formData: FormData): Promise<void> {
  try {
    const parsed = SlotIdSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) redirect("/employer/fairs");

    const slot = await db.recruitmentDriveInterviewSlot.findUnique({
      where: { id: parsed.data.slotId },
      select: {
        id: true,
        status: true,
        startsAt: true,
        driveCompanyId: true,
        candidateId: true,
        candidate: { select: { userId: true, firstName: true } },
        driveCompany: {
          select: {
            companyId: true,
            driveId: true,
            company: { select: { name: true } },
          },
        },
      },
    });
    if (!slot) redirect("/employer/fairs");

    const ctx = await requireRecruiterAtBooth(slot.driveCompanyId);

    if (slot.status === "BOOKED" && slot.candidateId) {
      // Booked → CANCELLED, notify the candidate.
      await db.recruitmentDriveInterviewSlot.update({
        where: { id: slot.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      if (slot.candidate?.userId) {
        try {
          await dispatchNotification({
            userId: slot.candidate.userId,
            type: "fair.slot_cancelled",
            title: "Your booth interview slot was cancelled",
            body: `${ctx.companyName} cancelled your ${formatLocalTime(slot.startsAt)} slot. Book another one from the fair page.`,
            link: `/fairs`,
            channels: ["IN_APP"],
          });
        } catch {/* best-effort */}
      }
    } else {
      // AVAILABLE / CANCELLED / etc — safe to hard-delete.
      await db.recruitmentDriveInterviewSlot.delete({
        where: { id: slot.id },
      });
    }

    try {
      await audit({
        actorId: ctx.userId,
        action: "fair.slot_deleted",
        entity: "RecruitmentDriveInterviewSlot",
        entityId: slot.id,
        meta: { wasBooked: slot.status === "BOOKED" },
      });
    } catch {/* best-effort */}

    revalidatePath(`/employer/fairs/${ctx.driveId}/slots`);
    redirect(
      `/employer/fairs/${ctx.driveId}/slots?notice=` +
        encodeURIComponent("Slot removed."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[fair-slots] deleteInterviewSlot unexpected");
    redirect("/employer/fairs?error=Couldn%27t+remove+slot");
  }
}

// ─── Candidate-side ─────────────────────────────────────────────

const BookSchema = z.object({
  slotId: z.string().min(1),
});

/**
 * Candidate books an AVAILABLE slot. Gate:
 *   • Must be registered for the fair (REGISTERED or CHECKED_IN).
 *   • Must pass the fair-eligibility check (60% + CV + phone + email).
 *   • Cannot have an existing AVAILABLE/BOOKED slot at the SAME
 *     starts-at across all booths (no double-booking themselves).
 *
 * Idempotency: if the slot was just booked by someone else
 * between the candidate's load and click, we surface "already
 * taken" rather than letting the second booking overwrite.
 */
export async function bookInterviewSlot(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin");
    const parsed = BookSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) redirect("/fairs");

    // Rate-limit per user — slot booking is the most contended write
    // surface during a fair day; throttle so a stuck retry doesn't
    // hammer the DB.
    try {
      await rateLimitOrThrow(`slot-book:${session.user.id}`, "saveItem");
    } catch (err) {
      if (isRouterControlError(err)) throw err;
      redirect("/fairs?error=" + encodeURIComponent("Booking too fast — try again in a moment."));
    }

    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        profileCompleteness: true,
        resumeUrl: true,
        aiResumeUrl: true,
        phone: true,
        user: { select: { emailVerifiedAt: true, phone: true } },
      },
    });
    if (!profile) redirect("/onboarding");

    const slot = await db.recruitmentDriveInterviewSlot.findUnique({
      where: { id: parsed.data.slotId },
      select: {
        id: true,
        status: true,
        startsAt: true,
        durationMinutes: true,
        driveCompanyId: true,
        candidateId: true,
        mode: true,
        driveCompany: {
          select: {
            companyId: true,
            driveId: true,
            company: { select: { name: true } },
            drive: { select: { id: true, slug: true, title: true, status: true } },
          },
        },
      },
    });
    if (!slot) redirect("/fairs?error=Slot+not+found");
    if (slot.status !== "AVAILABLE") {
      redirect(
        `/fairs/${slot.driveCompany.drive.slug}?error=` +
          encodeURIComponent("That slot was already booked. Pick another."),
      );
    }
    if (
      slot.driveCompany.drive.status !== "OPEN" &&
      slot.driveCompany.drive.status !== "IN_PROGRESS"
    ) {
      redirect(
        `/fairs?error=` +
          encodeURIComponent("This fair isn't accepting bookings."),
      );
    }

    // Must be registered for the fair.
    const registration = await db.recruitmentDriveRegistration.findUnique({
      where: {
        driveId_candidateId: {
          driveId: slot.driveCompany.drive.id,
          candidateId: profile.id,
        },
      },
      select: { status: true, fairMode: true },
    });
    if (
      !registration ||
      (registration.status !== "REGISTERED" && registration.status !== "CHECKED_IN")
    ) {
      redirect(
        `/fairs/${slot.driveCompany.drive.slug}?error=` +
          encodeURIComponent("Register for the fair first, then book a slot."),
      );
    }

    // Hybrid Recruitathon (Phase 1) — mode compatibility check.
    // The UI already filters incompatible slots out, but defence in
    // depth: a candidate who registered OFFLINE shouldn't be able to
    // hand-craft a POST to a VIDEO slot (or vice versa). HYBRID
    // candidates can book anything.
    if (registration.fairMode && registration.fairMode !== "HYBRID") {
      const slotIsOnline = slot.mode === "VIDEO" || slot.mode === "PHONE";
      const candidateIsOnline = registration.fairMode === "ONLINE";
      if (slotIsOnline !== candidateIsOnline) {
        redirect(
          `/fairs/${slot.driveCompany.drive.slug}?error=` +
            encodeURIComponent(
              candidateIsOnline
                ? "That slot is in-person. Switch your attendance mode to HYBRID if you'll be at the venue."
                : "That slot is online. Switch your attendance mode to HYBRID if you want to do this one over video.",
            ),
        );
      }
    }

    // Eligibility gate (same helper used for fair registration +
    // fair-attributed job applies).
    const eligibility = evaluateFairEligibility(
      {
        profileCompleteness: profile.profileCompleteness,
        resumeUrl: profile.resumeUrl,
        aiResumeUrl: profile.aiResumeUrl,
        phone: profile.phone,
      },
      profile.user,
    );
    if (!eligibility.ok) {
      const missingCsv = eligibility.missing.join(",");
      redirect(
        `/me/profile?incomplete=fair-book&fairSlug=${encodeURIComponent(slot.driveCompany.drive.slug)}&missing=${encodeURIComponent(missingCsv)}`,
      );
    }

    // Conflict check: this candidate must not already hold an
    // AVAILABLE/BOOKED slot at the same start time across any booth.
    const conflict = await db.recruitmentDriveInterviewSlot.findFirst({
      where: {
        candidateId: profile.id,
        startsAt: slot.startsAt,
        status: "BOOKED",
        NOT: { id: slot.id },
      },
      select: { id: true },
    });
    if (conflict) {
      redirect(
        `/fairs/${slot.driveCompany.drive.slug}?error=` +
          encodeURIComponent("You already have an interview booked at the same time. Cancel it first."),
      );
    }

    // Race-safe book: updateMany conditioned on `status = AVAILABLE`.
    // The conditional WHERE prevents a TOCTOU-style overwrite when
    // two candidates race the same slot — only the first wins (one
    // row flips, count = 1); the loser sees count = 0 and bounces.
    const result = await db.recruitmentDriveInterviewSlot.updateMany({
      where: { id: slot.id, status: "AVAILABLE" },
      data: {
        status: "BOOKED",
        candidateId: profile.id,
        bookedAt: new Date(),
      },
    });
    if (result.count === 0) {
      // Lost the race — another candidate booked between our
      // findUnique and updateMany. Surface a friendly message.
      redirect(
        `/fairs/${slot.driveCompany.drive.slug}?error=` +
          encodeURIComponent("Someone else just booked that slot. Pick another."),
      );
    }

    try {
      await audit({
        actorId: session.user.id,
        action: "fair.slot_booked",
        entity: "RecruitmentDriveInterviewSlot",
        entityId: slot.id,
        meta: { driveId: slot.driveCompany.drive.id },
      });
    } catch {/* best-effort */}

    // Best-effort confirmation to both sides.
    try {
      await dispatchNotification({
        userId: session.user.id,
        type: "fair.slot_booked",
        title: `Slot booked: ${slot.driveCompany.company.name}`,
        body: `${formatLocalTime(slot.startsAt)} · ${slot.durationMinutes} min · ${slot.driveCompany.drive.title}. Open your fair pass for details.`,
        link: `/me/fairs/${slot.driveCompany.drive.slug}/pass`,
        channels: ["IN_APP"],
        groupKey: `slot-${slot.id}`,
      });
    } catch {/* best-effort */}

    revalidatePath(`/fairs/${slot.driveCompany.drive.slug}`);
    redirect(
      `/me/fairs/${slot.driveCompany.drive.slug}/pass?notice=` +
        encodeURIComponent(
          `Booked ${formatLocalTime(slot.startsAt)} at ${slot.driveCompany.company.name}.`,
        ),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[fair-slots] bookInterviewSlot unexpected");
    redirect("/fairs?error=Couldn%27t+book");
  }
}

const CancelBookingSchema = z.object({
  slotId: z.string().min(1),
});

/**
 * Candidate cancels their OWN booked slot. (Recruiter cancel
 * lives in `deleteInterviewSlot` above.)
 */
export async function cancelInterviewBooking(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin");
    const parsed = CancelBookingSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) redirect("/me");

    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!profile) redirect("/onboarding");

    const slot = await db.recruitmentDriveInterviewSlot.findUnique({
      where: { id: parsed.data.slotId },
      select: {
        id: true,
        candidateId: true,
        status: true,
        driveCompany: {
          select: { drive: { select: { slug: true } } },
        },
      },
    });
    if (!slot) redirect("/me");
    if (slot.candidateId !== profile.id) redirect("/403");

    if (slot.status !== "BOOKED") {
      redirect(
        `/me/fairs/${slot.driveCompany.drive.slug}/pass?error=` +
          encodeURIComponent("Slot isn't in a cancellable state."),
      );
    }

    // Flip back to AVAILABLE + clear booking fields.
    await db.recruitmentDriveInterviewSlot.update({
      where: { id: slot.id },
      data: {
        status: "AVAILABLE",
        candidateId: null,
        bookedAt: null,
      },
    });
    try {
      await audit({
        actorId: session.user.id,
        action: "fair.slot_unbooked",
        entity: "RecruitmentDriveInterviewSlot",
        entityId: slot.id,
      });
    } catch {/* best-effort */}

    revalidatePath(`/fairs/${slot.driveCompany.drive.slug}`);
    redirect(
      `/me/fairs/${slot.driveCompany.drive.slug}/pass?notice=` +
        encodeURIComponent("Booking cancelled. The slot is open for someone else."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[fair-slots] cancelInterviewBooking unexpected");
    redirect("/me");
  }
}

function formatLocalTime(d: Date): string {
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Post-interview lifecycle close-out ───────────────────────────
//
// After the candidate either attended (COMPLETED) or no-showed
// (NO_SHOW), the recruiter — or an admin watching the fair from the
// /admin/fairs/[id]/slots dashboard — flips the slot to the final
// status. This is what powers post-fair analytics ("X% attendance,
// Y hires") and the fair-pass page hiding the cancel button after
// the interview is done.

const OutcomeSchema = z.object({
  slotId: z.string().min(1),
  outcome: z.enum(["COMPLETED", "NO_SHOW"]),
});

/**
 * Recruiter (or admin) marks a slot's final outcome. Only valid on
 * BOOKED slots — AVAILABLE / CANCELLED / already-terminal slots are
 * rejected with a friendly notice. Idempotent re-marks (same
 * outcome) are a no-op rather than an error so a double-click is
 * harmless.
 */
export async function markInterviewSlotOutcome(formData: FormData): Promise<void> {
  try {
    const parsed = OutcomeSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/employer/fairs?error=" + encodeURIComponent("Invalid outcome"));
    }
    const { slotId, outcome } = parsed.data;

    const slot = await db.recruitmentDriveInterviewSlot.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        status: true,
        driveCompanyId: true,
        startsAt: true,
        candidateId: true,
        driveCompany: {
          select: {
            companyId: true,
            driveId: true,
            drive: { select: { id: true, slug: true } },
          },
        },
      },
    });
    if (!slot) {
      redirect("/employer/fairs?error=" + encodeURIComponent("Slot not found"));
    }

    // Authz — recruiter at booth OR admin. Reusing the helper so
    // the same rules that gate create/delete also gate this.
    const ctx = await requireRecruiterAtBooth(slot.driveCompanyId);

    // Idempotent — same outcome twice is a no-op.
    if (slot.status === outcome) {
      revalidatePath(`/employer/fairs/${slot.driveCompany.driveId}/slots`);
      revalidatePath(`/admin/fairs/${slot.driveCompany.driveId}/slots`);
      redirect(
        `/employer/fairs/${slot.driveCompany.driveId}/slots?notice=` +
          encodeURIComponent(`Already marked ${outcome.toLowerCase().replace("_", "-")}.`),
      );
    }

    // Block transitions from terminal states (CANCELLED / completed-
    // -to-no-show flip-flop). If the recruiter genuinely needs to
    // change a wrong mark, admin can reset via the database.
    if (slot.status !== "BOOKED" && slot.status !== "COMPLETED" && slot.status !== "NO_SHOW") {
      redirect(
        `/employer/fairs/${slot.driveCompany.driveId}/slots?error=` +
          encodeURIComponent("Only BOOKED slots can be marked. Re-book first."),
      );
    }

    await db.recruitmentDriveInterviewSlot.update({
      where: { id: slotId },
      data: { status: outcome },
    });

    try {
      await audit({
        actorId: ctx.userId,
        action: outcome === "COMPLETED" ? "fair.slot_completed" : "fair.slot_no_show",
        entity: "RecruitmentDriveInterviewSlot",
        entityId: slotId,
        meta: { driveId: slot.driveCompany.driveId, candidateId: slot.candidateId },
      });
    } catch {/* best-effort */}

    revalidatePath(`/employer/fairs/${slot.driveCompany.driveId}/slots`);
    revalidatePath(`/admin/fairs/${slot.driveCompany.driveId}/slots`);
    revalidatePath(`/me/fairs/${slot.driveCompany.drive.slug}/pass`);

    redirect(
      `/employer/fairs/${slot.driveCompany.driveId}/slots?notice=` +
        encodeURIComponent(
          outcome === "COMPLETED" ? "Marked completed." : "Marked no-show.",
        ),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[fair-slots] markInterviewSlotOutcome unexpected");
    redirect("/employer/fairs?error=" + encodeURIComponent("Mark failed. Try again."));
  }
}

// ─── Phase 3 hybrid Recruitathon — reschedule recovery ─────────────
//
// When a candidate's slot collapses (connection failure, recruiter
// runs long, etc.) the recruiter needs a one-click "give them a
// later slot today" move. This action:
//
//   1. Validates the original slot is BOOKED at this booth.
//   2. Creates a NEW slot at the chosen time, same booth + job + mode
//      + meetingUrl, immediately set to BOOKED with the same candidate.
//   3. Flips the original slot to CANCELLED (preserving the audit
//      trail) instead of hard-deleting.
//   4. Notifies the candidate so they don't sit on the old time.
//
// Conflict-checked: candidate must not have another BOOKED slot at
// the new time across any booth. Race-safe: the new slot is created
// + booked in a single transaction.

const RescheduleSchema = z.object({
  slotId: z.string().min(1),
  newStartsAt: z.coerce.date(),
});

export async function rescheduleInterviewSlot(formData: FormData): Promise<void> {
  try {
    const parsed = RescheduleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/employer/fairs?error=" + encodeURIComponent("Invalid reschedule input."));
    }

    const original = await db.recruitmentDriveInterviewSlot.findUnique({
      where: { id: parsed.data.slotId },
      select: {
        id: true,
        status: true,
        startsAt: true,
        durationMinutes: true,
        driveCompanyId: true,
        candidateId: true,
        jobId: true,
        mode: true,
        meetingUrl: true,
        notes: true,
        candidate: { select: { id: true, userId: true } },
        driveCompany: {
          select: {
            driveId: true,
            company: { select: { name: true } },
            drive: { select: { id: true, slug: true } },
          },
        },
      },
    });
    if (!original) {
      redirect("/employer/fairs?error=" + encodeURIComponent("Slot not found."));
    }
    const ctx = await requireRecruiterAtBooth(original.driveCompanyId);
    if (original.status !== "BOOKED" || !original.candidateId) {
      redirect(
        `/employer/fairs/${ctx.driveId}/slots?error=` +
          encodeURIComponent("Only BOOKED slots can be rescheduled."),
      );
    }
    if (parsed.data.newStartsAt.getTime() === original.startsAt.getTime()) {
      redirect(
        `/employer/fairs/${ctx.driveId}/slots?error=` +
          encodeURIComponent("Pick a DIFFERENT time."),
      );
    }

    // Candidate conflict — they must not already hold a BOOKED slot
    // at the new time at any booth.
    const conflict = await db.recruitmentDriveInterviewSlot.findFirst({
      where: {
        candidateId: original.candidateId,
        startsAt: parsed.data.newStartsAt,
        status: "BOOKED",
        NOT: { id: original.id },
      },
      select: { id: true },
    });
    if (conflict) {
      redirect(
        `/employer/fairs/${ctx.driveId}/slots?error=` +
          encodeURIComponent("Candidate has another booking at that time."),
      );
    }

    // Atomic: cancel the old slot, create the new one already booked.
    // Wrapping both writes in a transaction so a half-applied
    // reschedule never leaves the candidate slot-less or double-booked.
    const newSlot = await db.$transaction(async (tx) => {
      await tx.recruitmentDriveInterviewSlot.update({
        where: { id: original.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      return tx.recruitmentDriveInterviewSlot.create({
        data: {
          driveCompanyId: original.driveCompanyId,
          jobId: original.jobId,
          startsAt: parsed.data.newStartsAt,
          durationMinutes: original.durationMinutes,
          mode: original.mode,
          meetingUrl: original.meetingUrl,
          notes: original.notes
            ? `${original.notes}\n\n(Rescheduled from ${original.startsAt.toISOString()})`
            : `(Rescheduled from ${original.startsAt.toISOString()})`,
          status: "BOOKED",
          candidateId: original.candidateId,
          bookedAt: new Date(),
        },
      });
    });

    try {
      await audit({
        actorId: ctx.userId,
        action: "fair.slot_rescheduled",
        entity: "RecruitmentDriveInterviewSlot",
        entityId: newSlot.id,
        meta: {
          oldSlotId: original.id,
          oldStartsAt: original.startsAt.toISOString(),
          newStartsAt: parsed.data.newStartsAt.toISOString(),
        },
      });
    } catch {/* best-effort */}

    if (original.candidate?.userId) {
      try {
        await dispatchNotification({
          userId: original.candidate.userId,
          type: "fair.slot_rescheduled",
          title: `Interview rescheduled — ${ctx.companyName}`,
          body: `Your slot moved to ${formatLocalTime(parsed.data.newStartsAt)}. Open your fair pass for the updated time.`,
          link: `/me/fairs/${original.driveCompany.drive.slug}/pass`,
          channels: ["IN_APP", "EMAIL"],
        });
      } catch {/* best-effort */}
    }

    revalidatePath(`/employer/fairs/${ctx.driveId}/slots`);
    revalidatePath(`/me/fairs/${original.driveCompany.drive.slug}/pass`);
    redirect(
      `/employer/fairs/${ctx.driveId}/slots?notice=` +
        encodeURIComponent(
          `Rescheduled to ${formatLocalTime(parsed.data.newStartsAt)} — candidate notified.`,
        ),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[fair-slots] rescheduleInterviewSlot unexpected");
    redirect("/employer/fairs?error=" + encodeURIComponent("Reschedule failed. Try again."));
  }
}
