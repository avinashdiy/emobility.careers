import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { setJobStatus } from "@/server/admin/actions";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Job quality" };
export const dynamic = "force-dynamic";

const GHOST_JOB_DAYS = 60; // OPEN ≥ 60d with zero applications
const STALE_NO_MOVEMENT_DAYS = 45; // OPEN with applications but none moved past APPLIED in N days

export default async function JobQualityPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const ghostCutoff = new Date(Date.now() - GHOST_JOB_DAYS * 86400_000);
  const noMovementCutoff = new Date(Date.now() - STALE_NO_MOVEMENT_DAYS * 86400_000);

  // Ghost jobs: still OPEN, published > N days ago, zero applications.
  // The candidate's-eye-view: "I applied a month ago, never heard back"
  // is the most damaging UX failure on the platform — surface it
  // ruthlessly so admins can nudge employers to close.
  const ghosts = await db.jobPosting.findMany({
    where: {
      status: "OPEN",
      publishedAt: { lt: ghostCutoff },
      applications: { none: {} },
    },
    take: 50,
    orderBy: { publishedAt: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      publishedAt: true,
      company: { select: { name: true, slug: true } },
      _count: { select: { applications: true } },
    },
  });

  // No-movement jobs: have applications, but no Application has been
  // touched recently (updatedAt < cutoff for ALL applications). We
  // approximate by joining and grouping; the Prisma `every:` clause
  // expresses this directly.
  const stalled = await db.jobPosting.findMany({
    where: {
      status: "OPEN",
      applications: {
        some: {},
        every: { updatedAt: { lt: noMovementCutoff } },
      },
    },
    take: 50,
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      updatedAt: true,
      company: { select: { name: true, slug: true } },
      _count: { select: { applications: true } },
    },
  });

  // Likely duplicates: same company, identical normalised title, both
  // OPEN, posted within 30 days. Normalisation is admin-side only —
  // we don't enforce uniqueness because legit re-postings (different
  // location, different team) share titles all the time.
  const duplicateGroups = await db.$queryRaw<
    {
      company_id: string;
      company_name: string;
      normalized_title: string;
      job_ids: string[];
      job_titles: string[];
      job_slugs: string[];
      count: bigint;
    }[]
  >`
    SELECT
      j."companyId" AS company_id,
      c.name AS company_name,
      lower(regexp_replace(j.title, '[^a-zA-Z0-9]+', ' ', 'g')) AS normalized_title,
      array_agg(j.id ORDER BY j."publishedAt" DESC) AS job_ids,
      array_agg(j.title ORDER BY j."publishedAt" DESC) AS job_titles,
      array_agg(j.slug ORDER BY j."publishedAt" DESC) AS job_slugs,
      COUNT(*) AS count
    FROM "JobPosting" j
    JOIN "Company" c ON c.id = j."companyId"
    WHERE j.status = 'OPEN'
      AND j."publishedAt" > NOW() - INTERVAL '30 days'
    GROUP BY j."companyId", c.name, normalized_title
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 30
  `;

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <h1 className="text-dashboard text-emce-text">Job quality</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Three quality signals to investigate. Ghost jobs hurt candidate
          trust most — close them or nudge the employer first.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Tile label="Ghost (≥60d, 0 apps)" value={ghosts.length} />
          <Tile label="No movement (45d+)" value={stalled.length} />
          <Tile label="Likely-duplicate groups" value={duplicateGroups.length} />
        </div>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">
            👻 Ghost jobs
            <span className="ml-2 text-hint font-normal text-emce-text-muted">
              (open ≥ {GHOST_JOB_DAYS}d, zero applications)
            </span>
          </h2>
          {ghosts.length === 0 ? (
            <p className="mt-3 text-hint text-emce-text-sec">None — clean.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {ghosts.map((j) => (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emce-orange/40 bg-emce-orange-light/30 p-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/job/${j.slug}`}
                      className="font-bold text-emce-text hover:underline"
                    >
                      {j.title}
                    </Link>
                    <span className="ml-2 text-hint text-emce-text-muted">
                      {j.company.name} · published {relativeTime(j.publishedAt!)}
                    </span>
                  </div>
                  <form action={setJobStatus}>
                    <input type="hidden" name="id" value={j.id} />
                    <input type="hidden" name="status" value="CLOSED" />
                    <ConfirmSubmit
                      confirm={`Close "${j.title}"? Recruiter can re-open.`}
                      size="sm"
                      variant="ghost"
                    >
                      Close
                    </ConfirmSubmit>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">
            🐌 Stalled pipelines
            <span className="ml-2 text-hint font-normal text-emce-text-muted">
              (no application moved in {STALE_NO_MOVEMENT_DAYS}d+)
            </span>
          </h2>
          {stalled.length === 0 ? (
            <p className="mt-3 text-hint text-emce-text-sec">None — clean.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {stalled.map((j) => (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-emce-light-soft p-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/employer/jobs/${j.id}/ats`}
                      className="font-bold text-emce-text hover:underline"
                    >
                      {j.title}
                    </Link>
                    <span className="ml-2 text-hint text-emce-text-muted">
                      {j.company.name} · {j._count.applications} candidate
                      {j._count.applications === 1 ? "" : "s"} · last update {relativeTime(j.updatedAt)}
                    </span>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/employers`}>Nudge employer</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">
            🔁 Likely duplicates
            <span className="ml-2 text-hint font-normal text-emce-text-muted">
              (same company + normalised title, both OPEN, last 30d)
            </span>
          </h2>
          {duplicateGroups.length === 0 ? (
            <p className="mt-3 text-hint text-emce-text-sec">None — clean.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {duplicateGroups.map((g) => (
                <li
                  key={`${g.company_id}-${g.normalized_title}`}
                  className="rounded-md border border-emce-border p-3"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-bold text-emce-text">{g.company_name}</span>
                    <Badge variant="warning">{Number(g.count)} duplicates</Badge>
                  </div>
                  <ul className="mt-2 space-y-1 text-hint">
                    {g.job_titles.map((title, i) => (
                      <li key={g.job_ids[i]}>
                        <Link
                          href={`/job/${g.job_slugs[i]}`}
                          className="text-emce-text-sec hover:underline"
                        >
                          {title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  const tone = value > 0 ? "border-emce-orange bg-emce-orange-light/30" : "";
  return (
    <Card className={`p-5 ${tone}`}>
      <div className="text-xs uppercase tracking-wide text-emce-text-muted">{label}</div>
      <div className="mt-1 text-3xl font-extrabold text-emce-dark tabular-nums">
        {value.toLocaleString()}
      </div>
    </Card>
  );
}
