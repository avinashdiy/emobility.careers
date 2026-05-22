import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { listCohortDriveParticipation } from "@/lib/tpo";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Programs · Placement" };

/**
 * Per-program (RecruitmentDrive) participation report for the TPO's
 * cohort. The platform models the Summer Internship Program, every
 * Recruitathon, every fair, and every campus drive as a
 * `RecruitmentDrive` — so this single surface answers Shivani's
 * question about "how is my college tracking on the internship
 * program?" without forking a new entity.
 *
 * Two roll-up KPIs per drive:
 *   • Registered — cohort students who signed up for the drive
 *     (RecruitmentDriveRegistration)
 *   • Applied — cohort students who applied to ≥1 job that's part
 *     of the drive (Application → RecruitmentDriveJob)
 *
 * Stage breakdown is rendered as a tight inline strip — admin can
 * click into a drive for the full per-student table + CSV export.
 */
export default async function TpoProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string }>;
}) {
  const sp = await searchParams;
  const cohort = sp.cohort
    ? await db.cohort.findUnique({
        where: { slug: sp.cohort },
        select: { id: true, slug: true, name: true, courseName: true },
      })
    : null;
  const cohortId = cohort?.id ?? null;

  const [drives, cohortOptions] = await Promise.all([
    listCohortDriveParticipation(cohortId),
    db.cohort.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ batchCode: "desc" }, { createdAt: "desc" }],
      select: { slug: true, name: true },
      take: 50,
    }),
  ]);

  const cohortQS = cohort ? `?cohort=${cohort.slug}` : "";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Placement · Programs"
        title="Internship & placement programs"
        subtitle={
          <>
            {cohort
              ? `${cohort.name} — ${cohort.courseName}`
              : "All DIYguru cohorts"}
            {" · "}
            <span className="text-emce-text-muted">
              Click a program for per-student participation + CSV export.
            </span>
          </>
        }
        actions={
          <form className="flex items-center gap-2">
            <label htmlFor="cohort" className="text-hint text-emce-text-sec">
              Cohort:
            </label>
            <select
              id="cohort"
              name="cohort"
              defaultValue={cohort?.slug ?? ""}
              className="h-9 rounded-md border border-emce-border bg-white px-2 text-sm"
            >
              <option value="">All DIYguru</option>
              {cohortOptions.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-emce-dark px-3 py-1 text-xs font-bold text-white hover:bg-emce-darkest"
            >
              Apply
            </button>
          </form>
        }
      />

      {drives.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No active programs"
          body="Programs (recruitment drives, internships, fairs) show up here once they're OPEN or IN_PROGRESS. Past programs stay listed for 90 days."
        />
      ) : (
        <ul className="space-y-3">
          {drives.map((d) => {
            const statusVariant =
              d.status === "OPEN"
                ? "success"
                : d.status === "IN_PROGRESS"
                  ? "warning"
                  : "default";
            return (
              <li key={d.driveId}>
                <Link
                  href={`/tpo/programs/${d.driveSlug}${cohortQS}`}
                  className="block"
                >
                  <Card variant="interactive" className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-emce-text">
                            {d.driveTitle}
                          </h3>
                          <Badge variant={statusVariant} size="sm">
                            {d.status}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-hint text-emce-text-muted">
                          📅 {d.startsAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
                          {d.endsAt > d.startsAt && (
                            <> – {d.endsAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}</>
                          )}
                          {" · "}
                          {relativeTime(d.startsAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-emce-text">
                        <Link
                          href={`/tpo/programs/${d.driveSlug}.csv${cohortQS}`}
                          className="rounded-md border border-emce-border bg-white px-2 py-1 text-xs font-semibold hover:bg-emce-light-soft"
                          onClick={(e) => e.stopPropagation()}
                        >
                          ⬇ CSV
                        </Link>
                      </div>
                    </div>

                    {/* KPI strip — registered, applied, hired counts */}
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                      <KpiTile label="Registered" value={d.registeredCount} />
                      <KpiTile label="Applied" value={d.appliedCount} />
                      <KpiTile
                        label="Hired"
                        value={d.hiredCount}
                        accent={d.hiredCount > 0}
                      />
                      <KpiTile
                        label="Interview"
                        value={d.stageCounts.INTERVIEW ?? 0}
                      />
                      <KpiTile
                        label="Shortlisted"
                        value={d.stageCounts.SHORTLISTED ?? 0}
                      />
                      <KpiTile
                        label="Applied (raw)"
                        value={d.stageCounts.APPLIED ?? 0}
                      />
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-2 text-center ${
        accent
          ? "border-emce-mid bg-emce-light-soft"
          : "border-emce-border bg-white"
      }`}
    >
      <div
        className={`text-lg font-extrabold ${
          accent ? "text-emce-darkest" : "text-emce-text"
        }`}
      >
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-emce-text-muted">
        {label}
      </div>
    </div>
  );
}
