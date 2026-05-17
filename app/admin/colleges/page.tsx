import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { PageHeader } from "@/components/ui/page-header";
import {
  approveCollegePlacementCell,
  rejectCollegePlacementCell,
  reopenCollegePlacementCell,
  revokeCollegePlacementCell,
  updatePlacementCellContact,
} from "@/server/colleges/actions";
import { relativeTime } from "@/lib/utils";
import type { CollegePlacementCellStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Colleges · Admin" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<CollegePlacementCellStatus, "default" | "success" | "danger" | "outline"> = {
  PENDING: "default",
  APPROVED: "success",
  REJECTED: "danger",
  REVOKED: "outline",
};

/**
 * Admin queue for college placement-cell applications. Three tabs
 * via `?status=`:
 *   • PENDING (default) — the actionable queue.
 *   • APPROVED — audit trail of who's live.
 *   • REJECTED — for tracing rejected applications.
 *
 * Approve flips `User.isPlacementOfficer = true` (see server action).
 * Reject takes an optional reason that's surfaced back to the TPO.
 */
export default async function AdminCollegesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const status: CollegePlacementCellStatus =
    sp.status === "APPROVED" || sp.status === "REJECTED" || sp.status === "REVOKED"
      ? sp.status
      : "PENDING";

  const q = sp.q?.trim() ?? "";

  // Counts for the tab pills — one query each is fine at <1k rows
  // (we're not expecting > 500 colleges signed up). Could batch into
  // a groupBy later if needed.
  const [pendingCount, approvedCount, rejectedCount, revokedCount] = await Promise.all([
    db.collegePlacementCell.count({ where: { status: "PENDING" } }),
    db.collegePlacementCell.count({ where: { status: "APPROVED" } }),
    db.collegePlacementCell.count({ where: { status: "REJECTED" } }),
    db.collegePlacementCell.count({ where: { status: "REVOKED" } }),
  ]);

  const cells = await db.collegePlacementCell.findMany({
    where: {
      status,
      ...(q
        ? {
            OR: [
              { contactName: { contains: q, mode: "insensitive" } },
              { contactEmail: { contains: q, mode: "insensitive" } },
              { institution: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: {
      institution: {
        select: { id: true, slug: true, name: true, city: true, state: true, website: true, verificationStatus: true },
      },
      createdBy: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  });

  return (
    <AdminShell>
      <div className="container max-w-5xl space-y-6 py-6 md:py-8">
        <ToastFromSearchParams />
        <PageHeader
          eyebrow="College placement cells"
          title="Colleges"
          subtitle={`${pendingCount} pending · ${approvedCount} approved · ${rejectedCount + revokedCount} closed`}
        />

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["PENDING", `Pending · ${pendingCount}`],
              ["APPROVED", `Approved · ${approvedCount}`],
              ["REJECTED", `Rejected · ${rejectedCount}`],
              ["REVOKED", `Revoked · ${revokedCount}`],
            ] as const
          ).map(([s, label]) => (
            <Link
              key={s}
              href={`/admin/colleges?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`inline-flex h-9 items-center justify-center rounded-md border px-4 text-xs font-bold ${
                status === s
                  ? "border-emce-dark bg-emce-dark text-white"
                  : "border-emce-border bg-white text-emce-dark hover:bg-emce-light-soft"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Search */}
        <Card className="p-4">
          <form action="/admin/colleges" method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="status" value={status} />
            <div className="flex-1 min-w-[220px]">
              <Label htmlFor="q">Search by institution, contact, or email</Label>
              <Input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="BMS College, tpo@..., Dr. Rajesh"
                maxLength={120}
              />
            </div>
            <SubmitButton size="sm" variant="outline">
              Search
            </SubmitButton>
            {q && (
              <Link
                href={`/admin/colleges?status=${status}`}
                className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
              >
                Clear
              </Link>
            )}
          </form>
        </Card>

        {/* Application list */}
        {cells.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-body text-emce-text-sec">
              {status === "PENDING"
                ? "No applications pending review. 🎉"
                : `No ${status.toLowerCase()} applications${q ? " match your search" : ""}.`}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {cells.map((cell) => (
              <Card key={cell.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Link
                        href={`/institutions/${cell.institution.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-section font-extrabold text-emce-text hover:underline"
                      >
                        {cell.institution.name}
                      </Link>
                      <Badge variant={STATUS_TONE[cell.status]} size="sm">
                        {cell.status.toLowerCase()}
                      </Badge>
                      {cell.institution.verificationStatus === "UNVERIFIED" && (
                        <Badge variant="warning" size="sm">
                          New institution — needs verify
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-hint text-emce-text-sec">
                      {[cell.institution.city, cell.institution.state].filter(Boolean).join(", ") || "Location not set"}
                      {cell.institution.website && (
                        <>
                          {" · "}
                          <a
                            href={cell.institution.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-emce-dark hover:underline"
                          >
                            {cell.institution.website.replace(/^https?:\/\//, "")} ↗
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <p className="text-hint text-emce-text-muted">
                    Applied {relativeTime(cell.createdAt)}
                  </p>
                </div>

                {/* Contact block */}
                <div className="mt-3 grid gap-2 rounded-md bg-emce-light-soft p-3 text-sm sm:grid-cols-2">
                  <p>
                    <strong className="text-emce-text">Contact:</strong>{" "}
                    {cell.contactName}
                    {cell.designation ? ` (${cell.designation})` : ""}
                  </p>
                  <p>
                    <strong className="text-emce-text">Email:</strong>{" "}
                    <a href={`mailto:${cell.contactEmail}`} className="text-emce-dark hover:underline">
                      {cell.contactEmail}
                    </a>
                  </p>
                  {cell.contactPhone && (
                    <p>
                      <strong className="text-emce-text">Phone:</strong>{" "}
                      <a href={`tel:${cell.contactPhone}`} className="text-emce-dark hover:underline">
                        {cell.contactPhone}
                      </a>
                    </p>
                  )}
                  {cell.studentCount != null && (
                    <p>
                      <strong className="text-emce-text">Cohort:</strong>{" "}
                      {cell.studentCount.toLocaleString("en-IN")} students
                    </p>
                  )}
                  <p className="sm:col-span-2">
                    <strong className="text-emce-text">User:</strong>{" "}
                    <Link
                      href={`/admin/users?q=${encodeURIComponent(cell.createdBy.email ?? "")}`}
                      className="text-emce-dark hover:underline"
                    >
                      {cell.createdBy.name ?? cell.createdBy.email}
                    </Link>
                  </p>
                </div>

                {cell.notes && (
                  <div className="mt-3 rounded-md border border-emce-border p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emce-mid-muted">
                      TPO note
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-emce-text-sec">
                      {cell.notes}
                    </p>
                  </div>
                )}

                {cell.status === "REJECTED" && cell.rejectionReason && (
                  <p className="mt-3 text-hint text-emce-red-deep">
                    <strong>Rejected:</strong> {cell.rejectionReason}
                  </p>
                )}

                {cell.reviewedBy && (
                  <p className="mt-3 text-hint text-emce-text-muted">
                    Reviewed by {cell.reviewedBy.name ?? "admin"} {cell.reviewedAt ? relativeTime(cell.reviewedAt) : ""}
                  </p>
                )}

                {/* Action bar — varies by status. */}
                {cell.status === "PENDING" && (
                  <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-emce-border pt-4">
                    <form action={approveCollegePlacementCell}>
                      <input type="hidden" name="id" value={cell.id} />
                      <ConfirmSubmit
                        size="sm"
                        confirm={`Approve ${cell.institution.name}? This grants ${cell.createdBy.email} TPO access.`}
                        pendingLabel="Approving…"
                      >
                        ✓ Approve
                      </ConfirmSubmit>
                    </form>
                    <form
                      action={rejectCollegePlacementCell}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="id" value={cell.id} />
                      <div>
                        <Label htmlFor={`reason-${cell.id}`} className="sr-only">
                          Rejection reason
                        </Label>
                        <Input
                          id={`reason-${cell.id}`}
                          name="rejectionReason"
                          placeholder="Reason (optional, shown to TPO)"
                          maxLength={500}
                          className="w-72"
                        />
                      </div>
                      <ConfirmSubmit
                        size="sm"
                        variant="outline"
                        confirm={`Reject ${cell.institution.name}'s application?`}
                        pendingLabel="Rejecting…"
                        className="text-emce-red-deep"
                      >
                        Reject
                      </ConfirmSubmit>
                    </form>
                  </div>
                )}

                {/* APPROVED — let admin revoke (e.g. TPO left college). */}
                {cell.status === "APPROVED" && (
                  <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-emce-border pt-4">
                    <form
                      action={revokeCollegePlacementCell}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="id" value={cell.id} />
                      <div>
                        <Label htmlFor={`revoke-${cell.id}`} className="sr-only">
                          Revoke reason
                        </Label>
                        <Input
                          id={`revoke-${cell.id}`}
                          name="reason"
                          placeholder="Reason (optional, internal)"
                          maxLength={500}
                          className="w-72"
                        />
                      </div>
                      <ConfirmSubmit
                        size="sm"
                        variant="outline"
                        confirm={`Revoke TPO access for ${cell.institution.name}? They'll lose /tpo access if this is their only approved cell.`}
                        pendingLabel="Revoking…"
                        className="text-emce-red-deep"
                      >
                        Revoke access
                      </ConfirmSubmit>
                    </form>
                  </div>
                )}

                {/* REJECTED / REVOKED — let admin reopen to PENDING. */}
                {(cell.status === "REJECTED" || cell.status === "REVOKED") && (
                  <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-emce-border pt-4">
                    <form action={reopenCollegePlacementCell}>
                      <input type="hidden" name="id" value={cell.id} />
                      <ConfirmSubmit
                        size="sm"
                        variant="outline"
                        confirm={`Move ${cell.institution.name} back to pending review?`}
                        pendingLabel="Reopening…"
                      >
                        ↺ Reopen for re-review
                      </ConfirmSubmit>
                    </form>
                  </div>
                )}

                {/* Admin contact-detail edit — available at any
                    status (TPOs occasionally change). Collapsed into
                    a <details> so the queue stays scannable; admin
                    clicks "Edit contact" only when needed. */}
                <details className="mt-4 border-t border-emce-border pt-3">
                  <summary className="cursor-pointer text-hint font-bold text-emce-dark hover:underline">
                    ✏️ Edit contact details
                  </summary>
                  <form
                    action={updatePlacementCellContact}
                    className="mt-3 grid gap-3 sm:grid-cols-2"
                  >
                    <input type="hidden" name="id" value={cell.id} />
                    <div>
                      <Label htmlFor={`edit-name-${cell.id}`}>Contact name *</Label>
                      <Input
                        id={`edit-name-${cell.id}`}
                        name="contactName"
                        defaultValue={cell.contactName}
                        required
                        maxLength={120}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`edit-email-${cell.id}`}>Contact email *</Label>
                      <Input
                        id={`edit-email-${cell.id}`}
                        name="contactEmail"
                        type="email"
                        defaultValue={cell.contactEmail}
                        required
                        maxLength={160}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`edit-phone-${cell.id}`}>Phone</Label>
                      <Input
                        id={`edit-phone-${cell.id}`}
                        name="contactPhone"
                        defaultValue={cell.contactPhone ?? ""}
                        maxLength={40}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`edit-designation-${cell.id}`}>Designation</Label>
                      <Input
                        id={`edit-designation-${cell.id}`}
                        name="designation"
                        defaultValue={cell.designation ?? ""}
                        maxLength={120}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`edit-cohort-${cell.id}`}>Cohort size</Label>
                      <Input
                        id={`edit-cohort-${cell.id}`}
                        name="studentCount"
                        type="number"
                        min={0}
                        max={100000}
                        inputMode="numeric"
                        defaultValue={cell.studentCount ?? ""}
                      />
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
                        Save contact
                      </SubmitButton>
                    </div>
                  </form>
                </details>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
