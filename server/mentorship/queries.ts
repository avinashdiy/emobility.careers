import { db } from "@/lib/db";
import type { Prisma, MentorAvailabilityKind } from "@prisma/client";

export interface MentorListFilters {
  q?: string;
  domain?: string;        // EVDomain slug
  language?: string;
  paid?: "free" | "paid"; // pricing filter
  cursor?: string;
  limit?: number;
}

export const MENTOR_LIST_INCLUDE = {
  user: {
    select: {
      id: true,
      candidateProfile: {
        select: {
          slug: true,
          firstName: true,
          lastName: true,
          headline: true,
          profilePhotoUrl: true,
          isDIYguruVerified: true,
          personType: true,
          institution: true,
        },
      },
    },
  },
} satisfies Prisma.MentorProfileInclude;

/** Public directory of approved + published mentors. */
export async function listMentors(filters: MentorListFilters) {
  const where: Prisma.MentorProfileWhereInput = {
    isPublished: true,
    kycStatus: "APPROVED",
  };
  if (filters.q) {
    where.OR = [
      { headline: { contains: filters.q, mode: "insensitive" } },
      { bio: { contains: filters.q, mode: "insensitive" } },
      { expertiseTags: { has: filters.q.toLowerCase() } },
    ];
  }
  if (filters.domain) where.evDomainSlugs = { has: filters.domain };
  if (filters.language) where.languages = { has: filters.language };
  if (filters.paid === "free") where.acceptingFree = true;
  if (filters.paid === "paid") where.acceptingPaid = true;

  return db.mentorProfile.findMany({
    where,
    take: filters.limit ?? 24,
    orderBy: [{ avgRating: "desc" }, { totalSessions: "desc" }, { updatedAt: "desc" }],
    ...(filters.cursor ? { skip: 1, cursor: { id: filters.cursor } } : {}),
    include: MENTOR_LIST_INCLUDE,
  });
}

export async function getMentorBySlug(slug: string) {
  const mentor = await db.mentorProfile.findFirst({
    where: { user: { candidateProfile: { slug } } },
    include: {
      ...MENTOR_LIST_INCLUDE,
      availabilityRules: true,
      reviews: {
        where: { isPublic: true },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          reviewer: {
            select: {
              candidateProfile: { select: { firstName: true, lastName: true, profilePhotoUrl: true, slug: true } },
            },
          },
        },
      },
    },
  });
  return mentor;
}

export async function getMentorByUserId(userId: string) {
  return db.mentorProfile.findUnique({
    where: { userId },
    include: { availabilityRules: true },
  });
}

export interface AvailabilitySlot {
  start: Date;
  end: Date;
}

/**
 * Compute concrete bookable slots for a mentor over the next `daysAhead` days.
 * Algorithm: expand RECURRING rules + OVERRIDE rules, subtract BLOCKED rules
 * and existing PENDING/CONFIRMED sessions, then chunk into the mentor's
 * default session duration with the configured buffer between bookings.
 *
 * Times are computed in IST (Asia/Kolkata) per MentorAvailability.timezone.
 * A future iteration could honour viewer-side timezones for display.
 */
