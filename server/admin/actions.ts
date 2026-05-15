"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { isRouterControlError } from "@/lib/server-action-errors";
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

/**
 * Toggle the `User.isPlacementOfficer` flag — grants /tpo dashboard
 * access without making the user an ADMIN. Reserved for trusted DIYguru
 * placement coordinators.
 */
export async function togglePlacementOfficer(formData: FormData) {
  const session = await requireAdmin();
  const userId = z.string().parse(formData.get("userId"));
  const before = await db.user.findUnique({
    where: { id: userId },
    select: { isPlacementOfficer: true },
  });
  if (!before) return;
  const next = !before.isPlacementOfficer;
  await db.user.update({ where: { id: userId }, data: { isPlacementOfficer: next } });
  await audit({
    actorId: session.user.id,
    action: next ? "user.tpo_granted" : "user.tpo_revoked",
    entity: "User",
    entityId: userId,
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
  const reasonInput = (formData.get("reason") as string | null)?.trim() ?? "";

  // For REJECTED status, require a reason — without one the email to
  // the owner would just say "no reason given" which is the exact
  // capricious behaviour we're trying to avoid. For other statuses,
  // any incoming reason is ignored and any prior reason is cleared.
  if (status === CompanyVerification.REJECTED && reasonInput.length < 10) {
    redirect(
      "/admin/employers?error=" +
        encodeURIComponent(
          "Provide a reason (at least 10 chars) when rejecting — it's emailed to the company owner so they know what to fix.",
        ),
    );
  }

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      slug: true,
      owner: { select: { email: true, name: true } },
    },
  });
  if (!company) {
    redirect("/admin/employers?error=" + encodeURIComponent("Company not found."));
  }

  await db.company.update({
    where: { id: companyId },
    data: {
      verificationStatus: status,
      // Persist or clear the reason in lockstep with the status flip
      // so a company that was rejected then re-approved doesn't
      // carry around a stale rejection note.
      rejectionReason: status === CompanyVerification.REJECTED ? reasonInput : null,
      rejectionAt: status === CompanyVerification.REJECTED ? new Date() : null,
    },
  });

  await audit({
    actorId: session.user.id,
    action: "company.verification",
    entity: "Company",
    entityId: companyId,
    meta: {
      status,
      ...(status === CompanyVerification.REJECTED && { reason: reasonInput }),
    },
  });

  // Email the owner on REJECTED specifically. We don't email on
  // VERIFIED (a quiet success is fine — the page just goes live)
  // unless we want to add that later. Wrapped so a transient mail
  // outage doesn't roll back the verification flip.
  if (status === CompanyVerification.REJECTED && company!.owner?.email) {
    try {
      const { companyRejectedEmail } = await import("@/lib/emails/templates");
      const { sendMail } = await import("@/lib/mail");
      const tpl = companyRejectedEmail({
        ownerName: company!.owner.name ?? null,
        companyName: company!.name,
        reason: reasonInput,
      });
      await sendMail({ to: company!.owner.email, ...tpl });
    } catch (err) {
      const { logger } = await import("@/lib/logger");
      logger.warn({ err, companyId }, "[company.verification] reject email failed");
    }
  }

  revalidatePath("/admin/employers");
  revalidatePath("/companies");
  // Slug isn't known here; revalidate the dynamic prefix so any
  // recently-cached /company/[slug] pages drop their cache and
  // re-render with the new visibility gate.
  revalidatePath("/company", "layout");
}

/**
 * Permanently delete a Company and everything cascading off it
 * (jobs, employer profiles, team invites, events, cohorts,
 * verification requests, competitions, follows). Used by platform
 * admins to clean up duplicate / spam company pages — the equivalent
 * of LinkedIn's "merge or delete" affordance.
 *
 * What survives the delete (relations are SetNull, not Cascade):
 *   • Candidate Experience entries that linked to the company —
 *     they remain as plain-text rows with the FK nulled.
 *   • Posts authored "as the company" — they revert to personal
 *     posts authored by the same User.
 *   • Salary submissions — kept for analytics but unlinked.
 *
 * Refused if the company has any APPLICATIONS attached to its jobs.
 * Job postings cascade-delete fine, but losing application history
 * (interviews, stage moves, candidate notes) is unrecoverable, so we
 * force the admin to first manually deal with applications.
 */
export async function deleteCompany(formData: FormData) {
  const session = await requireAdmin();
  const companyId = z.string().parse(formData.get("companyId"));

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { jobs: true, team: true, events: true } },
    },
  });
  if (!company) {
    redirect("/admin/employers?error=" + encodeURIComponent("Company not found."));
  }

  // Hard guard — refuse if any job has live applications. Application
  // rows have onDelete: Cascade against JobPosting, so if we don't
  // refuse here a single click would erase candidate application
  // history irreversibly.
  const appsCount = await db.application.count({
    where: { job: { companyId } },
  });
  if (appsCount > 0) {
    redirect(
      "/admin/employers?error=" +
        encodeURIComponent(
          `Can't delete "${company!.name}" — ${appsCount} application(s) attached to its jobs would be lost. Reject the company instead (hides it publicly) or move applications elsewhere first.`,
        ),
    );
  }

  // Cascade-delete via Prisma. Schema-level onDelete: Cascade fires
  // for jobs, employer profiles, team invites, events, cohorts,
  // verification requests, competitions, follows.
  await db.company.delete({ where: { id: companyId } });

  await audit({
    actorId: session.user.id,
    action: "company.deleted",
    entity: "Company",
    entityId: companyId,
    meta: {
      name: company!.name,
      slug: company!.slug,
      cascadedJobs: company!._count.jobs,
      cascadedTeam: company!._count.team,
      cascadedEvents: company!._count.events,
    },
  });

  revalidatePath("/admin/employers");
  revalidatePath("/companies");
  revalidatePath("/company", "layout");
  redirect(
    "/admin/employers?notice=" +
      encodeURIComponent(`Deleted "${company!.name}".`),
  );
}

