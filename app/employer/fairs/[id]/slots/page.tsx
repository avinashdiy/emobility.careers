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
import { PageHeader } from "@/components/ui/page-header";
import { EmployerShell } from "@/components/layout/employer-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import {
  bulkGenerateInterviewSlots,
  createInterviewSlot,
  deleteInterviewSlot,
  markInterviewSlotOutcome,
} from "@/server/recruitment-drives/slots";

export const metadata: Metadata = { title: "Booth interview slots" };
export const dynamic = "force-dynamic";

/**
 * Recruiter view at /employer/fairs/[id]/slots — manages the
 * 30-min interview windows at the company's booth. Two creation
 * affordances:
 *   • Bulk-generate N slots starting at a chosen time on a date
 *     (the "10 AM - 5 PM × 30 min" brochure pattern)
 *   • Single-slot add (one-off, e.g. an emergency late-evening
 *     window for an interesting candidate)
 *
 * Slot list grouped by date with per-row remove + booked-candidate
 * info when occupied.
 */
export default async function FairSlotsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const { id } = await params;

  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    select: { companyId: true },
  });
  if (!employer?.companyId) redirect("/employer/onboarding");

  const drive = await db.recruitmentDrive.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, startsAt: true, endsAt: true },
  });
  if (!drive) notFound();

  const booth = await db.recruitmentDriveCompany.findUnique({
    where: {
      driveId_companyId: { driveId: drive.id, companyId: employer.companyId },
    },
    select: {
      id: true,
      status: true,
      driveJobs: {
        orderBy: [{ sortOrder: "asc" }, { attachedAt: "asc" }],
        include: {
          job: { select: { id: true, title: true, status: true } },
        },
      },
    },
  });
  if (!booth || booth.status !== "CONFIRMED") {
    redirect(`/employer/fairs?error=Booth+not+confirmed`);
  }

  const openJobs = booth.driveJobs.filter((dj) => dj.job.status === "OPEN");

  const slots = await db.recruitmentDriveInterviewSlot.findMany({
    where: { driveCompanyId: booth.id },
    orderBy: { startsAt: "asc" },
    take: 500,
    include: {
      job: { select: { id: true, title: true } },
      candidate: {
        select: {
          firstName: true,
          lastName: true,
          slug: true,
          profilePhotoUrl: true,
          headline: true,
        },
      },
    },
  });

  // Group slots by date (Asia/Kolkata local) so the recruiter
  // scans by fair-day rather than scrolling a long flat list.
  const slotsByDay = new Map<string, typeof slots>();
  for (const s of slots) {
    const key = s.startsAt.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "short",
    });
    const bucket = slotsByDay.get(key) ?? [];
    bucket.push(s);
    slotsByDay.set(key, bucket);
  }

  const bookedCount = slots.filter((s) => s.status === "BOOKED").length;
  const availableCount = slots.filter((s) => s.status === "AVAILABLE").length;

  // Default the bulk-generate form's date to the fair's first day.
  const defaultDate = drive.startsAt
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    .slice(0, 10);

  return (
    <EmployerShell>
      <div className="container max-w-4xl space-y-6 py-6 md:py-8">
        <ToastFromSearchParams />
        <PageHeader
          eyebrow="Booth interview slots"
          title={`Slots · ${drive.title}`}
          subtitle={`${availableCount} available · ${bookedCount} booked · ${slots.length} total`}
          backHref={`/employer/fairs/${drive.id}`}
        />

        {/* Bulk generator — the "10 AM - 5 PM × 30 min" path. */}
        <Card className="p-5">
          <h2 className="text-section text-emce-text">Bulk-generate slots</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Spin up N back-to-back interview windows for a single
            day. Re-running for a day that already has slots skips
            duplicates by time — safe to retry.
          </p>
          <form
            action={bulkGenerateInterviewSlots}
            className="mt-4 grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="driveCompanyId" value={booth.id} />
            <div>
              <Label htmlFor="bulk-date">Day *</Label>
              <Input
                id="bulk-date"
                name="date"
                type="date"
                required
                defaultValue={defaultDate}
              />
            </div>
            <div>
              <Label htmlFor="bulk-start-time">Start time (IST) *</Label>
              <Input
                id="bulk-start-time"
                name="startTime"
                type="time"
                required
                defaultValue="10:00"
              />
            </div>
            <div>
              <Label htmlFor="bulk-duration">Each slot · minutes</Label>
              <Input
                id="bulk-duration"
                name="durationMinutes"
                type="number"
                min={5}
                max={240}
                defaultValue={30}
                inputMode="numeric"
              />
            </div>
            <div>
              <Label htmlFor="bulk-count">How many slots *</Label>
              <Input
                id="bulk-count"
                name="count"
                type="number"
                min={1}
                max={40}
                defaultValue={14}
                inputMode="numeric"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="bulk-job">
                Pin to a job (optional)
              </Label>
              <NativeSelect id="bulk-job" name="jobId" defaultValue="">
                <option value="">No pin — open to any role</option>
                {openJobs.map((dj) => (
                  <option key={dj.job.id} value={dj.job.id}>
                    {dj.job.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <SubmitButton size="sm" pendingLabel="Generating…">
                Generate slots
              </SubmitButton>
            </div>
          </form>
        </Card>

        {/* Single-slot add — for one-off windows. */}
        <Card className="p-5">
          <h2 className="text-section text-emce-text">Add one slot</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            One-off ("an extra 4 PM Tuesday slot for a hot candidate").
          </p>
          <form
            action={createInterviewSlot}
            className="mt-4 grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="driveCompanyId" value={booth.id} />
            <div>
              <Label htmlFor="single-startsAt">Starts at *</Label>
              <Input
                id="single-startsAt"
                name="startsAt"
                type="datetime-local"
                required
              />
            </div>
            <div>
              <Label htmlFor="single-duration">Duration · minutes</Label>
              <Input
                id="single-duration"
                name="durationMinutes"
                type="number"
                min={5}
                max={240}
                defaultValue={30}
                inputMode="numeric"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="single-job">Pin to a job (optional)</Label>
              <NativeSelect id="single-job" name="jobId" defaultValue="">
                <option value="">No pin — open to any role</option>
                {openJobs.map((dj) => (
                  <option key={dj.job.id} value={dj.job.id}>
                    {dj.job.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <SubmitButton size="sm" variant="outline" pendingLabel="Adding…">
                Add slot
              </SubmitButton>
            </div>
          </form>
        </Card>

        {/* Slot list grouped by day. */}
        <div>
          <h2 className="text-section text-emce-text">All slots</h2>
          {slots.length === 0 ? (
            <p className="mt-3 text-hint text-emce-text-sec">
              No slots yet. Use the bulk generator above to spin up a day&apos;s worth.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {Array.from(slotsByDay.entries()).map(([day, daySlots]) => (
                <Card key={day} className="p-4">
                  <p className="text-hint font-bold uppercase tracking-wider text-emce-mid-muted">
                    {day}
                  </p>
                  <ul className="mt-3 divide-y divide-emce-border">
                    {daySlots.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 py-2">
                        <span className="w-20 shrink-0 font-mono text-sm font-bold text-emce-text tabular-nums">
                          {s.startsAt.toLocaleTimeString("en-IN", {
                            timeZone: "Asia/Kolkata",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </span>
                        <span className="w-14 shrink-0 text-hint text-emce-text-muted">
                          {s.durationMinutes}m
                        </span>
                        {s.job ? (
                          <Badge variant="default" size="sm">
                            {s.job.title}
                          </Badge>
                        ) : (
                          <Badge variant="outline" size="sm">
                            Any role
                          </Badge>
                        )}
                        <div className="min-w-0 flex-1">
                          {s.status === "BOOKED" && s.candidate ? (
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
                                  {s.candidate.firstName} {s.candidate.lastName ?? ""}
                                </Link>
                                {s.candidate.headline && (
                                  <p className="line-clamp-1 text-[10px] text-emce-text-sec">
                                    {s.candidate.headline}
                                  </p>
                                )}
                              </div>
                              <Badge variant="success" size="sm">✓ Booked</Badge>
                            </div>
                          ) : s.status === "AVAILABLE" ? (
                            <Badge variant="default" size="sm">Available</Badge>
                          ) : s.status === "CANCELLED" ? (
                            <Badge variant="danger" size="sm">Cancelled</Badge>
                          ) : s.status === "COMPLETED" ? (
                            <Badge variant="success" size="sm">Completed</Badge>
                          ) : (
                            <Badge variant="outline" size="sm">No-show</Badge>
                          )}
                        </div>
                        {/* Post-interview close-out — only meaningful
                            for BOOKED slots that the recruiter has
                            actually run. Two buttons collapse the
                            common path (interview happened, mark
                            complete) and the edge case (candidate
                            didn't show up). */}
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
                                confirm="Mark this slot no-show? The candidate is recorded as absent for analytics."
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
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </EmployerShell>
  );
}
