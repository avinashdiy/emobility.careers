"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { withUniqueSlug } from "@/lib/slug";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { notificationsQueue } from "@/lib/queues";
import { objectKey, presignUpload, publicUrl } from "@/lib/storage";
import { EventType, EventStatus } from "@prisma/client";
import { plainTextLength, sanitizeRichTextHtml } from "@/lib/cms/job-sanitize";
import type { FormState } from "@/lib/form-state";

// ─── Auth helpers ────────────────────────────────────────────

/**
 * Auth gate for event mutations. Admins bypass the EmployerProfile
 * requirement so they can moderate events for any company without
 * having a fake employer record. The returned `employer` is null for
 * admins; downstream code branches on `session.user.role === "ADMIN"`
 * to skip company-scope checks (mirrors the pattern used in
 * server/employer/actions.ts for cross-company admin operations).
 */
async function requireEmployerWithCompany() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    include: { company: true },
  });
  // Admins are allowed through without an EmployerProfile; non-admins
  // must complete employer onboarding first.
  if (!employer && session.user.role !== "ADMIN") {
    redirect("/employer/onboarding");
  }
  return { session, employer };
}

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

// ─── Schemas ─────────────────────────────────────────────────

const EventSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(5).max(160),
  // Description is now HTML from the rich-text editor. The 20-char
  // readable-text floor is enforced after sanitise via plainTextLength.
  description: z.string().min(1, "Description is required.").max(40_000),
  eventType: z.nativeEnum(EventType),
  status: z.nativeEnum(EventStatus).default(EventStatus.DRAFT),
  // ISO datetime strings; `datetime-local` inputs send "YYYY-MM-DDTHH:mm".
  // We coerce via z.coerce.date().
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional().nullable(),
  timezone: z.string().min(1).max(64).default("Asia/Kolkata"),
  registrationDeadline: z.coerce.date().optional().nullable(),
  location: z.string().max(240).optional().nullable(),
  meetingUrl: z.string().url().max(500).optional().or(z.literal("")).nullable(),
  coverImageUrl: z.string().url().optional().or(z.literal("")).nullable(),
  capacity: z.coerce.number().int().min(1).max(100_000).optional().nullable(),
});

// ─── Employer-side CRUD ──────────────────────────────────────

/**
 * Create or update an event for the requesting employer's company.
 * The form posts the same payload for both — `id` decides whether
 * we update vs create. Cross-company tampering is blocked by the
 * `where: { id, companyId }` clause on update.
 */
export async function saveEvent(formData: FormData): Promise<FormState> {
  const { session, employer } = await requireEmployerWithCompany();
  await rateLimitOrThrow(`event:${session.user.id}`, "ats").catch(() => undefined);

  const raw: Record<string, FormDataEntryValue | null> = Object.fromEntries(formData);
  // Normalise nullable string fields — empty input → null, so the URL
  // schema accepts the row.
  for (const k of ["endsAt", "registrationDeadline", "location", "meetingUrl", "coverImageUrl", "capacity"]) {
    if (raw[k] === "") raw[k] = null;
  }

  const parsed = EventSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid event payload.",
    };
  }
  const data = parsed.data;

  const descriptionHtml = sanitizeRichTextHtml(data.description);
  if (plainTextLength(descriptionHtml) < 20) {
    return { ok: false, message: "Description should be at least 20 characters of readable text." };
  }
  data.description = descriptionHtml;

  // Sanity: end after start, registration deadline before start
  if (data.endsAt && data.endsAt < data.startsAt) {
    return { ok: false, message: "End time must be after start time." };
  }
  if (data.registrationDeadline && data.registrationDeadline > data.startsAt) {
    return { ok: false, message: "Registration deadline must be before the event starts." };
  }
  if (data.eventType !== "WEBINAR" && !data.location) {
    return { ok: false, message: "In-person events need a location." };
  }
  if (data.eventType !== "IN_PERSON" && !data.meetingUrl) {
    return { ok: false, message: "Online / hybrid events need a meeting URL." };
  }

  const isAdmin = session.user.role === "ADMIN";

  let saved: { id: string; slug: string; companyId: string };
  if (data.id) {
    // Update: scope by companyId so an attacker can't edit another
    // company's event by guessing IDs. Admins are exempt — they can
    // moderate events for any company.
    const existing = await db.event.findFirst({
      where:
        isAdmin
          ? { id: data.id }
          : { id: data.id, companyId: employer!.companyId! },
      select: { id: true, slug: true, companyId: true },
    });
    if (!existing) return { ok: false, message: "Event not found." };

    saved = await db.event.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        description: data.description,
        eventType: data.eventType,
        status: data.status,
        startsAt: data.startsAt,
        endsAt: data.endsAt ?? null,
        timezone: data.timezone,
        registrationDeadline: data.registrationDeadline ?? null,
        location: data.location ?? null,
        meetingUrl: data.meetingUrl || null,
        coverImageUrl: data.coverImageUrl || null,
        capacity: data.capacity ?? null,
      },
      select: { id: true, slug: true, companyId: true },
    });
  } else {
    // Create: only employers can author new events; admins moderate
    // existing ones. (An admin who wants to create an event for a
    // company should sign in as that company's recruiter.)
    if (!employer) {
      return {
        ok: false,
        message: "Admins can only edit existing events. To create one, sign in as a company recruiter.",
      };
    }
    saved = await withUniqueSlug(`${data.title}-${employer.company!.slug}`, (slug) =>
      db.event.create({
        data: {
          slug,
          companyId: employer.companyId!,
          createdById: session.user.id,
          title: data.title,
          description: data.description,
          eventType: data.eventType,
          status: data.status,
          startsAt: data.startsAt,
          endsAt: data.endsAt ?? null,
          timezone: data.timezone,
          registrationDeadline: data.registrationDeadline ?? null,
          location: data.location ?? null,
          meetingUrl: data.meetingUrl || null,
          coverImageUrl: data.coverImageUrl || null,
          capacity: data.capacity ?? null,
        },
        select: { id: true, slug: true, companyId: true },
      }),
    );
  }

  await audit({
    actorId: session.user.id,
    action: data.id ? "event.updated" : "event.created",
    entity: "Event",
    entityId: saved.id,
  });

  // Look up the company slug for the saved event so the revalidation
  // covers the right /company/[slug] page even when an admin edits a
  // company they don't own.
  const savedCompany = await db.company.findUnique({
    where: { id: saved.companyId },
    select: { slug: true },
  });
  revalidatePath("/events");
  revalidatePath(`/events/${saved.slug}`);
  if (savedCompany) {
    revalidatePath(`/company/${savedCompany.slug}`);
  }
  revalidatePath("/employer/events");
  return { ok: true };
}

