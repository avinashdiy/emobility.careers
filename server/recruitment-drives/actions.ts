"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { withUniqueSlug } from "@/lib/slug";
import { isRouterControlError } from "@/lib/server-action-errors";
import { notificationsQueue } from "@/lib/queues";
import { s3, buckets, publicUrl, objectKey } from "@/lib/storage";
import { sanitizeRichTextHtml } from "@/lib/cms/job-sanitize";
import type { FormState } from "@/lib/form-state";

/**
 * Server actions for the RecruitmentDrive (job-fair) feature.
 *
 * Three audiences hit these actions:
 *
 *   1. ADMIN — create/edit fairs, invite companies, publish.
 *      Admin-only via requireAdmin() throughout.
 *
 *   2. EMPLOYER (recruiter at a participating company) — accept /
 *      decline an invitation, attach jobs to their booth, edit
 *      their per-fair pitch.
 *
 *   3. CANDIDATE — applies via /fairs/[slug] (the public landing).
 *      We don't need a dedicated server action for that — the
 *      existing applyToJob action takes a `recruitmentDriveId`
 *      param so the candidate's Application row is correctly
 *      tagged with the fair source.
 *
 * Lifecycle: DRAFT → OPEN → IN_PROGRESS → CLOSED. CANCELLED is a
 * dead-end any state can hop to. Status transitions are admin-only;
 * the worker doesn't auto-advance because fair start/end times are
 * usually paired with on-site coordination that the admin owns.
 */

// ─── Helpers ────────────────────────────────────────────────────────

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

/**
 * Resolve the company the calling employer represents. Returns the
 * companyId if they're an EMPLOYER on a confirmed company,
 * otherwise redirects them to /403. We use this instead of the
 * full assertHostsCompany pattern because fair-side actions
 * never operate on a different company than the caller's own.
 */
async function requireEmployerCompanyId(): Promise<{ userId: string; companyId: string }> {
  const session = await requireUser();
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    select: { companyId: true },
  });
  if (!employer?.companyId) {
    // Admin viewing the employer surface — they shouldn't be here.
    redirect("/employer");
  }
  return { userId: session.user.id, companyId: employer.companyId };
}

// ─── Admin: create / edit / lifecycle ───────────────────────────────

// Coerce + validate lat/lng. Accepts blank strings (admin didn't
// pin the venue) → null. Rejects values outside the legal range so
// a typo doesn't render the map at coordinate (0,0) somewhere off
// the coast of Africa.
const latLngField = z
  .union([z.string().length(0), z.coerce.number().min(-180).max(180)])
  .optional()
  .transform((v) => (typeof v === "number" ? v : undefined));

const CreateDriveSchema = z.object({
  title: z.string().trim().min(4).max(160),
  tagline: z.string().trim().max(200).optional().or(z.literal("")),
  // Description is now HTML from the rich-text editor. Allowlist
  // sanitiser runs after parse; we leave the field optional + bump
  // the max to accommodate the extra markup overhead.
  description: z.string().max(40_000).optional().or(z.literal("")),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().max(120).optional().or(z.literal("")),
  country: z.string().trim().min(2).max(2).default("IN"),
  venueName: z.string().trim().max(200).optional().or(z.literal("")),
  venueAddress: z.string().trim().max(500).optional().or(z.literal("")),
  venueLat: latLngField,
  venueLng: latLngField,
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  registrationOpensAt: z.coerce.date().optional(),
  registrationClosesAt: z.coerce.date().optional(),
});

export interface CreateDriveResult extends FormState {
  driveId?: string;
  slug?: string;
}

