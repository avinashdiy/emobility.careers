"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CompanyVerification, Role, AccountStatus } from "@prisma/client";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

// ─── Users ───────────────────────────────────────────────────

export async function setUserRole(formData: FormData) {
  const session = await requireAdmin();
  const userId = z.string().parse(formData.get("userId"));
  const role = z.nativeEnum(Role).parse(formData.get("role"));
  const before = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  await db.user.update({ where: { id: userId }, data: { role } });
  await audit({
    actorId: session.user.id,
    action: "user.role_change",
    entity: "User",
    entityId: userId,
    meta: { from: before?.role, to: role },
  });
  revalidatePath("/admin/users");
}

export async function setUserStatus(formData: FormData) {
  const session = await requireAdmin();
  const userId = z.string().parse(formData.get("userId"));
  const status = z.nativeEnum(AccountStatus).parse(formData.get("status"));
  const before = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
  await db.user.update({ where: { id: userId }, data: { status } });
  await audit({
    actorId: session.user.id,
    action: "user.status_change",
    entity: "User",
    entityId: userId,
    meta: { from: before?.status, to: status },
  });
  revalidatePath("/admin/users");
}

// ─── Employer / company verification ────────────────────────

export async function setCompanyVerification(formData: FormData) {
  const session = await requireAdmin();
  const companyId = z.string().parse(formData.get("companyId"));
  const status = z.nativeEnum(CompanyVerification).parse(formData.get("status"));
  await db.company.update({ where: { id: companyId }, data: { verificationStatus: status } });
  await audit({
    actorId: session.user.id,
    action: "company.verification",
    entity: "Company",
    entityId: companyId,
    meta: { status },
  });
  revalidatePath("/admin/employers");
}

// ─── DIYguru roster import ───────────────────────────────────

export async function importDIYguruRoster(formData: FormData) {
  const session = await requireAdmin();
  const file = formData.get("file") as File | null;
  const notes = String(formData.get("notes") ?? "");
  if (!file) redirect("/admin/diyguru?error=No+file");

  if ((file as File).size > 10 * 1024 * 1024) {
    redirect("/admin/diyguru?error=" + encodeURIComponent("CSV too large (max 10MB)"));
  }

  const text = await (file as File).text();
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  // Cap at 10k rows per import to bound memory + transaction time
  const rows = result.data.slice(0, 10_000);

  const seen = new Set<string>();
  const normalized = rows
    .map((row) => {
      const email = (row.email ?? "").trim().toLowerCase();
      if (!email || seen.has(email)) return null;
      seen.add(email);
      return {
        email,
        fullName: row.full_name ?? row.name ?? "",
        studentId: row.student_id ?? row.id ?? null,
        phone: row.phone ?? null,
        courseName: row.course_name ?? row.course ?? null,
        courseSlug: row.course_slug ?? null,
        completionDate: row.completion_date ? new Date(row.completion_date) : null,
        grade: row.grade ?? null,
        labTags: row.lab_tags ? row.lab_tags.split("|").map((s) => s.trim()).filter(Boolean) : [],
        capstoneTitle: row.capstone_title ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // 1. Create batch + bulk roster insert in one transaction
  const batch = await db.$transaction(async (tx) => {
    const b = await tx.dIYguruImportBatch.create({
      data: {
        uploadedById: session.user.id,
        rowCount: normalized.length,
        notes: notes || null,
      },
    });
    if (normalized.length > 0) {
      await tx.dIYguruRoster.createMany({
        data: normalized.map((r) => ({ ...r, importBatchId: b.id })),
        skipDuplicates: true,
      });
    }
    return b;
  });

  // 2. Match against existing candidate profiles in one query
  const matchedUsers = await db.user.findMany({
    where: { email: { in: normalized.map((r) => r.email) } },
    select: { id: true, email: true, candidateProfile: { select: { id: true } } },
  });
  const userByEmail = new Map(matchedUsers.map((u) => [u.email, u]));

  const claims = normalized
    .map((r) => {
      const u = userByEmail.get(r.email);
      return u?.candidateProfile
        ? { email: r.email, userId: u.id, profileId: u.candidateProfile.id, row: r }
        : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (claims.length > 0) {
    await db.$transaction([
      ...claims.map((c) =>
        db.candidateProfile.update({
          where: { id: c.profileId },
          data: {
            isDIYguruVerified: true,
            diyguruStudentId: c.row.studentId,
            diyguruVerifiedAt: new Date(),
            ...(c.row.labTags.length > 0 ? { labExposureTags: c.row.labTags } : {}),
          },
        }),
      ),
      db.dIYguruRoster.updateMany({
        where: { importBatchId: batch.id, email: { in: claims.map((c) => c.email) } },
        data: { claimedAt: new Date() },
      }),
      db.dIYguruImportBatch.update({
        where: { id: batch.id },
        data: { matchedCount: claims.length },
      }),
    ]);
  }

  await audit({
    actorId: session.user.id,
    action: "diyguru.import",
    entity: "DIYguruImportBatch",
    entityId: batch.id,
    meta: { rowCount: normalized.length, matchedCount: claims.length },
  });

  revalidatePath("/admin/diyguru");
  redirect(`/admin/diyguru?imported=${normalized.length}&matched=${claims.length}`);
}

export async function manuallyVerifyCandidate(formData: FormData) {
  await requireAdmin();
  const candidateId = z.string().parse(formData.get("candidateId"));
  const verified = formData.get("verified") === "true";
  await db.candidateProfile.update({
    where: { id: candidateId },
    data: {
      isDIYguruVerified: verified,
      diyguruVerifiedAt: verified ? new Date() : null,
    },
  });
  revalidatePath("/admin/diyguru");
}

// ─── Skill taxonomy ──────────────────────────────────────────

export async function createSkill(formData: FormData) {
  await requireAdmin();
  const name = z.string().min(1).max(80).parse(formData.get("name"));
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const evDomainId = String(formData.get("evDomainId") ?? "") || null;
  await db.skill.upsert({
    where: { slug },
    create: { slug, name, evDomainId, category: "Manual" },
    update: { name, evDomainId },
  });
  revalidatePath("/admin/skills");
}

export async function deleteSkill(formData: FormData) {
  await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  await db.skill.delete({ where: { id } });
  revalidatePath("/admin/skills");
}

// ─── Job moderation ──────────────────────────────────────────

export async function setJobStatus(formData: FormData) {
  await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  const status = z.string().parse(formData.get("status"));
  await db.jobPosting.update({
    where: { id },
    data: { status: status as "DRAFT" | "OPEN" | "PAUSED" | "CLOSED" | "PENDING_REVIEW" },
  });
  revalidatePath("/admin/jobs");
}
