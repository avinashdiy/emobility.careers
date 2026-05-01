import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminShell } from "@/components/layout/admin-shell";
import { ApplicationStage } from "@prisma/client";
import { Download } from "lucide-react";

export const metadata = { title: "Analytics" };

const STAGES_FUNNEL: ApplicationStage[] = [
  "APPLIED", "SCREENED", "SHORTLISTED", "ASSESSMENT", "INTERVIEW", "OFFER", "HIRED",
];

const PRESETS: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
];

function parseRange(sp: { range?: string; from?: string; to?: string }) {
  // Custom range wins if both endpoints look like dates. Otherwise we
  // fall back to a preset. Default 30d so the page works without any
  // searchParams at all.
  if (sp.from && sp.to) {
    const from = new Date(sp.from);
    const to = new Date(sp.to);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from < to) {
      return { from, to, label: `${sp.from} → ${sp.to}` };
    }
  }
  const preset = PRESETS.find((p) => p.label === sp.range) ?? PRESETS[1];
  const to = new Date();
  const from = new Date(to.getTime() - preset.days * 24 * 3600 * 1000);
  return { from, to, label: `last ${preset.label}` };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const { from, to, label } = parseRange(sp);

  // 7-day window for the "this week" tier — independent of the
  // user-selected range, so the dashboard always shows momentum even
  // when zoomed out to 1y.
  const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [
    signupsRange,
    signups7,
    candidatesRange,
    employersRange,
    jobsPublishedRange,
    applicationsRange,
    hiresRange,
    diyguruVerified,
    diyguruNonVerified,
    funnel,
  ] = await Promise.all([
    db.user.count({ where: { createdAt: { gte: from, lte: to } } }),
    db.user.count({ where: { createdAt: { gte: since7 } } }),
    db.user.count({ where: { role: "CANDIDATE", createdAt: { gte: from, lte: to } } }),
    db.user.count({ where: { role: "EMPLOYER", createdAt: { gte: from, lte: to } } }),
    db.jobPosting.count({ where: { publishedAt: { gte: from, lte: to } } }),
    db.application.count({ where: { appliedAt: { gte: from, lte: to } } }),
    db.application.count({ where: { stage: "HIRED", updatedAt: { gte: from, lte: to } } }),
    db.candidateProfile.count({ where: { isDIYguruVerified: true } }),
    db.candidateProfile.count({ where: { isDIYguruVerified: false } }),
    Promise.all(
      STAGES_FUNNEL.map((stage) =>
        db.application.count({ where: { stage } }).then((count) => ({ stage, count })),
      ),
    ),
  ]);

  // Average time-in-stage from StageHistory — bound to selected range
  // so the rolling window narrative tracks the rest of the page.
  const stageHistorySample = await db.stageHistory.findMany({
    where: { at: { gte: from, lte: to }, fromStage: { not: null } },
    select: { applicationId: true, fromStage: true, toStage: true, at: true },
    orderBy: [{ applicationId: "asc" }, { at: "asc" }],
    take: 5000,
  });
  const stageDurations: Record<string, number[]> = {};
  const lastByApp = new Map<string, { stage: ApplicationStage; at: Date }>();
  for (const h of stageHistorySample) {
    const prev = lastByApp.get(h.applicationId);
    if (prev && h.fromStage === prev.stage) {
      const ms = h.at.getTime() - prev.at.getTime();
      const key = `${prev.stage}→${h.toStage}`;
      (stageDurations[key] ??= []).push(ms);
    }
    lastByApp.set(h.applicationId, { stage: h.toStage, at: h.at });
  }
  const avgDurations = Object.fromEntries(
    Object.entries(stageDurations).map(([k, arr]) => [k, arr.reduce((a, b) => a + b, 0) / arr.length]),
  );

  const exportQuery = sp.from && sp.to ? `?from=${sp.from}&to=${sp.to}` : sp.range ? `?range=${sp.range}` : "";

  return (
    <AdminShell>
      <div className="container max-w-6xl py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-dashboard text-emce-text">Analytics</h1>
            <p className="mt-1 text-sm text-emce-text-sec">Showing {label}.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a
              href={`/api/admin/analytics/export${exportQuery}`}
              download
              aria-label="Download analytics CSV"
            >
              <Download className="mr-1 h-4 w-4" aria-hidden /> Export CSV
            </a>
          </Button>
        </div>

        {/* Range picker — preset chips + custom from/to form. */}
        <Card className="mt-4 p-4">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick date range">
            {PRESETS.map((p) => {
              const active = (sp.range ?? "30d") === p.label && !sp.from;
              return (
                <Link
                  key={p.label}
                  href={`/admin/analytics?range=${p.label}`}
                  aria-pressed={active}
                  className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                    active
                      ? "bg-emce-dark text-emce-light"
                      : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
                  }`}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
          <form
            method="get"
            action="/admin/analytics"
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <div className="flex flex-col text-xs">
              <label htmlFor="from" className="font-bold uppercase tracking-wide text-emce-text-muted">From</label>
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={sp.from ?? ""}
                className="mt-0.5 rounded-md border border-emce-border px-2 py-1 text-sm"
              />
            </div>
            <div className="flex flex-col text-xs">
              <label htmlFor="to" className="font-bold uppercase tracking-wide text-emce-text-muted">To</label>
              <input
                id="to"
                name="to"
                type="date"
                defaultValue={sp.to ?? ""}
                className="mt-0.5 rounded-md border border-emce-border px-2 py-1 text-sm"
              />
            </div>
            <Button type="submit" size="sm" variant="outline">Apply</Button>
            {(sp.from || sp.range !== "30d") && (
              <Link
                href="/admin/analytics"
                className="text-xs font-bold text-emce-dark hover:underline"
              >
                Reset
              </Link>
            )}
          </form>
        </Card>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Stat value={signupsRange} label={`Signups · ${label}`} sub={`${signups7} (7d)`} />
          <Stat value={candidatesRange} label="Candidate signups" />
          <Stat value={employersRange} label="Employer signups" />
          <Stat value={hiresRange} label="Hires" />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Stat value={jobsPublishedRange} label="Jobs published" />
          <Stat value={applicationsRange} label="Applications" />
          <Stat
            value={`${Math.round((diyguruVerified / Math.max(1, diyguruVerified + diyguruNonVerified)) * 100)}%`}
            label="DIYguru verified"
            sub={`${diyguruVerified} of ${diyguruVerified + diyguruNonVerified}`}
          />
        </div>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">Application funnel (all-time)</h2>
          <ul className="mt-4 space-y-3">
            {funnel.map((s, i) => {
              const max = funnel[0].count || 1;
              const pct = (s.count / max) * 100;
              const conv = i > 0 ? Math.round((s.count / Math.max(1, funnel[i - 1].count)) * 100) : 100;
              return (
                <li key={s.stage}>
                  <div className="flex items-center justify-between text-hint text-emce-text-sec">
                    <span><strong className="text-emce-text">{s.stage}</strong> · {s.count.toLocaleString()}</span>
                    {i > 0 && <Badge variant={conv > 50 ? "success" : conv > 20 ? "warning" : "danger"}>{conv}% from prev</Badge>}
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-emce-border">
                    <div className="h-full bg-emce-mid" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">Avg time in stage ({label})</h2>
          {Object.keys(avgDurations).length === 0 ? (
            <p className="mt-2 text-hint text-emce-text-sec">No stage transitions in this window.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {Object.entries(avgDurations).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between text-hint">
                  <span className="text-emce-text-sec">{k}</span>
                  <span className="font-bold text-emce-text">{(v / 3600000).toFixed(1)}h</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

function Stat({ value, label, sub }: { value: number | string; label: string; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="text-3xl font-extrabold text-emce-dark">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="mt-1 text-xs uppercase tracking-wide text-emce-text-muted">{label}</div>
      {sub && <div className="mt-1 text-hint text-emce-text-sec">{sub}</div>}
    </Card>
  );
}
