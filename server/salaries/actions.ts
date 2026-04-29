"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { clientIp, honeypotTriggered } from "@/lib/anti-spam";
import { getOrSetAnonCookie, setUnlocked } from "@/lib/salary-compass";
import { ProfileMode, SalarySubmissionStatus } from "@prisma/client";

/**
 * Salary Compass — server actions.
 *
 *   • submitSalary       (public, anti-spam) — anonymous submission;
 *                          unlocks the database for 30d on success.
 *   • approveSalary      (admin) — moves PENDING → APPROVED.
 *   • rejectSalary       (admin) — moves PENDING → REJECTED.
 *
 * Anti-abuse on submission:
 *   - Honeypot field
 *   - Per-IP rate-limit (4/24h)
 *   - Per-cookie quota (1 submission/24h)
 *   - Sane min/max bounds on CTC
 *   - Status defaults to PENDING; admin moderation gates display
 */

const submitSchema = z.object({
  companyName: z.string().min(2).max(120),
  companyId: z.string().optional().nullable(),
  jobTitle: z.string().min(2).max(120),
  evDomainId: z.string().optional().nullable(),
  profileMode: z.nativeEnum(ProfileMode).default(ProfileMode.EXPERIENCED),
  yearsExp: z.coerce.number().int().min(0).max(40),
  location: z.string().max(80).optional(),
  ctcLakhs: z.coerce.number().min(1).max(2000), // up to ₹20Cr — generous cap
  baseLakhs: z.coerce.number().min(0).max(2000).optional(),
  bonusLakhs: z.coerce.number().min(0).max(2000).optional(),
  esopLakhs: z.coerce.number().min(0).max(2000).optional(),
  currency: z.string().default("INR"),
  // Toggle on the form. When checked, we attribute the submission to
  // the signed-in user (only for users who are signed in).
  attributeToProfile: z.coerce.boolean().optional(),
});

export async function submitSalary(formData: FormData): Promise<void> {
  // Layer 1 — honeypot
  if (honeypotTriggered(formData.get("website"))) {
    redirect("/salaries/submit?error=" + encodeURIComponent("Couldn't process this submission."));
  }

  // Layer 2 — rate-limit by IP
  const ip = await clientIp();
  if (ip) {
    try {
      await rateLimitOrThrow(`salary-ip:${ip}`, "signupIp"); // reuse 5/hour preset
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Too many submissions";
      redirect("/salaries/submit?error=" + encodeURIComponent(msg));
    }
  }

  // Layer 3 — schema
  const parsed = submitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/salaries/submit?error=" + encodeURIComponent("Please fill required fields with sensible numbers."));
  }
  const data = parsed.data;

  // Layer 4 — per-cookie 24h quota. Returning visitors can submit once
  // per day; this is generous (real users only submit once-ever) but
  // protects against a single-cookie spam burst.
  const cookieId = await getOrSetAnonCookie();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db.salarySubmission.count({
    where: { cookieId, createdAt: { gte: since24h } },
  });
  if (recent >= 1) {
    redirect("/salaries/submit?error=" + encodeURIComponent("You already submitted today. Come back tomorrow!"));
  }

  // Layer 5 — submit
  const session = await auth();
  const submittedByUserId = data.attributeToProfile && session?.user ? session.user.id : null;
  await db.salarySubmission.create({
    data: {
      companyId: data.companyId || null,
      companyName: data.companyName.trim(),
      jobTitle: data.jobTitle.trim(),
      evDomainId: data.evDomainId || null,
      profileMode: data.profileMode,
      yearsExp: data.yearsExp,
      location: data.location || null,
      ctcLakhs: data.ctcLakhs,
      baseLakhs: data.baseLakhs ?? null,
      bonusLakhs: data.bonusLakhs ?? null,
      esopLakhs: data.esopLakhs ?? null,
      currency: data.currency,
      submittedByUserId,
      ip: ip ?? null,
      cookieId,
      status: SalarySubmissionStatus.PENDING,
    },
  });

  // Unlock the database for this browser. The submission itself is
  // PENDING (admin moderation), but the UX promise is "submit and you
  // see everyone else's already-approved data" — we unlock immediately.
  await setUnlocked();

  redirect("/salaries?just_submitted=1");
}

// ─── Admin moderation ──────────────────────────────────────

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

export async function approveSalary(formData: FormData) {
  const session = await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  await db.salarySubmission.update({
    where: { id },
    data: {
      status: SalarySubmissionStatus.APPROVED,
      reviewedAt: new Date(),
      reviewedById: session.user.id,
    },
  });
  await audit({
    actorId: session.user.id,
    action: "salary.approved",
    entity: "SalarySubmission",
    entityId: id,
  });
  revalidatePath("/admin/salaries");
  revalidatePath("/salaries");
}

export async function rejectSalary(formData: FormData) {
  const session = await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  await db.salarySubmission.update({
    where: { id },
    data: {
      status: SalarySubmissionStatus.REJECTED,
      reviewedAt: new Date(),
      reviewedById: session.user.id,
    },
  });
  await audit({
    actorId: session.user.id,
    action: "salary.rejected",
    entity: "SalarySubmission",
    entityId: id,
  });
  revalidatePath("/admin/salaries");
}

// Suppress unused import lint warning when logger isn't referenced
// (happens after future refactors that no-op error paths).
void logger;
