"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { isRouterControlError } from "@/lib/server-action-errors";
import { withUniqueSlug } from "@/lib/slug";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * College placement-cell self-serve flow. See schema.prisma comment
 * on `CollegePlacementCell` for the three-step lifecycle. These
 * actions cover:
 *
 *   • `registerCollegePlacementCell` — signed-in TPO submits an
 *     application; row lands PENDING + admin gets notified.
 *   • `approveCollegePlacementCell` — admin flips to APPROVED,
 *     toggles `User.isPlacementOfficer = true`, opens up /tpo.
 *   • `rejectCollegePlacementCell` — admin flips to REJECTED with
 *     an optional reason the TPO sees on a re-apply.
 *
 * All admin actions are audit-logged so we can answer "who approved
 * this college" months later.
 */

// ─── shared auth helpers ──────────────────────────────────────────

async function requireSignedIn() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/colleges/register");
  return session;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

// ─── 1) Self-serve registration ───────────────────────────────────

const RegisterSchema = z
  .object({
    // Either pick an existing institution …
    institutionId: z.string().trim().optional(),
    // … or create a new one inline. If `institutionId` is blank
    // these are required and produce a fresh UNVERIFIED row admin
    // can clean up during moderation.
    newInstitutionName: z.string().trim().max(160).optional(),
    newInstitutionCity: z.string().trim().max(80).optional(),
    newInstitutionState: z.string().trim().max(80).optional(),
    newInstitutionWebsite: z.string().trim().max(500).optional(),

    contactName: z.string().trim().min(1, "Contact name required").max(120),
    contactEmail: z.string().trim().email("Valid email required").max(160),
    contactPhone: z.string().trim().max(40).optional(),
    designation: z.string().trim().max(120).optional(),
    studentCount: z.coerce.number().int().min(0).max(100_000).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine(
    (d) => Boolean(d.institutionId) || Boolean(d.newInstitutionName),
    { message: "Pick an institution or fill the new-institution form", path: ["institutionId"] },
  );

/**
 * Public-facing: a college TPO submits a placement-cell application
 * from `/colleges/register`. Idempotent via the
 * `@@unique([institutionId, createdById])` constraint — a TPO who
 * accidentally resubmits is sent to the existing row's status page.
 */
export async function registerCollegePlacementCell(formData: FormData): Promise<void> {
  try {
    const session = await requireSignedIn();
    // 5/hour is generous but caps abuse from a single user trying
    // to spam different institutions.
    await rateLimitOrThrow(`college-register:${session.user.id}`, "signup");

    const parsed = RegisterSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid submission";
      redirect("/colleges/register?error=" + encodeURIComponent(msg));
    }
    const d = parsed.data;

    // Resolve institutionId — pick the supplied one OR create a new
    // UNVERIFIED Institution row. We always go through the slug
    // allocator so the new row gets a unique URL slug.
    let institutionId = d.institutionId?.trim() || "";
    if (!institutionId) {
      const name = d.newInstitutionName!.trim();
      const created = await withUniqueSlug(name, (slug) =>
        db.institution.create({
          data: {
            slug,
            name,
            type: "COLLEGE",
            city: d.newInstitutionCity?.trim() || null,
            state: d.newInstitutionState?.trim() || null,
            website: d.newInstitutionWebsite?.trim() || null,
            createdById: session.user.id,
            verificationStatus: "UNVERIFIED",
          },
          select: { id: true },
        }),
      );
      institutionId = created.id;
    } else {
      // Sanity-check the FK before write so the user gets a friendly
      // error rather than a P2003.
      const exists = await db.institution.findUnique({
        where: { id: institutionId },
        select: { id: true },
      });
      if (!exists) {
        redirect("/colleges/register?error=" + encodeURIComponent("Pick a valid institution"));
      }
    }

    let cellId: string;
    try {
      const created = await db.collegePlacementCell.create({
        data: {
          institutionId,
          createdById: session.user.id,
          status: "PENDING",
          contactName: d.contactName,
          contactEmail: d.contactEmail,
          contactPhone: d.contactPhone || null,
          designation: d.designation || null,
          studentCount: d.studentCount ?? null,
          notes: d.notes || null,
        },
        select: { id: true },
      });
      cellId = created.id;
    } catch (err) {
      // P2002 on the unique pair = this user already applied for
      // this institution. Send them to the status page rather than
      // erroring out — most likely a refresh / double-submit.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        redirect("/me/college?notice=" + encodeURIComponent("You've already applied for this college."));
      }
      throw err;
    }

    try {
      await audit({
        actorId: session.user.id,
        action: "college.placement_cell_apply",
        entity: "CollegePlacementCell",
        entityId: cellId,
        meta: { institutionId },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/colleges");
    redirect(
      "/me/college?notice=" +
        encodeURIComponent("Application submitted — we'll email you when an admin reviews it."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[registerCollegePlacementCell] failed");
    redirect("/colleges/register?error=" + encodeURIComponent("Something went wrong. Try again."));
  }
}

// ─── 2) Admin approve ─────────────────────────────────────────────

const ApproveSchema = z.object({ id: z.string().min(1) });

export async function approveCollegePlacementCell(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = ApproveSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/colleges?error=" + encodeURIComponent("Invalid request"));
    }
    const { id } = parsed.data;

    // We need a few fields for the notification + audit, so fetch
    // first then run the flip in a transaction.
    const cell = await db.collegePlacementCell.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        institutionId: true,
        createdById: true,
        institution: { select: { name: true } },
      },
    });
    if (!cell) {
      redirect("/admin/colleges?error=" + encodeURIComponent("Application not found"));
    }
    if (cell.status === "APPROVED") {
      // Already approved — no-op, but still bounce the admin back.
      redirect("/admin/colleges?notice=" + encodeURIComponent("Already approved"));
    }

    await db.$transaction([
      db.collegePlacementCell.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedById: session.user.id,
          rejectionReason: null,
        },
      }),
      // The whole point of approval: open up /tpo for them. Bulk-
      // import + TPO dashboard gates on this flag.
      db.user.update({
        where: { id: cell.createdById },
        data: { isPlacementOfficer: true },
      }),
    ]);

    try {
      await dispatchNotification({
        userId: cell.createdById,
        type: "college.placement_cell_approved",
        title: "Your placement cell is approved",
        body: `${cell.institution.name} is now live on emobility.careers. You can start importing students from /tpo.`,
        link: "/tpo",
        channels: ["IN_APP", "EMAIL"],
      });
    } catch {/* best-effort */}

    try {
      await audit({
        actorId: session.user.id,
        action: "college.placement_cell_approve",
        entity: "CollegePlacementCell",
        entityId: id,
        meta: { institutionId: cell.institutionId, tpoUserId: cell.createdById },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/colleges");
    revalidatePath("/me/college");
    redirect("/admin/colleges?notice=" + encodeURIComponent("Approved"));
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[approveCollegePlacementCell] failed");
    redirect("/admin/colleges?error=" + encodeURIComponent("Approve failed. Try again."));
  }
}

// ─── 3) Admin reject ──────────────────────────────────────────────

const RejectSchema = z.object({
  id: z.string().min(1),
  rejectionReason: z.string().trim().max(500).optional(),
});

export async function rejectCollegePlacementCell(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = RejectSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/colleges?error=" + encodeURIComponent("Invalid request"));
    }
    const { id, rejectionReason } = parsed.data;

    const cell = await db.collegePlacementCell.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        institutionId: true,
        createdById: true,
        institution: { select: { name: true } },
      },
    });
    if (!cell) {
      redirect("/admin/colleges?error=" + encodeURIComponent("Application not found"));
    }

    await db.collegePlacementCell.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedById: session.user.id,
        rejectionReason: rejectionReason || null,
      },
    });

    try {
      await dispatchNotification({
        userId: cell.createdById,
        type: "college.placement_cell_rejected",
        title: "Placement cell application needs more info",
        body: rejectionReason
          ? `Your ${cell.institution.name} application was rejected: ${rejectionReason}`
          : `Your ${cell.institution.name} application was rejected. Reply to this email for next steps.`,
        link: "/me/college",
        channels: ["IN_APP", "EMAIL"],
      });
    } catch {/* best-effort */}

    try {
      await audit({
        actorId: session.user.id,
        action: "college.placement_cell_reject",
        entity: "CollegePlacementCell",
        entityId: id,
        meta: { institutionId: cell.institutionId, rejectionReason: rejectionReason || null },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/colleges");
    revalidatePath("/me/college");
    redirect("/admin/colleges?notice=" + encodeURIComponent("Rejected"));
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[rejectCollegePlacementCell] failed");
    redirect("/admin/colleges?error=" + encodeURIComponent("Reject failed. Try again."));
  }
}

// ─── 3b) Admin edit contact details (any status) ─────────────────
//
// Recruiters / TPOs occasionally hand over the role to a different
// person at the college. Admin can patch the contact block without
// requiring the TPO to re-apply. Limited to mutable contact fields —
// the institution link, status, and creator are not editable here
// (those changes need different audit trails).

const EditContactSchema = z.object({
  id: z.string().min(1),
  contactName: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().email().max(160),
  contactPhone: z.string().trim().max(40).optional(),
  designation: z.string().trim().max(120).optional(),
  studentCount: z.coerce.number().int().min(0).max(100_000).optional(),
});

export async function updatePlacementCellContact(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = EditContactSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid edit";
      redirect("/admin/colleges?error=" + encodeURIComponent(msg));
    }
    const { id, contactName, contactEmail, contactPhone, designation, studentCount } = parsed.data;

    const before = await db.collegePlacementCell.findUnique({
      where: { id },
      select: { id: true, contactEmail: true, status: true },
    });
    if (!before) {
      redirect("/admin/colleges?error=" + encodeURIComponent("Cell not found"));
    }

    await db.collegePlacementCell.update({
      where: { id },
      data: {
        contactName,
        contactEmail,
        contactPhone: contactPhone || null,
        designation: designation || null,
        studentCount: studentCount ?? null,
      },
    });

    try {
      await audit({
        actorId: session.user.id,
        action: "college.placement_cell_contact_edit",
        entity: "CollegePlacementCell",
        entityId: id,
        meta: { emailChanged: before.contactEmail !== contactEmail },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/colleges");
    revalidatePath("/me/college");
    redirect(
      `/admin/colleges?status=${before.status}&notice=` +
        encodeURIComponent("Contact details updated."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[updatePlacementCellContact] failed");
    redirect("/admin/colleges?error=" + encodeURIComponent("Edit failed. Try again."));
  }
}

// ─── 3c) Admin reopen (REJECTED → PENDING) ───────────────────────
//
// Mistakes happen — an admin who rejects in error (or after the TPO
// clears up whatever the rejection reason was) can move the row
// back to PENDING for re-review. Clears rejectionReason + reviewer
// stamps so the row looks fresh in the queue.

const ReopenSchema = z.object({ id: z.string().min(1) });

export async function reopenCollegePlacementCell(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = ReopenSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/colleges?error=" + encodeURIComponent("Invalid request"));
    }
    const { id } = parsed.data;

    const cell = await db.collegePlacementCell.findUnique({
      where: { id },
      select: { id: true, status: true, createdById: true },
    });
    if (!cell) {
      redirect("/admin/colleges?error=" + encodeURIComponent("Cell not found"));
    }
    if (cell.status !== "REJECTED" && cell.status !== "REVOKED") {
      redirect(
        "/admin/colleges?error=" +
          encodeURIComponent("Only REJECTED or REVOKED cells can be reopened."),
      );
    }

    await db.collegePlacementCell.update({
      where: { id },
      data: {
        status: "PENDING",
        rejectionReason: null,
        reviewedAt: null,
        reviewedById: null,
      },
    });

    try {
      await audit({
        actorId: session.user.id,
        action: "college.placement_cell_reopen",
        entity: "CollegePlacementCell",
        entityId: id,
        meta: { from: cell.status, tpoUserId: cell.createdById },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/colleges");
    revalidatePath("/me/college");
    redirect("/admin/colleges?notice=" + encodeURIComponent("Reopened for re-review."));
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[reopenCollegePlacementCell] failed");
    redirect("/admin/colleges?error=" + encodeURIComponent("Reopen failed. Try again."));
  }
}

// ─── 4) Admin revoke (separate from reject — for already-approved
// cells that need to be deactivated, e.g. TPO left the college).
// We don't expose this from the queue UI v1 — it's only callable
// via an admin tool if/when needed. Keeping the action signature
// here so the lifecycle is complete in one file. ────────────────

const RevokeSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

export async function revokeCollegePlacementCell(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = RevokeSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/colleges?error=" + encodeURIComponent("Invalid request"));
    }
    const { id, reason } = parsed.data;

    const cell = await db.collegePlacementCell.findUnique({
      where: { id },
      select: { id: true, status: true, institutionId: true, createdById: true },
    });
    if (!cell) {
      redirect("/admin/colleges?error=" + encodeURIComponent("Application not found"));
    }
    if (cell.status !== "APPROVED") {
      redirect("/admin/colleges?error=" + encodeURIComponent("Only approved cells can be revoked"));
    }

    // Check whether this user has any OTHER approved cells before
    // dropping the flag — a TPO might be running placement at more
    // than one institution.
    const otherApproved = await db.collegePlacementCell.count({
      where: {
        createdById: cell.createdById,
        status: "APPROVED",
        id: { not: id },
      },
    });

    await db.$transaction([
      db.collegePlacementCell.update({
        where: { id },
        data: {
          status: "REVOKED",
          reviewedAt: new Date(),
          reviewedById: session.user.id,
          rejectionReason: reason || null,
        },
      }),
      ...(otherApproved === 0
        ? [
            db.user.update({
              where: { id: cell.createdById },
              data: { isPlacementOfficer: false },
            }),
          ]
        : []),
    ]);

    try {
      await audit({
        actorId: session.user.id,
        action: "college.placement_cell_revoke",
        entity: "CollegePlacementCell",
        entityId: id,
        meta: { institutionId: cell.institutionId, reason: reason || null, droppedFlag: otherApproved === 0 },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/colleges");
    redirect("/admin/colleges?notice=" + encodeURIComponent("Revoked"));
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[revokeCollegePlacementCell] failed");
    redirect("/admin/colleges?error=" + encodeURIComponent("Revoke failed. Try again."));
  }
}
