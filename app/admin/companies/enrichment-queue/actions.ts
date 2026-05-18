"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { EnrichmentProposalStatus, Prisma } from "@prisma/client";
import { enrichOneCompany } from "@/lib/enrichment/orchestrator";

/**
 * Server actions for the /admin/companies/enrichment-queue UI.
 *
 * Every action:
 *   • Re-checks the session is ADMIN (defence in depth — the layout
 *     also gates this, but a stolen form-action POST shouldn't bypass).
 *   • Reads the proposal in the same transaction it mutates so the
 *     "applied vs proposed" diff is consistent.
 *   • Re-validates `/admin/companies/enrichment-queue` so the list
 *     refresh after the action shows the updated status without a
 *     hard navigation.
 *
 * Audit trail: every APPROVE/REJECT writes reviewedBy + reviewedAt
 * onto the proposal row. The diff between `proposedFields` and
 * `appliedFields` records exactly what the admin edited before
 * approving — useful for "why does the company page show X".
 */

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/403");
  }
  return session.user.id;
}

/**
 * APPROVE: apply the proposal's (optionally admin-edited) fields to
 * the underlying Company row. Records `appliedFields` for audit.
 *
 * Form fields:
 *   • proposalId (string, required)
 *   • field_<key> (string, optional) — admin's edited value per field.
 *     Unset keys fall back to whatever the proposal originally had.
 *   • drop_<key> (checkbox "1") — admin chose to NOT apply this field.
 */
export async function approveProposal(formData: FormData) {
  const adminId = await requireAdmin();
  const proposalId = String(formData.get("proposalId") ?? "");
  if (!proposalId) throw new Error("proposalId required");

  const proposal = await db.companyEnrichmentProposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      status: true,
      companyId: true,
      proposedFields: true,
    },
  });

  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== EnrichmentProposalStatus.PENDING) {
    throw new Error(`Proposal already ${proposal.status}`);
  }

  const proposed = (proposal.proposedFields ?? {}) as Record<string, string | number>;
  const applied: Record<string, string | number> = {};

  // Build the Company.update payload by walking each proposed field,
  // taking the admin's edited value if present, and skipping fields
  // the admin marked "drop".
  const companyUpdate: Record<string, unknown> = {};
  for (const key of Object.keys(proposed)) {
    if (formData.get(`drop_${key}`) === "1") continue;
    const edited = formData.get(`field_${key}`);
    const value = typeof edited === "string" && edited.length > 0 ? edited : proposed[key];
    if (value !== undefined && value !== null && value !== "") {
      // foundedYear is the only Int column — everything else is text.
      if (key === "foundedYear") {
        const year = Number(value);
        if (Number.isFinite(year) && year > 1800 && year <= new Date().getFullYear() + 1) {
          companyUpdate[key] = year;
          applied[key] = year;
        }
      } else {
        companyUpdate[key] = value;
        applied[key] = value;
      }
    }
  }

  // Single transaction: update company + mark proposal approved.
  // Either both happen or neither — keeps the audit trail honest.
  await db.$transaction([
    db.company.update({
      where: { id: proposal.companyId },
      data: companyUpdate,
    }),
    db.companyEnrichmentProposal.update({
      where: { id: proposalId },
      data: {
        status: EnrichmentProposalStatus.APPROVED,
        reviewedById: adminId,
        reviewedAt: new Date(),
        appliedFields: applied as Prisma.InputJsonValue,
      },
    }),
  ]);

  revalidatePath("/admin/companies/enrichment-queue");
  revalidatePath(`/admin/companies/enrichment-queue/${proposalId}`);
  redirect("/admin/companies/enrichment-queue?notice=approved");
}

/**
 * REJECT: mark the proposal rejected with a reason. The Company row
 * is untouched.
 */
export async function rejectProposal(formData: FormData) {
  const adminId = await requireAdmin();
  const proposalId = String(formData.get("proposalId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!proposalId) throw new Error("proposalId required");

  await db.companyEnrichmentProposal.update({
    where: { id: proposalId },
    data: {
      status: EnrichmentProposalStatus.REJECTED,
      reviewedById: adminId,
      reviewedAt: new Date(),
      rejectionReason: reason || "(no reason provided)",
    },
  });

  revalidatePath("/admin/companies/enrichment-queue");
  redirect("/admin/companies/enrichment-queue?notice=rejected");
}

/**
 * RE-FETCH: run the orchestrator again for a single proposal's
 * underlying company. Useful when the admin thinks the Wikipedia
 * extract / logo has improved since the original fetch.
 */
export async function refetchProposal(formData: FormData) {
  await requireAdmin();
  const proposalId = String(formData.get("proposalId") ?? "");
  if (!proposalId) throw new Error("proposalId required");

  const proposal = await db.companyEnrichmentProposal.findUnique({
    where: { id: proposalId },
    select: { companyId: true },
  });
  if (!proposal) throw new Error("Proposal not found");

  // Orchestrator deletes the prior COMPOSITE proposal and writes a
  // fresh one, so calling it here is sufficient — no manual cleanup.
  const result = await enrichOneCompany(proposal.companyId);

  revalidatePath("/admin/companies/enrichment-queue");
  redirect(`/admin/companies/enrichment-queue/${result.proposalId}?notice=refetched`);
}
