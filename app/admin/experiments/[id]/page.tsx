import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { NativeSelect } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AdminShell } from "@/components/layout/admin-shell";
import { setExperimentStatus } from "@/server/admin/experiment-actions";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  DRAFT: "outline",
  RUNNING: "success",
  PAUSED: "warning",
  COMPLETED: "default",
} as const;

export default async function ExperimentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;

  const exp = await db.experiment.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true, email: true } } },
  });
  if (!exp) notFound();

  const variants = (exp.variants as unknown) as { key: string; weight: number }[];

  // Per-variant exposure + conversion counts in a single query for the
  // funnel view. We don't compute statistical significance — that's
  // a deliberate omission; admins should pause and analyse with a real
  // tool when the lift looks promising.
  const events = await db.experimentEvent.groupBy({
    by: ["variantKey", "kind"],
    where: { experimentId: exp.id },
    _count: true,
  });
  const allocations = await db.experimentAllocation.groupBy({
    by: ["variantKey"],
    where: { experimentId: exp.id },
    _count: true,
  });
  const allocByVariant = new Map(
    allocations.map((a) => [a.variantKey, a._count]),
  );
  // Index events as variantKey × kind → count
  const exposureCounts = new Map<string, number>();
  const conversionsByGoal = new Map<string, Map<string, number>>(); // goal → variant → count
  for (const ev of events) {
    if (ev.kind === "exposed") {
      exposureCounts.set(ev.variantKey, ev._count);
    } else if (ev.kind.startsWith("converted:")) {
      const goal = ev.kind.slice("converted:".length);
      const m = conversionsByGoal.get(goal) ?? new Map();
      m.set(ev.variantKey, ev._count);
      conversionsByGoal.set(goal, m);
    }
  }

  return (
    <AdminShell>
      <div className="container max-w-4xl py-10">
        <Link
          href="/admin/experiments"
          className="inline-flex items-center gap-1 text-hint font-bold text-emce-dark hover:underline"
        >
          <ChevronLeft className="h-3 w-3" aria-hidden /> All experiments
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-dashboard text-emce-text">{exp.name}</h1>
          <Badge variant={STATUS_TONE[exp.status]}>{exp.status}</Badge>
          {exp.winnerKey && <Badge variant="success">winner: {exp.winnerKey}</Badge>}
        </div>
        <p className="mt-1 text-sm text-emce-text-sec">
          <code className="font-mono">{exp.key}</code> · created by{" "}
          {exp.createdBy.name ?? exp.createdBy.email}
        </p>
        {exp.hypothesis && (
          <p className="mt-2 rounded-md bg-emce-light-soft p-3 text-sm text-emce-text-sec">
            <strong>Hypothesis:</strong> {exp.hypothesis}
          </p>
        )}

        <Card className="mt-6 overflow-x-auto p-0">
          <h2 className="px-5 pt-5 text-section text-emce-text">Variants &amp; performance</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="bg-emce-light-soft text-left text-xs font-bold uppercase text-emce-text-sec">
              <tr>
                <th scope="col" className="p-3">Variant</th>
                <th scope="col" className="p-3 text-right">Weight</th>
                <th scope="col" className="p-3 text-right">Allocations</th>
                <th scope="col" className="p-3 text-right">Exposures</th>
                {[...conversionsByGoal.keys()].map((g) => (
                  <th key={g} scope="col" className="p-3 text-right">{g}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-emce-border">
              {variants.map((v) => (
                <tr key={v.key}>
                  <td className="p-3 font-bold text-emce-text">{v.key}</td>
                  <td className="p-3 text-right tabular-nums">{v.weight}%</td>
                  <td className="p-3 text-right tabular-nums">
                    {(allocByVariant.get(v.key) ?? 0).toLocaleString()}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {(exposureCounts.get(v.key) ?? 0).toLocaleString()}
                  </td>
                  {[...conversionsByGoal.keys()].map((g) => {
                    const conv = conversionsByGoal.get(g)?.get(v.key) ?? 0;
                    const exp = exposureCounts.get(v.key) ?? 0;
                    const rate = exp > 0 ? ((conv / exp) * 100).toFixed(2) : "—";
                    return (
                      <td key={g} className="p-3 text-right tabular-nums">
                        {conv.toLocaleString()}{" "}
                        <span className="text-hint text-emce-text-muted">
                          ({rate}%)
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="mt-6 p-5">
          <h2 className="text-section text-emce-text">Status controls</h2>
          <form action={setExperimentStatus} className="mt-3 grid gap-3 sm:grid-cols-12">
            <input type="hidden" name="id" value={exp.id} />
            <div className="sm:col-span-3">
              <Label htmlFor="status">Status</Label>
              <NativeSelect id="status" name="status" defaultValue={exp.status}>
                <option value="DRAFT">DRAFT</option>
                <option value="RUNNING">RUNNING</option>
                <option value="PAUSED">PAUSED</option>
                <option value="COMPLETED">COMPLETED</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-4">
              <Label htmlFor="winnerKey">Winner key (only when completing)</Label>
              <Input
                id="winnerKey"
                name="winnerKey"
                placeholder="control"
                defaultValue={exp.winnerKey ?? ""}
              />
            </div>
            <div className="sm:col-span-5 flex items-end">
              <ConfirmSubmit
                size="sm"
                confirm="Update experiment status? Allocator behaviour changes immediately."
              >
                Save
              </ConfirmSubmit>
            </div>
          </form>
          <p className="mt-2 text-hint text-emce-text-muted">
            DRAFT → no allocations. RUNNING → allocator serves variants by weight.
            PAUSED → existing allocations honoured, new traffic gets control.
            COMPLETED with a winner → everyone gets the winner.
          </p>
        </Card>

        <Card className="mt-6 p-5">
          <h2 className="text-section text-emce-text">How to instrument</h2>
          <pre className="mt-2 overflow-x-auto rounded-md bg-emce-light-soft p-3 text-xs">{`import { allocate, logExposure, logConversion } from "@/lib/experiments";

const variant = await allocate("${exp.key}", session?.user?.id);
await logExposure("${exp.key}", variant, session?.user?.id);

// Later, when the metric fires:
await logConversion("${exp.key}", "job_apply", session?.user?.id);`}</pre>
        </Card>
      </div>
    </AdminShell>
  );
}
