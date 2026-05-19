"use server";

/**
 * Employer-side booth ops at a recruitment fair. Two surfaces:
 *
 *   • lookupCandidateByCode — typed into the booth scanner page;
 *     resolves a 6-char check-in code to a candidate + verifies the
 *     candidate is registered for the same fair the employer's
 *     company has a booth at. Returns minimal profile + the URL to
 *     route the recruiter to the full profile / their ATS.
 *
 *   • addBoothInteraction (future) — quick thumb-up/down + note when
 *     the recruiter meets a candidate at the booth. NOT implemented
 *     in this pass; placeholder schema is the next iteration.
 *
 * Both are scoped to (employer's company, drive) so a recruiter at
 * Booth A can't accidentally scan / pull candidates registered to a
 * different fair.
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Look up a candidate by their check-in code, scoped to a specific
 * recruitment drive that the caller's company has a booth at.
 * Returns a redirect to the candidate's public profile (with a
 * fair-context query param so the profile knows to show fair-specific
 * "shortlist for X role at this fair" CTAs in a future iteration).
 *
 * Gated:
 *   • Caller must be signed-in EMPLOYER or ADMIN.
 *   • Caller's company must have a CONFIRMED booth at the drive
 *     (so a recruiter from Bosch can't pull candidates from the Ola
 *     booth's queue by typing random codes).
 *   • Candidate must have a non-cancelled registration at the drive.
 */
export async function lookupCandidateByCode(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }

  const driveId = String(formData.get("driveId") ?? "").trim();
  const codeRaw = String(formData.get("code") ?? "").trim();
  if (!driveId || codeRaw.length === 0) {
    redirect(`/employer/fairs/${driveId}/scan?error=${encodeURIComponent("Enter a code first.")}`);
  }
  // Normalise — uppercase + strip the `FAIR:` prefix that the QR
  // encoder might add (mirrors checkInRegistration's parser).
  const code = codeRaw.toUpperCase().replace(/^FAIR:/i, "").trim();

  // Authorisation: caller's company must have a confirmed booth.
  // Admins bypass this check.
  if (session.user.role !== "ADMIN") {
    const employer = await db.employerProfile.findUnique({
      where: { userId: session.user.id },
      select: { companyId: true },
    });
    if (!employer) {
      redirect(`/employer/fairs/${driveId}/scan?error=${encodeURIComponent("Employer profile not found.")}`);
    }
    const participation = await db.recruitmentDriveCompany.findUnique({
      where: { driveId_companyId: { driveId, companyId: employer.companyId } },
      select: { status: true },
    });
    if (!participation || participation.status !== "CONFIRMED") {
      redirect(`/employer/fairs/${driveId}/scan?error=${encodeURIComponent("Your company doesn't have a confirmed booth at this fair.")}`);
    }
  }

  const reg = await db.recruitmentDriveRegistration.findUnique({
    where: { checkInCode: code },
    select: {
      driveId: true,
      cancelledAt: true,
      candidate: { select: { slug: true } },
    },
  });
  if (!reg || reg.driveId !== driveId) {
    redirect(`/employer/fairs/${driveId}/scan?error=${encodeURIComponent("Code not found for this fair.")}`);
  }
  if (reg.cancelledAt) {
    redirect(`/employer/fairs/${driveId}/scan?error=${encodeURIComponent("This candidate cancelled their registration.")}`);
  }

  // Land on the candidate's public profile with the fair-context
  // hint so the recruiter sees "Met at Recruitathon Delhi" framing
  // (future enhancement) + their existing shortlist + Save flows
  // already work.
  redirect(`/${reg.candidate.slug}?fairCtx=${driveId}`);
}
