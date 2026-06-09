import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { AdminShell } from "@/components/layout/admin-shell";
import { relativeTime } from "@/lib/utils";
import { resolveConnectionIssue } from "@/server/recruitment-drives/registrations";

export const metadata = { title: "Live event dashboard" };
// Don't cache at the route level — every request hits fresh DB
// numbers. Combined with the page-level 15-sec meta-refresh below,
// this keeps the admin staring at a (near-)real-time count without
// any WebSocket / Soketi infra. v2 candidate: push updates via the
// existing realtime layer for sub-second freshness.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Live event-day dashboard for a recruitment fair.
 *
 * On the day of the fair, the placement operations team needs
 * single-glance visibility on:
 *   • Registrations (target vs. actual)
 *   • Check-ins (target vs. actual + delta in the last 15 min)
 *   • Interview slots booked vs. available
 *   • Late-breaking signups (who registered in the last hour)
 *   • Booth status (CONFIRMED, INVITED, WITHDRAWN)
 *
 * This page is one server component that runs every query on each
 * request + auto-refreshes every 15 seconds via meta-refresh. It
 * doesn't push (no WebSocket) — that's a v2 concern. 15s polling on
 * a sub-second-each query batch is comfortably under any plausible
 * fair-day load.
 */
export default async function LiveEventDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { slug } = await params;

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, title: true, city: true, state: true,
      startsAt: true, endsAt: true, status: true,
      registeredCount: true,
      heroStatCandidatesTarget: true,
      heroStatCompaniesTarget: true,
    },
  });
  if (!drive) notFound();

  // Time windows for delta metrics
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);

  // Five parallel aggregations. All small + indexed queries; under
  // 100ms total even with 10k registrations.
  const [
    totalRegistrations,
    activeRegistrations,
    checkedInTotal,
    checkedInLast15Min,
    registrationsLastHour,
    interviewSlotStats,
    boothStats,
    recentSignups,
    inlineSignupCount,
    tpoLinkCount,
    fairModeBreakdown,
    bookedSlotsByMode,
    onlineActiveNow,
    setupTestedCount,
    physicalCheckIns,
    onlineCheckIns,
    openIssues,
  ] = await Promise.all([
    db.recruitmentDriveRegistration.count({ where: { driveId: drive.id } }),
    db.recruitmentDriveRegistration.count({
      where: { driveId: drive.id, cancelledAt: null },
    }),
    db.recruitmentDriveRegistration.count({
      where: { driveId: drive.id, checkedInAt: { not: null } },
    }),
    db.recruitmentDriveRegistration.count({
      where: { driveId: drive.id, checkedInAt: { gte: fifteenMinAgo } },
    }),
    db.recruitmentDriveRegistration.count({
      where: { driveId: drive.id, createdAt: { gte: oneHourAgo }, cancelledAt: null },
    }),
    db.recruitmentDriveInterviewSlot.groupBy({
      by: ["status"],
      where: { driveCompany: { driveId: drive.id } },
      _count: { _all: true },
    }),
    db.recruitmentDriveCompany.groupBy({
      by: ["status"],
      where: { driveId: drive.id },
      _count: { _all: true },
    }),
    db.recruitmentDriveRegistration.findMany({
      where: { driveId: drive.id, cancelledAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true, createdAt: true, source: true, checkInCode: true,
        candidate: {
          select: {
            firstName: true, lastName: true, slug: true,
            education: { orderBy: { createdAt: "desc" }, take: 1, select: { institution: true } },
          },
        },
      },
    }),
    db.recruitmentDriveRegistration.count({
      where: { driveId: drive.id, source: "RECRUITATHON_INLINE", cancelledAt: null },
    }),
    db.recruitmentDriveRegistration.count({
      where: { driveId: drive.id, source: "RECRUITATHON_TPO_LINK", cancelledAt: null },
    }),
    // Phase 1 hybrid — three new mode-breakdown queries. groupBy by
    // fairMode is one round-trip but doesn't include rows where the
    // value is null (legacy registrations from before fairMode was
    // captured). We count those separately as "unspecified" so the
    // sum reconciles with totalRegistrations.
    db.recruitmentDriveRegistration.groupBy({
      by: ["fairMode"],
      where: { driveId: drive.id, cancelledAt: null },
      _count: { _all: true },
    }),
    db.recruitmentDriveInterviewSlot.groupBy({
      by: ["mode"],
      where: { driveCompany: { driveId: drive.id }, status: "BOOKED" },
      _count: { _all: true },
    }),
    // Phase 2 hybrid — "online active right now" (lastActiveAt in
    // the last 5 minutes). Scoped to non-OFFLINE registrations
    // because an OFFLINE candidate viewing their pass from a tab
    // shouldn't count as "online attendance".
    db.recruitmentDriveRegistration.count({
      where: {
        driveId: drive.id,
        cancelledAt: null,
        fairMode: { in: ["ONLINE", "HYBRID"] },
        lastActiveAt: { gte: new Date(now.getTime() - 5 * 60 * 1000) },
      },
    }),
    // Phase 2 hybrid — setup-tested count. Online candidates who've
    // completed the camera + mic self-test.
    db.recruitmentDriveRegistration.count({
      where: {
        driveId: drive.id,
        cancelledAt: null,
        fairMode: { in: ["ONLINE", "HYBRID"] },
        interviewReadyAt: { not: null },
      },
    }),
    // Phase 2 hybrid — checked-in split: physical (scanner had an
    // admin user) vs online (auto-checked-in, checkedInById is null).
    // Both queries run in parallel; we surface both in the same tile.
    db.recruitmentDriveRegistration.count({
      where: {
        driveId: drive.id,
        cancelledAt: null,
        checkedInAt: { not: null },
        checkedInById: { not: null },
      },
    }),
    db.recruitmentDriveRegistration.count({
      where: {
        driveId: drive.id,
        cancelledAt: null,
        checkedInAt: { not: null },
        checkedInById: null,
      },
    }),
    // Phase 3 hybrid — open connection-issue queue. Caps at 50
    // so a noisy event doesn't bloat the page; the rest are in
    // the audit log.
    db.fairConnectionIssue.findMany({
      where: { registration: { driveId: drive.id }, status: "OPEN" },
      orderBy: { reportedAt: "desc" },
      take: 50,
      select: {
        id: true,
        reportedAt: true,
        message: true,
        slotId: true,
        registration: {
          select: {
            candidate: {
              select: {
                firstName: true,
                lastName: true,
                slug: true,
                phone: true,
                user: { select: { phone: true } },
              },
            },
          },
        },
        slot: {
          select: {
            startsAt: true,
            mode: true,
            meetingUrl: true,
            driveCompany: { select: { company: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  const totalSlots = interviewSlotStats.reduce((sum, s) => sum + s._count._all, 0);
  const bookedSlots = interviewSlotStats.find((s) => s.status === "BOOKED")?._count._all ?? 0;
  const availableSlots = interviewSlotStats.find((s) => s.status === "AVAILABLE")?._count._all ?? 0;

  // Phase 1 hybrid — registration breakdown by attendance mode +
  // booked-slot breakdown by delivery mode. Drives the new KPI
  // tiles below. fairMode=null rows are pre-Phase-1 registrations
  // that didn't capture the field; we surface them as "unspecified"
  // rather than rolling them into OFFLINE (which would be incorrect
  // for a Recruitathon edition that ran online too).
  const offlineRegs = fairModeBreakdown.find((m) => m.fairMode === "OFFLINE")?._count._all ?? 0;
  const onlineRegs = fairModeBreakdown.find((m) => m.fairMode === "ONLINE")?._count._all ?? 0;
  const hybridRegs = fairModeBreakdown.find((m) => m.fairMode === "HYBRID")?._count._all ?? 0;
  const unspecifiedRegs = fairModeBreakdown.find((m) => m.fairMode === null)?._count._all ?? 0;
  const bookedOnsite = bookedSlotsByMode.find((m) => m.mode === "ONSITE")?._count._all ?? 0;
  const bookedVideo = bookedSlotsByMode.find((m) => m.mode === "VIDEO")?._count._all ?? 0;
  const bookedPhone = bookedSlotsByMode.find((m) => m.mode === "PHONE")?._count._all ?? 0;
  const confirmedBooths = boothStats.find((s) => s.status === "CONFIRMED")?._count._all ?? 0;
  const invitedBooths = boothStats.find((s) => s.status === "INVITED")?._count._all ?? 0;
  const withdrawnBooths = boothStats.find((s) => s.status === "WITHDRAWN")?._count._all ?? 0;

  const candidateTarget = drive.heroStatCandidatesTarget ?? 0;
  const companyTarget = drive.heroStatCompaniesTarget ?? 0;
  const checkInPct = activeRegistrations > 0 ? Math.round((checkedInTotal / activeRegistrations) * 100) : 0;
  const slotUtilPct = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;

  const place = [drive.city, drive.state].filter(Boolean).join(", ");
  const when = drive.startsAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  return (
    <AdminShell>
      {/* Meta-refresh — refreshes the page every 15s. We use the
          HTML meta tag (not setInterval) so we don't need a client
          component for the polling. Visible-tab tabs only get the
          refresh; backgrounded ones pause naturally. */}
      <meta httpEquiv="refresh" content="15" />
      <div className="container max-w-6xl py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <Link href={`/admin/recruitathon/${drive.slug}`} className="text-xs font-bold text-emce-dark hover:underline">
              ← Manage fair
            </Link>
            <h1 className="mt-1 text-dashboard text-emce-text">
              ⚡ Live · {drive.title}
            </h1>
            <p className="mt-1 text-hint text-emce-text-sec">
              {when} · {place} · auto-refresh every 15s ·{" "}
              <Badge variant="outline" size="sm">{drive.status}</Badge>
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/fairs/${drive.id}/check-in`}>📷 Check-in scanner</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/broadcasts?fair=${drive.id}`}>📢 Broadcast</Link>
            </Button>
          </div>
        </div>

        {/* Headline numbers — three KPI tiles. Each has a sub-line
            with delta / progress so the admin can read the rate at
            a glance without doing the math. */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Kpi
            label="Registrations"
            value={activeRegistrations.toLocaleString()}
            sub={
              <>
                {registrationsLastHour > 0 ? (
                  <span className="text-emce-mid-deep">+{registrationsLastHour} in last 1h</span>
                ) : (
                  <span className="text-emce-text-muted">no signups in last 1h</span>
                )}
                {candidateTarget > 0 && (
                  <span className="text-emce-text-muted">
                    {" "}· {Math.round((activeRegistrations / candidateTarget) * 100)}% of {candidateTarget.toLocaleString()} target
                  </span>
                )}
              </>
            }
            accent="primary"
          />
          <Kpi
            label="Checked in"
            value={`${checkedInTotal.toLocaleString()} (${checkInPct}%)`}
            sub={
              <>
                {checkedInLast15Min > 0 ? (
                  <span className="text-emce-mid-deep">+{checkedInLast15Min} in last 15min</span>
                ) : (
                  <span className="text-emce-text-muted">no check-ins in last 15min</span>
                )}
                <span className="text-emce-text-muted"> · {(activeRegistrations - checkedInTotal).toLocaleString()} no-shows so far</span>
              </>
            }
            accent={checkInPct >= 60 ? "ok" : "warn"}
          />
          <Kpi
            label="Interview slots"
            value={`${bookedSlots} / ${totalSlots}`}
            sub={
              totalSlots > 0 ? (
                <span className="text-emce-text-muted">
                  {availableSlots} still available · {slotUtilPct}% utilisation
                </span>
              ) : (
                <span className="text-emce-text-muted">no slots configured yet</span>
              )
            }
            accent={slotUtilPct >= 50 ? "ok" : "neutral"}
          />
        </div>

        {/* Booth status + source mix — second row */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">Booth status</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="rounded-md bg-emce-mid-soft px-2 py-1 font-bold text-emce-mid-deep">
                ✓ Confirmed: {confirmedBooths}
              </span>
              <span className="rounded-md bg-emce-amber-soft px-2 py-1 font-bold text-emce-amber-deep">
                Pending: {invitedBooths}
              </span>
              {withdrawnBooths > 0 && (
                <span className="rounded-md bg-emce-red-light px-2 py-1 font-bold text-emce-red-deep">
                  Withdrew: {withdrawnBooths}
                </span>
              )}
              {companyTarget > 0 && (
                <span className="rounded-md bg-emce-light-soft px-2 py-1 text-emce-text-sec">
                  Target: {companyTarget}
                </span>
              )}
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">Registration source mix</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="rounded-md bg-emce-light-soft px-2 py-1 text-emce-text">
                Inline form: <strong>{inlineSignupCount}</strong>
              </span>
              <span className="rounded-md bg-emce-light-soft px-2 py-1 text-emce-text">
                Via TPO link: <strong>{tpoLinkCount}</strong>
              </span>
              <span className="rounded-md bg-emce-light-soft px-2 py-1 text-emce-text">
                Other / direct: <strong>{(totalRegistrations - inlineSignupCount - tpoLinkCount).toLocaleString()}</strong>
              </span>
            </div>
          </Card>
        </div>

        {/* Phase 1 hybrid — attendance-mode + slot-mode breakdown.
            Lets the placement ops team answer "how many Delhi
            students are coming online?" without a CSV export. */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
              Attendance mode (registrations)
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="rounded-md bg-emce-light-soft px-2 py-1 text-emce-text">
                📍 In-person: <strong>{offlineRegs}</strong>
              </span>
              <span className="rounded-md bg-emce-mid-soft px-2 py-1 font-bold text-emce-mid-deep">
                💻 Online: <strong>{onlineRegs}</strong>
              </span>
              <span className="rounded-md bg-emce-light-soft px-2 py-1 text-emce-text">
                🌐 Hybrid: <strong>{hybridRegs}</strong>
              </span>
              {unspecifiedRegs > 0 && (
                <span className="rounded-md bg-emce-amber-soft px-2 py-1 text-emce-amber-deep">
                  Unspecified: <strong>{unspecifiedRegs}</strong>
                </span>
              )}
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
              Interview-slot delivery mix (booked)
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="rounded-md bg-emce-light-soft px-2 py-1 text-emce-text">
                📍 In-person: <strong>{bookedOnsite}</strong>
              </span>
              <span className="rounded-md bg-emce-mid-soft px-2 py-1 font-bold text-emce-mid-deep">
                📹 Video: <strong>{bookedVideo}</strong>
              </span>
              <span className="rounded-md bg-emce-light-soft px-2 py-1 text-emce-text">
                📞 Phone: <strong>{bookedPhone}</strong>
              </span>
              {bookedSlots === 0 && (
                <span className="text-hint text-emce-text-muted">
                  no slots booked yet
                </span>
              )}
            </div>
          </Card>
        </div>

        {/* Phase 2 hybrid — real-time online engagement signals.
            "Online active right now" = lastActiveAt < 5 min.
            "Setup-tested" = camera/mic test completed at least once.
            "Check-in mix" splits physical (scanner) from online
            (auto-checked-in via pass-page view). Sum reconciles
            with the existing `checkedInTotal` KPI tile above. */}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
              Online active right now
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-emce-text tabular-nums">
                {onlineActiveNow.toLocaleString()}
              </span>
              <span className="text-hint text-emce-text-muted">in the last 5 min</span>
            </div>
            <p className="mt-1 text-hint text-emce-text-sec">
              Counts only ONLINE / HYBRID registrants with the pass
              page open + foregrounded. Updates every 15 s with the
              page refresh.
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
              Setup-tested
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-emce-text tabular-nums">
                {setupTestedCount.toLocaleString()}
              </span>
              {onlineRegs + hybridRegs > 0 && (
                <span className="text-hint text-emce-text-muted">
                  of {onlineRegs + hybridRegs} online-capable
                </span>
              )}
            </div>
            <p className="mt-1 text-hint text-emce-text-sec">
              Candidates who&apos;ve verified their camera + mic. Low
              numbers a day before the event = chase via broadcast.
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
              Check-in channel
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="rounded-md bg-emce-light-soft px-2 py-1 text-emce-text">
                📍 Scanner: <strong>{physicalCheckIns}</strong>
              </span>
              <span className="rounded-md bg-emce-mid-soft px-2 py-1 font-bold text-emce-mid-deep">
                💻 Online: <strong>{onlineCheckIns}</strong>
              </span>
            </div>
            <p className="mt-2 text-hint text-emce-text-sec">
              &quot;Online&quot; = auto-checked-in when an online
              attendee opens their pass during the event window.
            </p>
          </Card>
        </div>

        {/* Phase 3 hybrid — active connection-issue queue. Visually
            loud because every row is an SOS. Cleared when the admin
            marks the issue resolved (form below each row). The id
            anchor is what the candidate-side issue-report
            notification deep-links into ("...#issues"). */}
        <Card
          id="issues"
          className={`mt-3 p-4 ${
            openIssues.length > 0
              ? "border-emce-red bg-emce-red-light/40"
              : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emce-red-deep">
              {openIssues.length > 0
                ? `🚨 ${openIssues.length} active issue${openIssues.length === 1 ? "" : "s"}`
                : "🟢 No active connection issues"}
            </p>
            {openIssues.length > 0 && (
              <span className="text-hint text-emce-text-sec">
                Auto-refreshing every 15 s
              </span>
            )}
          </div>
          {openIssues.length === 0 ? (
            <p className="mt-2 text-hint text-emce-text-muted">
              Candidates can file a connection-issue report from their
              fair pass; OPEN ones land here.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {openIssues.map((iss) => {
                const cand = iss.registration.candidate;
                const candName = `${cand.firstName} ${cand.lastName ?? ""}`.trim();
                const phone = cand.phone || cand.user?.phone || null;
                return (
                  <li
                    key={iss.id}
                    className="rounded-md border border-emce-red/40 bg-white p-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <Link
                            href={`/${cand.slug}`}
                            className="font-bold text-emce-text hover:underline"
                          >
                            {candName}
                          </Link>
                          {phone && (
                            <>
                              {" · "}
                              <a
                                href={`tel:${phone}`}
                                className="font-bold text-emce-dark hover:underline"
                              >
                                📞 {phone}
                              </a>
                            </>
                          )}
                        </p>
                        {iss.slot && (
                          <p className="text-hint text-emce-text-sec">
                            During{" "}
                            <strong>
                              {iss.slot.driveCompany.company.name}
                            </strong>{" "}
                            slot at{" "}
                            {iss.slot.startsAt.toLocaleTimeString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            })}
                            {iss.slot.mode !== "ONSITE" && iss.slot.meetingUrl && (
                              <>
                                {" · "}
                                <a
                                  href={iss.slot.meetingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-bold text-emce-dark hover:underline"
                                >
                                  Open meet link →
                                </a>
                              </>
                            )}
                          </p>
                        )}
                        {iss.message && (
                          <p className="mt-1 text-body italic text-emce-text-sec">
                            &ldquo;{iss.message}&rdquo;
                          </p>
                        )}
                        <p className="mt-1 text-hint text-emce-text-muted">
                          Reported {relativeTime(iss.reportedAt)}
                        </p>
                      </div>
                      <form
                        action={resolveConnectionIssue}
                        className="flex shrink-0 items-center gap-2"
                      >
                        <input type="hidden" name="issueId" value={iss.id} />
                        <Input
                          name="resolutionNote"
                          type="text"
                          placeholder="What did you do? (optional)"
                          className="h-9 w-56"
                          maxLength={500}
                        />
                        <SubmitButton size="sm" pendingLabel="Resolving…">
                          ✓ Resolved
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Recent signups — most useful at T-7 to T-1 days (watching
            the registration curve) AND on event day (catching last-
            minute drop-ins). */}
        <Card className="mt-3 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
            Latest registrations
          </p>
          {recentSignups.length === 0 ? (
            <p className="mt-3 text-hint text-emce-text-muted">No registrations yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-emce-border text-sm">
              {recentSignups.map((r) => {
                const name = `${r.candidate.firstName} ${r.candidate.lastName ?? ""}`.trim();
                const institution = r.candidate.education[0]?.institution ?? "";
                return (
                  <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/${r.candidate.slug}`} className="font-bold text-emce-text hover:underline">
                        {name}
                      </Link>
                      <span className="ml-2 text-hint text-emce-text-sec">{institution}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold tracking-wider text-emce-text-sec">{r.checkInCode}</span>
                      <Badge variant="outline" size="sm">{r.source.replace(/_/g, " ").toLowerCase()}</Badge>
                      <span className="text-hint text-emce-text-muted">{relativeTime(r.createdAt)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
  accent: "primary" | "ok" | "warn" | "neutral";
}) {
  const bg =
    accent === "primary" ? "border-emce-dark bg-gradient-to-br from-white to-emce-light-soft"
    : accent === "ok" ? "border-emce-mid bg-gradient-to-br from-white to-emce-mid-soft"
    : accent === "warn" ? "border-emce-amber bg-gradient-to-br from-white to-emce-amber-soft"
    : "border-emce-border bg-white";
  return (
    <Card className={`border-2 p-5 ${bg}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-emce-text">{value}</p>
      <p className="mt-1 text-hint">{sub}</p>
    </Card>
  );
}
