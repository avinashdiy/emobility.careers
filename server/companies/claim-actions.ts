"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import { isRouterControlError } from "@/lib/server-action-errors";
import { pgRateLimit } from "@/lib/rate-limit-pg";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { CompanyTeamRole } from "@prisma/client";
import type { FormState } from "@/lib/form-state";

/**
 * Server actions for the Company Claim workflow.
 *
 * Three audiences:
 *
 *   1. Public user (not yet on the company team) — submits a claim
 *      via /company/[slug]/claim. Idempotent on (companyId, userId)
 *      so re-submission updates the existing PENDING row.
 *
 *   2. Claimant — withdraws their own pending claim before admin
 *      acts on it.
 *
 *   3. Admin — approves or rejects via /admin/claims/[id]. On
 *      approval, side-effects: creates EmployerProfile (granting
 *      job-posting rights), promotes user role to EMPLOYER if
 *      they're still CANDIDATE, optionally flips the Company to
 *      VERIFIED, audit-logs everything, notifies the claimant.
 *
 * Security posture: this is the "trust the human in the loop" gate.
 * The submit path doesn't grant any access — it just files paperwork.
 * Approve is the privilege-conferring step and is admin-only.
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

// ─── Submit claim ──────────────────────────────────────────────────

const SubmitClaimSchema = z.object({
  companyId: z.string().min(1),
  /// Optional but strongly encouraged. We only validate the shape;
  /// matching against `Company.emailDomains` is a hint surfaced to
  /// the admin reviewer, not a gate (a domain match alone isn't
  /// enough to auto-approve).
  workEmail: z
    .string()
    .trim()
    .email("Work email looks invalid.")
    .optional()
    .or(z.literal("")),
  linkedinUrl: z
    .string()
    .trim()
    .url("Paste a full LinkedIn URL (https://linkedin.com/in/...).")
    .optional()
    .or(z.literal("")),
  proofText: z.string().trim().min(20, "Tell us a few sentences about your role.").max(2000),
  desiredRole: z.nativeEnum(CompanyTeamRole).default(CompanyTeamRole.RECRUITER),
  designation: z.string().trim().max(120).optional().or(z.literal("")),
});

export interface SubmitClaimResult extends FormState {
  claimId?: string;
  status?: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
}

export async function submitCompanyClaim(
  _prev: SubmitClaimResult,
  formData: FormData,
): Promise<SubmitClaimResult> {
  try {
    const session = await requireUser();
    // Verified email required — claims with unverified emails are
    // un-vettable (admin can't reach the claimant for follow-up).
    const userRow = await db.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerifiedAt: true, name: true, email: true },
    });
    if (!userRow?.emailVerifiedAt) {
      return {
        ok: false,
        message: "Verify your email first — admin needs to reach you for follow-up.",
      };
    }

    // Rate limit: 5 claim submissions per 24h per user. Generous
    // enough that someone editing a typo can re-submit, tight
    // enough that a compromised account can't submit claims for
    // hundreds of companies in a day.
    const limit = await pgRateLimit({
      action: "company.claim_submit",
      userId: session.user.id,
      opts: { limit: 5, windowMs: 24 * 60 * 60 * 1000 },
    });
    if (!limit.ok) return { ok: false, message: limit.message };

    const parsed = SubmitClaimSchema.safeParse({
      companyId: formData.get("companyId"),
      workEmail: formData.get("workEmail") || "",
      linkedinUrl: formData.get("linkedinUrl") || "",
      proofText: formData.get("proofText"),
      desiredRole: formData.get("desiredRole") || "RECRUITER",
      designation: formData.get("designation") || "",
    });
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Check the form.",
      };
    }

    const company = await db.company.findUnique({
      where: { id: parsed.data.companyId },
      select: {
        id: true,
        slug: true,
        name: true,
        ownerUserId: true,
        verificationStatus: true,
        emailDomains: true,
      },
    });
    if (!company) return { ok: false, message: "Company not found." };

    // Already on the team — no claim needed.
    const existingMembership = await db.employerProfile.findFirst({
      where: { userId: session.user.id, companyId: company.id },
      select: { id: true },
    });
    if (existingMembership) {
      return {
        ok: false,
        message: "You're already on this company's team.",
      };
    }

    // Owner-self path — extremely rare but possible (admin-created
    // company has the admin as ownerUserId; if that admin then
    // signs in as a regular user they'd hit this).
    if (company.ownerUserId === session.user.id) {
      return {
        ok: false,
        message: "You already own this company — visit /employer to manage it.",
      };
    }

    // Upsert the claim row. Re-submission of a PENDING claim updates
    // the proof text + role; re-submission of a REJECTED claim
    // bumps it back to PENDING + clears the reviewer note (the
    // claimant addressed the rejection).
    const existing = await db.companyClaim.findUnique({
      where: {
        companyId_claimantUserId: {
          companyId: company.id,
          claimantUserId: session.user.id,
        },
      },
    });
    if (existing && existing.status === "APPROVED") {
      return { ok: false, message: "Claim already approved." };
    }

    const claim = existing
      ? await db.companyClaim.update({
          where: { id: existing.id },
          data: {
            workEmail: parsed.data.workEmail || null,
            linkedinUrl: parsed.data.linkedinUrl || null,
            proofText: parsed.data.proofText,
            desiredRole: parsed.data.desiredRole,
            designation: parsed.data.designation || null,
            status: "PENDING",
            reviewedAt: null,
            reviewedById: null,
            reviewerNote: null,
          },
        })
      : await db.companyClaim.create({
          data: {
            companyId: company.id,
            claimantUserId: session.user.id,
            workEmail: parsed.data.workEmail || null,
            linkedinUrl: parsed.data.linkedinUrl || null,
            proofText: parsed.data.proofText,
            desiredRole: parsed.data.desiredRole,
            designation: parsed.data.designation || null,
          },
        });

    await audit({
      actorId: session.user.id,
      action: existing ? "company.claim_resubmitted" : "company.claim_submitted",
      entity: "CompanyClaim",
      entityId: claim.id,
      meta: { companyId: company.id, companyName: company.name },
    });

    // Best-effort admin ping — if mail is down we still want the
    // claim to land in the queue, so swallow the error.
    try {
      await sendMail({
        kind: "transactional",
        // Same env-var convention as the backup-verify alert path —
        // not part of the validated env schema because it's a soft
        // operational setting, not a critical configuration value.
        to: process.env.OPS_ALERT_EMAIL ?? "avinash@diyguru.org",
        subject: `New company claim: ${company.name}`,
        html: `<p>${userRow.name ?? userRow.email} filed a claim on
          <strong>${escapeHtml(company.name)}</strong>.</p>
          <p><a href="${env.NEXT_PUBLIC_APP_URL}/admin/claims/${claim.id}">Review →</a></p>`,
        text: `New claim on ${company.name} from ${userRow.email}. Review at ${env.NEXT_PUBLIC_APP_URL}/admin/claims/${claim.id}`,
      });
    } catch (err) {
      logger.warn({ err, claimId: claim.id }, "[company-claim] admin ping failed");
    }

    revalidatePath(`/company/${company.slug}/claim`);
    revalidatePath("/admin/claims");
    return {
      ok: true,
      claimId: claim.id,
      status: "PENDING",
      message:
        "Submitted — admin reviews claims within 1–3 business days. We'll email you the moment it's decided.",
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[company-claim] submit failed");
    return { ok: false, message: "Couldn't submit. Try again." };
  }
}

// ─── Withdraw (claimant cancels) ───────────────────────────────────

export async function withdrawCompanyClaim(formData: FormData): Promise<void> {
  try {
    const session = await requireUser();
    const claimId = z.string().parse(formData.get("claimId"));
    const claim = await db.companyClaim.findUnique({
      where: { id: claimId },
      select: { id: true, claimantUserId: true, status: true, companyId: true },
    });
    if (!claim || claim.claimantUserId !== session.user.id) return;
    // Only PENDING claims can be withdrawn — APPROVED already conferred
    // membership (use admin team-remove flow), REJECTED is terminal.
    if (claim.status !== "PENDING") return;
    await db.companyClaim.update({
      where: { id: claim.id },
      data: { status: "WITHDRAWN" },
    });
    await audit({
      actorId: session.user.id,
      action: "company.claim_withdrawn",
      entity: "CompanyClaim",
      entityId: claim.id,
    });
    revalidatePath("/me/account");
    revalidatePath("/admin/claims");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[company-claim] withdraw failed");
  }
}

// ─── Admin: approve ────────────────────────────────────────────────

const AdminDecideSchema = z.object({
  claimId: z.string(),
  /// Override the claimant's desired role on approve. Defaults to
  /// what they asked for; admin can downgrade RECRUITER → VIEWER
  /// when proof is thin but plausible.
  approvedRole: z.nativeEnum(CompanyTeamRole).optional(),
  /// Whether to flip the Company to VERIFIED on approve. Default
  /// true when the claimant's email-domain matches the company's
  /// `emailDomains`; otherwise admin opts in.
  verifyCompany: z.coerce.boolean().default(false),
  reviewerNote: z.string().max(2000).optional().or(z.literal("")),
});

export async function adminApproveCompanyClaim(formData: FormData): Promise<FormState> {
  try {
    const session = await requireAdmin();
    const parsed = AdminDecideSchema.safeParse({
      claimId: formData.get("claimId"),
      approvedRole: formData.get("approvedRole") || undefined,
      verifyCompany: formData.get("verifyCompany") || false,
      reviewerNote: formData.get("reviewerNote") || "",
    });
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Invalid input.",
      };
    }

    const claim = await db.companyClaim.findUnique({
      where: { id: parsed.data.claimId },
      include: {
        company: { select: { id: true, slug: true, name: true, verificationStatus: true } },
        claimant: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    if (!claim) return { ok: false, message: "Claim not found." };
    if (claim.status === "APPROVED") {
      return { ok: false, message: "Already approved." };
    }
    if (claim.status === "WITHDRAWN") {
      return { ok: false, message: "Claimant withdrew this claim." };
    }

    const finalRole = parsed.data.approvedRole ?? claim.desiredRole;
    // RECRUITER + ADMIN are the team-side roles that grant write
    // access. VIEWER is read-only. We never auto-promote to
    // company-admin (`isCompanyAdmin: true`) on a claim — that's
    // reserved for the original owner or a manual flip.
    const isCompanyAdmin = false;

    await db.$transaction(async (tx) => {
      // Mark the claim approved.
      await tx.companyClaim.update({
        where: { id: claim.id },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedById: session.user.id,
          reviewerNote: parsed.data.reviewerNote || null,
        },
      });
      // Create / update EmployerProfile. The claimant might have a
      // stale row pointing at a different company (e.g. they
      // self-attached during the gap-era and we're now formalising
      // a fresh claim) — upsert keyed on userId handles both
      // greenfield + migration cases.
      await tx.employerProfile.upsert({
        where: { userId: claim.claimantUserId },
        create: {
          userId: claim.claimantUserId,
          companyId: claim.companyId,
          designation: claim.designation,
          teamRole: finalRole,
          isCompanyAdmin,
        },
        update: {
          companyId: claim.companyId,
          designation: claim.designation,
          teamRole: finalRole,
          isCompanyAdmin,
        },
      });
      // Promote user.role from CANDIDATE → EMPLOYER if they're still
      // a candidate. Existing EMPLOYER / ADMIN are left alone.
      if (claim.claimant.role === "CANDIDATE") {
        await tx.user.update({
          where: { id: claim.claimantUserId },
          data: { role: "EMPLOYER" },
        });
      }
      // Flip Company to VERIFIED if admin opted in. Useful when the
      // company was UNVERIFIED and this is the first approved
      // claim — it's effectively the platform-vetted moment.
      if (parsed.data.verifyCompany && claim.company.verificationStatus !== "VERIFIED") {
        await tx.company.update({
          where: { id: claim.companyId },
          data: { verificationStatus: "VERIFIED", rejectionReason: null, rejectionAt: null },
        });
      }
    });

    await audit({
      actorId: session.user.id,
      action: "company.claim_approved",
      entity: "CompanyClaim",
      entityId: claim.id,
      meta: {
        companyId: claim.companyId,
        claimantUserId: claim.claimantUserId,
        finalRole,
        verifiedCompany: parsed.data.verifyCompany,
      },
    });

    // Notify the claimant.
    await dispatchNotification({
      userId: claim.claimantUserId,
      type: "company.claim_approved",
      title: `You're now on the ${claim.company.name} team`,
      body: `Your claim was approved as ${finalRole.toLowerCase()}. Visit /employer to manage jobs and team.`,
      link: "/employer",
      channels: ["IN_APP", "EMAIL"],
      actorId: session.user.id,
    }).catch(() => undefined);

    revalidatePath("/admin/claims");
    revalidatePath(`/admin/claims/${claim.id}`);
    revalidatePath(`/company/${claim.company.slug}/claim`);
    return { ok: true, message: `Approved as ${finalRole.toLowerCase()}.` };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[company-claim] approve failed");
    return { ok: false, message: "Couldn't approve." };
  }
}

// ─── Admin: reject ─────────────────────────────────────────────────

export async function adminRejectCompanyClaim(formData: FormData): Promise<FormState> {
  try {
    const session = await requireAdmin();
    const claimId = z.string().parse(formData.get("claimId"));
    const note = z
      .string()
      .min(5, "Tell the claimant what was missing or wrong (5+ chars).")
      .max(2000)
      .parse(formData.get("reviewerNote") ?? "");

    const claim = await db.companyClaim.findUnique({
      where: { id: claimId },
      include: {
        company: { select: { name: true, slug: true } },
        claimant: { select: { id: true, name: true, email: true } },
      },
    });
    if (!claim) return { ok: false, message: "Claim not found." };
    if (claim.status !== "PENDING") {
      return { ok: false, message: `Already ${claim.status.toLowerCase()}.` };
    }

    await db.companyClaim.update({
      where: { id: claim.id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedById: session.user.id,
        reviewerNote: note,
      },
    });

    await audit({
      actorId: session.user.id,
      action: "company.claim_rejected",
      entity: "CompanyClaim",
      entityId: claim.id,
      meta: { companyId: claim.companyId, note },
    });

    await dispatchNotification({
      userId: claim.claimantUserId,
      type: "company.claim_rejected",
      title: `Your claim on ${claim.company.name} needs more info`,
      body: note,
      link: `/company/${claim.company.slug}/claim`,
      channels: ["IN_APP", "EMAIL"],
      actorId: session.user.id,
    }).catch(() => undefined);

    revalidatePath("/admin/claims");
    revalidatePath(`/admin/claims/${claim.id}`);
    return { ok: true, message: "Rejected — claimant notified." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[company-claim] reject failed");
    return { ok: false, message: "Couldn't reject." };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
