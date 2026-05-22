import Link from "next/link";
import type { Metadata } from "next";
import type { Country } from "@prisma/client";
import { searchJobs } from "@/server/jobs/queries";
import { JobCard } from "@/components/jobs/JobCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import { countryUrl, hreflangAlternates } from "@/lib/seo/hreflang";
import { getViewerCountry } from "@/lib/viewer-country";
import { prewarmRates } from "@/lib/currency";

/**
 * Country-filtered jobs listing for `/[cc]/jobs` routes.
 *
 * Why a separate component (not just `/jobs?country=GB`):
 *   1. `/uk/jobs` is its own canonical URL with its own hreflang
 *      alternate cluster — Google understands it as the UK
 *      equivalent of `/jobs` (India default) and routes UK
 *      searchers there directly. A redirect to `?country=GB` would
 *      have Google chase the target and lose the country
 *      attribution in GSC.
 *   2. Simpler filter UX — country is fixed, so no country
 *      dropdown. Other filters (search, work-mode, etc.) link
 *      back to the full `/jobs` page when the user wants to
 *      cross-cut.
 *   3. Per-country empty-state copy tuned for the day-one launch
 *      reality (UAE / UK / etc. may have 0 jobs on day 1; the
 *      page needs to convert visitors into recruiter sign-ups
 *      with country-specific context, not the generic /jobs
 *      "no results" surface).
 *
 * Why kept lighter than the main /jobs page:
 *   The main `/jobs` carries the AI-ranked tiered surface for
 *   logged-in candidates + every facet filter. That's the
 *   discovery-first surface. `/uk/jobs` is the country-attribution
 *   surface — the recruiter-side claim that we operate in that
 *   market. Day-one usage will be low; complexity here is wasted.
 *   When the per-country job count crosses 100, we'll upgrade
 *   this to mirror the main page's tiering.
 */

/**
 * Generate the per-country jobs-listing metadata (title +
 * description + hreflang). Each `/[cc]/jobs/page.tsx` calls this
 * with its `Country` code; the metadata is statically resolvable
 * which keeps Next's metadata pipeline happy.
 */
export function generateCountryJobsMetadata(country: Country): Metadata {
  const meta = SUPPORTED_COUNTRIES[country];
  const url = countryUrl(country, "/jobs");
  return {
    title: `EV jobs in ${meta.name}`,
    description: `Browse open EV-industry roles in ${meta.name} — battery, charging, powertrain, motor, and vehicle engineering jobs. Filter by city, work mode, and seniority.`,
    alternates: {
      canonical: url,
      // hreflang alternates — `/uk/jobs` ↔ `/ae/jobs` ↔ `/jobs`
      // (India default) ↔ etc. Google reads these to route UK
      // searchers to the UK page, AE searchers to the AE page,
      // and falls back to the India root for unknown locales.
      languages: hreflangAlternates({ kind: "path", pathTail: "/jobs" }),
    },
    openGraph: {
      type: "website",
      url,
      title: `${meta.flag} EV jobs in ${meta.name}`,
      description: `Open EV-industry roles in ${meta.name} on eMobility Careers.`,
      siteName: "eMobility Careers",
    },
  };
}

/**
 * Renders the country-filtered jobs listing. Server component —
 * fetches jobs server-side, no client state. Pagination uses URL
 * `?page=N` so back/forward and direct links work.
 */
