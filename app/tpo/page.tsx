import Link from "next/link";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getCohortFunnel,
  getCohortKpi,
  getRecentRequirementsCount,
  getUnplacedStudents,
  FUNNEL_STAGES,
} from "@/lib/tpo";
import { relativeTime } from "@/lib/utils";
import { TpoInviteLinkCard } from "@/components/recruitathon/TpoInviteLinkCard";
import { TpoLiveCheckInCard } from "@/components/recruitathon/TpoLiveCheckInCard";
import { claimRecruitathonStudent } from "@/server/colleges/actions";

export const metadata = { title: "Placement dashboard" };

/**
 * TPO landing — top-level placement overview across every DIYguru-
 * verified candidate. The cohort filter is at the URL level (`?cohort=`)
 * so URLs are shareable. When unset, we show the global pool.
 */
export default async function TpoDashboard({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string }>;
}) {
  const sp = await searchParams;
  const cohort = sp.cohort
    ? await db.cohort.findUnique({
        where: { slug: sp.cohort },
        select: { id: true, name: true, courseName: true },
      })
    : null;
  const cohortId = cohort?.id ?? null;

  const [kpi, funnel, unplaced, requirements, cohortOptions] = await Promise.all([
    getCohortKpi(cohortId),
    getCohortFunnel(cohortId),
    getUnplacedStudents(cohortId, 10),
    getRecentRequirementsCount(),
    db.cohort.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ batchCode: "desc" }, { createdAt: "desc" }],
      select: { slug: true, name: true },
      take: 50,
    }),
  ]);

  // ─── Invite-link card data ────────────────────────────────────
  // Only renders when the current TPO has an APPROVED placement
  // cell with a minted inviteToken. Admins (no cell) see nothing
  // here — they get the full cohort dashboard above + the admin
  // surfaces. The card lists the upcoming OPEN drives with the
  // TPO's shareable invite URL + how many students have used it
  // so far per fair.
  const session = await auth();
  const [inviteData, roster, claimQueue] = session?.user
    ? await Promise.all([
        loadInviteLinkData(session.user.id),
        loadTpoStudentRoster(session.user.id),
        loadTpoClaimQueue(session.user.id),
      ])
    : [null, null, null];

  const peakReached = Math.max(1, ...funnel.map((f) => f.reached));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Placement"
        title="Placement dashboard"
        subtitle={
          <>
            {kpi.cohortName}
            {cohort && <> · <span className="text-emce-text-muted">{cohort.courseName}</span></>}
          </>
        }
        actions={
          // Cohort filter — empty value = "All DIYguru" pool.
          <form className="flex items-center gap-2">
            <select
              name="cohort"
              defaultValue={sp.cohort ?? ""}
              className="rounded-md border border-emce-border bg-white px-3 py-1.5 text-sm"
            >
              <option value="">All DIYguru-verified</option>
              {cohortOptions.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-emce-dark px-3 py-1.5 text-sm font-bold text-white hover:bg-emce-darkest"
            >
              Apply
            </button>
          </form>
        }
      />

      {/* Live check-in card — only renders when at least one fair
          this TPO has students at is IN_PROGRESS. Surfaces real-time
          attendance from this college so the TPO can answer "how
          many of my students made it" without leaving the dashboard. */}
      {inviteData && inviteData.liveFairs.length > 0 && (
        <TpoLiveCheckInCard
          collegeName={inviteData.collegeName}
          liveFairs={inviteData.liveFairs}
        />
      )}

      {/* Invite-link card — top of page so it's the first thing a
          TPO sees post-approval. Hidden for admins (no cell) and
          for cells in PENDING/REJECTED status (no token to share). */}
      {inviteData && (
        <TpoInviteLinkCard
          collegeName={inviteData.collegeName}
          inviteUrls={inviteData.inviteUrls}
          perFair={inviteData.perFair}
        />
      )}

      {/* Claim queue — students who registered directly (not via your
          link) whose college matches yours but who weren't auto-
          attributed (a fuzzy name match, or a typo). One click adds
          them to your roster. */}
      {claimQueue && claimQueue.candidates.length > 0 && (
        <Card className="border-emce-amber/50 bg-emce-amber-soft/40">
          <SectionTitle
            title={`Students who look like yours · ${claimQueue.candidates.length}`}
            description={`These registered directly (not via your link) and typed a college that matches ${claimQueue.collegeName}, but weren't auto-matched. Claim the ones that are yours.`}
          />
          <ul className="mt-4 space-y-2">
            {claimQueue.candidates.map((c) => (
              <li
                key={c.registrationId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emce-border bg-white p-3"
              >
                <div className="min-w-0">
                  {c.slug ? (
                    <Link href={`/${c.slug}`} className="font-bold text-emce-dark hover:underline">
                      {c.name}
                    </Link>
                  ) : (
                    <span className="font-bold text-emce-text">{c.name}</span>
                  )}
                  <div className="text-hint text-emce-text-muted">
                    Typed &ldquo;{c.typedCollege}&rdquo; · {c.driveTitle}
                    {c.linked ? " · auto-linked to your college" : " · name match"}
                  </div>
                </div>
                <form action={claimRecruitathonStudent}>
                  <input type="hidden" name="registrationId" value={c.registrationId} />
                  <button
                    type="submit"
                    className="rounded-md bg-emce-dark px-3 py-1.5 text-sm font-bold text-white hover:bg-emce-darkest"
                  >
                    + Add to my roster
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Registered-students roster — the named list of every student
          who registered via this college's invite link, across all
          fairs. Answers "exactly who registered", complementing the
          counts in the invite-link card. Most-recent 50 shown inline;
          the full set (and richer columns) is one click away via the
          CSV export. */}
      {roster && roster.total > 0 && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionTitle
              title={`Registered students · ${roster.total}`}
              description={`Everyone from ${roster.collegeName} who registered via your invite link.`}
            />
            <a
              href="/tpo/students.csv"
              className="shrink-0 rounded-md border border-emce-border bg-white px-3 py-1.5 text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
            >
              ⬇ Download CSV
            </a>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-emce-border text-hint uppercase tracking-wide text-emce-text-muted">
                  <th className="py-2 pr-3 font-bold">Student</th>
                  <th className="py-2 pr-3 font-bold">Fair</th>
                  <th className="py-2 pr-3 font-bold">Mode</th>
                  <th className="py-2 pr-3 font-bold">Profile</th>
                  <th className="py-2 pr-3 font-bold">Status</th>
                  <th className="py-2 pr-3 font-bold">Registered</th>
                </tr>
              </thead>
              <tbody>
                {roster.students.map((s, i) => (
                  <tr key={i} className="border-b border-emce-border/60">
                    <td className="py-2 pr-3">
                      {s.slug ? (
                        <Link href={`/${s.slug}`} className="font-bold text-emce-dark hover:underline">
                          {s.name}
                        </Link>
                      ) : (
                        <span className="font-bold text-emce-text">{s.name}</span>
                      )}
                      <div className="text-hint text-emce-text-muted">
                        {[s.email, s.phone].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-emce-text-sec">{s.driveTitle}</td>
                    <td className="py-2 pr-3">
                      {s.fairMode ? <Badge variant="default">{s.fairMode}</Badge> : "—"}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-emce-text-sec">
                      {s.profileCompleteness}%
                    </td>
                    <td className="py-2 pr-3">
                      {s.checkedIn ? (
                        <Badge variant="success">Checked in</Badge>
                      ) : (
                        <span className="text-emce-text-muted">Registered</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-hint text-emce-text-muted">
                      {relativeTime(s.registeredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {roster.total > roster.students.length && (
            <p className="mt-3 text-hint text-emce-text-muted">
              Showing the most recent {roster.students.length} of {roster.total}.
              Download the CSV for the full list with contact details, skills,
              EV domains and more.
            </p>
          )}
        </Card>
      )}

      {/* KPI strip — six tiles, LinkedIn-density */}
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Roster" value={kpi.rosterTotal} hint="CSV-imported students" />
        <Kpi
          label="Claimed"
          value={kpi.claimed}
          hint={`${kpi.unclaimed} unclaimed`}
          tone="info"
        />
        <Kpi label="In process" value={kpi.inProcess} hint="Active applications" tone="info" />
        <Kpi label="Hired" value={kpi.hired} hint="Placed students" tone="ok" />
        <Kpi
          label="Placement rate"
          value={`${kpi.placementRate}%`}
          hint="Hired / Claimed"
          tone={kpi.placementRate >= 50 ? "ok" : "warn"}
        />
        <Kpi
          label="New requirements"
          value={requirements.last24h}
          hint={`${requirements.last7d} in last 7d`}
          tone="info"
        />
      </div>

      {/* Funnel chart — stage-by-stage horizontal bars with drop-off pct. */}
      <Card>
        <SectionTitle
          title="Stage funnel"
          description={`"Reached" counts every application that ever touched the stage.`}
        />
        <ul className="mt-4 space-y-2">
          {funnel.map((row) => {
            const pct = Math.round((row.reached / peakReached) * 100);
            return (
              <li key={row.stage}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-emce-text">
                    {STAGE_LABELS[row.stage] ?? row.stage}
                  </span>
                  <span className="text-emce-text-sec">
                    <strong className="text-emce-text">{row.reached}</strong> reached
                    {" · "}
                    <span>{row.current} live</span>
                    {row.dropoffPct > 0 && (
                      <span className="ml-2 rounded-full bg-emce-red-light px-2 py-0.5 text-[10px] font-bold text-emce-red-deep">
                        −{row.dropoffPct}% drop
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1 h-3 overflow-hidden rounded-full bg-emce-light-soft">
                  <div
                    className={`h-full ${
                      row.stage === "HIRED" ? "bg-emce-mid-muted"
                      : row.stage === "REJECTED" ? "bg-emce-red"
                      : "bg-emce-mid"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Unplaced — the daily work queue */}
      <Card>
        <SectionTitle
          title="Still unplaced"
          actions={
            <Link href="/tpo/unplaced" className="text-xs font-bold text-emce-dark hover:underline">
              See all →
            </Link>
          }
        />
        {unplaced.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon="🎉"
              title="Everyone here has a hire"
              body="Great quarter — try a different cohort filter to see other groups."
            />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-emce-border">
            {unplaced.slice(0, 8).map((s) => (
              <li key={s.candidateId} className="flex items-center gap-3 py-2.5">
                <Avatar src={s.profilePhotoUrl} name={s.fullName} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/${s.slug}`}
                    className="block font-bold text-emce-text hover:underline"
                  >
                    {s.fullName}
                  </Link>
                  <p className="line-clamp-1 text-hint text-emce-text-sec">
                    {s.headline ?? "No headline"} · {s.cohortName ?? "No cohort"}
                  </p>
                </div>
                <div className="text-right text-hint">
                  <p className="text-emce-text-sec">{s.applicationsCount} applications</p>
                  {s.lastAppliedAt ? (
                    <p className="text-emce-text-muted">
                      Last applied {relativeTime(new Date(s.lastAppliedAt))}
                    </p>
                  ) : (
                    <Badge variant="warning" className="text-[10px]">
                      No applications yet
                    </Badge>
                  )}
                </div>
                <Badge
                  variant={s.profileCompleteness >= 90 ? "success" : s.profileCompleteness >= 50 ? "warning" : "danger"}
                  className="text-[10px]"
                >
                  {s.profileCompleteness}% complete
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "info" | "ok" | "warn";
}) {
  const toneClass =
    tone === "ok" ? "text-emce-mid-muted"
    : tone === "warn" ? "text-emce-orange-deep"
    : tone === "info" ? "text-emce-dark"
    : "text-emce-text";
  return (
    <Card>
      <p className="text-[10px] font-bold uppercase tracking-wide text-emce-text-sec">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-hint text-emce-text-muted">{hint}</p>}
    </Card>
  );
}

const STAGE_LABELS: Record<string, string> = {
  APPLIED: "Applied",
  SCREENED: "Screened",
  SHORTLISTED: "Shortlisted",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

// Just so the stages export is referenced — keeps TS noUnusedLocals happy if
// future dashboards consume this file's range vs. lib/tpo's own export.
void FUNNEL_STAGES;

/**
 * Resolve the data the TpoInviteLinkCard needs for the currently-
 * signed-in user. Returns null when the user has no APPROVED
 * placement cell (admin viewing /tpo, or pending TPO).
 *
 * Three queries — kept here vs lib/tpo because the card is local to
 * this page right now; extract if a second consumer materialises.
 */
interface LiveCheckInFair {
  driveTitle: string;
  driveSlug: string;
  totalRegistered: number;
  checkedIn: number;
  recentlyCheckedIn: {
    candidateName: string;
    candidateSlug: string;
    checkedInAt: Date;
  }[];
}

async function loadInviteLinkData(userId: string): Promise<
  | null
  | {
      collegeName: string;
      inviteUrls: { driveSlug: string; driveTitle: string; url: string; registeredCount: number }[];
      perFair: { driveTitle: string; registeredCount: number; profileCompletePct: number; checkedInCount: number }[];
      liveFairs: LiveCheckInFair[];
    }
> {
  const cell = await db.collegePlacementCell.findFirst({
    where: { createdById: userId, status: "APPROVED", inviteToken: { not: null } },
    select: {
      id: true,
      inviteToken: true,
      institution: { select: { name: true } },
    },
  });
  if (!cell || !cell.inviteToken) return null;

  // Upcoming drives = OPEN or IN_PROGRESS with endsAt in the future.
  // Limit to 4 so the card doesn't grow unbounded across multiple
  // fair series.
  const drives = await db.recruitmentDrive.findMany({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS"] },
      endsAt: { gte: new Date() },
    },
    orderBy: { startsAt: "asc" },
    take: 4,
    select: { slug: true, title: true },
  });

  // Per-drive counts via groupBy — one query for all upcoming fairs.
  const counts = await db.recruitmentDriveRegistration.groupBy({
    by: ["driveId"],
    where: {
      viaTpoCellId: cell.id,
      drive: { slug: { in: drives.map((d) => d.slug) } },
    },
    _count: { _all: true },
  });
  // GroupBy returns driveId, but we have slug — map via a second cheap lookup.
  const driveIdToSlug = new Map<string, string>();
  if (drives.length > 0) {
    const driveRows = await db.recruitmentDrive.findMany({
      where: { slug: { in: drives.map((d) => d.slug) } },
      select: { id: true, slug: true },
    });
    for (const d of driveRows) driveIdToSlug.set(d.id, d.slug);
  }
  const countBySlug = new Map<string, number>();
  for (const c of counts) {
    const slug = driveIdToSlug.get(c.driveId);
    if (slug) countBySlug.set(slug, c._count._all);
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const inviteUrls = drives.map((d) => ({
    driveSlug: d.slug,
    driveTitle: d.title,
    url: `${appUrl}/fairs/${d.slug}/register?as=candidate&tpo=${cell.inviteToken}`,
    registeredCount: countBySlug.get(d.slug) ?? 0,
  }));

  // perFair — across ALL drives (not just upcoming) where this cell
  // referred students. Lets the TPO see historical performance even
  // after a fair closes.
  const allRegistrations = await db.recruitmentDriveRegistration.findMany({
    where: { viaTpoCellId: cell.id },
    select: {
      checkedInAt: true,
      candidate: { select: { profileCompleteness: true } },
      drive: { select: { id: true, title: true } },
    },
  });
  const perFairMap = new Map<
    string,
    { driveTitle: string; registeredCount: number; profileSum: number; checkedInCount: number }
  >();
  for (const r of allRegistrations) {
    const key = r.drive.id;
    const row = perFairMap.get(key) ?? {
      driveTitle: r.drive.title,
      registeredCount: 0,
      profileSum: 0,
      checkedInCount: 0,
    };
    row.registeredCount += 1;
    row.profileSum += r.candidate.profileCompleteness;
    if (r.checkedInAt) row.checkedInCount += 1;
    perFairMap.set(key, row);
  }
  const perFair = Array.from(perFairMap.values()).map((row) => ({
    driveTitle: row.driveTitle,
    registeredCount: row.registeredCount,
    profileCompletePct: row.registeredCount > 0 ? Math.round(row.profileSum / row.registeredCount) : 0,
    checkedInCount: row.checkedInCount,
  }));

  // ─── Live check-in data (IN_PROGRESS fairs only) ──────────
  // Only loads when at least one fair is currently running, so the
  // TPO dashboard doesn't pay the cost on a typical day. The card
  // surfaces "X of Y students checked in" + the 5 most recent
  // check-ins with name + time.
  const liveDrives = await db.recruitmentDrive.findMany({
    where: { status: "IN_PROGRESS" },
    select: { id: true, slug: true, title: true },
  });
  const liveFairs: LiveCheckInFair[] = [];
  for (const d of liveDrives) {
    const regs = await db.recruitmentDriveRegistration.findMany({
      where: { driveId: d.id, viaTpoCellId: cell.id, cancelledAt: null },
      select: {
        checkedInAt: true,
        candidate: { select: { slug: true, firstName: true, lastName: true } },
      },
    });
    if (regs.length === 0) continue; // skip fairs with no students from this college
    const checkedIn = regs.filter((r) => r.checkedInAt).length;
    const recentlyCheckedIn = regs
      .filter((r) => r.checkedInAt)
      .sort((a, b) => (b.checkedInAt!.getTime() - a.checkedInAt!.getTime()))
      .slice(0, 5)
      .map((r) => ({
        candidateName: `${r.candidate.firstName} ${r.candidate.lastName ?? ""}`.trim(),
        candidateSlug: r.candidate.slug,
        checkedInAt: r.checkedInAt!,
      }));
    liveFairs.push({
      driveTitle: d.title,
      driveSlug: d.slug,
      totalRegistered: regs.length,
      checkedIn,
      recentlyCheckedIn,
    });
  }

  return {
    collegeName: cell.institution.name,
    inviteUrls,
    perFair,
    liveFairs,
  };
}

/**
 * Named roster of every student who registered for any Recruitathon via
 * this TPO's invite link (viaTpoCellId = cell.id). The dashboard renders
 * the most-recent 50 inline; the full set is exported by
 * /tpo/students.csv. Returns null when the viewer has no approved cell
 * (admins, pending applications) so the section hides cleanly.
 */
async function loadTpoStudentRoster(userId: string): Promise<{
  collegeName: string;
  total: number;
  students: {
    name: string;
    email: string | null;
    phone: string | null;
    slug: string | null;
    driveTitle: string;
    fairMode: string | null;
    profileCompleteness: number;
    checkedIn: boolean;
    registeredAt: Date;
  }[];
} | null> {
  const cell = await db.collegePlacementCell.findFirst({
    where: { createdById: userId, status: "APPROVED" },
    select: { id: true, institution: { select: { name: true } } },
  });
  if (!cell) return null;

  const [total, regs] = await Promise.all([
    db.recruitmentDriveRegistration.count({ where: { viaTpoCellId: cell.id } }),
    db.recruitmentDriveRegistration.findMany({
      where: { viaTpoCellId: cell.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        createdAt: true,
        checkedInAt: true,
        fairMode: true,
        drive: { select: { title: true } },
        candidate: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            slug: true,
            profileCompleteness: true,
          },
        },
      },
    }),
  ]);

  return {
    collegeName: cell.institution.name,
    total,
    students: regs.map((r) => ({
      name: `${r.candidate.firstName} ${r.candidate.lastName ?? ""}`.trim(),
      email: r.candidate.email,
      phone: r.candidate.phone,
      slug: r.candidate.slug,
      driveTitle: r.drive.title,
      fairMode: r.fairMode,
      profileCompleteness: r.candidate.profileCompleteness,
      checkedIn: Boolean(r.checkedInAt),
      registeredAt: r.createdAt,
    })),
  };
}

/**
 * Students who registered DIRECTLY (viaTpoCellId IS NULL) but whose
 * college matches this TPO's institution — either their Education was
 * fuzzy-linked to the canonical institution, or their typed college
 * name is a strong trigram match. These weren't auto-attributed (only
 * picked/email/alias matches are), so the TPO confirms them by hand.
 * Excludes anyone already attributed to any cell.
 */
async function loadTpoClaimQueue(userId: string): Promise<{
  collegeName: string;
  candidates: {
    registrationId: string;
    name: string;
    slug: string | null;
    typedCollege: string;
    driveTitle: string;
    linked: boolean;
  }[];
} | null> {
  const cell = await db.collegePlacementCell.findFirst({
    where: { createdById: userId, status: "APPROVED" },
    select: {
      institutionId: true,
      institution: { select: { name: true, shortName: true } },
    },
  });
  if (!cell) return null;

  const rows = await db.$queryRaw<
    {
      registrationId: string;
      firstName: string;
      lastName: string | null;
      slug: string | null;
      typedCollege: string | null;
      driveTitle: string;
      linked: boolean;
    }[]
  >`
    SELECT reg.id AS "registrationId",
           cand."firstName", cand."lastName", cand.slug,
           edu.institution AS "typedCollege",
           drive.title AS "driveTitle",
           (edu."institutionId" = ${cell.institutionId}) AS "linked"
    FROM "RecruitmentDriveRegistration" reg
    JOIN "CandidateProfile" cand ON cand.id = reg."candidateId"
    JOIN "RecruitmentDrive" drive ON drive.id = reg."driveId"
    LEFT JOIN LATERAL (
      SELECT institution, "institutionId"
      FROM "Education" e
      WHERE e."candidateId" = cand.id
      ORDER BY e."createdAt" ASC
      LIMIT 1
    ) edu ON true
    WHERE reg."viaTpoCellId" IS NULL
      AND (
        edu."institutionId" = ${cell.institutionId}
        OR similarity(coalesce(edu.institution, ''), ${cell.institution.name}) > 0.4
        OR similarity(coalesce(edu.institution, ''), ${cell.institution.shortName ?? ""}) > 0.4
      )
    ORDER BY reg."createdAt" DESC
    LIMIT 30
  `.catch(() => []);

  return {
    collegeName: cell.institution.name,
    candidates: rows.map((r) => ({
      registrationId: r.registrationId,
      name: `${r.firstName} ${r.lastName ?? ""}`.trim(),
      slug: r.slug,
      typedCollege: r.typedCollege ?? "—",
      driveTitle: r.driveTitle,
      linked: Boolean(r.linked),
    })),
  };
}
