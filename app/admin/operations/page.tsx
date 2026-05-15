import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminShell } from "@/components/layout/admin-shell";
import { getAllQueueSnapshots } from "@/lib/queue-introspect";
import { pauseQueue, resumeQueue } from "@/server/admin/operations-actions";
import { Activity, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

export const metadata = { title: "Queue operations" };

// This page reaches into Redis on every load, so opt out of caching —
// stale counts mislead operators when troubleshooting an outage.
export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const snapshots = await getAllQueueSnapshots().catch(() => []);
  const totalFailed = snapshots.reduce((s, q) => s + q.counts.failed, 0);
  const totalWaiting = snapshots.reduce((s, q) => s + q.counts.waiting, 0);
  const totalActive = snapshots.reduce((s, q) => s + q.counts.active, 0);
  const totalCompleted = snapshots.reduce((s, q) => s + q.counts.completed, 0);

  return (
    <AdminShell>
      <div className="container max-w-6xl py-10">
        <h1 className="text-dashboard text-emce-text">Background work</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Live status of every BullMQ queue. Data is read directly from Redis,
          so this is the ground truth — not a cached copy.
        </p>

        {/* Overview tiles */}
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <SummaryTile
            label="Active now"
            value={totalActive}
            icon={<Activity className="h-4 w-4 text-emce-mid" aria-hidden />}
          />
          <SummaryTile
            label="Waiting"
            value={totalWaiting}
            icon={<Clock className="h-4 w-4 text-emce-orange-deep" aria-hidden />}
          />
          <SummaryTile
            label="Completed (24h)"
            value={totalCompleted}
            icon={<CheckCircle2 className="h-4 w-4 text-emce-mid" aria-hidden />}
          />
          <SummaryTile
            label="Failed"
            value={totalFailed}
            icon={
              <AlertTriangle
                className={`h-4 w-4 ${totalFailed > 0 ? "text-emce-red-deep" : "text-emce-text-muted"}`}
                aria-hidden
              />
            }
            highlight={totalFailed > 0}
          />
        </div>

        {/* Per-queue table */}
        <Card className="mt-6 overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-emce-light-soft text-left text-xs font-bold uppercase text-emce-text-sec">
              <tr>
                <th scope="col" className="p-3">Queue</th>
                <th scope="col" className="p-3 text-right">Active</th>
                <th scope="col" className="p-3 text-right">Waiting</th>
                <th scope="col" className="p-3 text-right">Delayed</th>
                <th scope="col" className="p-3 text-right">Failed</th>
                <th scope="col" className="p-3 text-right">Completed</th>
                <th scope="col" className="p-3">Status</th>
                <th scope="col" className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emce-border">
              {snapshots.map((q) => (
                <tr key={q.name}>
                  <td className="p-3">
                    <Link
                      href={`/admin/operations/${q.name}`}
                      className="font-bold text-emce-text hover:underline"
                    >
                      {q.name}
                    </Link>
                    <div className="text-hint text-emce-text-muted">{q.description}</div>
                  </td>
                  <td className="p-3 text-right tabular-nums">{q.counts.active.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums">{q.counts.waiting.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums">{q.counts.delayed.toLocaleString()}</td>
                  <td
                    className={`p-3 text-right tabular-nums ${
                      q.counts.failed > 0 ? "font-bold text-emce-red-deep" : "text-emce-text-muted"
                    }`}
                  >
                    {q.counts.failed.toLocaleString()}
                  </td>
                  <td className="p-3 text-right tabular-nums text-emce-text-muted">
                    {q.counts.completed.toLocaleString()}
                  </td>
                  <td className="p-3">
                    {q.paused ? (
                      <Badge variant="warning">Paused</Badge>
                    ) : (
                      <Badge variant="success">Running</Badge>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {q.paused ? (
                      <form action={resumeQueue}>
                        <input type="hidden" name="queue" value={q.name} />
                        <Button type="submit" size="sm" variant="outline">Resume</Button>
                      </form>
                    ) : (
                      <form action={pauseQueue}>
                        <input type="hidden" name="queue" value={q.name} />
                        <Button type="submit" size="sm" variant="ghost">Pause</Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {snapshots.length === 0 && (
          <Card className="mt-6 p-10 text-center">
            <p className="text-section text-emce-text">Couldn't read queue state.</p>
            <p className="mt-2 text-hint text-emce-text-sec">
              Likely a Redis connectivity issue. Check the worker logs and{" "}
              <code>REDIS_URL</code> env var.
            </p>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}

function SummaryTile({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card
      className={`p-5 ${highlight ? "border-emce-red bg-emce-red-light/40" : ""}`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-emce-text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-3xl font-extrabold text-emce-dark tabular-nums">
        {value.toLocaleString()}
      </div>
    </Card>
  );
}
