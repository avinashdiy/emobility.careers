import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { SubmitButton } from "@/components/ui/submit-button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { bookInterviewSlot } from "@/server/recruitment-drives/slots";
import { evaluateFairEligibility, FAIR_GAP_COPY } from "@/lib/fair-eligibility";

export const metadata: Metadata = { title: "Book a booth interview slot" };
export const dynamic = "force-dynamic";

/**
 * Candidate-facing slot picker for ONE booth at a fair. Sits at
 * /fairs/[slug]/booths/[boothId]/slots — landed via the "Book
 * interview slot" CTA on each booth card on the public fair page.
 *
 * Eligibility-aware: a signed-out visitor sees a sign-in nudge; a
 * signed-in candidate who isn't registered for the fair or who
 * fails the eligibility check (60% + CV + phone + email) sees a
 * deep-link to fix the gap. Only fully-eligible candidates see
 * working Book buttons.
 *
 * Slot rendering: groups available slots by date (Asia/Kolkata),
 * shows the recruiter's optional notes inline. Booked / cancelled
 * slots are hidden — the candidate only sees what they can act on.
 */
export default async function FairBoothSlotsPage({
  params,
}: {
  params: Promise<{ slug: string; boothId: string }>;
}) {
  const { slug, boothId } = await params;
  const session = await auth();

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug },
    select: { id: true, slug: true, title: true, status: true },
  });
  if (!drive) notFound();
  if (drive.status === "DRAFT" || drive.status === "CANCELLED") notFound();

  const booth = await db.recruitmentDriveCompany.findUnique({
    where: { id: boothId },
    select: {
      id: true,
      driveId: true,
      status: true,
      boothLabel: true,
      company: { select: { name: true, slug: true, logoUrl: true } },
    },
  });
  if (!booth || booth.driveId !== drive.id || booth.status !== "CONFIRMED") {
    redirect(`/fairs/${slug}?error=Booth+not+found`);
  }

  // Pull available slots only. Past slots filtered out so the page
  // doesn't show ghost slots from earlier in the day.
  const slots = await db.recruitmentDriveInterviewSlot.findMany({
    where: {
      driveCompanyId: booth.id,
      status: "AVAILABLE",
      startsAt: { gte: new Date() },
    },
    orderBy: { startsAt: "asc" },
    take: 100,
    include: { job: { select: { id: true, title: true } } },
  });

  // Eligibility — only computed for signed-in candidates.
  let eligibility: ReturnType<typeof evaluateFairEligibility> | null = null;
  let registered = false;
  let myBookingAtBooth: { id: string; startsAt: Date } | null = null;
  if (session?.user?.role === "CANDIDATE") {
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        profileCompleteness: true,
        resumeUrl: true,
        aiResumeUrl: true,
        phone: true,
        user: { select: { emailVerifiedAt: true, phone: true } },
      },
    });
    if (profile) {
      eligibility = evaluateFairEligibility(
        {
          profileCompleteness: profile.profileCompleteness,
          resumeUrl: profile.resumeUrl,
          aiResumeUrl: profile.aiResumeUrl,
          phone: profile.phone,
        },
        profile.user,
      );
      const reg = await db.recruitmentDriveRegistration.findUnique({
        where: {
          driveId_candidateId: { driveId: drive.id, candidateId: profile.id },
        },
        select: { status: true },
      });
      registered =
        reg !== null &&
        (reg.status === "REGISTERED" || reg.status === "CHECKED_IN");

      // Existing booking at THIS booth (if any) — so the candidate
      // sees their current booking surfaced even when browsing
      // available alternatives.
      const existingBooking = await db.recruitmentDriveInterviewSlot.findFirst({
        where: {
          driveCompanyId: booth.id,
          candidateId: profile.id,
          status: "BOOKED",
        },
        select: { id: true, startsAt: true },
      });
      myBookingAtBooth = existingBooking;
    }
  }

  // Group available slots by date (Asia/Kolkata).
  const slotsByDay = new Map<string, typeof slots>();
  for (const s of slots) {
    const key = s.startsAt.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const bucket = slotsByDay.get(key) ?? [];
    bucket.push(s);
    slotsByDay.set(key, bucket);
  }

  // Can the candidate book at all? Three gates: signed in, fair-
  // registered, fully eligible. UI uses this to switch between
  // working Book buttons vs an explanatory panel.
  const canBook = session?.user && eligibility?.ok && registered;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg py-8">
        <ToastFromSearchParams />
        <div className="container max-w-3xl space-y-5">
          <Link
            href={`/fairs/${slug}`}
            className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
          >
            ← Back to {drive.title}
          </Link>

          <Card className="p-5 md:p-6">
            <div className="flex items-start gap-3">
              <Avatar
                src={booth.company.logoUrl}
                name={booth.company.name}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
                  Booth interview slots
                </p>
                <h1 className="text-2xl font-extrabold text-emce-text">
                  {booth.company.name}
                </h1>
                {booth.boothLabel && (
                  <p className="text-hint text-emce-text-sec">
                    📍 {booth.boothLabel}
                  </p>
                )}
                <p className="mt-1 text-hint text-emce-text-sec">
                  Pick a 30-minute window. We&apos;ll confirm both sides + add
                  it to your fair pass.
                </p>
              </div>
            </div>
          </Card>

          {/* Existing booking — surface FIRST so the candidate doesn't
              double-book by accident. */}
          {myBookingAtBooth && (
            <Card className="border-emce-mid/40 bg-emce-light-soft/40 p-4">
              <p className="text-section text-emce-text">
                ✓ You&apos;re booked at this booth
              </p>
              <p className="mt-1 text-body text-emce-text-sec">
                {myBookingAtBooth.startsAt.toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Manage this booking from{" "}
                <Link
                  href={`/me/fairs/${slug}/pass`}
                  className="font-bold text-emce-dark hover:underline"
                >
                  your fair pass
                </Link>
                . You can cancel it from there to free up the slot.
              </p>
            </Card>
          )}

          {/* Eligibility gates — render before the slot list so the
              candidate knows why the Book buttons might be disabled. */}
          {!session?.user && (
            <Card className="border-emce-orange/50 bg-emce-orange-light p-4">
              <p className="text-section text-emce-text">Sign in to book</p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Slot booking is for registered candidates. Sign in (or
                create an account) and register for the fair, then
                come back here.
              </p>
              <div className="mt-3">
                <Link
                  href={`/signin?next=/fairs/${slug}/booths/${boothId}/slots`}
                  className="inline-flex h-9 items-center rounded-md bg-emce-dark px-4 text-sm font-bold text-emce-light hover:bg-emce-dark-deep"
                >
                  Sign in →
                </Link>
              </div>
            </Card>
          )}

          {session?.user?.role === "CANDIDATE" && !registered && (
            <Card className="border-emce-orange/50 bg-emce-orange-light p-4">
              <p className="text-section text-emce-text">
                Register for the fair first
              </p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Slot booking is gated to candidates who&apos;ve confirmed
                attendance. Register on the fair page (it&apos;s one click
                if your profile is complete), then come back.
              </p>
              <div className="mt-3">
                <Link
                  href={`/fairs/${slug}`}
                  className="inline-flex h-9 items-center rounded-md bg-emce-dark px-4 text-sm font-bold text-emce-light hover:bg-emce-dark-deep"
                >
                  Open fair page →
                </Link>
              </div>
            </Card>
          )}

          {session?.user?.role === "CANDIDATE" &&
            registered &&
            eligibility &&
            !eligibility.ok && (
              <Card className="border-emce-orange/50 bg-emce-orange-light p-4">
                <p className="text-section text-emce-text">
                  Finish your profile to book
                </p>
                <p className="mt-1 text-hint text-emce-text-sec">
                  Recruiters need the basics before they meet you.
                  Complete these {eligibility.missing.length}{" "}
                  {eligibility.missing.length === 1 ? "item" : "items"} and
                  the Book buttons unlock.
                </p>
                <ul className="mt-3 space-y-2">
                  {eligibility.missing.map((gap) => {
                    const copy = FAIR_GAP_COPY[gap];
                    return (
                      <li
                        key={gap}
                        className="flex items-center justify-between gap-3 rounded-md border border-emce-orange/40 bg-white p-3"
                      >
                        <span className="font-bold text-emce-text">
                          {copy.label}
                        </span>
                        <Link
                          href={copy.href}
                          className="inline-flex h-8 shrink-0 items-center rounded-md bg-emce-dark px-3 text-xs font-bold text-emce-light hover:bg-emce-dark-deep"
                        >
                          {copy.cta} →
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

          {/* Slot list */}
          <div>
            <h2 className="text-section text-emce-text">
              {slots.length} available {slots.length === 1 ? "slot" : "slots"}
            </h2>
            {slots.length === 0 ? (
              <Card className="mt-3 p-6 text-center">
                <p className="text-hint text-emce-text-muted">
                  No slots are open right now. The booth recruiter may add
                  more — check back, or message them via{" "}
                  <Link
                    href={`/fairs/${slug}`}
                    className="font-bold text-emce-dark hover:underline"
                  >
                    the fair page
                  </Link>
                  .
                </p>
              </Card>
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
                          <span className="w-24 shrink-0 font-mono text-sm font-bold text-emce-text tabular-nums">
                            {s.startsAt.toLocaleTimeString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            })}
                          </span>
                          <span className="shrink-0 text-hint text-emce-text-muted">
                            {s.durationMinutes}m
                          </span>
                          {s.job && (
                            <Badge variant="default" size="sm">
                              {s.job.title}
                            </Badge>
                          )}
                          <div className="min-w-0 flex-1">
                            {s.notes && (
                              <p className="line-clamp-2 text-hint text-emce-text-sec">
                                {s.notes}
                              </p>
                            )}
                          </div>
                          <form action={bookInterviewSlot}>
                            <input type="hidden" name="slotId" value={s.id} />
                            <SubmitButton
                              size="sm"
                              variant="outline"
                              disabled={!canBook}
                              pendingLabel="Booking…"
                            >
                              Book
                            </SubmitButton>
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
      </main>
      <SiteFooter />
    </>
  );
}
