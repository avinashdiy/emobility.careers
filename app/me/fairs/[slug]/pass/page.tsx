import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import {
  cancelDriveRegistration,
  markOnlineCheckedIn,
} from "@/server/recruitment-drives/registrations";
import { cancelInterviewBooking } from "@/server/recruitment-drives/slots";
import { PresencePinger } from "@/components/recruitathon/PresencePinger";
import { ConnectionIssueButton } from "@/components/recruitathon/ConnectionIssueButton";
import { VideoIntroUploader } from "@/components/recruitathon/VideoIntroUploader";

export const metadata: Metadata = {
  title: "Your fair pass",
  // Pass pages are personal — keep them out of search engines.
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Candidate-facing "fair pass" — the page they bring to the venue
 * (on their phone) and show at the check-in desk. Displays:
 *
 *   • Fair title, date, venue (so the candidate can re-confirm
 *     they're at the right one).
 *   • The 6-character check-in code, BIG, monospaced. This is the
 *     thing fair staff types into the admin scanner UI to mark
 *     the candidate present.
 *   • Status pill — REGISTERED / CHECKED_IN / CANCELLED.
 *   • "Add to calendar" link (generates a download URL for an ICS
 *     file the candidate can drop into Google/Apple Calendar).
 *   • Cancel-registration button (REGISTERED state only; hidden
 *     post check-in for the obvious reason).
 *
 * Future iterations could render the check-in code as a QR matrix
 * for hands-free scanning; the schema is already prepared (the
 * code itself encodes uniquely). v1 keeps the code-only path so
 * admin scanners with no QR reader still work.
 */
export default async function FairPassPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/signin?next=/me/fairs/${slug}/pass`);

  // No role gate. The fair pass is personal data — the
  // CandidateProfile lookup + registration check below ARE the owner
  // gate. An EMPLOYER (or ADMIN) who registered to ATTEND a fair (vs
  // booth-staff at one) has every right to view their own pass.
  // The previous role===CANDIDATE check 403'd anyone whose User.role
  // had been bumped to EMPLOYER between fair-registration and arrival
  // at the venue — a regression that would have stranded dual-persona
  // users at the door.
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!profile) redirect("/onboarding");

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      tagline: true,
      city: true,
      state: true,
      venueName: true,
      venueAddress: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
  });
  if (!drive) notFound();

  const reg = await db.recruitmentDriveRegistration.findUnique({
    where: { driveId_candidateId: { driveId: drive.id, candidateId: profile.id } },
    select: {
      id: true,
      status: true,
      checkInCode: true,
      createdAt: true,
      checkedInAt: true,
      fairMode: true,
      interviewReadyAt: true,
      videoIntroUrl: true,
      videoIntroUploadedAt: true,
    },
  });
  if (!reg) {
    // No registration — kick back to the fair landing with a hint.
    redirect(
      `/fairs/${slug}?notice=` +
        encodeURIComponent("You're not registered yet — click Register to attend."),
    );
  }

  // Phase 2 hybrid — auto-check-in path for ONLINE / HYBRID
  // candidates who hit the pass page during the event window.
  // Idempotent inside the action; safe to call on every render.
  // OFFLINE candidates and out-of-window views are no-ops.
  const isOnlineCandidate =
    reg.fairMode === "ONLINE" || reg.fairMode === "HYBRID";
  if (isOnlineCandidate && !reg.checkedInAt) {
    await markOnlineCheckedIn(slug);
  }

  // Pull this candidate's interview slot bookings at any booth in
  // this fair. Sorted chronologically so the candidate scans by
  // when-to-show-up, not by which company. Limited to non-cancelled
  // statuses — a cancelled slot has nothing actionable to show.
  const bookedSlots = await db.recruitmentDriveInterviewSlot.findMany({
    where: {
      candidateId: profile.id,
      status: { in: ["BOOKED", "COMPLETED"] },
      driveCompany: { driveId: drive.id },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      durationMinutes: true,
      status: true,
      notes: true,
      // Phase 1 hybrid — mode decides which CTA to render in the
      // booked-slots list (Join for VIDEO, venue info for ONSITE,
      // a stand-by hint for PHONE). meetingUrl powers the Join link.
      mode: true,
      meetingUrl: true,
      driveCompany: {
        select: {
          boothLabel: true,
          company: { select: { name: true, slug: true } },
        },
      },
      job: { select: { id: true, title: true } },
    },
  });

  // Phase 1 hybrid — used by the Join-button branch below. A button
  // shown 30 min before the slot start AND up to (durationMinutes + 15)
  // after — wide enough that a candidate who's a few minutes late or
  // a recruiter running long can both still tap Join.
  const now = new Date();
  function joinWindow(slot: { startsAt: Date; durationMinutes: number }): boolean {
    const opensAt = new Date(slot.startsAt.getTime() - 30 * 60 * 1000);
    const closesAt = new Date(slot.startsAt.getTime() + (slot.durationMinutes + 15) * 60 * 1000);
    return now >= opensAt && now <= closesAt;
  }

  // ICS download URL — uses an existing API route pattern if one
  // exists, otherwise falls back to a manual data: URL we mint
  // client-side below. We compute it lazily here so the page
  // doesn't pre-generate ICS bytes on every load.
  const icsParams = new URLSearchParams({
    title: drive.title,
    location: [drive.venueName, drive.venueAddress, `${drive.city}${drive.state ? ", " + drive.state : ""}`]
      .filter(Boolean)
      .join(", "),
    start: drive.startsAt.toISOString(),
    end: drive.endsAt.toISOString(),
    description: `Your check-in code: ${reg.checkInCode}\n\nemobility.careers/fairs/${drive.slug}`,
  });
  const icsHref = `/api/calendar/ics?${icsParams.toString()}`;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg py-8 md:py-12">
        <ToastFromSearchParams />
        {/* Phase 2 hybrid — presence beacon for ONLINE / HYBRID
            candidates. Bumps lastActiveAt every 60s while the tab is
            foregrounded, plus on visibilitychange. Powers the live
            console's "online active right now" tile. OFFLINE
            candidates skip the beacon — their presence is the
            scanner at the venue, not a tab somewhere. */}
        {isOnlineCandidate && <PresencePinger driveSlug={slug} />}
        <div className="container max-w-2xl space-y-4">
          <Link
            href={`/fairs/${slug}`}
            className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
          >
            ← Back to fair page
          </Link>

          <Card className="p-6 md:p-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
              Your fair pass
            </p>
            <h1 className="mt-1 text-2xl font-extrabold leading-tight text-emce-text md:text-[28px]">
              {drive.title}
            </h1>
            {drive.tagline && (
              <p className="mt-1 text-sm text-emce-text-sec">{drive.tagline}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {reg.status === "CHECKED_IN" && (
                <Badge variant="success">✓ Checked in</Badge>
              )}
              {reg.status === "REGISTERED" && (
                <Badge variant="default">Registered</Badge>
              )}
              {reg.status === "CANCELLED" && (
                <Badge variant="danger">Cancelled</Badge>
              )}
              {reg.status === "NO_SHOW" && (
                <Badge variant="outline">No-show</Badge>
              )}
              {/* Phase 1 hybrid — attendance-mode badge so the candidate
                  sees at a glance whether they're heading to the venue
                  or joining online. */}
              {reg.fairMode === "OFFLINE" && (
                <Badge variant="outline">📍 In-person</Badge>
              )}
              {reg.fairMode === "ONLINE" && (
                <Badge variant="outline">💻 Online</Badge>
              )}
              {reg.fairMode === "HYBRID" && (
                <Badge variant="outline">🌐 Hybrid</Badge>
              )}
              {/* Phase 2 hybrid — setup-tested badge for online
                  candidates who've passed the camera/mic self-test.
                  Recruiter sees the same signal as a green dot on
                  their slot board. */}
              {isOnlineCandidate && reg.interviewReadyAt && (
                <Badge variant="success">✓ Setup tested</Badge>
              )}
            </div>

            {/* The big check-in code + QR. Two ways to check in:
                1. Fair staff scans the QR (fast path — preferred at
                   the venue). QR encodes just the check-in code (not
                   a URL) so the scanner can match what it gets back
                   against RecruitmentDriveRegistration.checkInCode
                   without any URL parsing.
                2. If the QR is unreadable (printed pass faded, etc.)
                   staff type the 6-char code instead.
                Server-side SVG keeps the page zero-JS for printing /
                offline use — works even when the venue WiFi is
                flakey. */}
            <div className="mt-6 rounded-lg border-2 border-dashed border-emce-mid/50 bg-emce-light-soft p-6 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emce-mid-muted">
                Show this at the check-in desk
              </p>
              <div
                className="mx-auto mt-3 inline-block rounded-md bg-white p-2"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: await QRCode.toString(reg.checkInCode, { type: "svg", margin: 1, width: 192, color: { dark: "#0f1e2e", light: "#ffffff" } }) }}
              />
              <p
                className="mt-3 font-mono text-[28px] font-extrabold tracking-[0.3em] text-emce-darkest md:text-[36px]"
                aria-label={`Check-in code: ${reg.checkInCode.split("").join(" ")}`}
              >
                {reg.checkInCode}
              </p>
              <p className="mt-2 text-hint text-emce-text-muted">
                Fair staff will scan the QR (or type the code) to mark
                you present. Keep this page open on your phone.
              </p>
            </div>

            <div className="mt-6 space-y-2 text-body text-emce-text-sec">
              <p>
                <strong className="text-emce-text">📅 When:</strong>{" "}
                {drive.startsAt.toLocaleString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              {drive.venueName && (
                <p>
                  <strong className="text-emce-text">📍 Where:</strong> {drive.venueName}
                  {drive.venueAddress ? ` — ${drive.venueAddress}` : ""}
                </p>
              )}
              <p>
                <strong className="text-emce-text">🏙️ City:</strong> {drive.city}
                {drive.state ? `, ${drive.state}` : ""}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {/* Two-event ICS surface:
                  • Fair-day "you're attending" reminder — single
                    VEVENT covering the whole fair window.
                  • Booked interview slots — separate ICS that emits
                    one VEVENT per booked booth slot, so they appear
                    individually on the candidate's calendar with
                    the recruiter name + booth label. */}
              <Button asChild variant="outline" size="sm">
                <a href={icsHref}>📆 Save fair date</a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/me/fairs/${drive.slug}/slots.ics`}>📅 Interview slots → calendar</a>
              </Button>
              {/* Phase 2 hybrid — only surface for online-capable
                  candidates. OFFLINE registrants don't need to test. */}
              {isOnlineCandidate && (
                <Button
                  asChild
                  variant={reg.interviewReadyAt ? "outline" : "default"}
                  size="sm"
                >
                  <Link href={`/me/fairs/${drive.slug}/test-call`}>
                    {reg.interviewReadyAt
                      ? "🎥 Re-test camera + mic"
                      : "🎥 Test camera + mic"}
                  </Link>
                </Button>
              )}
              {reg.status === "REGISTERED" && drive.status !== "CLOSED" && (
                <form action={cancelDriveRegistration}>
                  <input type="hidden" name="driveId" value={drive.id} />
                  <ConfirmSubmit
                    variant="link"
                    size="sm"
                    confirm="Cancel your registration? You can re-register before the fair starts."
                    pendingLabel="Cancelling…"
                    className="text-emce-red-deep"
                  >
                    Cancel registration
                  </ConfirmSubmit>
                </form>
              )}
            </div>
          </Card>

          {/* Booth interview-slot bookings — surfaced on the pass
              page so the candidate has ONE place to manage everything
              fair-related. Sorted by start time. Per-row cancel
              button frees the slot back to AVAILABLE. */}
          {bookedSlots.length > 0 && (
            <Card className="p-6">
              <h2 className="text-section text-emce-text">Your interview slots</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                In-person slots: arrive 5 minutes early with photo ID. Online
                slots: tap Join when the time comes — the link opens in a
                new tab.
              </p>
              <ul className="mt-3 divide-y divide-emce-border">
                {bookedSlots.map((s) => {
                  const isOnline = s.mode === "VIDEO" || s.mode === "PHONE";
                  const canJoin =
                    s.mode === "VIDEO" &&
                    s.meetingUrl &&
                    s.status === "BOOKED" &&
                    joinWindow(s);
                  return (
                    <li key={s.id} className="py-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-emce-text">
                            {s.driveCompany.company.name}
                            {!isOnline && s.driveCompany.boothLabel && (
                              <span className="ml-2 text-hint font-normal text-emce-text-muted">
                                · 📍 {s.driveCompany.boothLabel}
                              </span>
                            )}
                          </p>
                          <p className="text-hint text-emce-text-sec">
                            {s.startsAt.toLocaleString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            })}{" "}
                            · {s.durationMinutes} min
                            {s.job ? ` · ${s.job.title}` : ""}
                          </p>
                          {/* Phase 1 hybrid — per-slot mode badge tells
                              the candidate exactly how this one is
                              happening. Visually distinct so the
                              ONLINE-Delhi candidate doesn't accidentally
                              show up at a Pune booth. */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            {s.mode === "VIDEO" && (
                              <Badge variant="default" size="sm" className="bg-emce-mid/20 text-emce-darkest">
                                📹 Online · video
                              </Badge>
                            )}
                            {s.mode === "PHONE" && (
                              <Badge variant="default" size="sm" className="bg-emce-mid/20 text-emce-darkest">
                                📞 Online · phone
                              </Badge>
                            )}
                            {s.mode === "ONSITE" && (
                              <Badge variant="outline" size="sm">
                                📍 In person
                              </Badge>
                            )}
                            {s.status === "COMPLETED" && (
                              <Badge variant="success" size="sm">✓ Done</Badge>
                            )}
                          </div>
                          {s.notes && (
                            <p className="mt-1 text-hint italic text-emce-text-sec">
                              {s.notes}
                            </p>
                          )}
                          {/* PHONE mode — recruiter calls the candidate's
                              registered phone. Just a hint; no Join button. */}
                          {s.mode === "PHONE" && s.status === "BOOKED" && (
                            <p className="mt-2 text-hint text-emce-text-sec">
                              📞 The recruiter will call you on your registered
                              phone number. Keep it handy 5 minutes before the
                              slot time.
                            </p>
                          )}
                        </div>
                        {s.status === "BOOKED" && (
                          <form action={cancelInterviewBooking}>
                            <input type="hidden" name="slotId" value={s.id} />
                            <ConfirmSubmit
                              variant="link"
                              size="sm"
                              confirm={`Cancel your ${s.driveCompany.company.name} interview slot?`}
                              pendingLabel="…"
                              className="text-emce-red-deep"
                            >
                              Cancel
                            </ConfirmSubmit>
                          </form>
                        )}
                      </div>
                      {/* VIDEO mode — Join CTA. We always render the
                          link when the slot has a meetingUrl, but
                          gate the *primary* (filled) variant to the
                          ±30 min window so the candidate doesn't
                          jump into an empty room hours early. The
                          outline variant always shows so the candidate
                          can copy the link to their calendar app. */}
                      {s.mode === "VIDEO" && s.meetingUrl && s.status === "BOOKED" && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {canJoin ? (
                            <Button asChild size="sm">
                              <a
                                href={s.meetingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                ▶ Join interview
                              </a>
                            </Button>
                          ) : (
                            <Button asChild size="sm" variant="outline">
                              <a
                                href={s.meetingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Open meeting link
                              </a>
                            </Button>
                          )}
                          <span className="text-hint text-emce-text-muted">
                            {canJoin
                              ? "Join button is live — opens in a new tab."
                              : "Join button lights up 30 min before the slot."}
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {/* Phase 3 hybrid — async fallback. Online candidates can
              upload a 2-min video intro that recruiters see as a
              non-blocking review item. Useful when a slot got
              cancelled, they couldn't book in time, or they just
              want a recruiter to put a face to the CV. OFFLINE
              candidates skip this — they're at the booth in person. */}
          {isOnlineCandidate && (
            <Card className="p-6">
              <h2 className="text-section text-emce-text">
                🎥 Video intro (optional)
              </h2>
              <VideoIntroUploader
                driveSlug={slug}
                hasExistingIntro={Boolean(reg.videoIntroUrl)}
              />
            </Card>
          )}

          {/* Phase 3 hybrid — connection-issue SOS. Surfaces during
              and slightly around the event window so a candidate
              having pre-event setup trouble can ping the admin too.
              Hidden completely for OFFLINE candidates — they walk up
              to the help desk at the venue. */}
          {isOnlineCandidate &&
            new Date() >= new Date(drive.startsAt.getTime() - 60 * 60 * 1000) &&
            new Date() <= new Date(drive.endsAt.getTime() + 30 * 60 * 1000) && (
              <Card className="border-emce-red/30 bg-emce-red-light/30 p-6">
                <h2 className="text-section text-emce-text">
                  Something not working?
                </h2>
                <p className="mt-1 text-hint text-emce-text-sec">
                  If your video / mic / Meet link is failing during a
                  booked slot, tap this — the fair admin gets paged
                  on WhatsApp and will call you back. We&apos;ll also
                  try to re-slot you with the recruiter.
                </p>
                <div className="mt-3">
                  <ConnectionIssueButton driveSlug={slug} />
                </div>
              </Card>
            )}

          <p className="text-hint text-emce-text-sec">
            Lost your code? It&apos;s already linked to your account — fair
            staff can also look you up by email at the desk.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
