import Link from "next/link";
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
