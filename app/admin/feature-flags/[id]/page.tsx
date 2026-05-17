import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { PageHeader } from "@/components/ui/page-header";
import {
  upsertFeatureFlag,
  addFeatureFlagTarget,
  removeFeatureFlagTarget,
} from "@/server/feature-flags/actions";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit feature flag · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminFeatureFlagDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;

  const flag = await db.featureFlag.findUnique({
    where: { id },
    include: {
      author: { select: { name: true, email: true } },
      targets: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  if (!flag) notFound();

  return (
    <AdminShell>
      <div className="container max-w-3xl space-y-6 py-6 md:py-8">
        <ToastFromSearchParams />
        <Link
          href="/admin/feature-flags"
          className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
        >
          ← All flags
        </Link>

        <PageHeader
          eyebrow="Feature flag"
          title={flag.label}
          subtitle={
            <>
              <code className="rounded bg-emce-light-soft px-1.5 py-0.5 text-[11px]">
                {flag.key}
              </code>{" "}
              · {flag.type.toLowerCase()} · {flag.enabled ? "enabled" : "disabled"}
              {flag.type === "PERCENTAGE" && flag.enabled && ` · ${flag.rolloutPercent}% rolled out`}
            </>
          }
        />

        {/* Edit form */}
        <Card className="p-5">
          <h2 className="text-section text-emce-text">Configuration</h2>
          <form action={upsertFeatureFlag} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={flag.id} />
            <div>
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                name="key"
                defaultValue={flag.key}
                required
                maxLength={120}
                readOnly
                className="bg-emce-light-soft text-emce-text-muted"
              />
            </div>
            <div>
              <Label htmlFor="label">Label *</Label>
              <Input
                id="label"
                name="label"
                defaultValue={flag.label}
                required
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="type">Type *</Label>
              <NativeSelect id="type" name="type" defaultValue={flag.type} required>
                <option value="BOOLEAN">Boolean</option>
                <option value="PERCENTAGE">Percentage</option>
                <option value="TARGETED">Targeted</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="rolloutPercent">Rollout %</Label>
              <Input
                id="rolloutPercent"
                name="rolloutPercent"
                type="number"
                min={0}
                max={100}
                defaultValue={flag.rolloutPercent}
                inputMode="numeric"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={flag.description ?? ""}
                maxLength={2000}
              />
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-emce-border pt-3">
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="enabled"
                    value="true"
                    defaultChecked={flag.enabled}
                  />
                  Enabled
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="defaultForAnonymous"
                    value="true"
                    defaultChecked={flag.defaultForAnonymous}
                  />
                  Default true for anonymous
                </label>
              </div>
              <SubmitButton size="sm" pendingLabel="Saving…">
                Save changes
              </SubmitButton>
            </div>
          </form>
          <p className="mt-3 text-[10px] text-emce-text-muted">
            Last updated {relativeTime(flag.updatedAt)}
            {flag.author?.name ? ` by ${flag.author.name}` : ""}
          </p>
        </Card>

        {/* Targets */}
        <Card className="p-5">
          <h2 className="text-section text-emce-text">
            Targeted users ({flag.targets.length})
          </h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Users in this list get the explicit override regardless of the
            flag&apos;s type or rollout. Use to enrol beta users (enabled =
            true) or to exclude a problematic user from a percentage rollout
            (enabled = false).
          </p>

          {/* Add target */}
          <form action={addFeatureFlagTarget} className="mt-4 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="flagId" value={flag.id} />
            <div className="sm:col-span-2">
              <Label htmlFor="userIdOrEmail">User id or email *</Label>
              <Input
                id="userIdOrEmail"
                name="userIdOrEmail"
                required
                maxLength={160}
                placeholder="user@example.com or cuid"
              />
            </div>
            <div>
              <Label htmlFor="enabled">Override</Label>
              <NativeSelect id="enabled" name="enabled" defaultValue="true">
                <option value="true">Enable for this user</option>
                <option value="false">Explicitly EXCLUDE this user</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="note">Note (optional)</Label>
              <Input
                id="note"
                name="note"
                maxLength={300}
                placeholder="VIP customer; private-beta enrollee"
              />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <SubmitButton size="sm" variant="outline" pendingLabel="Adding…">
                Add target
              </SubmitButton>
            </div>
          </form>

          {/* Existing targets */}
          {flag.targets.length === 0 ? (
            <p className="mt-4 text-hint text-emce-text-sec">
              No targets configured yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-emce-border">
              {flag.targets.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-emce-text">
                      {t.user.name ?? t.user.email}
                    </p>
                    <p className="text-[11px] text-emce-text-muted">
                      {t.user.email} · {relativeTime(t.createdAt)}
                    </p>
                    {t.note && (
                      <p className="mt-1 text-hint italic text-emce-text-sec">
                        {t.note}
                      </p>
                    )}
                  </div>
                  <Badge variant={t.enabled ? "success" : "danger"} size="sm">
                    {t.enabled ? "✓ enabled" : "✗ excluded"}
                  </Badge>
                  <form action={removeFeatureFlagTarget}>
                    <input type="hidden" name="id" value={t.id} />
                    <ConfirmSubmit
                      size="sm"
                      variant="ghost"
                      confirm="Remove this user from the targeting list?"
                      pendingLabel="…"
                      className="text-emce-red-deep"
                    >
                      Remove
                    </ConfirmSubmit>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
