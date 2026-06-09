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
  rescheduleInterviewSlot,
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
          id: true,
          firstName: true,
          lastName: true,
          slug: true,
          profilePhotoUrl: true,
          headline: true,
        },
      },
    },
  });

  // Phase 2 hybrid — pull the candidate's registration record for
  // each BOOKED slot so the slot board can surface their setup-tested
  // state and their online presence. One round-trip via a single
  // findMany scoped to this drive + the booked candidates.
  const bookedCandidateIds = slots
    .filter((s) => s.status === "BOOKED" && s.candidate?.id)
    .map((s) => s.candidate!.id);
  const registrationsByCandidate = new Map<
    string,
    {
      fairMode: "OFFLINE" | "ONLINE" | "HYBRID" | null;
      interviewReadyAt: Date | null;
      lastActiveAt: Date | null;
    }
  >();
  if (bookedCandidateIds.length > 0) {
    const regs = await db.recruitmentDriveRegistration.findMany({
      where: {
        driveId: drive.id,
        candidateId: { in: bookedCandidateIds },
      },
      select: {
        candidateId: true,
        fairMode: true,
        interviewReadyAt: true,
        lastActiveAt: true,
      },
    });
    for (const r of regs) {
      registrationsByCandidate.set(r.candidateId, {
        fairMode: r.fairMode,
        interviewReadyAt: r.interviewReadyAt,
        lastActiveAt: r.lastActiveAt,
      });
    }
  }

  // Phase 2 hybrid — "next 2 hours" split. Surfaces the upcoming
  // ONSITE-mode + ONLINE-mode queues separately so the recruiter
  // running a hybrid booth can see both streams without scrolling
  // through a flat day's worth of slots. Past-but-recent slots
  // (in the last 15 min) stay in the queue so a recruiter
  // running 10 min late still sees their current candidate.
  const now = new Date();
  const queueOpenedAt = new Date(now.getTime() - 15 * 60 * 1000);
  const queueClosesAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const upcomingOnsite = slots.filter(
    (s) =>
      s.status === "BOOKED" &&
      s.mode === "ONSITE" &&
      s.startsAt >= queueOpenedAt &&
      s.startsAt <= queueClosesAt,
  );
  const upcomingOnline = slots.filter(
    (s) =>
      s.status === "BOOKED" &&
      (s.mode === "VIDEO" || s.mode === "PHONE") &&
      s.startsAt >= queueOpenedAt &&
      s.startsAt <= queueClosesAt,
  );
  const presenceWindow = new Date(now.getTime() - 5 * 60 * 1000);

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

        {/* Phase 2 hybrid — "Next 2 hours" split view. Renders only
            when at least one booked slot is upcoming, so the rest of
            the page (the bulk generator + single-add + full slot list)
            isn't disturbed during off-event periods. */}
        {(upcomingOnsite.length > 0 || upcomingOnline.length > 0) && (
          <Card className="border-emce-mid/40 bg-emce-light-soft/40 p-5">
            <h2 className="text-section text-emce-text">⏱ Next 2 hours</h2>
            <p className="mt-1 text-hint text-emce-text-sec">
              Your queue right now. Green dot = candidate&apos;s camera +
              mic are tested. Pulse dot = candidate has the pass open
              in the last 5 min.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
                  📹 Online ({upcomingOnline.length})
                </p>
                {upcomingOnline.length === 0 ? (
                  <p className="mt-2 text-hint text-emce-text-muted">
                    No online interviews in the next 2 h.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {upcomingOnline.slice(0, 6).map((s) => {
                      const r = s.candidate ? registrationsByCandidate.get(s.candidate.id) : undefined;
                      const ready = Boolean(r?.interviewReadyAt);
                      const active =
                        r?.lastActiveAt && r.lastActiveAt >= presenceWindow;
                      return (
                        <li
                          key={s.id}
                          className="flex items-center gap-2 rounded-md border border-emce-border bg-white p-2"
                        >
                          <span className="w-16 shrink-0 font-mono text-xs font-bold text-emce-text tabular-nums">
                            {s.startsAt.toLocaleTimeString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            })}
                          </span>
                          <span
                            title={ready ? "Setup tested" : "Not setup-tested yet"}
                            aria-label={ready ? "Setup tested" : "Not setup-tested"}
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                              ready ? "bg-emce-mid" : "bg-emce-red"
                            }`}
                          />
                          {active && (
                            <span
                              className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emce-mid-deep"
                              title="Online right now"
                              aria-label="Online right now"
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm text-emce-text">
                            {s.candidate?.firstName} {s.candidate?.lastName ?? ""}
                          </span>
                          {s.meetingUrl && (
                            <a
                              href={s.meetingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-md bg-emce-dark px-2 py-1 text-xs font-bold text-emce-light hover:bg-emce-dark-deep"
                            >
                              Join
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
                  📍 At the booth ({upcomingOnsite.length})
                </p>
                {upcomingOnsite.length === 0 ? (
                  <p className="mt-2 text-hint text-emce-text-muted">
                    No in-person interviews in the next 2 h.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {upcomingOnsite.slice(0, 6).map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center gap-2 rounded-md border border-emce-border bg-white p-2"
                      >
                        <span className="w-16 shrink-0 font-mono text-xs font-bold text-emce-text tabular-nums">
                          {s.startsAt.toLocaleTimeString("en-IN", {
                            timeZone: "Asia/Kolkata",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-emce-text">
                          {s.candidate?.firstName} {s.candidate?.lastName ?? ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        )}

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
            {/* Hybrid Recruitathon (Phase 1) — every slot generated by
                this batch gets the same mode. Recruiters who want a
                mixed day run the bulk twice (once ONSITE, once VIDEO). */}
            <div>
              <Label htmlFor="bulk-mode">Mode *</Label>
              <NativeSelect id="bulk-mode" name="mode" defaultValue="ONSITE">
                <option value="ONSITE">In-person at booth</option>
                <option value="VIDEO">Online — video</option>
                <option value="PHONE">Online — phone</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="bulk-meeting-url">
                Meeting URL <span className="text-emce-text-muted">(VIDEO only)</span>
              </Label>
              <Input
                id="bulk-meeting-url"
                name="meetingUrl"
                type="url"
                inputMode="url"
                placeholder="https://meet.google.com/abc-defg-hij"
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
            <div>
              <Label htmlFor="single-mode">Mode *</Label>
              <NativeSelect id="single-mode" name="mode" defaultValue="ONSITE">
                <option value="ONSITE">In-person at booth</option>
                <option value="VIDEO">Online — video</option>
                <option value="PHONE">Online — phone</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="single-meeting-url">
                Meeting URL <span className="text-emce-text-muted">(VIDEO only)</span>
              </Label>
              <Input
                id="single-meeting-url"
                name="meetingUrl"
                type="url"
                inputMode="url"
                placeholder="https://meet.google.com/abc-defg-hij"
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
                        {/* Hybrid Recruitathon (Phase 1) — mode badge.
                            Distinct visual treatment vs the job pill so
                            recruiters can scan a day and immediately
                            see the online/onsite mix. */}
                        {s.mode === "VIDEO" ? (
                          <Badge variant="default" size="sm" className="bg-emce-mid/20 text-emce-darkest">
                            📹 Video
                          </Badge>
                        ) : s.mode === "PHONE" ? (
                          <Badge variant="default" size="sm" className="bg-emce-mid/20 text-emce-darkest">
                            📞 Phone
                          </Badge>
                        ) : (
                          <Badge variant="outline" size="sm">
                            📍 In person
                          </Badge>
                        )}
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
                              {/* Phase 2 hybrid — readiness + presence
                                  indicators on every booked online slot
                                  in the full list (mirrors the next-2h
                                  rail above so the recruiter has the
                                  same signal in both places). */}
                              {(s.mode === "VIDEO" || s.mode === "PHONE") &&
                                (() => {
                                  const r = registrationsByCandidate.get(s.candidate.id);
                                  const ready = Boolean(r?.interviewReadyAt);
                                  const active =
                                    r?.lastActiveAt && r.lastActiveAt >= presenceWindow;
                                  return (
                                    <span className="flex items-center gap-1.5">
                                      <span
                                        title={ready ? "Setup tested" : "Not setup-tested yet"}
                                        aria-label={ready ? "Setup tested" : "Not setup-tested"}
                                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                          ready ? "bg-emce-mid" : "bg-emce-red"
                                        }`}
                                      />
                                      {active && (
                                        <span
                                          className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emce-mid-deep"
                                          title="Online right now"
                                          aria-label="Online right now"
                                        />
                                      )}
                                    </span>
                                  );
                                })()}
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
                            actually run. Three buttons cover:
                              ✓ Done       — interview happened
                              ↻ Reschedule — needs a new time (Phase 3)
                              ✗ No-show    — candidate didn't show
                            Reschedule uses a native `details`+`summary`
                            disclosure so the time picker is hidden by
                            default — keeps the row visually quiet. */}
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
                            <details className="group">
                              <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-xs font-bold text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text">
                                ↻ Reschedule
                              </summary>
                              <form
                                action={rescheduleInterviewSlot}
                                className="absolute z-10 mt-1 flex items-center gap-2 rounded-md border border-emce-border bg-white p-2 shadow-emce-modal"
                              >
                                <input type="hidden" name="slotId" value={s.id} />
                                <Input
                                  type="datetime-local"
                                  name="newStartsAt"
                                  required
                                  className="h-8 text-xs"
                                />
                                <SubmitButton size="sm" pendingLabel="…">
                                  Move
                                </SubmitButton>
                              </form>
                            </details>
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