export async function cancelEvent(formData: FormData): Promise<FormState> {
  const { session, employer } = await requireEmployerWithCompany();
  const id = z.string().parse(formData.get("id"));
  const event = await db.event.findFirst({
    // Admins can cancel any event; everyone else is scoped to their
    // company. The narrowed where-clause is computed below.
    where:
      session.user.role === "ADMIN"
        ? { id }
        : { id, companyId: employer!.companyId! },
    select: {
      id: true,
      slug: true,
      title: true,
      company: { select: { name: true } },
    },
  });
  if (!event) return { ok: false, message: "Event not found." };

  await db.event.update({
    where: { id: event.id },
    data: { status: EventStatus.CANCELLED },
  });
  await audit({
    actorId: session.user.id,
    action: "event.cancelled",
    entity: "Event",
    entityId: event.id,
  });

  // Fan out a cancellation notification to every still-registered
  // attendee. Best-effort — a queue outage shouldn't block the
  // cancellation itself, so each enqueue is wrapped in a catch.
  const registrations = await db.eventRegistration.findMany({
    where: { eventId: event.id, status: "REGISTERED" },
    select: { userId: true },
  });
  for (const r of registrations) {
    await notificationsQueue
      .add("event-cancelled", {
        userId: r.userId,
        type: "event.cancelled",
        title: `Event cancelled: ${event.title}`,
        body: `${event.company.name} has cancelled this event. Check the page for any rescheduled dates.`,
        link: `/events/${event.slug}`,
        channels: ["IN_APP", "EMAIL"],
      })
      .catch(() => undefined);
  }

  revalidatePath("/events");
  revalidatePath(`/events/${event.slug}`);
  revalidatePath("/employer/events");
  return { ok: true };
}

export async function deleteEvent(formData: FormData): Promise<FormState> {
  const { session, employer } = await requireEmployerWithCompany();
  const id = z.string().parse(formData.get("id"));
  const event = await db.event.findFirst({
    where:
      session.user.role === "ADMIN"
        ? { id }
        : { id, companyId: employer!.companyId! },
    select: { id: true, slug: true, status: true },
  });
  if (!event) return { ok: false, message: "Event not found." };
  // Refuse to delete events that have already happened — keep them as
  // history. Cancel them instead if they're upcoming and need to come
  // off the public list.
  if (event.status === "COMPLETED") {
    return { ok: false, message: "Past events can't be deleted; they're kept for history." };
  }

  await db.event.delete({ where: { id: event.id } });
  await audit({
    actorId: session.user.id,
    action: "event.deleted",
    entity: "Event",
    entityId: id,
  });
  revalidatePath("/events");
  revalidatePath("/employer/events");
  return { ok: true };
}

// ─── User-side registration ──────────────────────────────────

