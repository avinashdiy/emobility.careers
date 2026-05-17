"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";

/**
 * Admin-only candidate profile patches. The candidate-side editors
 * at /me/profile own the full editing surface; this is a narrower
 * tool for admins to fix obvious data issues (typo in name, wrong
 * city, broken resume URL) without impersonating the candidate.
 *
 * Edits write to the same fields the candidate's own editors do,
 * so behaviour is identical post-save. Every change is audit-logged
 * with `actor` = admin user id.
 */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

const EditSchema = z.object({
  candidateId: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional(),
  headline: z.string().trim().max(160).optional(),
  summary: z.string().trim().max(4000).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
  location: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  country: z.string().trim().max(2).optional(),
  noticePeriodDays: z.coerce.number().int().min(0).max(365).optional(),
  totalExperienceMonths: z.coerce.number().int().min(0).max(720).optional(),
  openToWork: z.coerce.boolean().optional(),
  hiringNow: z.coerce.boolean().optional(),
  resumeUrl: z.string().trim().max(500).optional(),
  linkedinUrl: z.string().trim().max(500).optional(),
});

export async function adminUpdateCandidateProfile(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = EditSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid edit";
      redirect("/admin/candidates?error=" + encodeURIComponent(msg));
    }
    const d = parsed.data;

    const before = await db.candidateProfile.findUnique({
      where: { id: d.candidateId },
      select: { id: true, slug: true, firstName: true, lastName: true, email: true },
    });
    if (!before) {
      redirect("/admin/candidates?error=" + encodeURIComponent("Candidate not found"));
    }

    await db.candidateProfile.update({
      where: { id: d.candidateId },
      data: {
        firstName: d.firstName,
        lastName: d.lastName || null,
        headline: d.headline || null,
        summary: d.summary || null,
        phone: d.phone || null,
        email: d.email || null,
        location: d.location || null,
        city: d.city || null,
        country: d.country?.toUpperCase() || null,
        ...(d.noticePeriodDays != null ? { noticePeriodDays: d.noticePeriodDays } : {}),
        ...(d.totalExperienceMonths != null
          ? { totalExperienceMonths: d.totalExperienceMonths }
          : {}),
        openToWork: d.openToWork ?? false,
        hiringNow: d.hiringNow ?? false,
        resumeUrl: d.resumeUrl || null,
        linkedinUrl: d.linkedinUrl || null,
      },
    });

    try {
      await audit({
        actorId: session.user.id,
        action: "candidate.admin_edit",
        entity: "CandidateProfile",
        entityId: d.candidateId,
        meta: {
          nameChanged: before.firstName !== d.firstName || (before.lastName ?? "") !== (d.lastName ?? ""),
          emailChanged: (before.email ?? "") !== (d.email ?? ""),
        },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/candidates");
    revalidatePath(`/admin/candidates/${before.slug}`);
    revalidatePath(`/${before.slug}`);
    redirect(
      `/admin/candidates/${before.slug}?notice=` +
        encodeURIComponent("Profile updated."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[adminUpdateCandidateProfile] failed");
    redirect("/admin/candidates?error=" + encodeURIComponent("Edit failed."));
  }
}

const ToggleVerifySchema = z.object({ candidateId: z.string().min(1) });

/**
 * Admin manual flip of `isDIYguruVerified`. Mirrors the existing
 * `manuallyVerifyCandidate` admin action but accepts a candidateId
 * (the older one accepts profile id; equivalent here). Kept distinct
 * so the audit log entity is clearly the candidate.
 */
export async function adminToggleDIYguruVerified(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = ToggleVerifySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/candidates?error=" + encodeURIComponent("Invalid request"));
    }
    const c = await db.candidateProfile.findUnique({
      where: { id: parsed.data.candidateId },
      select: { id: true, slug: true, isDIYguruVerified: true },
    });
    if (!c) {
      redirect("/admin/candidates?error=" + encodeURIComponent("Not found"));
    }
    const next = !c.isDIYguruVerified;
    await db.candidateProfile.update({
      where: { id: c.id },
      data: {
        isDIYguruVerified: next,
        diyguruVerifiedAt: next ? new Date() : null,
      },
    });
    try {
      await audit({
        actorId: session.user.id,
        action: next ? "candidate.diyguru_verify" : "candidate.diyguru_unverify",
        entity: "CandidateProfile",
        entityId: c.id,
      });
    } catch {/* best-effort */}
    revalidatePath(`/admin/candidates/${c.slug}`);
    revalidatePath(`/${c.slug}`);
    redirect(`/admin/candidates/${c.slug}?notice=` + encodeURIComponent(next ? "Verified." : "Unverified."));
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[adminToggleDIYguruVerified] failed");
    redirect("/admin/candidates?error=" + encodeURIComponent("Toggle failed."));
  }
}
