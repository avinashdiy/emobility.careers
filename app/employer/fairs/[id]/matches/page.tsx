import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { EmployerShell } from "@/components/layout/employer-shell";
import { getOrComputeCandidateMatch } from "@/server/matching/candidate-match";

export const metadata: Metadata = { title: "Pre-event matches · fair" };
export const dynamic = "force-dynamic";

/**
 * Pre-event JD-matched attendee list (per fair).
 *
 * Recruiter view at /employer/fairs/[id]/matches showing
 * registered candidates ranked by match score against ONE of the
 * recruiter's company's fair-attached jobs. The brochure's
 * "Receive curated candidate profiles 2 weeks before the event"
 * promise — but instead of an email, it's a live list the
 * recruiter scrolls inside their dashboard.
 *
 * Job filter: `?job=<jobId>` picks which of the company's
 * fair-attached jobs to rank against. Defaults to the first one.
 * Recruiter sees other attached jobs as tabs along the top.
 *
 * Match-score computation: reuses `getOrComputeCandidateMatch`
 * (cached for 7 days). For an attendee list of ~50–200 the
 * sequential compute is acceptable; if attendees scale to 1000+
 * we'd batch-compute via a worker tick.
 */
export default async function FairPreEventMatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect(`/signin?next=/employer/fairs`);
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }

  const { id } = await params;
  const sp = await searchParams;

  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    select: { companyId: true, company: { select: { name: true } } },
  });
  if (!employer?.companyId) redirect("/employer/onboarding");

  // Two-step authz: must be on the fair (CONFIRMED status), and
  // the fair must exist.
  const drive = await db.recruitmentDrive.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      status: true,
      registeredCount: true,
    },
  });
  if (!drive) notFound();

  const participation = await db.recruitmentDriveCompany.findUnique({
    where: {
      driveId_companyId: { driveId: drive.id, companyId: employer.companyId },
    },
    select: { id: true, status: true },
  });
  if (!participation || participation.status !== "CONFIRMED") {
    redirect(`/employer/fairs?error=Not%20on%20this%20fair`);
  }

  // The company's jobs attached to this fair. Empty list = the
  // recruiter hasn't attached any roles yet, so we don't have an
  // anchor JD to rank against.
  const fairJobs = await db.recruitmentDriveJob.findMany({
    where: { driveId: drive.id, companyId: employer.companyId },
    orderBy: [{ sortOrder: "asc" }, { attachedAt: "asc" }],
    include: {
      job: { select: { id: true, title: true, status: true } },
    },
  });
  const eligibleFairJobs = fairJobs.filter((fj) => fj.job.status === "OPEN");

  if (eligibleFairJobs.length === 0) {
    return (
      <EmployerShell>
        <div className="container max-w-4xl space-y-6 py-6 md:py-8">
          <PageHeader
            eyebrow="Pre-event matches"
            title={`Matches at ${drive.title}`}
            backHref={`/employer/fairs/${drive.id}`}
          />
          <EmptyState
            variant="mesh"
            icon="🎯"
            title="No jobs attached yet"
            body="Attach an OPEN job to your booth and we'll rank registered attendees by how well their profiles match it."
            action={
              <Link
                href={`/employer/fairs/${drive.id}`}
                className="rounded-md bg-emce-dark px-4 py-2 text-sm font-bold text-emce-light hover:bg-emce-dark-deep"
              >
                Manage your booth
              </Link>
            }
          />
        </div>
      </EmployerShell>
    );
  }

  // Pick the active job (URL param wins; defaults to first).
  const activeJobId =
    sp.job && eligibleFairJobs.some((fj) => fj.job.id === sp.job)
      ? sp.job
      : eligibleFairJobs[0].job.id;

  // Pull every registered candidate. Cap at 500 — beyond that, the
  // recruiter should pre-filter via the existing /employer/candidates
  // search.
  const registrations = await db.recruitmentDriveRegistration.findMany({
    where: {
      driveId: drive.id,
      status: { in: ["REGISTERED", "CHECKED_IN"] },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      status: true,
      checkInCode: true,
      intentNote: true,
      candidate: {
        select: {
          id: true,
          slug: true,
          firstName: true,
          lastName: true,
          headline: true,
          profilePhotoUrl: true,
          city: true,
          totalExperienceMonths: true,
          isDIYguruVerified: true,
        },
      },
    },
  });

  // Compute (or pull cached) match score for each registrant
  // against the active job. Sequential — fine at ~100 attendees,
  // would need a worker batch beyond ~500.
  const scored = await Promise.all(
    registrations.map(async (r) => {
      const match = await getOrComputeCandidateMatch(r.candidate.id, activeJobId);
      return { registration: r, score: match?.score ?? null };
    }),
  );

  // Sort: scored candidates first (desc by score), unscored last
  // (alphabetical by name).
  scored.sort((a, b) => {
    if (a.score !== null && b.score !== null) return b.score - a.score;
    if (a.score !== null) return -1;
    if (b.score !== null) return 1;
    return a.registration.candidate.firstName.localeCompare(
      b.registration.candidate.firstName,
    );
  });

  const activeJob = eligibleFairJobs.find((fj) => fj.job.id === activeJobId)!;

  return (
    <EmployerShell>
      <div className="container max-w-5xl space-y-6 py-6 md:py-8">
        <PageHeader
          eyebrow="Pre-event matches"
          title={`Matches at ${drive.title}`}
          subtitle={`${drive.registeredCount} candidate${drive.registeredCount === 1 ? "" : "s"} registered · scored against your "${activeJob.job.title}" job`}
          backHref={`/employer/fairs/${drive.id}`}
        />

        {/* Job switcher — tabs for each of the company's
            fair-attached jobs. Clicking re-renders the page with
            the new match-anchor JD. */}
        {eligibleFairJobs.length > 1 && (
          <nav
            aria-label="Pick a job to rank against"
            className="flex flex-wrap gap-2 rounded-md border border-emce-border bg-white p-2"
          >
            {eligibleFairJobs.map((fj) => {
              const active = fj.job.id === activeJobId;
              return (
                <Link
                  key={fj.job.id}
                  href={`/employer/fairs/${drive.id}/matches?job=${fj.job.id}`}
                  className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-bold transition ${
                    active
                      ? "bg-emce-dark text-emce-light"
                      : "text-emce-text-sec hover:bg-emce-light-soft"
                  }`}
                >
                  {fj.job.title}
                </Link>
              );
            })}
          </nav>
        )}

        {scored.length === 0 ? (
          <EmptyState
            variant="soft"
            icon="📋"
            title="No registered attendees yet"
            body="As candidates register for the fair, their match score against your selected job will appear here. Check back closer to the date."
          />
        ) : (
          <ul className="divide-y divide-emce-border rounded-md border border-emce-border bg-white">
            {scored.map(({ registration, score }) => {
              const c = registration.candidate;
              const fullName = `${c.firstName} ${c.lastName ?? ""}`.trim();
              const expYears =
                c.totalExperienceMonths > 0
                  ? `${(c.totalExperienceMonths / 12).toFixed(1)} yrs`
                  : "Fresher";
              return (
                <li
                  key={registration.id}
                  className="flex items-center gap-3 p-3"
                >
                  <Avatar
                    src={c.profilePhotoUrl}
                    name={fullName}
                    size="sm"
                    className="h-10 w-10 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/${c.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-bold text-emce-text hover:underline"
                      >
                        {fullName}
                      </Link>
                      {c.isDIYguruVerified && (
                        <Badge variant="diyguru" size="sm">⭐ DIYguru</Badge>
                      )}
                      {registration.status === "CHECKED_IN" && (
                        <Badge variant="success" size="sm">✓ Checked in</Badge>
                      )}
                    </div>
                    {c.headline && (
                      <p className="line-clamp-1 text-hint text-emce-text-sec">
                        {c.headline}
                      </p>
                    )}
                    <p className="text-[10px] uppercase tracking-wide text-emce-text-muted">
                      {expYears}
                      {c.city ? ` · ${c.city}` : ""}
                      {" · Reg. code: "}
                      <span className="font-mono font-bold">{registration.checkInCode}</span>
                    </p>
                    {registration.intentNote && (
                      <p className="mt-1 line-clamp-2 italic text-hint text-emce-text-sec">
                        &ldquo;{registration.intentNote}&rdquo;
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {score === null ? (
                      <span className="text-hint text-emce-text-muted">
                        Not scored
                      </span>
                    ) : (
                      <span
                        className={`text-2xl font-extrabold tabular-nums ${
                          score >= 75
                            ? "text-emce-success-deep"
                            : score >= 50
                              ? "text-amber-600"
                              : "text-emce-text-muted"
                        }`}
                      >
                        {Math.round(score)}%
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <Card className="p-4 text-hint text-emce-text-sec">
          <strong className="text-emce-text">How this works:</strong>{" "}
          Match score is computed from the candidate&apos;s profile (skills,
          experience, EV domain, location) against the selected
          job&apos;s requirements. Scores are cached for 7 days. Click any
          candidate&apos;s name to open their full profile in a new tab.
        </Card>
      </div>
    </EmployerShell>
  );
}