/**
 * Bulk-delete every REJECTED company that has no live applications.
 * The admin UI hides REJECTED rows past the pagination cutoff, so
 * this is the cleanup hatch for clearing them all at once.
 *
 * Companies with applications attached to their jobs are skipped (we
 * never silently destroy candidate application history). The admin
 * sees a count of deleted vs skipped in the success notice.
 */
export async function bulkDeleteRejectedCompanies() {
  const session = await requireAdmin();

  const candidates = await db.company.findMany({
    where: { verificationStatus: "REJECTED" },
    select: { id: true, name: true, slug: true },
  });

  // Build a parallel query to find which of those still have
  // applications. Doing this in one go is cheaper than per-company.
  const withApps = candidates.length === 0
    ? []
    : await db.application.groupBy({
        by: ["jobId"],
        where: { job: { companyId: { in: candidates.map((c) => c.id) } } },
        _count: { _all: true },
      });
  const blockedJobIds = new Set(withApps.map((w) => w.jobId));
  const blockedCompanyIds = new Set<string>();
  if (blockedJobIds.size > 0) {
    const blockedJobs = await db.jobPosting.findMany({
      where: { id: { in: [...blockedJobIds] } },
      select: { companyId: true },
    });
    for (const j of blockedJobs) blockedCompanyIds.add(j.companyId);
  }

  const toDelete = candidates.filter((c) => !blockedCompanyIds.has(c.id));
  let deleted = 0;
  for (const c of toDelete) {
    try {
      await db.company.delete({ where: { id: c.id } });
      deleted += 1;
    } catch {
      // Cascade-failure on a single row shouldn't abort the whole
      // bulk run. Skip and continue.
    }
  }

  await audit({
    actorId: session.user.id,
    action: "company.bulk_deleted",
    entity: "Company",
    entityId: "bulk",
    meta: {
      attempted: candidates.length,
      deleted,
      skippedDueToApplications: candidates.length - toDelete.length,
    },
  });

  revalidatePath("/admin/employers");
  revalidatePath("/companies");
  revalidatePath("/company", "layout");

  const skipped = candidates.length - deleted;
  redirect(
    "/admin/employers?notice=" +
      encodeURIComponent(
        skipped === 0
          ? `Deleted ${deleted} rejected compan${deleted === 1 ? "y" : "ies"}.`
          : `Deleted ${deleted}, skipped ${skipped} (had application history attached). Move applications elsewhere first to delete those.`,
      ),
  );
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

/**
 * Inline-edit a single skill row. Allows renaming + re-categorising
 * an existing canonical skill. We preserve the slug — renaming would
 * require a slug change too, which would invalidate any URL or cached
 * reference. Admins who really need to rename should add a new skill
 * and delete the old one (deletion cascades cleanly via Prisma).
 */
export async function updateSkill(formData: FormData) {
  await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  const name = z.string().min(1).max(80).parse(formData.get("name"));
  const evDomainId = String(formData.get("evDomainId") ?? "") || null;
  await db.skill.update({
    where: { id },
    data: { name, evDomainId },
  });
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

// ─── Email diagnostics ───────────────────────────────────────
//
// Triggered from /admin/settings?tab=email. Tries to send a test email
// to the supplied address using whichever provider is configured. We
// surface the raw provider error message back as a query-string flash
// so the admin can see (e.g.) "SignatureDoesNotMatch" or "domain not
// verified" without SSH-ing to the box.
export async function sendTestEmail(formData: FormData) {
  await requireAdmin();
  const to = z.string().email().parse(formData.get("to"));

  const { sendMail, activeMailProvider } = await import("@/lib/mail");
  const provider = activeMailProvider();

  if (provider === "none") {
    redirect(
      `/admin/settings?tab=email&testEmail=err&testMsg=${encodeURIComponent(
        "No email provider is configured. Set AWS_SES_REGION + AWS_SES_ACCESS_KEY_ID + AWS_SES_SECRET_ACCESS_KEY (or RESEND_API_KEY) in .env on the host and restart the web container.",
      )}`,
    );
  }

  try {
    await sendMail({
      to,
      subject: "eMobility Careers — test email",
      html: `<p>This is a test email from your <strong>eMobility Careers</strong> admin settings.</p>
<p>Provider: <code>${provider}</code></p>
<p>If you see this in your inbox, transactional emails (sign-up verification, magic links, password resets, etc.) are delivering correctly.</p>`,
      text: `This is a test email from eMobility Careers admin settings.\nProvider: ${provider}.\nIf you see this in your inbox, transactional email is delivering.`,
    });
    redirect(
      `/admin/settings?tab=email&testEmail=ok&testMsg=${encodeURIComponent(
        `Sent via ${provider} to ${to}. Check the inbox (and spam) within a minute.`,
      )}`,
    );
  } catch (err) {
    // Re-throw redirect / not-found errors Next.js uses for control
    // flow. Using the canonical helper instead of an ad-hoc
    // `err.message === "NEXT_REDIRECT"` check — the helper handles
    // both NEXT_REDIRECT and NEXT_NOT_FOUND and survives any future
    // Next.js error-format change.
    if (isRouterControlError(err)) throw err;
    const message =
      err instanceof Error
        ? `${err.name}: ${err.message}`.slice(0, 600)
        : "Unknown error — check server logs (pm2 logs emce-web).";
    redirect(
      `/admin/settings?tab=email&testEmail=err&testMsg=${encodeURIComponent(message)}`,
    );
  }
}
