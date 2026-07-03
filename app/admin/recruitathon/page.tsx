import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminShell } from "@/components/layout/admin-shell";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Recruitathon registrations" };

/**
 * Admin dashboard for the Recruitathon inline-signup flow. Lists
 * every RecruitmentDrive with its inline-signup counts (candidates +
 * employers via the new RECRUITATHON_INLINE source) and links to:
 *
 *   • /admin/recruitathon/[slug]            — per-fair detail
 *   • /admin/recruitathon/[slug]/candidates.csv
 *   • /admin/recruitathon/[slug]/employers.csv
 *
 * Placement team uses the CSV exports to email the matched candidate
 * lists to participating employers + the matched employer lists to
 * registered candidates ahead of the fair.
 */
export default async function AdminRecruitathonIndex() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const drives = await db.recruitmentDrive.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS", "CLOSED"] } },
    orderBy: { startsAt: "desc" },
    select: {
      id: true, slug: true, title: true, city: true, state: true,
      startsAt: true, status: true,
      _count: {
        select: {
          registrations: true,
          participatingCompanies: true,
        },
      },
    },
  });

  // Per-drive inline-signup counts (the subset that came through the
  // new RECRUITATHON_INLINE source). Done in one batched groupBy.
  const inlineCounts = await db.recruitmentDriveRegistration.groupBy({
    by: ["driveId"],
    where: { source: "RECRUITATHON_INLINE" },
    _count: { _all: true },
  });
  const inlineByDrive = new Map(inlineCounts.map((r) => [r.driveId, r._count._all]));

  return (
    <AdminShell>
      <div className="container max-w-5xl py-8">
        <h1 className="text-dashboard text-emce-text">Recruitathon registrations</h1>
        <p className="mt-1 text-hint text-emce-text-sec">
          Self-registrations from the public inline-signup form
          (<code>/fairs/[slug]/register</code>). Click a fair to manage rows
          + export CSVs for the placement team.
        </p>

        <div className="mt-4 rounded-lg border border-emce-border bg-emce-light-soft/50 p-4">
          <Button asChild>
            <a href="/api/admin/recruitathon/export">📊 Download detailed test-scores CSV</a>
          </Button>
          <p className="mt-2 text-hint text-emce-text-sec">
            One row per candidate × role, across all drives: name · email · phone · education · skills ·
            company · role · level · location · eligibility · AI match/fitment · priority · test score ·
            pass/fail · tab-switch &amp; camera flags · general-EV score. Opens straight in Excel.
          </p>
        </div>

        {drives.length === 0 ? (
          <EmptyState
            icon="🎫"
            title="No recruitment drives yet"
            body="Create one via /admin/fairs first; this page lists drives with public inline-signup enabled."
          />
        ) : (
          <ul className="mt-6 space-y-3">
            {drives.map((d) => {
              const inline = inlineByDrive.get(d.id) ?? 0;
              const place = [d.city, d.state].filter(Boolean).join(", ");
              const when = new Date(d.startsAt).toLocaleDateString("en-IN", {
                day: "numeric", month: "short", year: "numeric",
              });
              return (
                <li key={d.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <Link
                            href={`/admin/recruitathon/${d.slug}`}
                            className="text-lg font-extrabold text-emce-text hover:underline"
                          >
                            {d.title}
                          </Link>
                          <Badge variant={d.status === "OPEN" ? "success" : d.status === "IN_PROGRESS" ? "warning" : "default"} size="sm">
                            {d.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-hint text-emce-text-sec">
                          📅 {when} · 📍 {place}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-4 text-sm">
                          <span className="text-emce-text-sec">
                            <strong className="text-emce-text">{d._count.registrations}</strong> candidates
                            {inline > 0 && <span className="text-emce-text-muted"> ({inline} via Recruitathon form)</span>}
                          </span>
                          <span className="text-emce-text-sec">
                            <strong className="text-emce-text">{d._count.participatingCompanies}</strong> companies
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline">
                          <a href={`/admin/recruitathon/${d.slug}/candidates.csv`}>📥 Candidates CSV</a>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <a href={`/admin/recruitathon/${d.slug}/employers.csv`}>📥 Employers CSV</a>
                        </Button>
                        <Button asChild size="sm">
                          <Link href={`/admin/recruitathon/${d.slug}`}>Manage →</Link>
                        </Button>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
