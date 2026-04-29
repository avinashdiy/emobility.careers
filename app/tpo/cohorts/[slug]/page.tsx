import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getCohortFunnel, getCohortKpi, getUnplacedStudents } from "@/lib/tpo";
import { assignRosterToCohort } from "@/server/cohorts/actions";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Cohort detail" };

/**
 * Per-cohort dashboard. Same building blocks as the top-level
 * /tpo dashboard, scoped to one Cohort. The unplaced list and roster
 * tables are full (not capped at 8) since this is the deep-dive view.
 */
export default async function CohortDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cohort = await db.cohort.findUnique({
    where: { slug },
    include: {
      _count: { select: { rosterEntries: true, candidates: true } },
    },
  });
  if (!cohort) notFound();

  const [kpi, funnel, unplaced, roster, unassigned] = await Promise.all([
    getCohortKpi(cohort.id),
    getCohortFunnel(cohort.id),
    getUnplacedStudents(cohort.id, 50),
    db.dIYguruRoster.findMany({
      where: { cohortId: cohort.id },
      orderBy: { fullName: "asc" },
      take: 100,
    }),
    // Roster rows that don't yet belong to any cohort. The TPO ticks the
    // ones that should join this cohort and submits the form below; we
    // call assignRosterToCohort which also forwards the cohort id onto
    // already-claimed candidates so the funnel updates without a
    // re-claim.
    db.dIYguruRoster.findMany({
      where: { cohortId: null },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const peak = Math.max(1, ...funnel.map((f) => f.reached));

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/tpo/cohorts"
        backLabel="All cohorts"
        eyebrow="Cohort"
        title={cohort.name}
        subtitle={
          <>
            {cohort.courseName}
            {cohort.batchCode && <> · {cohort.batchCode}</>}
            {cohort.institution && <> · {cohort.institution}</>}
            {cohort.description && (
              <span className="block max-w-2xl pt-1 text-emce-text-sec">{cohort.description}</span>
            )}
          </>
        }
        actions={
          <Badge variant={cohort.status === "ACTIVE" ? "success" : "outline"}>
            {cohort.status}
          </Badge>
        }
      />

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Roster" value={kpi.rosterTotal} />
        <Kpi label="Claimed" value={kpi.claimed} hint={`${kpi.unclaimed} unclaimed`} />
        <Kpi label="In process" value={kpi.inProcess} />
        <Kpi label="Hired" value={kpi.hired} tone="ok" />
        <Kpi
          label="Placement %"
          value={`${kpi.placementRate}%`}
          tone={kpi.placementRate >= 50 ? "ok" : "warn"}
        />
        <Kpi label="Capacity" value={cohort.capacity ?? "—"} />
      </div>

      <Card>
        <SectionTitle title="Stage funnel" />
        <ul className="mt-4 space-y-2">
          {funnel.map((row) => (
            <li key={row.stage}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-emce-text">{STAGE_LABELS[row.stage] ?? row.stage}</span>
                <span className="text-emce-text-sec">
                  <strong className="text-emce-text">{row.reached}</strong> reached · {row.current} live
                  {row.dropoffPct > 0 && (
                    <span className="ml-2 rounded-full bg-emce-red-light px-2 py-0.5 text-[10px] font-bold text-emce-red">
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
                  style={{ width: `${Math.round((row.reached / peak) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionTitle
          title="Unplaced students"
          actions={<span className="text-hint text-emce-text-sec">{unplaced.length}</span>}
        />
        {unplaced.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon="🎉"
              title="Every claimed student here has a hire"
              body="Nothing to chase right now."
            />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-emce-border">
            {unplaced.map((s) => (
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
                    {s.headline ?? "No headline"}
                  </p>
                </div>
                <div className="text-right text-hint">
                  <p className="text-emce-text-sec">{s.applicationsCount} apps</p>
                  {s.lastAppliedAt ? (
                    <p className="text-emce-text-muted">
                      Last applied {relativeTime(new Date(s.lastAppliedAt))}
                    </p>
                  ) : (
                    <Badge variant="warning" className="text-[10px]">No applications</Badge>
                  )}
                </div>
                <Badge
                  variant={s.profileCompleteness >= 90 ? "success" : s.profileCompleteness >= 50 ? "warning" : "danger"}
                  className="text-[10px]"
                >
                  {s.profileCompleteness}%
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {unassigned.length > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-section text-emce-text">Add unassigned roster entries</h2>
            <span className="text-hint text-emce-text-sec">
              {unassigned.length} unassigned
            </span>
          </div>
          <p className="mt-1 text-hint text-emce-text-sec">
            These DIYguru roster entries don't belong to any cohort yet. Tick the ones that should join <strong>{cohort.name}</strong> and submit.
          </p>
          <form action={assignRosterToCohort} className="mt-3 space-y-2">
            <input type="hidden" name="cohortId" value={cohort.id} />
            <ul className="max-h-72 overflow-y-auto rounded-md border border-emce-border">
              {unassigned.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 border-b border-emce-border px-3 py-2 last:border-0"
                >
                  <input
                    type="checkbox"
                    name="rosterId"
                    value={r.id}
                    className="h-4 w-4 accent-emce-mid"
                    aria-label={`Assign ${r.fullName} to this cohort`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-emce-text">{r.fullName}</p>
                    <p className="truncate text-hint text-emce-text-sec">
                      {r.email}
                      {r.courseName && <> · {r.courseName}</>}
                      {r.grade && <> · grade {r.grade}</>}
                    </p>
                  </div>
                  {r.claimedAt && (
                    <Badge variant="success" className="text-[10px]">
                      ✓ Claimed
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
            <Button type="submit" size="sm">Assign to {cohort.name}</Button>
          </form>
        </Card>
      )}

      <Card>
        <SectionTitle
          title="Roster"
          actions={<span className="text-hint text-emce-text-sec">{cohort._count.rosterEntries} entries</span>}
        />
        {roster.length === 0 ? (
          <p className="mt-3 text-sm text-emce-text-sec">
            No roster entries yet. Upload a CSV at /admin/diyguru and pick this cohort as the target.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-emce-border text-left text-hint text-emce-text-sec">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Course</th>
                  <th className="py-2 pr-3">Grade</th>
                  <th className="py-2 pr-3">Claimed</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.id} className="border-b border-emce-border last:border-0">
                    <td className="py-2 pr-3 font-bold text-emce-text">{r.fullName}</td>
                    <td className="py-2 pr-3 text-emce-text-sec">{r.email}</td>
                    <td className="py-2 pr-3 text-emce-text-sec">{r.courseName ?? "—"}</td>
                    <td className="py-2 pr-3 text-emce-text-sec">{r.grade ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {r.claimedAt ? (
                        <Badge variant="success" className="text-[10px]">
                          ✓ {relativeTime(r.claimedAt)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Unclaimed</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
  tone?: "default" | "ok" | "warn";
}) {
  const toneClass =
    tone === "ok" ? "text-emce-mid-muted"
    : tone === "warn" ? "text-emce-orange"
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