export async function createRecruitmentDrive(
  _prev: CreateDriveResult,
  formData: FormData,
): Promise<CreateDriveResult> {
  try {
    const session = await requireAdmin();
    const parsed = CreateDriveSchema.safeParse({
      title: formData.get("title"),
      tagline: formData.get("tagline") || "",
      description: formData.get("description") || "",
      city: formData.get("city"),
      state: formData.get("state") || "",
      country: formData.get("country") || "IN",
      venueName: formData.get("venueName") || "",
      venueAddress: formData.get("venueAddress") || "",
      venueLat: formData.get("venueLat") || "",
      venueLng: formData.get("venueLng") || "",
      startsAt: formData.get("startsAt"),
      endsAt: formData.get("endsAt"),
      registrationOpensAt: formData.get("registrationOpensAt") || undefined,
      registrationClosesAt: formData.get("registrationClosesAt") || undefined,
    });
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Check the form.",
      };
    }
    if (parsed.data.endsAt < parsed.data.startsAt) {
      return { ok: false, message: "End date can't be before start date." };
    }
    const descriptionHtml = parsed.data.description
      ? sanitizeRichTextHtml(parsed.data.description)
      : "";

    const drive = await withUniqueSlug(parsed.data.title, async (slug) =>
      db.recruitmentDrive.create({
        data: {
          slug,
          title: parsed.data.title,
          tagline: parsed.data.tagline || null,
          description: descriptionHtml || null,
          city: parsed.data.city,
          state: parsed.data.state || null,
          country: parsed.data.country,
          venueName: parsed.data.venueName || null,
          venueAddress: parsed.data.venueAddress || null,
          venueLat: parsed.data.venueLat ?? null,
          venueLng: parsed.data.venueLng ?? null,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          registrationOpensAt: parsed.data.registrationOpensAt ?? null,
          registrationClosesAt: parsed.data.registrationClosesAt ?? null,
          createdById: session.user.id,
        },
      }),
    );

    await audit({
      actorId: session.user.id,
      action: "recruitment_drive.created",
      entity: "RecruitmentDrive",
      entityId: drive.id,
      meta: { title: parsed.data.title, city: parsed.data.city },
    });

    revalidatePath("/admin/fairs");
    return { ok: true, driveId: drive.id, slug: drive.slug };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[recruitment-drive] create failed");
    return { ok: false, message: "Couldn't create the fair. Try again." };
  }
}

const UpdateDriveSchema = CreateDriveSchema.extend({
  driveId: z.string(),
  bannerImageUrl: z.string().url().optional().or(z.literal("")),
  heroImageUrl: z.string().url().optional().or(z.literal("")),
});

