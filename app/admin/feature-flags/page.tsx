import Link from "next/link";
import { redirect } from "next/navigation";
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
  toggleFeatureFlagEnabled,
  deleteFeatureFlag,
  setFeatureFlagRollout,
  clearFeatureFlagCache,
} from "@/server/feature-flags/actions";
import { FeatureFlagType } from "@prisma/client";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Feature flags · Admin" };
export const dynamic = "force-dynamic";

const TYPE_TONE: Record<FeatureFlagType, "default" | "success" | "warning"> = {
  BOOLEAN: "default",
  PERCENTAGE: "warning",
  TARGETED: "success",
};

/**
 * Feature flag dashboard. Distinct from `/admin/settings` (which is
 * the kill-switch surface for the 4 pillars). New flags should be
 * created here; rollout adjustment, targeting, and audit live here.
 *
 * UI: create-form at the top, list-of-cards below. Each card has an
 * inline rollout-percent slider (PERCENTAGE flags only), enable/
 * disable toggle, and a "→ details" link for managing targets.
 */
export default async function AdminFeatureFlagsPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const flags = await db.featureFlag.findMany({
    orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
    include: {
      author: { select: { name: true, email: true } },
      _count: { select: { targets: true } },
    },
  });

  const enabledCount = flags.filter((f) => f.enabled).length;
  const rollingOut = flags.filter(
    (f) => f.type === "PERCENTAGE" && f.enabled && f.rolloutPercent > 0 && f.rolloutPercent < 100,
  ).length;

  return (
    <AdminShell>
      <div className="container max-w-4xl space-y-6 py-6 md:py-8">
        <ToastFromSearchParams />
        <PageHeader
          eyebrow="Configuration"
          title="Feature flags"
          subtitle={
            <>
              <strong>{flags.length}</strong> flags · {enabledCount} enabled ·{" "}
              {rollingOut} mid-rollout
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <p className="text-hint text-emce-text-sec">
            Distinct from{" "}
            <Link href="/admin/settings" className="font-bold text-emce-dark hover:underline">
              Settings
            </Link>{" "}
            (kill switches) and{" "}
            <Link href="/admin/experiments" className="font-bold text-emce-dark hover:underline">
              Experiments
            </Link>{" "}
            (A/B tests). Use flags for incremental rollouts.
          </p>
          <form action={clearFeatureFlagCache} className="ml-auto">
            <SubmitButton size="sm" variant="ghost" pendingLabel="…">
              ↻ Clear cache
            </SubmitButton>
          </form>
        </div>

        {/* Create */}
        <Card className="p-5">
          <h2 className="text-section text-emce-text">New flag</h2>
          <form action={upsertFeatureFlag} className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="key">Key *</Label>
              <Input
                id="key"
                name="key"
                required
                maxLength={120}
                placeholder="new_search_ui"
              />
            </div>
            <div>
              <Label htmlFor="label">Label *</Label>
              <Input
                id="label"
                name="label"
                required
                maxLength={120}
                placeholder="New search UI"
              />
            </div>
            <div>
              <Label htmlFor="type">Type *</Label>
              <NativeSelect id="type" name="type" defaultValue="BOOLEAN" required>
                <option value="BOOLEAN">Boolean (on/off for everyone)</option>
                <option value="PERCENTAGE">Percentage (gradual rollout)</option>
                <option value="TARGETED">Targeted (specific users only)</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="rolloutPercent">Initial rollout %</Label>
              <Input
                id="rolloutPercent"
                name="rolloutPercent"
                type="number"
                min={0}
                max={100}
                defaultValue={0}
                inputMode="numeric"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={2}
                maxLength={2000}
                placeholder="What does this flag control? Who owns it? When should it be removed?"
              />
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-emce-border pt-3">
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name="enabled" value="true" />
                  Enabled at create
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name="defaultForAnonymous" value="true" />
                  Default true for anonymous
                </label>
              </div>
              <SubmitButton size="sm" pendingLabel="Creating…">
                Create flag
              </SubmitButton>
            </div>
          </form>
        </Card>

        {/* List */}
        {flags.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-body text-emce-text-sec">
              No flags yet. Create one above.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {flags.map((f) => (
              <Card key={f.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Link
                        href={`/admin/feature-flags/${f.id}`}
                        className="text-section font-extrabold text-emce-text hover:underline"
                      >
                        {f.label}
                      </Link>
                      <code className="rounded bg-emce-light-soft px-1.5 py-0.5 text-[11px]">
                        {f.key}
                      </code>
                      <Badge variant={TYPE_TONE[f.type]} size="sm">
                        {f.type.toLowerCase()}
                      </Badge>
                      <Badge variant={f.enabled ? "success" : "outline"} size="sm">
                        {f.enabled ? "enabled" : "disabled"}
                      </Badge>
                      {f.type === "PERCENTAGE" && f.enabled && (
                        <Badge variant="warning" size="sm">
                          {f.rolloutPercent}% rollout
                        </Badge>
                      )}
                      {f.type === "TARGETED" && (
                        <Badge variant="outline" size="sm">
                          {f._count.targets} targets
                        </Badge>
                      )}
                    </div>
                    {f.description && (
                      <p className="mt-1 line-clamp-2 text-hint text-emce-text-sec">
                        {f.description}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-emce-text-muted">
                      Last updated {relativeTime(f.updatedAt)}
                      {f.author?.name ? ` by ${f.author.name}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <form action={toggleFeatureFlagEnabled}>
                      <input type="hidden" name="id" value={f.id} />
                      <SubmitButton size="sm" variant="outline" pendingLabel="…">
                        {f.enabled ? "Disable" : "Enable"}
                      </SubmitButton>
                    </form>
                    <Link
                      href={`/admin/feature-flags/${f.id}`}
                      className="text-hint font-bold text-emce-dark hover:underline"
                    >
                      Details →
                    </Link>
                  </div>
                </div>

                {/* Quick rollout slider for PERCENTAGE flags */}
                {f.type === "PERCENTAGE" && (
                  <form
                    action={setFeatureFlagRollout}
                    className="mt-3 flex flex-wrap items-end gap-3 border-t border-emce-border pt-3"
                  >
                    <input type="hidden" name="id" value={f.id} />
                    <div className="flex-1">
                      <Label htmlFor={`rollout-${f.id}`}>
                        Rollout % — {f.rolloutPercent}% currently
                      </Label>
                      <Input
                        id={`rollout-${f.id}`}
                        name="rolloutPercent"
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={f.rolloutPercent}
                        inputMode="numeric"
                      />
                    </div>
                    <SubmitButton size="sm" variant="outline" pendingLabel="…">
                      Update rollout
                    </SubmitButton>
                  </form>
                )}

                <form
                  action={deleteFeatureFlag}
                  className="mt-3 border-t border-emce-border pt-3"
                >
                  <input type="hidden" name="id" value={f.id} />
                  <ConfirmSubmit
                    size="sm"
                    variant="ghost"
                    confirm={`Delete "${f.label}"? Any code reading this key will fall back to false.`}
                    pendingLabel="…"
                    className="text-emce-red-deep"
                  >
                    Delete flag
                  </ConfirmSubmit>
                </form>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
