import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";

export const metadata: Metadata = { title: "Post-event report" };
export const dynamic = "force-dynamic";

/**
 * Post-event outcome report — what actually happened at the fair,
 * split by attendance mode so the placement team can answer "did
 * online work as well as offline?" with hard numbers.
 *
 * Renders a tabular breakdown across attendance modes (OFFLINE /
 * ONLINE / HYBRID) for the metrics that matter to a placement team:
 *
 *   1. Registered
 *   2. Checked-in (scanner OR online auto-check-in)
 *   3. Setup-tested (online-capable only)
 *   4. Booked at least one interview slot
 *   5. Completed at least one interview (slot → COMPLETED)
 *   6. Hired (Application.stage = HIRED, fair-attributed)
 *
 * Each metric is a single COUNT against indexed columns; the page
 * runs ~10 small queries in parallel. v2: write the rollup nightly
 * into a snapshot table so deep-link shares don't re-run queries.
 */

type ModeKey = "OFFLINE" | "ONLINE" | "HYBRID";
const MODE_LABELS: Record<ModeKey, string> = {
  OFFLINE: "📍 In-person",
  ONLINE: "💻 Online",
  HYBRID: "🌐 Hybrid",
};

export default async function RecruitathonReportPage({
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
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      endsAt: true,
      status: true,
      city: true,
      state: true,
    },
  });
  if (!drive) notFound();

  // Pull per-mode breakdowns in parallel. Each `groupBy` returns
  // rows we then merge into the three mode keys; null-mode rows
  // (legacy registrations without fairMode) get collapsed into an
  // "unspecified" row at the bottom of the table.
  const [
    regsByMode,
    checkInsByMode,
    setupTestedByMode,
    bookedSlotsRollup,
    completedSlotsRollup,
    hiresRollup,
    totalRegs,
    totalCheckIns,
    totalHires,
    totalCompleted,
  ] = await Promise.all([
    db.recruitmentDriveRegistration.groupBy({
      by: ["fairMode"],
      where: { driveId: drive.id, cancelledAt: null },
      _count: { _all: true },
    }),
    db.recruitmentDriveRegistration.groupBy({
      by: ["fairMode"],
      where: { driveId: drive.id, cancelledAt: null, checkedInAt: { not: null } },
      _count: { _all: true },
    }),
    db.recruitmentDriveRegistration.groupBy({
      by: ["fairMode"],
      where: { driveId: drive.id, cancelledAt: null, interviewReadyAt: { not: null } },
      _count: { _all: true },
    }),
    // For per-mode slot rollups we join via the slot's candidate
    // registration. Single $queryRaw is cleaner than a multi-hop
    // Prisma groupBy because we want to group by the REGISTRATION's
    // fairMode, not the slot's mode.
    db.$queryRaw<{ fairMode: ModeKey | null; n: bigint }[]>`
      SELECT r."fairMode" as "fairMode", COUNT(DISTINCT s.id) as n
      FROM "RecruitmentDriveInterviewSlot" s
      JOIN "RecruitmentDriveCompany" rc ON rc.id = s."driveCompanyId"
      JOIN "RecruitmentDriveRegistration" r
        ON r."candidateId" = s."candidateId" AND r."driveId" = rc."driveId"
      WHERE rc."driveId" = ${drive.id}
        AND s.status IN ('BOOKED', 'COMPLETED', 'NO_SHOW')
        AND r."cancelledAt" IS NULL
      GROUP BY r."fairMode"
    `,
    db.$queryRaw<{ fairMode: ModeKey | null; n: bigint }[]>`
      SELECT r."fairMode" as "fairMode", COUNT(DISTINCT s.id) as n
      FROM "RecruitmentDriveInterviewSlot" s
      JOIN "RecruitmentDriveCompany" rc ON rc.id = s."driveCompanyId"
      JOIN "RecruitmentDriveRegistration" r
        ON r."candidateId" = s."candidateId" AND r."driveId" = rc."driveId"
      WHERE rc."driveId" = ${drive.id}
        AND s.status = 'COMPLETED'
        AND r."cancelledAt" IS NULL
      GROUP BY r."fairMode"
    `,
    // Hires — applications scoped to this drive that reached HIRED,
    // grouped by the candidate's fairMode for THIS drive.
    db.$queryRaw<{ fairMode: ModeKey | null; n: bigint }[]>`
      SELECT r."fairMode" as "fairMode", COUNT(DISTINCT a.id) as n
      FROM "Application" a
      JOIN "RecruitmentDriveRegistration" r
        ON r."candidateId" = a."candidateId" AND r."driveId" = ${drive.id}
      WHERE a."recruitmentDriveId" = ${drive.id}
        AND a.stage = 'HIRED'
        AND r."cancelledAt" IS NULL
      GROUP BY r."fairMode"
    `,
    db.recruitmentDriveRegistration.count({
      where: { driveId: drive.id, cancelledAt: null },
    }),
    db.recruitmentDriveRegistration.count({
      where: { driveId: drive.id, cancelledAt: null, checkedInAt: { not: null } },
    }),
    db.application.count({
      where: { recruitmentDriveId: drive.id, stage: "HIRED" },
    }),
    db.recruitmentDriveInterviewSlot.count({
      where: { driveCompany: { driveId: drive.id }, status: "COMPLETED" },
    }),
  ]);

  // Pivot into a row-per-mode map with all 6 metrics + unspecified
  // bucket for legacy null-fairMode registrations.
  type Row = {
    registered: number;
    checkedIn: number;
    setupTested: number;
    booked: number;
    completed: number;
    hired: number;
  };
  const emptyRow = (): Row => ({
    registered: 0,
    checkedIn: 0,
    setupTested: 0,
    booked: 0,
    completed: 0,
    hired: 0,
  });
  const rows: Record<ModeKey | "UNSPECIFIED", Row> = {
    OFFLINE: emptyRow(),
    ONLINE: emptyRow(),
    HYBRID: emptyRow(),
    UNSPECIFIED: emptyRow(),
  };
  const pick = (m: ModeKey | null): keyof typeof rows => m ?? "UNSPECIFIED";
  for (const r of regsByMode) rows[pick(r.fairMode)].registered = r._count._all;
  for (const r of checkInsByMode) rows[pick(r.fairMode)].checkedIn = r._count._all;
  for (const r of setupTestedByMode) rows[pick(r.fairMode)].setupTested = r._count._all;
  for (const r of bookedSlotsRollup) rows[pick(r.fairMode)].booked = Number(r.n);
  for (const r of completedSlotsRollup) rows[pick(r.fairMode)].completed = Number(r.n);
  for (const r of hiresRollup) rows[pick(r.fairMode)].hired = Number(r.n);

  const place = [drive.city, drive.state].filter(Boolean).join(", ");
  const hasUnspecified = rows.UNSPECIFIED.registered > 0;

  return (
    <AdminShell>
      <div className="container max-w-5xl py-8">
        <Link
          href={`/admin/recruitathon/${drive.slug}`}
          className="text-xs font-bold text-emce-dark hover:underline"
        >
          ← Manage fair
        </Link>
        <h1 className="mt-1 text-dashboard text-emce-text">
          📊 Post-event report · {drive.title}
        </h1>
        <p className="mt-1 text-hint text-emce-text-sec">
          {drive.startsAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          {" — "}
          {drive.endsAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          {place && ` · ${place}`}
          {" · "}
          <Badge variant="outline" size="sm">{drive.status}</Badge>
        </p>

        {/* Top-line totals — quick scan for headline KPI without
            needing to add up the per-mode rows below. */}
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Tile label="Registered" value={totalRegs.toLocaleString()} />
          <Tile
            label="Checked in"
            value={`${totalCheckIns.toLocaleString()} (${totalRegs > 0 ? Math.round((totalCheckIns / totalRegs) * 100) : 0}%)`}
          />
          <Tile
            label="Completed interviews"
            value={totalCompleted.toLocaleString()}
          />
          <Tile
            label="Hired"
            value={totalHires.toLocaleString()}
            accent={totalHires > 0 ? "ok" : "neutral"}
          />
        </div>

        {/* Per-mode breakdown table. Conversion percentages computed
            in-row so the reader can compare offline vs online without
            mental arithmetic. */}
        <Card className="mt-6 overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-emce-border bg-emce-light-soft text-left text-hint font-bold uppercase tracking-wider text-emce-mid-muted">
                <th className="p-3">Mode</th>
                <th className="p-3 text-right">Registered</th>
                <th className="p-3 text-right">Checked in</th>
                <th className="p-3 text-right">Setup tested</th>
                <th className="p-3 text-right">Booked a slot</th>
                <th className="p-3 text-right">Completed</th>
                <th className="p-3 text-right">Hired</th>
                <th className="p-3 text-right">Hire rate</th>
              </tr>
            </thead>
            <tbody>
              {(["OFFLINE", "ONLINE", "HYBRID"] as const).map((m) => {
                const r = rows[m];
                const hireRate = r.registered > 0 ? (r.hired / r.registered) * 100 : 0;
                return (
                  <tr key={m} className="border-b border-emce-border last:border-0">
                    <td className="p-3 font-bold text-emce-text">{MODE_LABELS[m]}</td>
                    <td className="p-3 text-right tabular-nums">{r.registered}</td>
                    <td className="p-3 text-right tabular-nums">
                      {r.checkedIn}
                      {r.registered > 0 && (
                        <span className="ml-1 text-emce-text-muted">
                          ({Math.round((r.checkedIn / r.registered) * 100)}%)
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {m === "OFFLINE" ? (
                        <span className="text-emce-text-muted">—</span>
                      ) : (
                        r.setupTested
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">{r.booked}</td>
                    <td className="p-3 text-right tabular-nums">{r.completed}</td>
                    <td className="p-3 text-right tabular-nums">{r.hired}</td>
                    <td className="p-3 text-right tabular-nums font-bold">
                      {r.registered > 0 ? `${hireRate.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
              {hasUnspecified && (
                <tr className="border-t border-emce-border bg-emce-amber-soft/30">
                  <td className="p-3 italic text-emce-text-sec">
                    Unspecified
                    <span className="ml-2 text-hint text-emce-text-muted">
                      (pre-Phase 1 registrations)
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums">{rows.UNSPECIFIED.registered}</td>
                  <td className="p-3 text-right tabular-nums">{rows.UNSPECIFIED.checkedIn}</td>
                  <td className="p-3 text-right tabular-nums">—</td>
                  <td className="p-3 text-right tabular-nums">{rows.UNSPECIFIED.booked}</td>
                  <td className="p-3 text-right tabular-nums">{rows.UNSPECIFIED.completed}</td>
                  <td className="p-3 text-right tabular-nums">{rows.UNSPECIFIED.hired}</td>
                  <td className="p-3 text-right tabular-nums">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <p className="mt-6 text-hint text-emce-text-sec">
          Numbers reflect the fair&apos;s current state — re-run after
          recruiters close out their outstanding pipelines for a
          final view. <Link href={`/admin/recruitathon/${drive.slug}/candidates.csv`} className="font-bold text-emce-dark hover:underline">Download per-candidate CSV →</Link>
          {" · "}
          <a href="/api/admin/recruitathon/export" className="font-bold text-emce-dark hover:underline">Download detailed test-scores CSV →</a>
        </p>
      </div>
    </AdminShell>
  );
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "ok" | "neutral";
}) {
  return (
    <Card
      className={`p-4 ${
        accent === "ok" ? "border-emce-mid/40 bg-emce-light-soft/40" : ""
      }`}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold tabular-nums text-emce-text">
        {value}
      </p>
    </Card>
  );
}