async function registerForEventInner(formData: FormData): Promise<FormState> {
  const session = await requireUser();
  await rateLimitOrThrow(`event-rsvp:${session.user.id}`, "saveItem").catch(() => undefined);

  const eventId = z.string().parse(formData.get("eventId"));
  const notes = (formData.get("notes") as string | null)?.slice(0, 1000) || null;

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      slug: true,
      status: true,
      startsAt: true,
      registrationDeadline: true,
      capacity: true,
      _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
    },
  });
  if (!event) return { ok: false, message: "Event not found." };
  if (event.status !== "OPEN") {
    return { ok: false, message: "Registrations are closed for this event." };
  }
  if (event.registrationDeadline && event.registrationDeadline < new Date()) {
    return { ok: false, message: "Registration deadline has passed." };
  }
  if (event.startsAt < new Date()) {
    return { ok: false, message: "This event has already started." };
  }

  // Check capacity. We treat REGISTERED rows as the live count; CANCELLED
  // and ATTENDED rows are excluded by the where clause above.
  if (event.capacity !== null && event._count.registrations >= event.capacity) {
    return { ok: false, message: "This event is full." };
  }

  // Upsert — re-registering after cancelling is allowed.
  await db.eventRegistration.upsert({
    where: { eventId_userId: { eventId, userId: session.user.id } },
    update: { status: "REGISTERED", notes },
    create: { eventId, userId: session.user.id, notes, status: "REGISTERED" },
  });

  revalidatePath(`/events/${event.slug}`);
  return { ok: true };
}

async function cancelEventRegistrationInner(formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const eventId = z.string().parse(formData.get("eventId"));

  const reg = await db.eventRegistration.findUnique({
    where: { eventId_userId: { eventId, userId: session.user.id } },
    include: { event: { select: { slug: true } } },
  });
  if (!reg) return { ok: false, message: "You're not registered for this event." };

  await db.eventRegistration.update({
    where: { eventId_userId: { eventId, userId: session.user.id } },
    data: { status: "CANCELLED" },
  });

  revalidatePath(`/events/${reg.event.slug}`);
  return { ok: true };
}

// ─── void-returning wrappers for direct <form action={…}> usage ──
//
// Inline <form action={registerForEvent}> in a server component
// requires Promise<void>. These wrappers run the typed action and
// swallow the return; the inner functions stay available for any
// future client-side useActionState integration.

export async function registerForEvent(formData: FormData): Promise<void> {
  await registerForEventInner(formData);
}

export async function cancelEventRegistration(formData: FormData): Promise<void> {
  await cancelEventRegistrationInner(formData);
}

// ─── Cover-image upload (presigned, MinIO/S3) ────────────────
//
// Replaces the old "paste a public URL" UX in EventEditor with a real
// upload. Mirrors `presignPostAttachmentUpload` from rich-post-actions
// but scoped to event covers — JPG/PNG/WEBP only, 5MB cap (covers are
// shown at h-48 / h-64; no point allowing 10MB).
//
// The client PUTs the file directly to the returned signed URL; the
// `publicUrl` is what we save into Event.coverImageUrl on submit.

const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_MIME_WHITELIST = ["image/jpeg", "image/png", "image/webp"] as const;
const COVER_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const CoverPresignSchema = z.object({
  mime: z.enum(COVER_MIME_WHITELIST),
  byteSize: z.number().int().positive().max(COVER_MAX_BYTES),
  fileName: z.string().min(1).max(200),
});

export async function presignEventCoverUpload(input: {
  mime: string;
  byteSize: number;
  fileName: string;
}): Promise<
  | { ok: true; uploadUrl: string; publicUrl: string; storageKey: string }
  | { ok: false; message: string }
> {
  // Reuses the strict employer auth gate. Admins pass through too —
  // they may be uploading a cover on behalf of a company.
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Not signed in." };
  }
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    return { ok: false, message: "Only employers can upload event covers." };
  }
  await rateLimitOrThrow(`event-cover:${session.user.id}`, "resumeUpload").catch(() => undefined);

  const parsed = CoverPresignSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Cover must be JPG/PNG/WEBP up to 5MB.",
    };
  }

  const ext = COVER_EXT_BY_MIME[parsed.data.mime] ?? "jpg";
  // Namespaced under `events/{userId}/` so admins can audit who
  // uploaded what; the public URL doesn't expose anything sensitive.
  // Routed through the public `posts` bucket — `docs` is intentionally
  // private (Aadhar uploads, GDPR exports) and event covers are
  // rendered as public <img>, same access pattern as post media.
  const key = objectKey(`events/${session.user.id}`, ext);
  const { url } = await presignUpload("posts", key, parsed.data.mime);

  return {
    ok: true,
    uploadUrl: url,
    publicUrl: publicUrl("posts", key),
    storageKey: key,
  };
}