export async function getMentorSlots(opts: {
  mentorId: string;
  fromDate?: Date;
  daysAhead?: number;
  durationMins?: number;
}): Promise<AvailabilitySlot[]> {
  const fromDate = opts.fromDate ?? new Date();
  const daysAhead = opts.daysAhead ?? 14;
  const horizon = new Date(fromDate.getTime() + daysAhead * 24 * 3600 * 1000);

  const [mentor, rules, busy] = await Promise.all([
    db.mentorProfile.findUnique({ where: { id: opts.mentorId } }),
    db.mentorAvailability.findMany({ where: { mentorId: opts.mentorId } }),
    db.mentorshipSession.findMany({
      where: {
        mentorId: opts.mentorId,
        status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
        scheduledAt: { gte: fromDate, lte: horizon },
      },
      select: { scheduledAt: true, durationMins: true },
    }),
  ]);
  if (!mentor) return [];
  const duration = opts.durationMins ?? mentor.sessionDurations[0] ?? 30;
  const buffer = mentor.bufferMinutes;

  // Build candidate windows day by day in IST.
  const windows: AvailabilitySlot[] = [];
  for (let day = 0; day < daysAhead; day++) {
    const dayStart = new Date(fromDate.getTime() + day * 24 * 3600 * 1000);
    // Convert to IST (UTC+5:30) day-of-week.
    const istDay = new Date(dayStart.getTime() + 5.5 * 3600 * 1000).getUTCDay();
    for (const r of rules) {
      if (r.kind !== "RECURRING") continue;
      if (r.dayOfWeek !== istDay) continue;
      if (r.startMinute == null || r.endMinute == null) continue;
      const dayMidnightUtc = new Date(
        Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate()),
      );
      // IST = UTC+5:30 → midnight IST = midnight UTC − 5:30.
      const istMidnightUtc = new Date(dayMidnightUtc.getTime() - 5.5 * 3600 * 1000);
      const winStart = new Date(istMidnightUtc.getTime() + r.startMinute * 60 * 1000);
      const winEnd = new Date(istMidnightUtc.getTime() + r.endMinute * 60 * 1000);
      if (winEnd > fromDate) windows.push({ start: winStart, end: winEnd });
    }
  }
  // OVERRIDE windows
  for (const r of rules) {
    if (r.kind !== "OVERRIDE" || !r.startAt || !r.endAt) continue;
    if (r.endAt < fromDate || r.startAt > horizon) continue;
    windows.push({ start: r.startAt, end: r.endAt });
  }

  // Subtract BLOCKED windows + existing busy sessions.
  const blocked: AvailabilitySlot[] = [
    ...rules
      .filter((r): r is typeof r & { startAt: Date; endAt: Date } =>
        r.kind === "BLOCKED" && Boolean(r.startAt) && Boolean(r.endAt))
      .map((r) => ({ start: r.startAt, end: r.endAt })),
    ...busy.map((b) => ({
      start: b.scheduledAt,
      end: new Date(b.scheduledAt.getTime() + b.durationMins * 60 * 1000),
    })),
  ];

  // Chunk windows into duration+buffer slots, skipping overlap with blocked.
  const slots: AvailabilitySlot[] = [];
  for (const w of windows) {
    const stride = (duration + buffer) * 60 * 1000;
    const dMs = duration * 60 * 1000;
    let cursor = Math.max(w.start.getTime(), fromDate.getTime() + 60 * 60 * 1000); // ≥ 1h notice
    while (cursor + dMs <= w.end.getTime()) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor + dMs);
      const collides = blocked.some((b) => slotStart < b.end && slotEnd > b.start);
      if (!collides) slots.push({ start: slotStart, end: slotEnd });
      cursor += stride;
    }
  }
  // Cap and sort
  slots.sort((a, b) => a.start.getTime() - b.start.getTime());
  return slots.slice(0, 60);
}

export async function getMyMentorshipSessions(userId: string) {
  return db.mentorshipSession.findMany({
    where: { menteeUserId: userId },
    orderBy: { scheduledAt: "desc" },
    take: 50,
    include: {
      mentor: {
        include: MENTOR_LIST_INCLUDE,
      },
    },
  });
}

export async function getMentorshipBookingsForMentor(mentorUserId: string) {
  return db.mentorshipSession.findMany({
    where: { mentor: { userId: mentorUserId } },
    orderBy: { scheduledAt: "desc" },
    take: 100,
    include: {
      mentee: {
        select: {
          id: true,
          email: true,
          candidateProfile: { select: { firstName: true, lastName: true, slug: true, profilePhotoUrl: true, headline: true } },
        },
      },
    },
  });
}

export async function getPayoutLedger(mentorId: string) {
  const [completed, payouts] = await Promise.all([
    db.mentorshipSession.aggregate({
      where: { mentorId, status: "COMPLETED", paymentStatus: "PAID" },
      _sum: { priceMinor: true },
    }),
    db.mentorshipPayout.findMany({
      where: { mentorId },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const earned = completed._sum.priceMinor ?? 0;
  const paidOut = payouts.filter((p) => p.status === "PAID").reduce((acc, p) => acc + p.amountMinor, 0);
  return { earnedMinor: earned, paidOutMinor: paidOut, owedMinor: earned - paidOut, payouts };
}

// ─── Admin queue ─────────────────────────────────────────────

export async function getMentorKycQueue(status: "PENDING" | "APPROVED" | "REJECTED" | "ALL" = "PENDING") {
  const where: Prisma.MentorProfileWhereInput =
    status === "ALL" ? { kycStatus: { not: "DRAFT" } } : { kycStatus: status };
  return db.mentorProfile.findMany({
    where,
    orderBy: { kycSubmittedAt: "desc" },
    take: 100,
    include: MENTOR_LIST_INCLUDE,
  });
}

// Helper kept here so server actions don't reach into schema-less land
export const AVAILABILITY_KINDS: MentorAvailabilityKind[] = ["RECURRING", "OVERRIDE", "BLOCKED"];