export async function updateRecruitmentDrive(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await requireAdmin();
    const parsed = UpdateDriveSchema.safeParse({
      driveId: formData.get("driveId"),
      title: formData.get("title"),
      tagline: formData.get("tagline") || "",
      description: formData.get("description") || "",
      city: formData.get("city"),
      state: formData.get("state") || "",
      country: formData.get("country") || "IN",
      venueName: formData.get("venueName") || "",
      venueAddress: formData.get("venueAddress") || "",
      venueLat: formData.get("venueLat") || "",
      venueLng: formData.get("venueLng") || "",
      startsAt: formData.get("startsAt"),
      endsAt: formData.get("endsAt"),
      registrationOpensAt: formData.get("registrationOpensAt") || undefined,
      registrationClosesAt: formData.get("registrationClosesAt") || undefined,
      bannerImageUrl: formData.get("bannerImageUrl") || "",
      heroImageUrl: formData.get("heroImageUrl") || "",
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
    }
    if (parsed.data.endsAt < parsed.data.startsAt) {
      return { ok: false, message: "End date can't be before start date." };
    }
    const descriptionHtml = parsed.data.description
      ? sanitizeRichTextHtml(parsed.data.description)
      : "";

    const drive = await db.recruitmentDrive.update({
      where: { id: parsed.data.driveId },
      data: {
        title: parsed.data.title,
        tagline: parsed.data.tagline || null,
        description: descriptionHtml || null,
        city: parsed.data.city,
        state: parsed.data.state || null,
        country: parsed.data.country,
        venueName: parsed.data.venueName || null,
        venueAddress: parsed.data.venueAddress || null,
        venueLat: parsed.data.venueLat ?? null,
        venueLng: parsed.data.venueLng ?? null,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        registrationOpensAt: parsed.data.registrationOpensAt ?? null,
        registrationClosesAt: parsed.data.registrationClosesAt ?? null,
        bannerImageUrl: parsed.data.bannerImageUrl || null,
        heroImageUrl: parsed.data.heroImageUrl || null,
      },
    });

    await audit({
      actorId: session.user.id,
      action: "recruitment_drive.updated",
      entity: "RecruitmentDrive",
      entityId: drive.id,
    });

    revalidatePath(`/admin/fairs/${drive.id}`);
    revalidatePath(`/fairs/${drive.slug}`);
    return { ok: true, message: "Saved." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[recruitment-drive] update failed");
    return { ok: false, message: "Couldn't save." };
  }
}

/**
 * Move the drive between lifecycle states. Admin-only.
 * Valid transitions:
 *   DRAFT       → OPEN | CANCELLED
 *   OPEN        → IN_PROGRESS | CLOSED | CANCELLED
 *   IN_PROGRESS → CLOSED | CANCELLED
 *   CLOSED      → (terminal)
 *   CANCELLED   → (terminal)
 *
 * Publishing (DRAFT → OPEN) stamps `publishedAt`. The /fairs landing
 * lists OPEN + IN_PROGRESS; CLOSED still resolves via direct URL so
 * the SEO juice + recap value stays.
 */
export async function setRecruitmentDriveStatus(formData: FormData): Promise<FormState> {
  try {
    const session = await requireAdmin();
    const driveId = z.string().parse(formData.get("driveId"));
    const target = z
      .enum(["DRAFT", "OPEN", "IN_PROGRESS", "CLOSED", "CANCELLED"])
      .parse(formData.get("status"));

    const drive = await db.recruitmentDrive.findUnique({
      where: { id: driveId },
      select: { id: true, status: true, slug: true },
    });
    if (!drive) return { ok: false, message: "Drive not found." };

    // Reject illegal transitions early — keeps the audit trail clean
    // and prevents zombie states from creeping in via the URL bar.
    const ALLOWED: Record<string, string[]> = {
      DRAFT: ["OPEN", "CANCELLED"],
      OPEN: ["IN_PROGRESS", "CLOSED", "CANCELLED"],
      IN_PROGRESS: ["CLOSED", "CANCELLED"],
      CLOSED: [],
      CANCELLED: [],
    };
    if (!ALLOWED[drive.status].includes(target)) {
      return {
        ok: false,
        message: `Can't go from ${drive.status} to ${target}.`,
      };
    }

    await db.recruitmentDrive.update({
      where: { id: drive.id },
      data: {
        status: target,
        ...(target === "OPEN" ? { publishedAt: new Date() } : {}),
      },
    });
    await audit({
      actorId: session.user.id,
      action: "recruitment_drive.status_changed",
      entity: "RecruitmentDrive",
      entityId: drive.id,
      meta: { from: drive.status, to: target },
    });

    revalidatePath(`/admin/fairs`);
    revalidatePath(`/admin/fairs/${drive.id}`);
    revalidatePath(`/fairs`);
    revalidatePath(`/fairs/${drive.slug}`);
    return { ok: true, message: `Drive ${target.toLowerCase()}.` };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[recruitment-drive] status change failed");
    return { ok: false, message: "Couldn't update status." };
  }
}

// ─── Admin: invite / remove companies ──────────────────────────────

export async function inviteCompanyToDrive(formData: FormData): Promise<FormState> {
  try {
    const session = await requireAdmin();
    const driveId = z.string().parse(formData.get("driveId"));
    const companyId = z.string().parse(formData.get("companyId"));

    // Idempotent: if the row already exists we re-use it (e.g. an
    // admin clicks Invite twice). New invites land at INVITED;
    // already-CONFIRMED rows are left alone.
    const drive = await db.recruitmentDrive.findUnique({
      where: { id: driveId },
      select: { id: true, slug: true, title: true },
    });
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, ownerUserId: true },
    });
    if (!drive || !company) {
      return { ok: false, message: "Drive or company not found." };
    }

    const existing = await db.recruitmentDriveCompany.findUnique({
      where: { driveId_companyId: { driveId, companyId } },
    });
    if (existing && existing.status !== "WITHDRAWN") {
      return { ok: false, message: "Company already on this drive." };
    }
    if (existing) {
      // Re-invite a previously-withdrawn company. The decrement
      // happened on the original WITHDRAWN, so we re-increment
      // here in the same transaction as the status flip.
      await db.$transaction([
        db.recruitmentDriveCompany.update({
          where: { id: existing.id },
          data: { status: "INVITED", invitedAt: new Date(), withdrawnAt: null },
        }),
        db.recruitmentDrive.update({
          where: { id: driveId },
          data: { participatingCount: { increment: 1 } },
        }),
      ]);
    } else {
      // Atomic: create the join row + bump the counter together
      // so a crash between the two can't drift the denorm. Same
      // pattern used by createTeam / attachJobToDrive / etc.
      await db.$transaction([
        db.recruitmentDriveCompany.create({
          data: { driveId, companyId },
        }),
        db.recruitmentDrive.update({
          where: { id: driveId },
          data: { participatingCount: { increment: 1 } },
        }),
      ]);
    }

    // Notify the company owner. We don't send to every employer at
    // the company because that gets spammy quickly — the owner can
    // forward / loop in their team via the in-app inbox.
    if (company.ownerUserId) {
      await notificationsQueue
        .add("recruitment-drive.invited", {
          userId: company.ownerUserId,
          type: "recruitment_drive.invited",
          title: `Invited to ${drive.title}`,
          body: `${company.name} is invited to the recruitment drive. Confirm participation to set up your booth.`,
          link: `/employer/fairs`,
          channels: ["IN_APP", "EMAIL"],
          actorId: session.user.id,
        })
        .catch(() => undefined);
    }

    await audit({
      actorId: session.user.id,
      action: "recruitment_drive.company_invited",
      entity: "RecruitmentDrive",
      entityId: driveId,
      meta: { companyId, companyName: company.name },
    });

    revalidatePath(`/admin/fairs/${driveId}`);
    return { ok: true, message: `Invited ${company.name}.` };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[recruitment-drive] invite company failed");
    return { ok: false, message: "Couldn't invite the company." };
  }
}

