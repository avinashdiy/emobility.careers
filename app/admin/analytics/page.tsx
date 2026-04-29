import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { ApplicationStage } from "@prisma/client";

export const metadata = { title: "Analytics" };

const STAGES_FUNNEL: ApplicationStage[] = [
  "APPLIED", "SCREENED", "SHORTLISTED", "ASSESSMENT", "INTERVIEW", "OFFER", "HIRED",
];

export default async function AnalyticsPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [
    signups7,
    signups30,
    candidates7,
    employers7,
    jobsPublished7,
    jobsPublished30,
    applications7,
    applications30,
    hires30,
    diyguruVerified,
    diyguruNonVerified,
    funnel,
  ] = await Promise.all([
    db.user.count({ where: { createdAt: { gte: since7 } } }),
    db.user.count({ where: { createdAt: { gte: since30 } } }),
    db.user.count({ where: { role: "CANDIDATE", createdAt: { gte: since7 } } }),
    db.user.count({ where: { role: "EMPLOYER", createdAt: { gte: since7 } } }),
    db.jobPosting.count({ where: { publishedAt: { gte: since7 } } }),
    db.jobPosting.count({ where: { publishedAt: { gte: since30 } } }),
    db.application.count({ where: { appliedAt: { gte: since7 } } }),
    db.application.count({ where: { appliedAt: { gte: since30 } } }),
    db.application.count({ where: { stage: "HIRED", updatedAt: { gte: since30 } } }),
    db.candidateProfile.count({ where: { isDIYguruVerified: true } }),
    db.candidateProfile.count({ where: { isDIYguruVerified: false } }),
    Promise.all(
      STAGES_FUNNEL.map((stage) =>
        db.application.count({ where: { stage } }).then((count) => ({ stage, count })),
      ),
    ),
  ]);

  // Average time-in-stage from StageHistory
  const stageHistorySample = await db.stageHistory.findMany({
    where: { at: { gte: since30 }, fromStage: { not: null } },
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

  return (
    <AdminShell>
      <div className="container max-w-6xl py-10">
        <h1 className="text-dashboard text-emce-text">Analytics</h1>
        <p className="mt-1 text-sm text-emce-text-sec">Last 30 days unless noted.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Stat value={signups7} label="Signups · 7d" sub={`${signups30} (30d)`} />
          <Stat value={candidates7} label="Candidate signups · 7d" />
          <Stat value={employers7} label="Employer signups · 7d" />
          <Stat value={hires30} label="Hires · 30d" />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Stat value={jobsPublished7} label="Jobs published · 7d" sub={`${jobsPublished30} (30d)`} />
          <Stat value={applications7} label="Applications · 7d" sub={`${applications30} (30d)`} />
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
          <h2 className="text-section text-emce-text">Avg time in stage (last 30d)</h2>
          {Object.keys(avgDurations).length === 0 ? (
            <p className="mt-2 text-hint text-emce-text-sec">No stage transitions yet.</p>
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