export async function CountryJobsListing({ country }: { country: Country }) {
  const meta = SUPPORTED_COUNTRIES[country];

  // Strict country filter. We deliberately DON'T include
  // openToRelocation here — `/uk/jobs` should show UK-tagged
  // roles, not cross-border relocation jobs from elsewhere.
  // Users who want the broader view land on `/jobs?country=GB
  // &includeRelocation=true` instead.
  const { jobs, total, page, pages } = await searchJobs({
    country,
    pageSize: 24,
  });

  // Resolve the viewer's country once so JobCards can render
  // salaries in their local currency. `prewarmRates` then pulls
  // the FX rates for both the viewer's country AND every posted
  // country in the result set in a single DB roundtrip, so each
  // JobCard's synchronous `getUsdRateSync` call inside the render
  // tree is a free memory lookup.
  const viewerCountry = await getViewerCountry();
  await prewarmRates([
    viewerCountry,
    country,
    ...jobs.map((j) => j.country),
  ]);

  return (
    <div className="container max-w-5xl py-10">
      {/* ── Hero ── */}
      <header className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
          <Link href={countryUrl(country)} className="hover:text-emce-dark">
            {meta.flag} {meta.name}
          </Link>{" "}
          · Jobs
        </p>
        <h1 className="mt-1 text-3xl font-extrabold text-emce-text md:text-4xl">
          EV jobs in {meta.name}
        </h1>
        <p className="mt-1 text-body text-emce-text-sec">
          {total > 0
            ? `${total.toLocaleString()} open role${total === 1 ? "" : "s"} across battery, charging, powertrain, and vehicle engineering.`
            : `No open roles in ${meta.name} yet — the platform is launching here. Recruiters: this is where you'd post.`}
        </p>
      </header>

      {/* ── Empty state — day-one launch reality ── */}
      {jobs.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon="🛻"
            title={`No EV jobs in ${meta.name} yet`}
            body={`We're onboarding employers in ${meta.name} now. If you're a recruiter, post the first listing and it'll appear here — and on every supported job board crawler (Google for Jobs, Bing) within 24 hours of publishing.`}
            action={
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button asChild size="sm">
                  <Link href={`/signup?role=EMPLOYER&country=${country}`}>
                    Post the first job →
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={countryUrl(country)}>
                    Back to {meta.name} overview
                  </Link>
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          {/* ── Job cards ── */}
          <ul className="grid gap-3 sm:grid-cols-2">
            {jobs.map((j) => (
              <li key={j.id}>
                {/* searchJobs returns a Prisma payload that already
                    matches JobCardData; pass through directly to
                    match the pattern used by /jobs/page.tsx.
                    `viewerCountry` triggers the cross-currency
                    salary display ("£3.8k /mo (AED 18,000)" etc.). */}
                <JobCard job={j} viewerCountry={viewerCountry} />
              </li>
            ))}
          </ul>

          {/* ── Pagination ── */}
          {pages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-3 text-sm">
              {page > 1 ? (
                <Link
                  href={`${countryUrl(country, "/jobs")}?page=${page - 1}`}
                  className="rounded-md border border-emce-border bg-white px-3 py-1.5 font-semibold text-emce-text hover:border-emce-mid hover:bg-emce-light-soft"
                >
                  ← Previous
                </Link>
              ) : (
                <span className="rounded-md border border-emce-border bg-emce-light-soft px-3 py-1.5 text-emce-text-muted">
                  ← Previous
                </span>
              )}
              <span className="text-emce-text-sec">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Link
                  href={`${countryUrl(country, "/jobs")}?page=${page + 1}`}
                  className="rounded-md border border-emce-border bg-white px-3 py-1.5 font-semibold text-emce-text hover:border-emce-mid hover:bg-emce-light-soft"
                >
                  Next →
                </Link>
              ) : (
                <span className="rounded-md border border-emce-border bg-emce-light-soft px-3 py-1.5 text-emce-text-muted">
                  Next →
                </span>
              )}
            </nav>
          )}
        </>
      )}

      {/* ── Cross-link to the global jobs page ──
          Recruiter who wants the full filter UX (search, EV
          domain facets, etc.) jumps here. Pre-fills the country
          filter so they don't lose context. */}
      <div className="mt-10 border-t border-emce-border pt-6 text-center text-hint text-emce-text-sec">
        Looking for more options?{" "}
        <Link
          href={`/jobs?country=${country}`}
          className="font-bold text-emce-dark hover:underline"
        >
          Full filter view →
        </Link>
        {" · "}
        <Link
          href={`/jobs?country=${country}&includeRelocation=true`}
          className="font-bold text-emce-dark hover:underline"
        >
          Include relocation-friendly roles from other countries →
        </Link>
      </div>
    </div>
  );
}
