import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";

export const metadata: Metadata = {
  title: "Your college placement cell",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Post-application status page for college TPOs. Shows the lifecycle
 * the user's application is in (PENDING → APPROVED / REJECTED /
 * REVOKED) plus the next-step CTA they should take.
 *
 *   • PENDING   — "We'll email you when admin reviews. ETA 2 days."
 *   • APPROVED  — link to /tpo dashboard + import flow
 *   • REJECTED  — show admin's rejection reason + "Re-apply" link
 *                 that nukes the row and sends them back to register.
 *                 (v1: simpler — just link back to /colleges/register
 *                 with a note. The unique constraint blocks duplicate
 *                 (institution, user) so they'd need to pick another
 *                 institution OR contact us.)
 *   • REVOKED   — "Your access was revoked. Contact support."
 *
 * Surfaces all cells this user has created (a TPO might apply for
 * multiple institutions). Sorted newest first.
 */
export default async function CollegeStatusPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/college");

  const cells = await db.collegePlacementCell.findMany({
    where: { createdById: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      contactName: true,
      contactEmail: true,
      designation: true,
      studentCount: true,
      notes: true,
      rejectionReason: true,
      reviewedAt: true,
      createdAt: true,
      institution: {
        select: { id: true, slug: true, name: true, city: true, state: true },
      },
    },
  });

  return (
    <div className="min-h-screen bg-emce-light-bg py-8 md:py-12">
      <ToastFromSearchParams />
      <div className="container max-w-3xl space-y-6">
        <div>
          <Link
            href="/me"
            className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
          >
            ← Back to your profile
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight text-emce-text md:text-4xl">
            Your college placement cell
          </h1>
          <p className="mt-2 text-body text-emce-text-sec">
            Track the status of your placement-cell application(s) and jump to
            your TPO dashboard once approved.
          </p>
        </div>

        {cells.length === 0 ? (
          <Card className="p-6 md:p-8">
            <p className="text-section text-emce-text">
              No applications yet
            </p>
            <p className="mt-2 text-body text-emce-text-sec">
              Register your placement cell to bulk-import students, share
              matched openings, and bring your cohort to our recruitment fairs.
            </p>
            <Link
              href="/colleges/register"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-emce-dark px-5 text-sm font-bold text-white hover:bg-emce-darkest"
            >
              Register your college
            </Link>
          </Card>
        ) : (
          <div className="space-y-4">
            {cells.map((cell) => (
              <Card key={cell.id} className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-section text-emce-text">
                      {cell.institution.name}
                    </h2>
                    <p className="mt-1 text-hint text-emce-text-sec">
                      {[cell.institution.city, cell.institution.state]
                        .filter(Boolean)
                        .join(", ") || "Location not set"}
                    </p>
                  </div>
                  {cell.status === "PENDING" && (
                    <Badge variant="default">⏳ Pending review</Badge>
                  )}
                  {cell.status === "APPROVED" && (
                    <Badge variant="success">✓ Approved</Badge>
                  )}
                  {cell.status === "REJECTED" && (
                    <Badge variant="danger">Rejected</Badge>
                  )}
                  {cell.status === "REVOKED" && (
                    <Badge variant="outline">Revoked</Badge>
                  )}
                </div>

                {/* Status-specific copy + CTA */}
                {cell.status === "PENDING" && (
                  <div className="mt-4 rounded-lg border border-emce-border bg-emce-light-soft p-4">
                    <p className="text-body text-emce-text">
                      Admin reviews applications within 2 business days. We&apos;ll
                      email <strong>{cell.contactEmail}</strong> the moment your
                      cell is approved. No action needed from you in the
                      meantime.
                    </p>
                  </div>
                )}

                {cell.status === "APPROVED" && (
                  <div className="mt-4 rounded-lg border-2 border-emce-dark/30 bg-emce-light-soft p-4">
                    <p className="text-body text-emce-text">
                      You&apos;re all set. Head to the TPO dashboard to import
                      your cohort and start sharing matched openings.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href="/tpo"
                        className="inline-flex h-10 items-center justify-center rounded-md bg-emce-dark px-5 text-sm font-bold text-white hover:bg-emce-darkest"
                      >
                        Open TPO dashboard →
                      </Link>
                      <Link
                        href={`/institutions/${cell.institution.slug}`}
                        className="inline-flex h-10 items-center justify-center rounded-md border border-emce-border bg-white px-5 text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
                      >
                        View public page
                      </Link>
                    </div>
                  </div>
                )}

                {cell.status === "REJECTED" && (
                  <div className="mt-4 rounded-lg border border-emce-red-deep/30 bg-emce-light-soft p-4">
                    <p className="text-body text-emce-text">
                      Your application was rejected.
                    </p>
                    {cell.rejectionReason && (
                      <p className="mt-2 text-hint text-emce-text-sec">
                        <strong className="text-emce-text">Reason:</strong>{" "}
                        {cell.rejectionReason}
                      </p>
                    )}
                    <p className="mt-2 text-hint text-emce-text-sec">
                      Email <a href="mailto:colleges@emobility.careers" className="font-bold text-emce-dark hover:underline">colleges@emobility.careers</a>{" "}
                      if you&apos;d like to re-apply with updated details.
                    </p>
                  </div>
                )}

                {cell.status === "REVOKED" && (
                  <div className="mt-4 rounded-lg border border-emce-red-deep/30 bg-emce-light-soft p-4">
                    <p className="text-body text-emce-text">
                      Your placement-cell access was revoked. Contact{" "}
                      <a href="mailto:colleges@emobility.careers" className="font-bold text-emce-dark hover:underline">
                        colleges@emobility.careers
                      </a>{" "}
                      to restore access.
                    </p>
                  </div>
                )}

                {/* Submitted-details summary — collapsed-style. Helps
                    the TPO confirm what they filled in. */}
                <div className="mt-4 space-y-1 text-hint text-emce-text-sec">
                  <p>
                    <strong className="text-emce-text">Submitted:</strong>{" "}
                    {cell.createdAt.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p>
                    <strong className="text-emce-text">Contact:</strong>{" "}
                    {cell.contactName}
                    {cell.designation ? ` (${cell.designation})` : ""}
                    {" — "}
                    {cell.contactEmail}
                  </p>
                  {cell.studentCount != null && (
                    <p>
                      <strong className="text-emce-text">Cohort size:</strong>{" "}
                      {cell.studentCount.toLocaleString("en-IN")} students
                    </p>
                  )}
                  {cell.reviewedAt && (
                    <p>
                      <strong className="text-emce-text">Reviewed:</strong>{" "}
                      {cell.reviewedAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
