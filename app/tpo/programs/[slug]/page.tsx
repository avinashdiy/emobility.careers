import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getDriveStudentReport } from "@/lib/tpo";
import type { ApplicationStage } from "@prisma/client";

export const metadata = { title: "Program participation · Placement" };

/**
 * Per-drive student participation table for the TPO.
 *
 * One row per cohort student. Columns: name, course, registered Y/N,
 * # applications to this drive's jobs, furthest stage they reached.
 * Click a student → their public profile (or the candidate detail in
 * /admin/candidates for richer info, depending on caller's permission).
 *
 * The "Download CSV" link in the header points at the sibling
 * `.csv/route.ts` handler which serves the same data as a file —
 * lets TPOs share with leadership / forward to managers / paste into
 * Excel for further analysis without rebuilding the table.
 */
export default async function TpoDriveDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cohort?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const cohort = sp.cohort
    ? await db.cohort.findUnique({
        where: { slug: sp.cohort },
        select: { id: true, slug: true, name: true, courseName: true },
      })
    : null;
  const cohortId = cohort?.id ?? null;

  const report = await getDriveStudentReport(cohortId, slug);
  if (!report) notFound();

  const { drive, students } = report;
  const cohortQS = cohort ? `?cohort=${cohort.slug}` : "";

  // Rollup numbers for the header KPI strip.
  const registeredCount = students.filter((s) => s.registered).length;
  const appliedCount = students.filter((s) => s.applicationsCount > 0).length;
  const hiredCount = students.filter((s) => s.furthestStage === "HIRED").length;

  return (
    <div className="space-y-6">
      <Link
        href={`/tpo/programs${cohortQS}`}
        className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
      >
        ← Programs
      </Link>
      <PageHeader
        eyebrow="Placement · Program"
        title={drive.title}
        subtitle={
          <>
            <Badge
              variant={
                drive.status === "OPEN"
                  ? "success"
                  : drive.status === "IN_PROGRESS"
                    ? "warning"
                    : "default"
              }
              size="sm"
            >
              {drive.status}
            </Badge>{" "}
            {cohort
              ? `${cohort.name} — ${cohort.courseName}`
              : "All DIYguru cohorts"}{" "}
            <span className="text-emce-text-muted">
              · {students.length} student{students.length === 1 ? "" : "s"} in scope
            </span>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/tpo/programs/${drive.slug}.csv${cohortQS}`}>
                ⬇ Download CSV
              </Link>
            </Button>
          </div>
        }
      />

      {/* ── KPI rollup ── */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <div className="text-2xl font-extrabold text-emce-text">
            {registeredCount}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-emce-text-muted">
            Registered for the drive
          </div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-extrabold text-emce-text">
            {appliedCount}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-emce-text-muted">
            Applied to ≥1 job
          </div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-extrabold text-emce-darkest">
            {hiredCount}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-emce-text-muted">
            Hired
          </div>
        </Card>
      </div>

      {/* ── Per-student table ── */}
      {students.length === 0 ? (
        <EmptyState
          icon="🎓"
          title="No students in this cohort"
          body={
            cohort
              ? "Import roster from /tpo/import to populate this view."
              : "The DIYguru-verified pool is currently empty."
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-emce-light-soft text-left text-[10px] font-bold uppercase tracking-wider text-emce-text-sec">
              <tr>
                <th className="p-3">Student</th>
                <th className="p-3 text-center">Registered</th>
                <th className="p-3 text-center">Applied</th>
                <th className="p-3">Furthest stage</th>
                <th className="p-3">Per-job detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emce-border">
              {students.map((s) => {
                const fullName = `${s.firstName} ${s.lastName ?? ""}`.trim();
                return (
                  <tr key={s.candidateId}>
                    <td className="p-3">
                      <Link
                        href={`/${s.slug}`}
                        target="_blank"
                        className="flex items-center gap-2 hover:underline"
                      >
                        <Avatar name={fullName} size="sm" src={null} />
                        <div className="min-w-0">
                          <div className="font-bold text-emce-text">{fullName}</div>
                          {s.email && (
                            <div className="text-hint text-emce-text-muted">
                              {s.email}
                              {s.course && ` · ${s.course}`}
                            </div>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="p-3 text-center">
                      {s.registered ? (
                        <Badge
                          variant={s.checkedIn ? "success" : "default"}
                          size="sm"
                        >
                          {s.checkedIn ? "✓ Checked in" : "✓ Yes"}
                        </Badge>
                      ) : (
                        <span className="text-emce-text-muted">—</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {s.applicationsCount > 0 ? (
                        <Badge variant="default" size="sm">
                          {s.applicationsCount}
                        </Badge>
                      ) : (
                        <span className="text-emce-text-muted">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {s.furthestStage ? (
                        <StagePill stage={s.furthestStage} />
                      ) : (
                        <span className="text-emce-text-muted">Not applied</span>
                      )}
                    </td>
                    <td className="p-3 text-hint text-emce-text-sec">
                      {s.perJob.length === 0 ? (
                        <span className="text-emce-text-muted">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {s.perJob.slice(0, 3).map((j, idx) => (
                            <li key={idx} className="truncate">
                              <span className="font-semibold">{j.jobTitle}</span>{" "}
                              <span className="text-emce-text-muted">
                                @ {j.companyName}
                              </span>{" "}
                              <Badge variant="outline" size="sm">
                                {j.stage}
                              </Badge>
                            </li>
                          ))}
                          {s.perJob.length > 3 && (
                            <li className="text-emce-text-muted">
                              +{s.perJob.length - 3} more
                            </li>
                          )}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function StagePill({ stage }: { stage: ApplicationStage }) {
  const tone: Record<ApplicationStage, "default" | "success" | "warning" | "outline"> = {
    APPLIED: "outline",
    SCREENED: "default",
    SHORTLISTED: "default",
    ASSESSMENT: "warning",
    INTERVIEW: "warning",
    OFFER: "success",
    HIRED: "success",
    REJECTED: "outline",
    WITHDRAWN: "outline",
  };
  return (
    <Badge variant={tone[stage]} size="sm">
      {stage}
    </Badge>
  );
}