export async function removeCompanyFromDrive(formData: FormData): Promise<FormState> {
  try {
    const session = await requireAdmin();
    const participationId = z.string().parse(formData.get("participationId"));
    const part = await db.recruitmentDriveCompany.findUnique({
      where: { id: participationId },
      include: { company: { select: { name: true } } },
    });
    if (!part) return { ok: false, message: "Participation not found." };
    // We need (a) the company's job rows on this drive cleared, (b)
    // the participation flipped to WITHDRAWN, and (c) the drive's
    // counters trimmed — all atomically. The job-row deleteMany
    // returns a count we can use for the jobsCount decrement,
    // closing the "deleteMany without recompute" gap that the v1
    // implementation flagged in its own comment.
    await db.$transaction(async (tx) => {
      const removedJobs = await tx.recruitmentDriveJob.deleteMany({
        where: { driveId: part.driveId, companyId: part.companyId },
      });
      await tx.recruitmentDriveCompany.update({
        where: { id: part.id },
        data: { status: "WITHDRAWN", withdrawnAt: new Date() },
      });
      await tx.recruitmentDrive.update({
        where: { id: part.driveId },
        data: {
          participatingCount: { decrement: 1 },
          // Decrement jobsCount by however many rows we just
          // deleted — using removedJobs.count keeps the denorm
          // accurate even when a single removal sweeps multiple
          // jobs.
          jobsCount: { decrement: removedJobs.count },
        },
      });
    });
    await audit({
      actorId: session.user.id,
      action: "recruitment_drive.company_removed",
      entity: "RecruitmentDrive",
      entityId: part.driveId,
      meta: { companyId: part.companyId, companyName: part.company.name },
    });
    revalidatePath(`/admin/fairs/${part.driveId}`);
    return { ok: true, message: `Removed ${part.company.name}.` };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[recruitment-drive] remove company failed");
    return { ok: false, message: "Couldn't remove." };
  }
}

// ─── Employer: accept / decline invitation ─────────────────────────

