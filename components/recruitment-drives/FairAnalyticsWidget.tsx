import { Card } from "@/components/ui/card";
import type { FairAnalytics } from "@/lib/recruitment-drive-analytics";

/**
 * Per-fair analytics widget for the admin detail page. Three
 * panels in one card:
 *
 *   1. Funnel bar chart — Applications at each ATS stage. Read
 *      left-to-right as the candidate journey. Visualises drop-
 *      off between consecutive stages.
 *   2. Daily applies sparkline — 30-day activity. Same SVG
 *      pattern as HiringVelocityChart on /pulse so it looks
 *      consistent across surfaces.
 *   3. Top roles list — top 5 jobs by application count, with
 *      the company name + share-of-total %.
 *
 * Server component (we only render data; no client interactivity
 * needed). Empty / zero-state collapses gracefully — a fair with
 * 0 applications still renders the card with "No applications
 * yet" copy instead of breaking layout.
 */
export function FairAnalyticsWidget({ data }: { data: FairAnalytics }) {
  const hasAny = data.totalApplications > 0;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-section text-emce-text">Analytics</h2>
          <p className="text-hint text-emce-text-sec">
            Funnel + daily applies for this fair.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Stat label="Applications" value={data.totalApplications} />
          <Stat label="Unique candidates" value={data.uniqueCandidates} />
        </div>
      </div>

      {!hasAny ? (
        <p className="mt-6 text-center text-hint text-emce-text-muted">
          No applications yet. Once candidates apply via the public fair page
          they show up here.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          <FunnelBars funnel={data.funnel} total={data.totalApplications} />
          <DailySparkline daily={data.daily} />
          <TopRoles roles={data.topRoles} total={data.totalApplications} />
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-right">
      <div className="text-2xl font-extrabold text-emce-darkest">{value}</div>
      <div className="text-hint text-emce-text-muted">{label}</div>
    </div>
  );
}

/**
 * Horizontal bar chart for the funnel. Each bar is a stage; bar
 * length proportional to that stage's count vs the largest bucket
 * (which is usually APPLIED). Zero-count stages still render so
 * the candidate journey is visible top-to-bottom even when no one
 * has reached the late stages yet.
 */
function FunnelBars({
  funnel,
  total,
}: {
  funnel: { stage: string; count: number }[];
  total: number;
}) {
  const max = Math.max(...funnel.map((f) => f.count), 1);
  return (
    <div>
      <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
        Stage funnel
      </p>
      <ul className="mt-2 space-y-1.5">
        {funnel.map((f) => {
          const pct = total > 0 ? Math.round((f.count / total) * 100) : 0;
          const widthPct = max > 0 ? (f.count / max) * 100 : 0;
          return (
            <li key={f.stage} className="grid grid-cols-12 items-center gap-2 text-sm">
              <span className="col-span-3 text-emce-text-sec">
                {prettyStage(f.stage)}
              </span>
              <div className="col-span-7 h-3 overflow-hidden rounded-full bg-emce-light-soft">
                <div
                  className={`h-full rounded-full ${barColor(f.stage)}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="col-span-2 text-right font-bold text-emce-text">
                {f.count}{" "}
                <span className="text-hint font-normal text-emce-text-muted">
                  ({pct}%)
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function prettyStage(stage: string): string {
  return stage.charAt(0) + stage.slice(1).toLowerCase().replace(/_/g, " ");
}

function barColor(stage: string): string {
  // Green for "good outcomes", orange/amber for in-flight, red
  // for terminal-no, grey for terminal-out. Same colour story as
  // the candidate-side application tracker so admins reading the
  // funnel don't have to learn a new palette.
  switch (stage) {
    case "HIRED":
    case "OFFER":
      return "bg-emce-dark";
    case "INTERVIEW":
    case "SHORTLISTED":
      return "bg-emce-mid";
    case "ASSESSMENT":
    case "SCREENED":
      return "bg-emce-orange";
    case "REJECTED":
      return "bg-emce-red";
    case "WITHDRAWN":
      return "bg-emce-text-muted";
    default:
      return "bg-emce-darkest";
  }
}

/**
 * 30-day applies sparkline. Hand-built SVG (no chart library) —
 * matches the HiringVelocityChart pattern used on /pulse. WoW
 * delta is computed inline; we don't render a separate WoW chip
 * because the admin widget is space-constrained.
 */
function DailySparkline({
  daily,
}: {
  daily: { date: string; count: number }[];
}) {
  const WIDTH = 600;
  const HEIGHT = 80;
  const PAD = 6;
  const max = Math.max(1, ...daily.map((d) => d.count));
  const stepX = (WIDTH - 2 * PAD) / Math.max(1, daily.length - 1);
  const points = daily.map((d, i) => {
    const x = PAD + i * stepX;
    const y = HEIGHT - PAD - ((d.count / max) * (HEIGHT - 2 * PAD));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = points.join(" ");
  const areaPath = `${PAD},${HEIGHT - PAD} ${linePath} ${PAD + (daily.length - 1) * stepX},${HEIGHT - PAD}`;

  // Last 7 vs prior 7 — a coarse "is this trending" indicator.
  const last7 = daily.slice(-7).reduce((a, d) => a + d.count, 0);
  const prev7 = daily.slice(-14, -7).reduce((a, d) => a + d.count, 0);
  const wowPct = prev7 === 0 ? (last7 > 0 ? 100 : 0) : Math.round(((last7 - prev7) / prev7) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
          Daily applies · 30 days
        </p>
        <p className="text-hint">
          <span className="font-bold text-emce-text">{last7}</span>{" "}
          <span className="text-emce-text-muted">last 7d</span>
          {prev7 > 0 && (
            <>
              {" · "}
              <span
                className={
                  wowPct > 0
                    ? "font-bold text-emce-darkest"
                    : wowPct < 0
                      ? "font-bold text-emce-red"
                      : "text-emce-text-muted"
                }
              >
                {wowPct > 0 ? "↑" : wowPct < 0 ? "↓" : "—"} {Math.abs(wowPct)}% WoW
              </span>
            </>
          )}
        </p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-20 w-full min-w-[400px]"
          role="img"
          aria-label="Daily fair applications over the last 30 days"
        >
          <polygon points={areaPath} fill="#374a47" fillOpacity="0.15" />
          <polyline
            points={linePath}
            fill="none"
            stroke="#374a47"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="mt-1 flex items-center justify-between text-hint text-emce-text-muted">
        <span>{daily[0]?.date}</span>
        <span>peak: {max}</span>
        <span>{daily[daily.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function TopRoles({
  roles,
  total,
}: {
  roles: { jobId: string; jobTitle: string; companyName: string; count: number }[];
  total: number;
}) {
  if (roles.length === 0) return null;
  return (
    <div>
      <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
        Top roles by applications
      </p>
      <ul className="mt-2 space-y-1.5">
        {roles.map((r, i) => {
          const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
          return (
            <li
              key={r.jobId}
              className="flex flex-wrap items-center gap-2 rounded-md border border-emce-border bg-white p-2 text-sm"
            >
              <span className="font-bold text-emce-text-muted">#{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-emce-text">{r.jobTitle}</p>
                <p className="text-hint text-emce-text-sec">{r.companyName}</p>
              </div>
              <span className="font-bold text-emce-darkest">{r.count}</span>
              <span className="text-hint text-emce-text-muted">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
