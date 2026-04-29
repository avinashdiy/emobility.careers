import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getUnplacedStudents } from "@/lib/tpo";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Unplaced students" };

/**
 * Unplaced-students working page. Cohort-filterable via the dropdown.
 * Sorted by lowest profile-completeness first (the TPO's first
 * intervention is "fill out your profile") then by oldest application
 * activity ("nudge them to apply more").
 */
export default async function UnplacedPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string }>;
}) {
  const sp = await searchParams;
  const cohort = sp.cohort
    ? await db.cohort.findUnique({ where: { slug: sp.cohort }, select: { id: true, name: true } })
    : null;

  const [unplaced, cohortOptions] = await Promise.all([
    getUnplacedStudents(cohort?.id ?? null, 200),
    db.cohort.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ batchCode: "desc" }, { createdAt: "desc" }],
      select: { slug: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Placement"
        title="Unplaced students"
        subtitle={`${cohort ? cohort.name : "All DIYguru-verified"} · sorted by profile-completeness ascending`}
        actions={
          <form className="flex items-center gap-2">
            <select
              name="cohort"
              defaultValue={sp.cohort ?? ""}
              className="rounded-md border border-emce-border bg-white px-3 py-1.5 text-sm"
            >
              <option value="">All DIYguru-verified</option>
              {cohortOptions.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
            <button type="submit" className="rounded-md bg-emce-dark px-3 py-1.5 text-sm font-bold text-white hover:bg-emce-darkest">
              Apply
            </button>
          </form>
        }
      />

      <Card>
        {unplaced.length === 0 ? (
          <EmptyState
            icon="🎉"
            title="Nobody unplaced in this view"
            body="Switch the cohort filter above to triage another group."
          />
        ) : (
          <ul className="divide-y divide-emce-border">
            {unplaced.map((s) => (
              <li key={s.candidateId} className="flex items-center gap-3 py-3">
                <Avatar src={s.profilePhotoUrl} name={s.fullName} size="md" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/${s.slug}`}
                    className="block font-bold text-emce-text hover:underline"
                  >
                    {s.fullName}
                  </Link>
                  <p className="line-clamp-1 text-hint text-emce-text-sec">
                    {s.headline ?? "No headline"}
                  </p>
                  <p className="text-hint text-emce-text-muted">
                    {s.cohortName ?? "No cohort"}
                    {s.email ? <> · {s.email}</> : null}
                  </p>
                </div>
                <div className="text-right text-hint">
                  <p className="text-emce-text-sec">{s.applicationsCount} applications</p>
                  {s.lastAppliedAt ? (
                    <p className="text-emce-text-muted">
                      Last applied {relativeTime(new Date(s.lastAppliedAt))}
                    </p>
                  ) : (
                    <Badge variant="warning" className="text-[10px]">No applications yet</Badge>
                  )}
                </div>
                <Badge
                  variant={s.profileCompleteness >= 90 ? "success" : s.profileCompleteness >= 50 ? "warning" : "danger"}
                  className="text-[10px]"
                >
                  {s.profileCompleteness}% complete
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