export async function acceptDriveInvite(formData: FormData): Promise<FormState> {
  try {
    const { userId, companyId } = await requireEmployerCompanyId();
    const driveId = z.string().parse(formData.get("driveId"));

    const part = await db.recruitmentDriveCompany.findUnique({
      where: { driveId_companyId: { driveId, companyId } },
    });
    if (!part) return { ok: false, message: "No invitation found for your company." };
    if (part.status === "CONFIRMED") {
      return { ok: false, message: "Already confirmed." };
    }

    await db.recruitmentDriveCompany.update({
      where: { id: part.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    await audit({
      actorId: userId,
      action: "recruitment_drive.company_confirmed",
      entity: "RecruitmentDrive",
      entityId: driveId,
      meta: { companyId },
    });
    revalidatePath(`/employer/fairs`);
    revalidatePath(`/employer/fairs/${driveId}`);
    return { ok: true, message: "You're confirmed for the fair." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[recruitment-drive] accept invite failed");
    return { ok: false, message: "Couldn't accept." };
  }
}

export async function declineDriveInvite(formData: FormData): Promise<FormState> {
  try {
    const { userId, companyId } = await requireEmployerCompanyId();
    const driveId = z.string().parse(formData.get("driveId"));
    const part = await db.recruitmentDriveCompany.findUnique({
      where: { driveId_companyId: { driveId, companyId } },
    });
    if (!part) return { ok: false, message: "No invitation found." };
    await db.recruitmentDriveCompany.update({
      where: { id: part.id },
      data: { status: "WITHDRAWN", withdrawnAt: new Date() },
    });
    await audit({
      actorId: userId,
      action: "recruitment_drive.company_declined",
      entity: "RecruitmentDrive",
      entityId: driveId,
      meta: { companyId },
    });
    revalidatePath(`/employer/fairs`);
    return { ok: true, message: "Invitation declined." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[recruitment-drive] decline invite failed");
    return { ok: false, message: "Couldn't decline." };
  }
}

// ─── Employer: edit booth (label + per-fair pitch) ─────────────────

const BoothSchema = z.object({
  driveId: z.string(),
  boothLabel: z.string().trim().max(60).optional().or(z.literal("")),
  aboutAtFair: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function updateBooth(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { userId, companyId } = await requireEmployerCompanyId();
    const parsed = BoothSchema.safeParse({
      driveId: formData.get("driveId"),
      boothLabel: formData.get("boothLabel") || "",
      aboutAtFair: formData.get("aboutAtFair") || "",
    });
    if (!parsed.success) return { ok: false, message: "Check the form." };
    const part = await db.recruitmentDriveCompany.findUnique({
      where: { driveId_companyId: { driveId: parsed.data.driveId, companyId } },
    });
    if (!part) return { ok: false, message: "Not invited to this drive." };
    if (part.status !== "CONFIRMED") {
      return { ok: false, message: "Confirm participation first." };
    }
    await db.recruitmentDriveCompany.update({
      where: { id: part.id },
      data: {
        boothLabel: parsed.data.boothLabel || null,
        aboutAtFair: parsed.data.aboutAtFair || null,
      },
    });
    await audit({
      actorId: userId,
      action: "recruitment_drive.booth_updated",
      entity: "RecruitmentDriveCompany",
      entityId: part.id,
    });
    revalidatePath(`/employer/fairs/${parsed.data.driveId}`);
    revalidatePath(`/fairs`);
    return { ok: true, message: "Booth updated." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[recruitment-drive] booth update failed");
    return { ok: false, message: "Couldn't save." };
  }
}

// ─── Employer: attach / detach jobs ────────────────────────────────

export async function attachJobToDrive(formData: FormData): Promise<FormState> {
  try {
    const { userId, companyId } = await requireEmployerCompanyId();
    const driveId = z.string().parse(formData.get("driveId"));
    const jobId = z.string().parse(formData.get("jobId"));
    const challengeAssessmentId = (formData.get("challengeAssessmentId") as string) || null;

    // Authz: the job must belong to the calling company AND the
    // company must be CONFIRMED at the drive. Both checks in one
    // round-trip.
    const [job, part] = await Promise.all([
      db.jobPosting.findFirst({
        where: { id: jobId, companyId },
        select: { id: true },
      }),
      db.recruitmentDriveCompany.findUnique({
        where: { driveId_companyId: { driveId, companyId } },
        select: { id: true, status: true },
      }),
    ]);
    if (!job) return { ok: false, message: "Job not found at your company." };
    if (!part) return { ok: false, message: "You're not on this drive." };
    if (part.status !== "CONFIRMED") {
      return { ok: false, message: "Confirm your participation first." };
    }

    // If a challenge is attached, validate it's an assessment that
    // belongs to this job (or to the library — `jobId = null`).
    if (challengeAssessmentId) {
      const assess = await db.assessment.findUnique({
        where: { id: challengeAssessmentId },
        select: { jobId: true, isLibrary: true },
      });
      if (!assess) return { ok: false, message: "Challenge not found." };
      if (assess.jobId && assess.jobId !== jobId && !assess.isLibrary) {
        return { ok: false, message: "Challenge belongs to a different job." };
      }
    }

    // Idempotent on (driveId, jobId).
    const existing = await db.recruitmentDriveJob.findUnique({
      where: { driveId_jobId: { driveId, jobId } },
    });
    if (existing) {
      await db.recruitmentDriveJob.update({
        where: { id: existing.id },
        data: { challengeAssessmentId },
      });
    } else {
      // Atomic: create the join + bump the counter together so a
      // mid-flow crash can't leave jobsCount drifted.
      await db.$transaction([
        db.recruitmentDriveJob.create({
          data: {
            driveId,
            jobId,
            companyId,
            participationId: part.id,
            challengeAssessmentId,
          },
        }),
        db.recruitmentDrive.update({
          where: { id: driveId },
          data: { jobsCount: { increment: 1 } },
        }),
      ]);
    }
    await audit({
      actorId: userId,
      action: "recruitment_drive.job_attached",
      entity: "RecruitmentDrive",
      entityId: driveId,
      meta: { jobId, hasChallenge: Boolean(challengeAssessmentId) },
    });
    revalidatePath(`/employer/fairs/${driveId}`);
    revalidatePath(`/fairs`);
    return { ok: true, message: existing ? "Job updated." : "Job attached to your booth." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[recruitment-drive] attach job failed");
    return { ok: false, message: "Couldn't attach the job." };
  }
}

export async function detachJobFromDrive(formData: FormData): Promise<FormState> {
  try {
    const { userId, companyId } = await requireEmployerCompanyId();
    const driveId = z.string().parse(formData.get("driveId"));
    const jobId = z.string().parse(formData.get("jobId"));
    const dj = await db.recruitmentDriveJob.findUnique({
      where: { driveId_jobId: { driveId, jobId } },
    });
    if (!dj || dj.companyId !== companyId) {
      return { ok: false, message: "Not authorised." };
    }
    // Atomic: delete the join + decrement the counter together.
    await db.$transaction([
      db.recruitmentDriveJob.delete({ where: { id: dj.id } }),
      db.recruitmentDrive.update({
        where: { id: driveId },
        data: { jobsCount: { decrement: 1 } },
      }),
    ]);
    await audit({
      actorId: userId,
      action: "recruitment_drive.job_detached",
      entity: "RecruitmentDrive",
      entityId: driveId,
      meta: { jobId },
    });
    revalidatePath(`/employer/fairs/${driveId}`);
    revalidatePath(`/fairs`);
    return { ok: true, message: "Job removed from your booth." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[recruitment-drive] detach job failed");
    return { ok: false, message: "Couldn't detach." };
  }
}

// ─── Admin: upload hero / banner with sharp auto-crop ──────────────

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB pre-resize cap

/**
 * Magic-byte sniff for the four allowed image formats. Defends
 * against attackers spoofing the MIME header (which is browser-
 * supplied and easily faked).
 */
function sniffImageKind(buffer: Buffer): "jpeg" | "png" | "gif" | "webp" | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
    return "png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38)
    return "gif";
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return "webp";
  return null;
}

/**
 * Shared upload pipeline for fair imagery. The two callers below
 * (uploadDriveBanner and uploadDriveHero) only differ in (a) which
 * column we update on the drive and (b) the output aspect ratio.
 */
async function uploadDriveImage(opts: {
  formData: FormData;
  field: "bannerImageUrl" | "heroImageUrl";
  width: number;
  height: number;
  keyPrefix: string;
}): Promise<FormState & { url?: string }> {
  try {
    const session = await requireAdmin();
    const driveId = z.string().parse(opts.formData.get("driveId"));
    const file = opts.formData.get("image") as File | null;
    const drive = await db.recruitmentDrive.findUnique({
      where: { id: driveId },
      select: { id: true, slug: true },
    });
    if (!drive) return { ok: false, message: "Drive not found." };
    if (!file) return { ok: false, message: "No file received." };
    if (file.size === 0) return { ok: false, message: "Empty file." };
    if (file.size > MAX_IMAGE_BYTES) {
      return { ok: false, message: "Image must be under 10 MB before resize." };
    }
    if (file.type && !ALLOWED_IMAGE_MIMES.has(file.type)) {
      return { ok: false, message: "JPEG, PNG, WebP, or GIF only." };
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const kind = sniffImageKind(inputBuffer);
    if (!kind) {
      return {
        ok: false,
        message: "File doesn't look like a real image (JPEG/PNG/WebP/GIF).",
      };
    }

    // sharp pipeline. Same shape as TeamLogoUploader's:
    //   • rotate() — apply EXIF rotation (otherwise mobile portraits
    //     come out sideways)
    //   • resize(W, H, cover) — scale to fill the target aspect-ratio
    //     box, crop the overflow centred. So a 1920×1080 source
    //     uploaded for the 3:1 banner gets centre-cropped to 1920×640.
    //   • webp({quality: 85}) — re-encode for ~30% smaller payload
    //     than the original. q=85 is near-lossless at this scale.
    let outBuffer: Buffer;
    try {
      outBuffer = await sharp(inputBuffer, { animated: kind === "gif" })
        .rotate()
        .resize(opts.width, opts.height, { fit: "cover", position: "centre" })
        .webp({ quality: 85 })
        .toBuffer();
    } catch (err) {
      logger.warn({ err, driveId }, "[recruitment-drive] sharp resize failed");
      return {
        ok: false,
        message: "Couldn't process this image. Try a different file.",
      };
    }

    const key = objectKey(`${opts.keyPrefix}/${drive.id}`, "webp");
    await s3.send(
      new PutObjectCommand({
        Bucket: buckets.logos,
        Key: key,
        Body: outBuffer,
        ContentType: "image/webp",
        ACL: "public-read",
        Metadata: { "x-content-type-options": "nosniff" },
      }),
    );

    const url = publicUrl("logos", key);
    await db.recruitmentDrive.update({
      where: { id: drive.id },
      data: { [opts.field]: url },
    });
    await audit({
      actorId: session.user.id,
      action: `recruitment_drive.${opts.field === "bannerImageUrl" ? "banner" : "hero"}_uploaded`,
      entity: "RecruitmentDrive",
      entityId: drive.id,
    });
    revalidatePath(`/admin/fairs/${drive.id}`);
    revalidatePath(`/fairs/${drive.slug}`);
    revalidatePath("/fairs");
    return { ok: true, url };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[recruitment-drive] upload image failed");
    return { ok: false, message: "Upload failed. Try again." };
  }
}

/**
 * Banner — wide thumbnail used in the /fairs list cards. 3:1
 * aspect ratio, ~1500×500 fits on retina without bloat.
 */
export async function uploadDriveBanner(formData: FormData): Promise<FormState & { url?: string }> {
  return uploadDriveImage({
    formData,
    field: "bannerImageUrl",
    width: 1500,
    height: 500,
    keyPrefix: "fair-banners",
  });
}

/**
 * Hero — full-bleed background on the public fair landing.
 * 16:9 (1920×1080) gives us the room we need for tall hero text +
 * a focal pin on the venue.
 */
export async function uploadDriveHero(formData: FormData): Promise<FormState & { url?: string }> {
  return uploadDriveImage({
    formData,
    field: "heroImageUrl",
    width: 1920,
    height: 1080,
    keyPrefix: "fair-heroes",
  });
}

// ─── Admin: toggle featured ──────────────────────────────────────────

/**
 * Flip `featuredAt` between now and null. Featured drives surface
 * on /pulse and the homepage's "EV job fairs" rail. Admin-only.
 * Idempotent on re-feature (just bumps the timestamp).
 */
export async function toggleDriveFeatured(formData: FormData): Promise<FormState> {
  try {
    const session = await requireAdmin();
    const driveId = z.string().parse(formData.get("driveId"));
    const drive = await db.recruitmentDrive.findUnique({
      where: { id: driveId },
      select: { id: true, slug: true, featuredAt: true },
    });
    if (!drive) return { ok: false, message: "Drive not found." };
    const next = drive.featuredAt ? null : new Date();
    await db.recruitmentDrive.update({
      where: { id: drive.id },
      data: { featuredAt: next },
    });
    await audit({
      actorId: session.user.id,
      action: next ? "recruitment_drive.featured" : "recruitment_drive.unfeatured",
      entity: "RecruitmentDrive",
      entityId: drive.id,
    });
    revalidatePath("/admin/fairs");
    revalidatePath(`/admin/fairs/${drive.id}`);
    revalidatePath("/pulse");
    revalidatePath("/");
    return {
      ok: true,
      message: next ? "Featured on /pulse + homepage." : "Removed from featured.",
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[recruitment-drive] toggle featured failed");
    return { ok: false, message: "Couldn't update." };
  }
}
