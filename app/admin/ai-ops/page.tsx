import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { formatUsdMicros } from "@/lib/ai/track-cost";

export const metadata = { title: "AI operations" };
export const dynamic = "force-dynamic";

const RANGES = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export default async function AIOpsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const range = RANGES.find((r) => r.label === sp.range) ?? RANGES[1]; // 7d default
  const since = new Date(Date.now() - range.days * 24 * 3600 * 1000);

  // Pull aggregates in parallel: by feature, by model, by day, plus
  // a recent-failures sample for the bottom of the page.
  const [byFeature, byModel, recentFailures, totalRow] = await Promise.all([
    db.aICostLog.groupBy({
      by: ["feature", "model"],
      where: { createdAt: { gte: since } },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        costUsdMicros: true,
      },
      _count: true,
    }),
    db.aICostLog.groupBy({
      by: ["model"],
      where: { createdAt: { gte: since } },
      _sum: {
        totalTokens: true,
        costUsdMicros: true,
      },
      _count: true,
    }),
    db.aICostLog.findMany({
      where: { createdAt: { gte: since }, success: false },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        feature: true,
        model: true,
        errorMessage: true,
        durationMs: true,
        createdAt: true,
      },
    }),
    db.aICostLog.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { costUsdMicros: true, totalTokens: true },
      _count: true,
    }),
  ]);

  // Per-day timeseries — separate query because groupBy on a date
  // truncation needs raw SQL. Keeps the page output minimal — just
  // the 7/30/90 most recent days.
  const dailyRows: { day: Date; total_micros: bigint; calls: bigint }[] =
    await db.$queryRaw`
      SELECT
        date_trunc('day', "createdAt") AS day,
        SUM("costUsdMicros")::bigint   AS total_micros,
        COUNT(*)::bigint               AS calls
      FROM "AICostLog"
      WHERE "createdAt" >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `;
  const maxDailyMicros = dailyRows.reduce(
    (m, r) => Math.max(m, Number(r.total_micros)),
    0,
  );

  const totalCost = totalRow._sum.costUsdMicros ?? 0;
  const totalCalls = totalRow._count;
  const totalTokens = totalRow._sum.totalTokens ?? 0;

  return (
    <AdminShell>
      <div className="container max-w-6xl py-10">
        <h1 className="text-dashboard text-emce-text">AI operations</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          OpenAI usage tracked per call by{" "}
          <code>lib/ai/track-cost.ts</code>. Cost is computed against the
          pricing table in that file — bump it when OpenAI publishes new
          numbers.
        </p>

        {/* Range chips */}
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <a
              key={r.label}
              href={`/admin/ai-ops?range=${r.label}`}
              aria-pressed={range.label === r.label}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                range.label === r.label
                  ? "bg-emce-dark text-emce-light"
                  : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
              }`}
            >
              {r.label}
            </a>
          ))}
        </div>

        {/* Headline tiles */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <div className="text-xs uppercase tracking-wide text-emce-text-muted">
              Spend ({range.label})
            </div>
            <div className="mt-1 text-3xl font-extrabold text-emce-dark">
              {formatUsdMicros(totalCost)}
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase tracking-wide text-emce-text-muted">
              Calls
            </div>
            <div className="mt-1 text-3xl font-extrabold text-emce-dark">
              {totalCalls.toLocaleString()}
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-xs uppercase tracking-wide text-emce-text-muted">
              Tokens
            </div>
            <div className="mt-1 text-3xl font-extrabold text-emce-dark">
              {totalTokens.toLocaleString()}
            </div>
          </Card>
        </div>

        {/* Daily spark */}
        <Card className="mt-6 p-5">
          <h2 className="text-section text-emce-text">Daily spend</h2>
          {dailyRows.length === 0 ? (
            <p className="mt-3 text-hint text-emce-text-sec">
              No AI calls in this window. Either nothing's happening yet, or
              call sites haven't been wrapped with{" "}
              <code>trackAICall()</code> — see <code>lib/ai/track-cost.ts</code>.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {dailyRows.map((d) => {
                const micros = Number(d.total_micros);
                const calls = Number(d.calls);
                const pct = maxDailyMicros > 0 ? (micros / maxDailyMicros) * 100 : 0;
                return (
                  <li key={d.day.toISOString()} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-emce-text-sec">
                      {d.day.toISOString().slice(0, 10)}
                    </span>
                    <div className="flex-1 overflow-hidden rounded-full bg-emce-border">
                      <div
                        className="h-3 bg-emce-mid"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-24 text-right font-bold tabular-nums">
                      {formatUsdMicros(micros)}
                    </span>
                    <span className="w-16 text-right text-hint text-emce-text-muted tabular-nums">
                      {calls} calls
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Per-feature breakdown */}
        <Card className="mt-6 overflow-x-auto p-0">
          <h2 className="px-5 pt-5 text-section text-emce-text">By feature</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="bg-emce-light-soft text-left text-xs font-bold uppercase text-emce-text-sec">
              <tr>
                <th scope="col" className="p-3">Feature</th>
                <th scope="col" className="p-3">Model</th>
                <th scope="col" className="p-3 text-right">Calls</th>
                <th scope="col" className="p-3 text-right">Prompt tok</th>
                <th scope="col" className="p-3 text-right">Comp. tok</th>
                <th scope="col" className="p-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emce-border">
              {byFeature.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-emce-text-sec">
                    Nothing logged yet.
                  </td>
                </tr>
              ) : (
                byFeature
                  .slice()
                  .sort(
                    (a, b) =>
                      (b._sum.costUsdMicros ?? 0) - (a._sum.costUsdMicros ?? 0),
                  )
                  .map((r) => (
                    <tr key={`${r.feature}/${r.model}`}>
                      <td className="p-3 font-bold text-emce-text">{r.feature}</td>
                      <td className="p-3 text-emce-text-sec">{r.model}</td>
                      <td className="p-3 text-right tabular-nums">
                        {r._count.toLocaleString()}
                      </td>
                      <td className="p-3 text-right tabular-nums text-emce-text-muted">
                        {(r._sum.promptTokens ?? 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right tabular-nums text-emce-text-muted">
                        {(r._sum.completionTokens ?? 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-bold tabular-nums">
                        {formatUsdMicros(r._sum.costUsdMicros ?? 0)}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </Card>

        {/* Per-model summary */}
        <Card className="mt-6 overflow-x-auto p-0">
          <h2 className="px-5 pt-5 text-section text-emce-text">By model</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="bg-emce-light-soft text-left text-xs font-bold uppercase text-emce-text-sec">
              <tr>
                <th scope="col" className="p-3">Model</th>
                <th scope="col" className="p-3 text-right">Calls</th>
                <th scope="col" className="p-3 text-right">Tokens</th>
                <th scope="col" className="p-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emce-border">
              {byModel
                .slice()
                .sort(
                  (a, b) =>
                    (b._sum.costUsdMicros ?? 0) - (a._sum.costUsdMicros ?? 0),
                )
                .map((r) => (
                  <tr key={r.model}>
                    <td className="p-3 font-bold text-emce-text">{r.model}</td>
                    <td className="p-3 text-right tabular-nums">
                      {r._count.toLocaleString()}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {(r._sum.totalTokens ?? 0).toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-bold tabular-nums">
                      {formatUsdMicros(r._sum.costUsdMicros ?? 0)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>

        {/* Recent failures */}
        {recentFailures.length > 0 && (
          <Card className="mt-6 p-5">
            <h2 className="text-section text-emce-text">Recent failures</h2>
            <ul className="mt-3 space-y-2">
              {recentFailures.map((f) => (
                <li key={f.id} className="rounded-md border border-emce-red/40 bg-emce-red-light/40 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-hint">
                    <Badge variant="danger">{f.feature}</Badge>
                    <span className="font-bold text-emce-text">{f.model}</span>
                    <span className="text-emce-text-muted">
                      {f.createdAt.toLocaleString()}
                      {f.durationMs ? ` · ${f.durationMs}ms` : ""}
                    </span>
                  </div>
                  {f.errorMessage && (
                    <pre className="mt-1 max-h-24 overflow-auto text-xs text-emce-red-deep">
                      {f.errorMessage}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
