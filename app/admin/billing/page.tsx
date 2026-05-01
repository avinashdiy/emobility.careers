import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { AdminShell } from "@/components/layout/admin-shell";
import { upsertPlan, deactivatePlan } from "@/server/admin/plan-actions";
import { getBooleanSetting } from "@/lib/settings";

export const metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const [plans, activeSubs, paymentsEnabled] = await Promise.all([
    db.plan.findMany({
      orderBy: [{ scope: "asc" }, { interval: "asc" }, { amountMinor: "asc" }],
      include: { _count: { select: { subscriptions: true } } },
    }),
    db.subscription.count({ where: { status: "ACTIVE" } }),
    getBooleanSetting("feature.payments_enabled"),
  ]);

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-dashboard text-emce-text">Billing</h1>
          {paymentsEnabled ? (
            <Badge variant="success">Payments live</Badge>
          ) : (
            <Badge variant="warning">Payments disabled</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-emce-text-sec">
          Plans + subscriptions schema. v1 ships with payments off — flip{" "}
          <code>feature.payments_enabled</code> in{" "}
          <a href="/admin/settings?tab=feature" className="font-bold text-emce-dark underline">settings</a>{" "}
          to expose checkout to users. Adding plans here is non-breaking — they
          stay invisible until that flag flips.
        </p>

        {sp.error && (
          <div className="mt-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
            {sp.error}
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Tile label="Plans" value={plans.length.toLocaleString()} />
          <Tile label="Active plans" value={plans.filter((p) => p.isActive).length.toLocaleString()} />
          <Tile label="Active subscriptions" value={activeSubs.toLocaleString()} />
        </div>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">Add / update plan</h2>
          <form action={upsertPlan} className="mt-4 grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-3">
              <Label htmlFor="key">Key</Label>
              <Input id="key" name="key" placeholder="employer-startup-monthly" required />
            </div>
            <div className="sm:col-span-5">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" name="name" placeholder="Startup (monthly)" required />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="scope">Scope</Label>
              <NativeSelect id="scope" name="scope" defaultValue="EMPLOYER">
                <option value="CANDIDATE">Candidate</option>
                <option value="EMPLOYER">Employer</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="interval">Interval</Label>
              <NativeSelect id="interval" name="interval" defaultValue="MONTHLY">
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="ONE_TIME">One-time</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="amountMinor">Amount (minor unit)</Label>
              <Input
                id="amountMinor"
                name="amountMinor"
                type="number"
                min="0"
                placeholder="999900 = ₹9,999"
                required
                defaultValue="0"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" name="currency" maxLength={3} defaultValue="INR" />
            </div>
            <div className="sm:col-span-7">
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" placeholder="Up to 5 active jobs / month" />
            </div>
            <div className="sm:col-span-12">
              <Label htmlFor="features">Features (JSON, optional)</Label>
              <Textarea
                id="features"
                name="features"
                rows={3}
                className="font-mono text-xs"
                placeholder='{"jobsPerMonth": 5, "aiMatchesPerWeek": 50}'
              />
            </div>
            <div className="sm:col-span-12 flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" value="true" defaultChecked />
                <span className="font-bold text-emce-text">Active</span>
              </label>
              <Button type="submit" className="ml-auto">Save plan</Button>
            </div>
          </form>
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">Plans</h2>
          {plans.length === 0 ? (
            <p className="mt-3 text-hint text-emce-text-sec">No plans yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {plans.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emce-border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-emce-text">{p.name}</span>
                      <code className="text-hint text-emce-text-muted">{p.key}</code>
                      <Badge variant="outline">{p.scope}</Badge>
                      <Badge variant="outline">{p.interval}</Badge>
                      {!p.isActive && <Badge variant="warning">Inactive</Badge>}
                    </div>
                    <p className="mt-1 text-hint text-emce-text-sec">
                      {p.amountMinor === 0
                        ? "Free"
                        : `${(p.amountMinor / 100).toLocaleString()} ${p.currency}`}{" "}
                      · {p._count.subscriptions} subscriber
                      {p._count.subscriptions === 1 ? "" : "s"}
                      {p.description && ` · ${p.description}`}
                    </p>
                  </div>
                  {p.isActive && (
                    <form action={deactivatePlan}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmSubmit
                        confirm={`Deactivate ${p.name}? Existing subscribers keep access; new sign-ups can't pick this plan.`}
                        size="sm"
                        variant="ghost"
                      >
                        Deactivate
                      </ConfirmSubmit>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wide text-emce-text-muted">{label}</div>
      <div className="mt-1 text-3xl font-extrabold text-emce-dark tabular-nums">{value}</div>
    </Card>
  );
}
