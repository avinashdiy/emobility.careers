import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { PageHeader } from "@/components/ui/page-header";
import {
  deleteInterviewSlot,
  markInterviewSlotOutcome,
} from "@/server/recruitment-drives/slots";
import type { InterviewSlotStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Interview slots · Fair admin" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<InterviewSlotStatus, "default" | "success" | "danger" | "outline" | "warning"> = {
  AVAILABLE: "default",
  BOOKED: "success",
  CANCELLED: "danger",
  COMPLETED: "success",
  NO_SHOW: "outline",
};

/**
 * Fair-ops admin view of every interview slot across every booth at
 * a single fair. The recruiter-side equivalent at
 * `/employer/fairs/[id]/slots` is scoped to one booth — this is the
 * cross-company panopticon for the platform team to:
 *
 *   • spot booths with no slots (recruiter forgot to set them up)
 *   • spot fully-booked booths (signal to nudge more candidates)
 *   • cancel problematic bookings on behalf of a recruiter or
 *     candidate during the live event
 *   • mark COMPLETED / NO_SHOW post-fair when a recruiter forgets
 *
 * Filters: by company (?company=), by status (?status=). Default
 * sort: starts time asc within each company.
 */
export default async function AdminFairSlotsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ company?: string; status?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;
  const sp = await searchParams;

  const drive = await db.recruitmentDrive.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, startsAt: true, endsAt: true },
  });
  if (!drive) notFound();

  // Booth/company filter list — every confirmed company at this
  // fair, used in the NativeSelect filter + as a fallback row
  // when the company has zero slots ("not set up yet").
  const booths = await db.recruitmentDriveCompany.findMany({
    where: { driveId: drive.id, status: "CONFIRMED" },
    orderBy: [{ company: { name: "asc" } }],
    select: {
      id: true,
      companyId: true,
      boothLabel: true,
      company: { select: { name: true, slug: true } },
      _count: { select: { interviewSlots: true } },
    },
  });

  const companyFilter = sp.company?.trim() || "";
  const statusFilter =
    sp.status === "AVAILABLE" ||
    sp.status === "BOOKED" ||
    sp.status === "CANCELLED" ||
    sp.status === "COMPLETED" ||
    sp.status === "NO_SHOW"
      ? (sp.status as InterviewSlotStatus)
      : null;

  // Top-level KPIs across the whole fair — small enough at <1k
  // slots per fair to count per-status without pagination.
  const [available, booked, completed, noShow, cancelled] = await Promise.all([
    db.recruitmentDriveInterviewSlot.count({
      where: { driveCompany: { driveId: drive.id }, status: "AVAILABLE" },
    }),
    db.recruitmentDriveInterviewSlot.count({
      where: { driveCompany: { driveId: drive.id }, status: "BOOKED" },
    }),
    db.recruitmentDriveInterviewSlot.count({
      where: { driveCompany: { driveId: drive.id }, status: "COMPLETED" },
    }),
    db.recruitmentDriveInterviewSlot.count({
      where: { driveCompany: { driveId: drive.id }, status: "NO_SHOW" },
    }),
    db.recruitmentDriveInterviewSlot.count({
      where: { driveCompany: { driveId: drive.id }, status: "CANCELLED" },
    }),
  ]);

  const totalSlots = available + booked + completed + noShow + cancelled;

  // Load filtered slots. Take=500 cap matches the recruiter-side
  // page; a fair with more than 500 slots is unusual and would
  // need a per-day paginator anyway.
  const slots = await db.recruitmentDriveInterviewSlot.findMany({
    where: {
      driveCompany: { driveId: drive.id },
      ...(companyFilter ? { driveCompany: { driveId: drive.id, companyId: companyFilter } } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: [{ driveCompany: { company: { name: "asc" } } }, { startsAt: "asc" }],
    take: 500,
    include: {
      driveCompany: {
        select: {
          id: true,
          boothLabel: true,
          company: { select: { id: true, name: true, slug: true } },
        },
      },
      job: { select: { id: true, title: true } },
      candidate: {
        select: {
          firstName: true,
          lastName: true,
          slug: true,
          profilePhotoUrl: true,
          headline: true,
          user: { select: { email: true } },
        },
      },
    },
  });

  // Group by booth so the cross-fair view scans naturally — every
  // company gets its own block even if it has zero slots (so the
  // admin can spot "Acme Corp hasn't created any slots yet").
  const slotsByBooth = new Map<string, typeof slots>();
  for (const s of slots) {
    const bucket = slotsByBooth.get(s.driveCompany.id) ?? [];
    bucket.push(s);
    slotsByBooth.set(s.driveCompany.id, bucket);
  }

  // Decide which booths to show. If filtering by company, only
  // that one; otherwise every confirmed booth, including ones
  // with zero slots.
  const visibleBooths = companyFilter
    ? booths.filter((b) => b.companyId === companyFilter)
    : booths;

  return (
    <AdminShell>
      <div className="container max-w-6xl space-y-6 py-6 md:py-8">
        <ToastFromSearchParams />
        <PageHeader
          eyebrow="Interview slots"
          title={`Slots · ${drive.title}`}
          subtitle={
            <>
              <span className="font-bold text-emce-darkest">{totalSlots}</span>{" "}
              slots · {available} available · {booked} booked · {completed}{" "}
              completed · {noShow} no-show · {cancelled} cancelled
            </>
          }
          backHref={`/admin/fairs/${drive.id}`}
        />

        {/* Filters */}
        <Card className="p-4">
          <form
            action={`/admin/fairs/${drive.id}/slots`}
            method="get"
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-[220px] flex-1">
              <Label htmlFor="company">Company</Label>
              <NativeSelect id="company" name="company" defaultValue={companyFilter}>
                <option value="">All booths</option>
                {booths.map((b) => (
                  <option key={b.companyId} value={b.companyId}>
                    {b.company.name} ({b._count.interviewSlots})
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="min-w-[180px]">
              <Label htmlFor="status">Status</Label>
              <NativeSelect id="status" name="status" defaultValue={statusFilter ?? ""}>
                <option value="">Any status</option>
                <option value="AVAILABLE">Available</option>
                <option value="BOOKED">Booked</option>
                <option value="COMPLETED">Completed</option>
                <option value="NO_SHOW">No-show</option>
                <option value="CANCELLED">Cancelled</option>
              </NativeSelect>
            </div>
            <SubmitButton size="sm" variant="outline">Apply</SubmitButton>
            {(companyFilter || statusFilter) && (
              <Link
                href={`/admin/fairs/${drive.id}/slots`}
                className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
              >
                Clear
              </Link>
            )}
          </form>
        </Card>

        {/* Slots grouped by booth */}
        {visibleBooths.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-body text-emce-text-sec">
              No confirmed booths at this fair yet.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {visibleBooths.map((booth) => {
              const boothSlots = slotsByBooth.get(booth.id) ?? [];
              return (
                <Card key={booth.id} className="p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/company/${booth.company.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-section font-extrabold text-emce-text hover:underline"
                      >
                        {booth.company.name}
                      </Link>
                      {booth.boothLabel && (
                        <span className="ml-2 text-hint text-emce-text-muted">
                          · 📍 {booth.boothLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-hint text-emce-text-muted">
                      {boothSlots.length === 0
                        ? "⚠️ No slots created yet"
                        : `${boothSlots.length} ${boothSlots.length === 1 ? "slot" : "slots"} shown`}
                    </p>
                  </div>

                  {boothSlots.length === 0 ? (
                    <p className="mt-3 text-hint text-emce-text-sec">
                      Recruiter hasn&apos;t generated any interview windows.
                      Nudge them or set up slots on their behalf at{" "}
                      <Link
                        href={`/employer/fairs/${drive.id}/slots`}
                        className="font-bold text-emce-dark hover:underline"
                      >
                        the recruiter slots tool
                      </Link>
                      .
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-emce-border">
                      {boothSlots.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                          <span className="w-32 shrink-0 font-mono text-sm font-bold text-emce-text tabular-nums">
                            {s.startsAt.toLocaleString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            })}
                          </span>
                          <span className="w-12 shrink-0 text-hint text-emce-text-muted">
                            {s.durationMinutes}m
                          </span>
                          {s.job ? (
                            <Badge variant="default" size="sm">
                              {s.job.title}
                            </Badge>
                          ) : (
                            <Badge variant="outline" size="sm">Any role</Badge>
                          )}
                          <Badge variant={STATUS_TONE[s.status]} size="sm">
                            {s.status.toLowerCase().replace("_", "-")}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            {s.candidate ? (
                              <div className="flex items-center gap-2">
                                <Avatar
                                  src={s.candidate.profilePhotoUrl}
                                  name={`${s.candidate.firstName} ${s.candidate.lastName ?? ""}`}
                                  size="sm"
                                  className="h-7 w-7 shrink-0"
                                />
                                <div className="min-w-0">
                                  <Link
                                    href={`/${s.candidate.slug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block truncate text-sm font-bold text-emce-text hover:underline"
                                  >
                                    {s.candidate.firstName}{" "}
                                    {s.candidate.lastName ?? ""}
                                  </Link>
                                  <p className="line-clamp-1 text-[10px] text-emce-text-sec">
                                    {s.candidate.user.email}
                                  </p>
                                </div>
                              </div>
                            ) : null}
                          </div>

                          {/* Admin override row — mirrors the recruiter
                              buttons but ALL slot lifecycle states are
                              admin-callable from here. */}
                          {s.status === "BOOKED" && (
                            <>
                              <form action={markInterviewSlotOutcome}>
                                <input type="hidden" name="slotId" value={s.id} />
                                <input type="hidden" name="outcome" value="COMPLETED" />
                                <SubmitButton
                                  variant="ghost"
                                  size="sm"
                                  pendingLabel="…"
                                  className="text-emce-darkest"
                                >
                                  ✓ Done
                                </SubmitButton>
                              </form>
                              <form action={markInterviewSlotOutcome}>
                                <input type="hidden" name="slotId" value={s.id} />
                                <input type="hidden" name="outcome" value="NO_SHOW" />
                                <ConfirmSubmit
                                  variant="ghost"
                                  size="sm"
                                  confirm="Mark this slot no-show? Recorded for analytics."
                                  pendingLabel="…"
                                  className="text-emce-text-muted"
                                >
                                  ✗ No-show
                                </ConfirmSubmit>
                              </form>
                            </>
                          )}
                          <form action={deleteInterviewSlot}>
                            <input type="hidden" name="slotId" value={s.id} />
                            <ConfirmSubmit
                              variant="ghost"
                              size="sm"
                              confirm={
                                s.status === "BOOKED"
                                  ? "Cancel this booked slot? The candidate will be notified."
                                  : "Remove this slot?"
                              }
                              pendingLabel="…"
                              className="text-emce-red-deep"
                            >
                              {s.status === "BOOKED" ? "Cancel" : "Remove"}
                            </ConfirmSubmit>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <p className="text-hint text-emce-text-sec">
          Admin actions ride the same server actions as the recruiter UI —
          cancellation notifies the candidate, marking COMPLETED/NO_SHOW
          updates analytics, removing AVAILABLE slots is silent.
        </p>
      </div>
    </AdminShell>
  );
}
