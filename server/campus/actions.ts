"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { withUniqueSlug } from "@/lib/slug";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { CampusDriveStatus } from "@prisma/client";

/**
 * Campus drive CRUD. Drives are owned by Companies — same authorization
 * rule as job postings: any team member of the company (or an ADMIN)
 * can edit the drive's content + linked jobs.
 *
 * The big behaviour change in this module is around `landingPageUrl`:
 * we no longer treat it as recruiter-typed free text. Whenever a drive
 * has a slug, the URL is auto-derived from `${APP_URL}/campus/{slug}`.
 * The slug is generated from the title + company on first save and is
 * unique across all drives (`@unique` in the schema).
 */

async function requireDriveAccess(driveId?: string) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    include: { company: true },
  });
  if (!employer && session.user.role !== "ADMIN") redirect("/employer/onboarding");

  if (driveId) {
    const drive = await db.campusDrive.findUnique({
      where: { id: driveId },
      select: { id: true, companyId: true, slug: true, status: true },
    });
    if (!drive) redirect("/employer/drives");
    if (
      session.user.role !== "ADMIN" &&
      drive.companyId !== employer?.companyId
    ) {
      redirect("/403");
    }
    return { session, employer, drive };
  }
  return { session, employer, drive: null };
}

const createSchema = z.object({
  title: z.string().min(3).max(140),
  institution: z.string().min(2).max(200),
  city: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  driveDate: z.string().min(8),         // YYYY-MM-DD
  driveEndDate: z.string().optional(),  // optional second date
  contactName: z.string().max(120).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().max(40).optional(),
  description: z.string().max(8000).optional(),
  bannerImageUrl: z.string().url().optional().or(z.literal("")),
  maxCandidates: z.coerce.number().int().min(0).max(10000).optional(),
});

export async function createDrive(formData: FormData) {
  const { session, employer } = await requireDriveAccess();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/employer/drives?error=" + encodeURIComponent("Please fill required fields."));
  }
  const data = parsed.data;
  const companyId = employer?.companyId;
  if (!companyId) redirect("/employer/onboarding");

  // Slug = "{title}-{company-slug}" → unique across drives via withUniqueSlug.
  // We append the company slug because two companies may run a drive with
  // the same title at the same institution.
  const drive = await withUniqueSlug(
    `${data.title}-${employer!.company.slug}`,
    (slug) =>
      db.campusDrive.create({
        data: {
          slug,
          companyId,
          title: data.title,
          institution: data.institution,
          city: data.city || null,
          state: data.state || null,
          driveDate: new Date(data.driveDate),
          driveEndDate: data.driveEndDate ? new Date(data.driveEndDate) : null,
          contactName: data.contactName || null,
          contactEmail: data.contactEmail || null,
          contactPhone: data.contactPhone || null,
          description: data.description || null,
          bannerImageUrl: data.bannerImageUrl || null,
          maxCandidates: data.maxCandidates ?? null,
          // Auto-fill landingPageUrl from the slug. Recruiters can override
          // later (e.g. point at a Calendly) via updateDrive, but the
          // default is the auto-generated emobility.careers page.
          landingPageUrl: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/campus/${slug}`,
        },
        select: { id: true, slug: true, title: true },
      }),
  );

  await audit({
    actorId: session.user.id,
    action: "campus_drive.created",
    entity: "CampusDrive",
    entityId: drive.id,
    meta: { title: drive.title },
  });

  revalidatePath("/employer/drives");
  redirect(`/employer/drives/${drive.id}`);
}

const updateSchema = createSchema.extend({
  driveId: z.string(),
  // Only used when an admin / coordinator wants to redirect candidates to
  // an external landing page. Empty string = revert to auto-generated.
  landingPageOverride: z.string().url().optional().or(z.literal("")),
});

export async function updateDrive(formData: FormData) {
  const { session, drive } = await requireDriveAccess(
    String(formData.get("driveId") ?? ""),
  );
  if (!drive) return;
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/employer/drives/${drive.id}?error=` + encodeURIComponent("Please fill required fields."));
  }
  const data = parsed.data;

  const autoUrl = drive.slug
    ? `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/campus/${drive.slug}`
    : null;
  const finalLandingUrl = data.landingPageOverride ? data.landingPageOverride : autoUrl;

  await db.campusDrive.update({
    where: { id: drive.id },
    data: {
      title: data.title,
      institution: data.institution,
      city: data.city || null,
      state: data.state || null,
      driveDate: new Date(data.driveDate),
      driveEndDate: data.driveEndDate ? new Date(data.driveEndDate) : null,
      contactName: data.contactName || null,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
      description: data.description || null,
      bannerImageUrl: data.bannerImageUrl || null,
      maxCandidates: data.maxCandidates ?? null,
      landingPageUrl: finalLandingUrl,
    },
  });

  await audit({
    actorId: session.user.id,
    action: "campus_drive.updated",
    entity: "CampusDrive",
    entityId: drive.id,
  });
  revalidatePath("/employer/drives");
  revalidatePath(`/employer/drives/${drive.id}`);
  if (drive.slug) revalidatePath(`/campus/${drive.slug}`);
}

export async function setDriveStatus(formData: FormData) {
  const { session, drive } = await requireDriveAccess(String(formData.get("driveId") ?? ""));
  if (!drive) return;
  const status = z.nativeEnum(CampusDriveStatus).parse(formData.get("status"));
  await db.campusDrive.update({
    where: { id: drive.id },
    data: { status },
  });
  await audit({
    actorId: session.user.id,
    action: "campus_drive.status_change",
    entity: "CampusDrive",
    entityId: drive.id,
    meta: { status },
  });
  revalidatePath("/employer/drives");
  revalidatePath(`/employer/drives/${drive.id}`);
  if (drive.slug) revalidatePath(`/campus/${drive.slug}`);
}

export async function attachJobToDrive(formData: FormData) {
  const { session, drive } = await requireDriveAccess(String(formData.get("driveId") ?? ""));
  if (!drive) return;
  const jobId = z.string().parse(formData.get("jobId"));
  // Sanity check — the job must belong to the same company as the drive
  // (or be admin-managed). Otherwise companies could attach each other's
  // jobs to their drive landing pages.
  const job = await db.jobPosting.findUnique({
    where: { id: jobId },
    select: { companyId: true },
  });
  if (!job) return;
  if (session.user.role !== "ADMIN" && job.companyId !== drive.companyId) return;
  await db.campusDriveJob.upsert({
    where: { driveId_jobId: { driveId: drive.id, jobId } },
    create: { driveId: drive.id, jobId },
    update: {},
  });
  revalidatePath(`/employer/drives/${drive.id}`);
  if (drive.slug) revalidatePath(`/campus/${drive.slug}`);
}

export async function detachJobFromDrive(formData: FormData) {
  const { drive } = await requireDriveAccess(String(formData.get("driveId") ?? ""));
  if (!drive) return;
  const jobId = z.string().parse(formData.get("jobId"));
  await db.campusDriveJob.delete({
    where: { driveId_jobId: { driveId: drive.id, jobId } },
  }).catch(() => undefined);
  revalidatePath(`/employer/drives/${drive.id}`);
  if (drive.slug) revalidatePath(`/campus/${drive.slug}`);
}
