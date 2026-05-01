import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { getQueueDetail } from "@/lib/queue-introspect";
import {
  retryFailedJob,
  discardFailedJob,
  retryAllFailed,
  pauseQueue,
  resumeQueue,
} from "@/server/admin/operations-actions";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function QueueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { name } = await params;
  const sp = await searchParams;

  const detail = await getQueueDetail(name).catch(() => null);
  if (!detail) notFound();
  const { snapshot, failed } = detail;

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <Link
          href="/admin/operations"
          className="inline-flex items-center gap-1 text-hint font-bold text-emce-dark hover:underline"
        >
          <ChevronLeft className="h-3 w-3" aria-hidden /> All queues
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-dashboard text-emce-text">{snapshot.name}</h1>
          {snapshot.paused ? (
            <Badge variant="warning">Paused</Badge>
          ) : (
            <Badge variant="success">Running</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-emce-text-sec">{snapshot.description}</p>

        {sp.notice && (
          <div className="mt-3 rounded-md bg-emce-light-soft p-3 text-sm text-emce-dark">
            {sp.notice}
          </div>
        )}
        {sp.error && (
          <div className="mt-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
            {sp.error}
          </div>
        )}

        {/* Counts row */}
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          <CountTile label="Active" value={snapshot.counts.active} />
          <CountTile label="Waiting" value={snapshot.counts.waiting} />
          <CountTile label="Delayed" value={snapshot.counts.delayed} />
          <CountTile label="Failed" value={snapshot.counts.failed} highlight />
          <CountTile label="Completed (24h)" value={snapshot.counts.completed} />
        </div>

        {/* Action bar */}
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-emce-border bg-white p-3">
          {snapshot.counts.failed > 0 && (
            <form action={retryAllFailed}>
              <input type="hidden" name="queue" value={snapshot.name} />
              <ConfirmSubmit
                confirm={`Retry all ${snapshot.counts.failed} failed job${
                  snapshot.counts.failed === 1 ? "" : "s"
                }? They'll go back into the wait queue.`}
                size="sm"
              >
                Retry all failed ({snapshot.counts.failed})
              </ConfirmSubmit>
            </form>
          )}
          {snapshot.paused ? (
            <form action={resumeQueue}>
              <input type="hidden" name="queue" value={snapshot.name} />
              <Button type="submit" size="sm" variant="outline">Resume queue</Button>
            </form>
          ) : (
            <form action={pauseQueue}>
              <input type="hidden" name="queue" value={snapshot.name} />
              <Button type="submit" size="sm" variant="ghost">Pause queue</Button>
            </form>
          )}
        </div>

        {/* Failed-job table */}
        <h2 className="mt-6 text-section text-emce-text">Failed jobs</h2>
        {failed.length === 0 ? (
          <Card className="mt-3 p-10 text-center">
            <div className="text-4xl" aria-hidden>✓</div>
            <p className="mt-3 text-section text-emce-text">No failures right now.</p>
          </Card>
        ) : (
          <ul className="mt-3 space-y-3">
            {failed.map((j) => (
              <li key={j.id}>
                <Card>
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-emce-text">{j.name}</span>
                        <Badge variant="outline">id: {j.id}</Badge>
                        <Badge variant="warning">{j.attemptsMade} attempts</Badge>
                        <span className="text-hint text-emce-text-muted">
                          {new Date(j.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {j.failedReason && (
                        <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-emce-red-light p-2 text-xs text-emce-red">
                          {j.failedReason}
                        </pre>
                      )}
                      {j.stacktrace.length > 0 && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer font-bold text-emce-text-sec">
                            Stack trace ({j.stacktrace.length} frames)
                          </summary>
                          <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-emce-light-soft p-2 text-emce-text-muted">
                            {j.stacktrace.join("\n\n")}
                          </pre>
                        </details>
                      )}
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer font-bold text-emce-text-sec">
                          Job data
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-emce-light-soft p-2 text-emce-text-muted">
                          {JSON.stringify(j.data, null, 2)}
                        </pre>
                      </details>
                    </div>
                    <div className="flex flex-col gap-2 sm:w-32">
                      <form action={retryFailedJob}>
                        <input type="hidden" name="queue" value={snapshot.name} />
                        <input type="hidden" name="jobId" value={j.id} />
                        <Button type="submit" size="sm" className="w-full">Retry</Button>
                      </form>
                      <form action={discardFailedJob}>
                        <input type="hidden" name="queue" value={snapshot.name} />
                        <input type="hidden" name="jobId" value={j.id} />
                        <ConfirmSubmit
                          confirm="Discard this failed job? This can't be undone."
                          size="sm"
                          variant="ghost"
                          className="w-full"
                        >
                          Discard
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}

function CountTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  const danger = highlight && value > 0;
  return (
    <Card className={`p-3 ${danger ? "border-emce-red bg-emce-red-light/40" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-emce-text-muted">{label}</div>
      <div
        className={`mt-1 text-2xl font-extrabold tabular-nums ${
          danger ? "text-emce-red" : "text-emce-dark"
        }`}
      >
        {value.toLocaleString()}
      </div>
    </Card>
  );
}
