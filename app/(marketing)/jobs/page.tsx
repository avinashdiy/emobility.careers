import Link from "next/link";
import { searchJobs } from "@/server/jobs/queries";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { JobCard } from "@/components/jobs/JobCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { rankJobsForCandidate } from "@/server/matching/candidate-match";

export const metadata = { title: "Browse EV jobs" };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; location?: string; domain?: string; workMode?: string; profileMode?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  // DIYGURU_ONLY listings are filtered into the result set only for
  // verified students. We resolve the flag here once and pass it down
  // so the WHERE clause stays a single Prisma roundtrip.
  let viewerIsDIYguru = false;
  // Hold onto the candidate row when present so we can score the
  // result set afterward. Skip the lookup entirely for non-candidates
  // to keep the anonymous and recruiter paths cheap.
  let candidateProfileId: string | null = null;
  if (session?.user) {
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, isDIYguruVerified: true },
    });
    viewerIsDIYguru = !!profile?.isDIYguruVerified;
    if (session.user.role === "CANDIDATE" && profile) {
      candidateProfileId = profile.id;
    }
  }
  const filter = {
    q: sp.q,
    location: sp.location,
    domain: sp.domain,
    workMode: sp.workMode,
    profileMode: sp.profileMode,
    viewerIsDIYguru,
    page: sp.page ? parseInt(sp.page) : 1,
  };
  const { jobs, total, page, pages } = await searchJobs(filter);
  const evDomains = await db.eVDomain.findMany({ orderBy: { order: "asc" } });

  // Score the visible page of results for the logged-in candidate so
  // each card can carry an "X% match" pill. We pass the IDs through
  // `rankJobsForCandidate` which prefers the cache and bounds live
  // computes per request — no risk of N concurrent embed calls. The
  // map is keyed by job id so the JobCard render stays a flat lookup.
  let scoreByJobId: Map<string, number> = new Map();
  let bestMatchesAbove60: { id: string; score: number }[] = [];
  if (candidateProfileId && jobs.length > 0) {
    try {
      const ranked = await rankJobsForCandidate(
        candidateProfileId,
        jobs.map((j) => j.id),
        jobs.length, // score everything on the page (rank takes top-K)
      );
      scoreByJobId = new Map(ranked.map((r) => [r.jobId, r.score]));
      // "Best matches for you" only highlights jobs that are
      // genuinely worth flagging. 0.6+ = decent or strong match per
      // MatchScoreCard's tone bands; below that we'd be promoting
      // weak fits and the section loses trust fast.
      bestMatchesAbove60 = ranked
        .filter((r) => r.score >= 0.6)
        .slice(0, 3)
        .map((r) => ({ id: r.jobId, score: r.score }));
    } catch {
      // Scoring is non-essential — let the page render.
    }
  }
  // Resolve the JobCard rows for the highlighted "Best matches" strip
  // (if any). We already have these objects in `jobs`, so a Map
  // lookup beats a second DB roundtrip.
  const jobsById = new Map(jobs.map((j) => [j.id, j]));
  const bestMatches = bestMatchesAbove60
    .map((b) => ({ job: jobsById.get(b.id), score: b.score }))
    .filter((x): x is { job: NonNullable<typeof x.job>; score: number } => Boolean(x.job));

  return (
    <div className="container py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="default">EV Jobs</Badge>
          <h1 className="mt-2 text-dashboard text-emce-text md:text-3xl">
            {total > 0 ? `${total.toLocaleString()} EV jobs` : "EV jobs"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {(filter.q || filter.location || filter.domain) && (
            <Button asChild variant="outline" size="sm">
              <Link href="/me/alerts">🔔 Save this search as alert</Link>
            </Button>
          )}
          {/* WhatsApp daily-digest CTA — sits next to alerts so any
              job-seeker scanning the page sees the lower-friction
              "phone, not inbox" path. */}
          <Button asChild size="sm" className="bg-[#25D366] text-white hover:bg-[#1ebe5b]">
            <Link href="/digest">📱 Get daily on WhatsApp</Link>
          </Button>
        </div>
      </div>

      {/* Filter bar — on mobile only the search query and Search
          button are visible by default; secondary filters (location,
          work mode, profile mode) collapse into a "More filters"
          panel so the page doesn't lead with five stacked rows.
          On sm+ everything sits inline in the grid-cols-12 layout.
          The collapsibility is pure HTML — `<details>` keeps form
          inputs in the DOM (and submitting) even when visually
          hidden, so no JS / client component needed. */}
      <Card className="mb-6 p-4">
        <form className="grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <Input name="q" defaultValue={filter.q ?? ""} placeholder="Title, skill, company" />
          </div>

          {/* Secondary filters — collapsible on mobile, force-shown
              on sm+. Both the <details> wrapper and its inner div use
              `sm:!contents` so they have no box at sm+; their input
              children become direct grid items of the parent
              grid-cols-12. The bang (`!`) is required because the UA
              stylesheet's `details:not([open]) > *:not(summary)`
              hide rule has higher specificity than a plain
              `display: contents` declaration. Below sm the summary
              is the toggle and the UA shows/hides the inner div
              based on the open attribute. */}
          <details className="group sm:!contents">
            <summary
              className="cursor-pointer list-none rounded-md bg-emce-light-soft px-3 py-2.5 text-sm font-bold text-emce-dark hover:bg-emce-mid hover:text-emce-darkest sm:hidden"
            >
              <span className="group-open:hidden">More filters ▾</span>
              <span className="hidden group-open:inline">Hide filters ▴</span>
            </summary>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:!contents">
              <div className="sm:col-span-3">
                <Input name="location" defaultValue={filter.location ?? ""} placeholder="Location or 'Remote'" />
              </div>
              <div className="sm:col-span-2">
                <NativeSelect name="workMode" defaultValue={filter.workMode ?? ""}>
                  <option value="">Any work mode</option>
                  <option value="ONSITE">On-site</option>
                  <option value="REMOTE">Remote</option>
                  <option value="HYBRID">Hybrid</option>
                </NativeSelect>
              </div>
              <div className="sm:col-span-2">
                <NativeSelect name="profileMode" defaultValue={filter.profileMode ?? ""}>
                  <option value="">Any profile</option>
                  <option value="FRESHER">Fresher</option>
                  <option value="EXPERIENCED">Experienced</option>
                  <option value="TECHNICIAN">Technician</option>
                  <option value="LEADERSHIP">Leadership</option>
                </NativeSelect>
              </div>
            </div>
          </details>

          <div className="sm:col-span-1">
            <Button type="submit" className="w-full">Search</Button>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/jobs"
            className="rounded-full bg-emce-light-soft px-3 py-1 text-xs font-bold text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
          >
            All
          </Link>
          {evDomains.map((d) => (
            <Link
              key={d.slug}
              href={`/jobs?domain=${d.slug}`}
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                filter.domain === d.slug
                  ? "bg-emce-dark text-emce-light"
                  : "bg-emce-light-soft text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
              }`}
            >
              {d.name}
            </Link>
          ))}
        </div>
      </Card>

      {/* "Best matches for you" — surfaces only when at least one job
          on the visible page scores 60%+ for this candidate. Keeps
          the section credible: an empty page or a page of long-shots
          shouldn't get a "best matches" headline. */}
      {bestMatches.length > 0 && (
        <Card className="mb-6 border-emce-mid/40 bg-emce-light-soft/40 p-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <Badge variant="success">For you</Badge>
              <h2 className="mt-1 text-section text-emce-text">
                Best matches based on your profile
              </h2>
              <p className="text-hint text-emce-text-sec">
                Picked from the {jobs.length} jobs on this page using your
                skills, experience, and EV domains.
              </p>
            </div>
          </div>
          <ul className="space-y-2">
            {bestMatches.map(({ job, score }) => (
              <li key={job.id}>
                <JobCard job={job} matchScore={score} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {jobs.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="text-4xl">🔎</div>
          <h2 className="mt-3 text-section text-emce-text">No jobs match your filters</h2>
          <p className="mt-1 text-hint text-emce-text-sec">Try removing a filter or browsing by domain.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => (
            <li key={j.id}>
              <JobCard job={j} matchScore={scoreByJobId.get(j.id) ?? null} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/jobs?${new URLSearchParams({ ...sp, page: String(page - 1) })}`}>← Prev</Link>
            </Button>
          )}
          <span className="text-sm text-emce-text-sec">Page {page} of {pages}</span>
          {page < pages && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/jobs?${new URLSearchParams({ ...sp, page: String(page + 1) })}`}>Next →</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
