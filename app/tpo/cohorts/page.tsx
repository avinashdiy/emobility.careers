import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCohort, archiveCohort, unarchiveCohort } from "@/server/cohorts/actions";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ApplicationStage } from "@prisma/client";

export const metadata = { title: "Cohorts" };

/**
 * Cohort list with quick KPIs + a "create new" form. Each row links to
 * the cohort detail page where the full funnel + roster lives.
 */
export default async function CohortListPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const showArchived = sp.archived === "true";
  const cohorts = await db.cohort.findMany({
    where: { status: showArchived ? "ARCHIVED" : "ACTIVE" },
    orderBy: [{ batchCode: "desc" }, { createdAt: "desc" }],
    include: {
      _count: {
        select: { rosterEntries: true, candidates: true },
      },
    },
  });

  // Pull cheap KPIs for the row tiles in one go — hired count per cohort.
  const cohortIds = cohorts.map((c) => c.id);
  const hiredRows = cohortIds.length
    ? await db.application.groupBy({
        by: ["candidateId"],
        where: {
          candidate: { cohortId: { in: cohortIds } },
          stage: ApplicationStage.HIRED,
        },
        _count: { _all: true },
      })
    : [];
  const candidateToCohort = cohortIds.length
    ? await db.candidateProfile.findMany({
        where: { id: { in: hiredRows.map((r) => r.candidateId) } },
        select: { id: true, cohortId: true },
      })
    : [];
  const cohortHired = new Map<string, number>();
  for (const c of candidateToCohort) {
    if (c.cohortId) cohortHired.set(c.cohortId, (cohortHired.get(c.cohortId) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Placement"
        title="Cohorts"
        subtitle="Group DIYguru roster entries into named batches so the TPO funnel can slice by group."
        actions={
          <Link
            href={showArchived ? "/tpo/cohorts" : "/tpo/cohorts?archived=true"}
            className="text-xs font-bold text-emce-text-sec hover:underline"
          >
            {showArchived ? "← Active cohorts" : "Archived cohorts →"}
          </Link>
        }
      />

      {sp.error && (
        <div className="rounded-md bg-emce-red-light p-3 text-sm text-emce-red">{sp.error}</div>
      )}

      <Card>
        <SectionTitle
          title="Create cohort"
          description="Use a name that includes the course + batch — e.g. EV Powertrain — Mar 2025."
        />
        <form action={createCohort} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="name">Cohort name *</Label>
            <Input id="name" name="name" required minLength={2} maxLength={120} />
          </div>
          <div>
            <Label htmlFor="courseName">Course name *</Label>
            <Input id="courseName" name="courseName" required maxLength={120} />
          </div>
          <div>
            <Label htmlFor="batchCode">Batch code (optional)</Label>
            <Input id="batchCode" name="batchCode" placeholder="2025-03" maxLength={20} />
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
            <Label htmlFor="institution">Institution / lab</Label>
            <Input id="institution" name="institution" maxLength={160} />
          </div>
          <div>
            <Label htmlFor="capacity">Capacity</Label>
            <Input id="capacity" name="capacity" type="number" min={0} max={10000} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={3} maxLength={2000} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Create cohort</Button>
          </div>
        </form>
      </Card>

      {cohorts.length === 0 ? (
        <EmptyState
          icon="📚"
          title={`No ${showArchived ? "archived" : "active"} cohorts yet`}
          body={showArchived ? "Cohorts you archive will show up here." : "Use the form above to create your first cohort."}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {cohorts.map((c) => {
            const hired = cohortHired.get(c.id) ?? 0;
            const placementPct = c._count.candidates > 0
              ? Math.round((hired / c._count.candidates) * 100)
              : 0;
            return (
              <li key={c.id}>
                <Card className="h-full">
                  <div className="flex items-start justify-between">
                    <div>
                      <Link
                        href={`/tpo/cohorts/${c.slug}`}
                        className="font-bold text-emce-text hover:underline"
                      >
                        {c.name}
                      </Link>
                      <p className="text-hint text-emce-text-sec">
                        {c.courseName}
                        {c.batchCode && <> · {c.batchCode}</>}
                      </p>
                    </div>
                    {c.status === "ARCHIVED" ? (
                      <Badge variant="outline">Archived</Badge>
                    ) : (
                      <Badge variant={placementPct >= 50 ? "success" : "warning"}>
                        {placementPct}% placed
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-emce-light-soft p-2">
                      <p className="text-lg font-extrabold text-emce-text">{c._count.rosterEntries}</p>
                      <p className="text-hint text-emce-text-sec">Roster</p>
                    </div>
                    <div className="rounded-md bg-emce-light-soft p-2">
                      <p className="text-lg font-extrabold text-emce-text">{c._count.candidates}</p>
                      <p className="text-hint text-emce-text-sec">Claimed</p>
                    </div>
                    <div className="rounded-md bg-emce-light-soft p-2">
                      <p className="text-lg font-extrabold text-emce-mid-muted">{hired}</p>
                      <p className="text-hint text-emce-text-sec">Hired</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <form action={c.status === "ACTIVE" ? archiveCohort : unarchiveCohort}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        {c.status === "ACTIVE" ? "Archive" : "Restore"}
                      </Button>
                    </form>
                    <Button asChild size="sm">
                      <Link href={`/tpo/cohorts/${c.slug}`}>Open →</Link>
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
