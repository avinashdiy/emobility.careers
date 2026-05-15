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
import { EmptyState } from "@/components/ui/empty-state";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { rankJobsForCandidate } from "@/server/matching/candidate-match";

export const metadata = { title: "Browse EV jobs" };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    location?: string;
    domain?: string;
    workMode?: string;
    profileMode?: string;
    powertrain?: string;
    companyTier?: string;
    credential?: string;
    packKwhMin?: string;
    chargerKwMin?: string;
    page?: string;
  }>;
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
    // Wave C #29 — facet filters
    powertrain: sp.powertrain,
    companyTier: sp.companyTier,
    credential: sp.credential,
    packKwhMin: sp.packKwhMin ? Number(sp.packKwhMin) : undefined,
    chargerKwMin: sp.chargerKwMin ? Number(sp.chargerKwMin) : undefined,
    viewerIsDIYguru,
    page: sp.page ? parseInt(sp.page) : 1,
  };
  const { jobs, total, page, pages } = await searchJobs(filter);
  const [evDomains, credentials] = await Promise.all([
    db.eVDomain.findMany({ orderBy: { order: "asc" } }),
    db.credential.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  // Score the visible page of results for the logged-in candidate so
  // each card can carry an "X% match" pill. We pass the IDs through
  // `rankJobsForCandidate` which prefers the cache and bounds live
  // computes per request — no risk of N concurrent embed calls.
  let scoreByJobId: Map<string, number> = new Map();
  if (candidateProfileId && jobs.length > 0) {
    try {
      const ranked = await rankJobsForCandidate(
        candidateProfileId,
        jobs.map((j) => j.id),
        jobs.length, // score everything on the page (rank takes top-K)
      );
      scoreByJobId = new Map(ranked.map((r) => [r.jobId, r.score]));
    } catch {
      // Scoring is non-essential — let the page render.
    }
  }

  // Wave A #9 — Curated tiered job feed. Bucket the scored jobs into
  // three explicit tiers so candidates see "Exact match / Strong /
  // Adjacent" headers instead of a single "Best matches" stripe that
  // doesn't explain its own ranking. Each tier renders only when it
  // contains at least one job. Bucketed jobs are STILL shown in the
  // full list below — the tiers are a curation lens, not a filter, so
  // there's no confusion about "where did the other matches go?".
  const tieredJobs: {
    tier: "exact" | "strong" | "adjacent";
    job: (typeof jobs)[number];
    score: number;
  }[] = [];
  if (scoreByJobId.size > 0) {
    for (const j of jobs) {
      const s = scoreByJobId.get(j.id);
      if (s === undefined) continue;
      if (s >= 0.85) tieredJobs.push({ tier: "exact", job: j, score: s });
      else if (s >= 0.7) tieredJobs.push({ tier: "strong", job: j, score: s });
      else if (s >= 0.55) tieredJobs.push({ tier: "adjacent", job: j, score: s });
    }
    tieredJobs.sort((a, b) => b.score - a.score);
  }
  const exactMatches = tieredJobs.filter((t) => t.tier === "exact").slice(0, 4);
  const strongMatches = tieredJobs.filter((t) => t.tier === "strong").slice(0, 4);
  const adjacentMatches = tieredJobs.filter((t) => t.tier === "adjacent").slice(0, 4);

  return (
    <div className="container py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="animate-fade-up">
          <Badge variant="live">Live across India</Badge>
          <h1 className="mt-2 text-dashboard font-extrabold text-emce-text md:text-3xl">
            {total > 0 ? (
              <>
                <AnimatedNumber to={total} className="emce-text-gradient" /> EV jobs
              </>
            ) : (
              "EV jobs"
            )}
          </h1>
          <p className="mt-1 text-hint text-emce-text-sec">
            Battery · Charging · Powertrain · Software · Manufacturing — refreshed daily.
          </p>
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

          {/* Wave C #29 — EV facet row. Sits on its own row below the
              primary filters so the UI doesn't blow out to 18 columns
              on desktop. The four sub-facets all live inside the same
              `details` collapse on mobile via the parent <details>
              `sm:!contents` trick, but the row itself is grid-cols-12
              so each facet is its own column at sm+. */}
          <details className="group sm:col-span-12 sm:!block">
            <summary className="cursor-pointer list-none text-hint font-bold text-emce-mid-muted">
              <span className="group-open:hidden">EV facets ▾</span>
              <span className="hidden group-open:inline">EV facets ▴</span>
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <NativeSelect name="powertrain" defaultValue={filter.powertrain ?? ""}>
                  <option value="">Any powertrain area</option>
                  <option value="battery">Battery</option>
                  <option value="bms">BMS</option>
                  <option value="motor">Motor & drives</option>
                  <option value="charging">Charging</option>
                  <option value="power-electronics">Power electronics</option>
                  <option value="vehicle-integration">Vehicle integration</option>
                  <option value="software">Software & IoT</option>
                  <option value="manufacturing">Manufacturing</option>
                  <option value="after-sales">After-sales / service</option>
                </NativeSelect>
              </div>
              <div className="sm:col-span-3">
                <NativeSelect name="companyTier" defaultValue={filter.companyTier ?? ""}>
                  <option value="">Any company tier</option>
                  <option value="oem">OEM</option>
                  <option value="tier-1">Tier-1 supplier</option>
                  <option value="tier-2">Tier-2 supplier</option>
                  <option value="startup">Startup</option>
                  <option value="charging-operator">Charging operator</option>
                  <option value="research">Research institute</option>
                  <option value="consulting">Consulting</option>
                </NativeSelect>
              </div>
              <div className="sm:col-span-3">
                <NativeSelect name="credential" defaultValue={filter.credential ?? ""}>
                  <option value="">Any credential</option>
                  {credentials.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </NativeSelect>
              </div>
              <div className="sm:col-span-3">
                <div className="flex gap-2">
                  <Input
                    name="packKwhMin"
                    type="number"
                    min="0"
                    placeholder="Min kWh"
                    defaultValue={filter.packKwhMin ?? ""}
                    title="Minimum battery-pack size (kWh) the role works with"
                  />
                  <Input
                    name="chargerKwMin"
                    type="number"
                    min="0"
                    placeholder="Min kW"
                    defaultValue={filter.chargerKwMin ?? ""}
                    title="Minimum charger output (kW) the role designs / installs"
                  />
                </div>
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

      {/* Wave A #9 — Curated tiered job feed. Three explicit tiers
          when the viewer is signed in + scored:
            - Exact match (≥85%)   — top, glow card, "this fits you"
            - Strong match (70-85%) — regular card
            - Adjacent (55-70%)     — softer card, "worth a look"
          Each tier renders only when at least one job qualifies.
          The full list below STILL includes these jobs — the tiers
          are a curation lens, not a filter. Caps at 4 per tier so
          the rest of the page doesn't get pushed below the fold. */}
      {exactMatches.length > 0 && (
        <Card variant="glow" className="mb-6 animate-fade-up">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <Badge variant="glow">✨ Exact match</Badge>
              <h2 className="mt-1 text-section text-emce-text">
                These jobs fit you almost perfectly
              </h2>
              <p className="text-hint text-emce-text-sec">
                Picked from the {jobs.length} jobs on this page using your
                skills, experience, verified badges, and EV domains. Apply soon
                — exact matches go fast.
              </p>
            </div>
          </div>
          <ul className="emce-stagger space-y-2">
            {exactMatches.map(({ job, score }) => (
              <li key={job.id}>
                <JobCard job={job} matchScore={score} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {strongMatches.length > 0 && (
        <Card className="mb-6 animate-fade-up border-emce-mid/40 bg-emce-light-soft/40">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <Badge variant="success">For you · Strong fit</Badge>
              <h2 className="mt-1 text-section text-emce-text">
                These come close — apply with a tailored cover letter
              </h2>
              <p className="text-hint text-emce-text-sec">
                Most of the required skills overlap; closing the small gap on
                your apply is straightforward.
              </p>
            </div>
          </div>
          <ul className="emce-stagger space-y-2">
            {strongMatches.map(({ job, score }) => (
              <li key={job.id}>
                <JobCard job={job} matchScore={score} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {adjacentMatches.length > 0 && (
        <Card className="mb-6 animate-fade-up">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <Badge variant="default">Adjacent</Badge>
              <h2 className="mt-1 text-section text-emce-text">
                A bit of a stretch — worth a look if you&apos;re exploring
              </h2>
              <p className="text-hint text-emce-text-sec">
                Some skill overlap. Great if you&apos;re open to a slight pivot
                in your EV career.
              </p>
            </div>
          </div>
          <ul className="emce-stagger space-y-2">
            {adjacentMatches.map(({ job, score }) => (
              <li key={job.id}>
                <JobCard job={job} matchScore={score} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {jobs.length === 0 ? (
        <EmptyState
          variant="mesh"
          icon="🔎"
          title="No jobs match your filters"
          body="Try removing a filter, broadening the location, or browsing by domain below."
          action={
            <Button asChild variant="accent" size="sm">
              <Link href="/jobs">Clear all filters</Link>
            </Button>
          }
        />
      ) : (
        <ul className="emce-stagger space-y-3">
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
