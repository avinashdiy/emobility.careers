"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { InstitutionVerification } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";

/**
 * Admin moderation for user-submitted Institution rows. Mirrors
 * `setCompanyVerification` in server/admin/actions.ts but for the
 * Institution model. Candidates submit new institutions via the
 * EntityPicker → createInstitutionLite path, which marks them
 * PENDING. Admin reviews + flips to VERIFIED (page goes live) or
 * REJECTED (hidden from search + dropped from picker).
 *
 * Display rule reminder: on candidate profiles, the institution
 * name renders regardless of status. Only VERIFIED rows render as
 * clickable links to /institutions/<slug>.
 */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

const VerifySchema = z.object({
  institutionId: z.string().min(1),
  status: z.nativeEnum(InstitutionVerification),
  reason: z.string().trim().max(500).optional(),
});

export async function setInstitutionVerification(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = VerifySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/institutions?error=" + encodeURIComponent("Invalid moderation request"));
    }
    const { institutionId, status, reason } = parsed.data;

    // For REJECTED, require a minimum reason — matches the company
    // moderation pattern. Audit log captures it for the founder.
    if (status === "REJECTED" && (!reason || reason.length < 10)) {
      redirect(
        "/admin/institutions?error=" +
          encodeURIComponent(
            "Provide a reason (10+ chars) when rejecting — it's logged for the submitter.",
          ),
      );
    }

    const before = await db.institution.findUnique({
      where: { id: institutionId },
      select: {
        id: true,
        slug: true,
        name: true,
        verificationStatus: true,
        createdById: true,
      },
    });
    if (!before) {
      redirect("/admin/institutions?error=" + encodeURIComponent("Institution not found"));
    }

    await db.institution.update({
      where: { id: institutionId },
      data: {
        verificationStatus: status,
        ...(status === "VERIFIED" ? { verifiedAt: new Date() } : {}),
        ...(status !== "VERIFIED" ? { verifiedAt: null } : {}),
      },
    });

    try {
      await audit({
        actorId: session.user.id,
        action: "institution.verify",
        entity: "Institution",
        entityId: institutionId,
        meta: {
          from: before.verificationStatus,
          to: status,
          submitterUserId: before.createdById,
          reason: reason ?? null,
        },
      });
    } catch {/* best-effort */}

    // Revalidate the moderation queue + the public surface where
    // this institution now appears (or stops appearing). Also bust
    // the institution's own page if approved.
    revalidatePath("/admin/institutions");
    revalidatePath("/institutions");
    revalidatePath(`/institutions/${before.slug}`);

    redirect(
      `/admin/institutions?notice=` +
        encodeURIComponent(
          status === "VERIFIED"
            ? `${before.name} approved — page is now live.`
            : status === "REJECTED"
              ? `${before.name} rejected.`
              : `${before.name} status updated to ${status.toLowerCase()}.`,
        ),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[setInstitutionVerification] failed");
    redirect("/admin/institutions?error=" + encodeURIComponent("Moderation failed. Try again."));
  }
}

const EditSchema = z.object({
  institutionId: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  type: z.enum([
    "UNIVERSITY",
    "COLLEGE",
    "SCHOOL",
    "ITI",
    "POLYTECHNIC",
    "RESEARCH_INSTITUTE",
    "TRAINING_CENTER",
    "OTHER",
  ]),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  website: z.string().trim().max(500).optional(),
});

/**
 * Lets admin clean up a candidate-submitted institution before
 * approving — fix capitalisation, add a city, swap type. Useful
 * because candidates often submit "IIT Bombay" with no type set or
 * "Vit chennai" with bad casing.
 */
export async function adminEditInstitution(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = EditSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid edit";
      redirect("/admin/institutions?error=" + encodeURIComponent(msg));
    }
    const { institutionId, name, type, city, state, website } = parsed.data;

    await db.institution.update({
      where: { id: institutionId },
      data: {
        name,
        type,
        city: city || null,
        state: state || null,
        website: website || null,
      },
    });

    try {
      await audit({
        actorId: session.user.id,
        action: "institution.edit",
        entity: "Institution",
        entityId: institutionId,
        meta: { fields: Object.keys(parsed.data) },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/institutions");
    redirect("/admin/institutions?notice=" + encodeURIComponent("Details updated."));
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[adminEditInstitution] failed");
    redirect("/admin/institutions?error=" + encodeURIComponent("Edit failed."));
  }
}
