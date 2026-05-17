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
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { PageHeader } from "@/components/ui/page-header";
import {
  createCohort,
  archiveCohort,
  unarchiveCohort,
} from "@/server/cohorts/actions";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Cohorts · Admin" };
export const dynamic = "force-dynamic";

/**
 * Admin mirror of /tpo/cohorts — same data, but reachable from the
 * admin shell without leaving the admin chrome. Reuses the TPO
 * server actions (createCohort / archiveCohort / unarchiveCohort)
 * which already accept ADMIN role via `requireTpoOrAdmin`.
 *
 * Drill-down (per-cohort funnel + roster) still lives at
 * /tpo/cohorts/[slug]; this page links into it. We don't duplicate
 * that page for admin since the data is identical and the TPO shell
 * is fine for admin viewing (admins pass through the layout gate).
 */
export default async function AdminCohortsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const showArchived = sp.archived === "true";

  const cohorts = await db.cohort.findMany({
    where: { status: showArchived ? "ARCHIVED" : "ACTIVE" },
    orderBy: [{ batchCode: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { rosterEntries: true, candidates: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  const [activeCount, archivedCount] = await Promise.all([
    db.cohort.count({ where: { status: "ACTIVE" } }),
    db.cohort.count({ where: { status: "ARCHIVED" } }),
  ]);

  return (
    <AdminShell>
      <div className="container max-w-4xl space-y-6 py-6 md:py-8">
        <ToastFromSearchParams />
        <PageHeader
          eyebrow="Placement"
          title="Cohorts"
          subtitle={`${activeCount} active · ${archivedCount} archived. Drill-down funnels live at /tpo/cohorts/<slug>.`}
        />

        {/* Tabs */}
        <div className="flex items-center gap-2">
          <Link
            href="/admin/cohorts"
            className={`inline-flex h-9 items-center justify-center rounded-md border px-4 text-xs font-bold ${
              !showArchived
                ? "border-emce-dark bg-emce-dark text-white"
                : "border-emce-border bg-white text-emce-dark hover:bg-emce-light-soft"
            }`}
          >
            Active · {activeCount}
          </Link>
          <Link
            href="/admin/cohorts?archived=true"
            className={`inline-flex h-9 items-center justify-center rounded-md border px-4 text-xs font-bold ${
              showArchived
                ? "border-emce-dark bg-emce-dark text-white"
                : "border-emce-border bg-white text-emce-dark hover:bg-emce-light-soft"
            }`}
          >
            Archived · {archivedCount}
          </Link>
          <Link
            href="/tpo"
            className="ml-auto text-hint font-bold text-emce-dark hover:underline"
          >
            Open TPO console →
          </Link>
        </div>

        {/* Create */}
        <Card className="p-5">
          <h2 className="text-section text-emce-text">New cohort</h2>
          <form action={createCohort} className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" required maxLength={120} placeholder="B.Tech EEE 2026" />
            </div>
            <div>
              <Label htmlFor="courseName">Course *</Label>
              <Input
                id="courseName"
                name="courseName"
                required
                maxLength={120}
                placeholder="Bachelor of Technology — Electrical & Electronics"
              />
            </div>
            <div>
              <Label htmlFor="batchCode">Batch code</Label>
              <Input
                id="batchCode"
                name="batchCode"
                maxLength={20}
                placeholder="2026-Q1"
              />
            </div>
            <div>
              <Label htmlFor="institution">Institution</Label>
              <Input
                id="institution"
                name="institution"
                maxLength={160}
                placeholder="BMS College of Engineering"
              />
            </div>
            <div>
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" name="startDate" type="date" />
            </div>
            <div>
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" name="endDate" type="date" />
            </div>
            <div>
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                name="capacity"
                type="number"
                min={0}
                max={10000}
                inputMode="numeric"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={2} maxLength={2000} />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <SubmitButton size="sm" pendingLabel="Creating…">
                Create cohort
              </SubmitButton>
            </div>
          </form>
        </Card>

        {/* List */}
        {cohorts.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-body text-emce-text-sec">
              No {showArchived ? "archived" : "active"} cohorts.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {cohorts.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Link
                        href={`/tpo/cohorts/${c.slug}`}
                        className="text-section font-extrabold text-emce-text hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.batchCode && (
                        <Badge variant="default" size="sm">{c.batchCode}</Badge>
                      )}
                      <Badge variant="outline" size="sm">
                        {c._count.rosterEntries} roster · {c._count.candidates} candidates
                      </Badge>
                    </div>
                    <p className="mt-1 text-hint text-emce-text-sec">
                      {c.courseName}
                      {c.institution ? ` · ${c.institution}` : ""}
                    </p>
                    <p className="text-[10px] text-emce-text-muted">
                      Created by {c.createdBy?.name ?? c.createdBy?.email ?? "admin"}{" "}
                      {relativeTime(c.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/tpo/cohorts/${c.slug}`}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-emce-border bg-white px-3 text-xs font-bold text-emce-dark hover:bg-emce-light-soft"
                    >
                      Funnel →
                    </Link>
                    {showArchived ? (
                      <form action={unarchiveCohort}>
                        <input type="hidden" name="cohortId" value={c.id} />
                        <SubmitButton size="sm" variant="outline" pendingLabel="…">
                          Unarchive
                        </SubmitButton>
                      </form>
                    ) : (
                      <form action={archiveCohort}>
                        <input type="hidden" name="cohortId" value={c.id} />
                        <ConfirmSubmit
                          size="sm"
                          variant="outline"
                          confirm={`Archive ${c.name}? It'll be hidden from active lists but data is preserved.`}
                          pendingLabel="…"
                        >
                          Archive
                        </ConfirmSubmit>
                      </form>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
