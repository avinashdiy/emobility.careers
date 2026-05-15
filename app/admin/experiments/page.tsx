import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminShell } from "@/components/layout/admin-shell";
import { createExperiment } from "@/server/admin/experiment-actions";

export const metadata = { title: "Experiments" };
export const dynamic = "force-dynamic";

const STATUS_TONE = {
  DRAFT: "outline",
  RUNNING: "success",
  PAUSED: "warning",
  COMPLETED: "default",
} as const;

export default async function ExperimentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const exps = await db.experiment.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { allocations: true, events: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <h1 className="text-dashboard text-emce-text">A/B experiments</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Sticky-by-user variant allocation. Reference an experiment from code
          via <code>allocate(&quot;your-key&quot;, userId)</code>. After running long enough
          to hit power, mark a winner and the allocator serves it to everyone.
        </p>

        {sp.error && (
          <div className="mt-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
            {sp.error}
          </div>
        )}

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">Create experiment</h2>
          <form action={createExperiment} className="mt-4 grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-4">
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                name="key"
                placeholder="feed-cta-copy"
                pattern="[a-z0-9_-]+"
                required
              />
            </div>
            <div className="sm:col-span-8">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Feed CTA copy A/B" required />
            </div>
            <div className="sm:col-span-12">
              <Label htmlFor="hypothesis">Hypothesis</Label>
              <Textarea
                id="hypothesis"
                name="hypothesis"
                rows={2}
                placeholder="What you expect to learn or change."
              />
            </div>
            <div className="sm:col-span-12">
              <Label htmlFor="variants">Variants (JSON)</Label>
              <Textarea
                id="variants"
                name="variants"
                rows={3}
                required
                defaultValue='[{"key":"control","weight":50},{"key":"v2","weight":50}]'
                className="font-mono text-xs"
              />
              <p className="mt-1 text-hint text-emce-text-muted">
                Array of <code>{"{ key, weight }"}</code>. Weights must sum to 100.
              </p>
            </div>
            <div className="sm:col-span-12 flex justify-end">
              <Button type="submit">Create as DRAFT</Button>
            </div>
          </form>
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">All experiments</h2>
          {exps.length === 0 ? (
            <p className="mt-3 text-hint text-emce-text-sec">None yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {exps.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emce-border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/experiments/${e.id}`}
                        className="font-bold text-emce-text hover:underline"
                      >
                        {e.name}
                      </Link>
                      <code className="text-hint text-emce-text-muted">{e.key}</code>
                      <Badge variant={STATUS_TONE[e.status]}>{e.status}</Badge>
                      {e.winnerKey && (
                        <Badge variant="success">winner: {e.winnerKey}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-hint text-emce-text-sec">
                      {e._count.allocations.toLocaleString()} allocations ·{" "}
                      {e._count.events.toLocaleString()} events
                      {" · "}created by {e.createdBy.name ?? e.createdBy.email}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
