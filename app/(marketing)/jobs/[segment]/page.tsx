import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { searchJobs } from "@/server/jobs/queries";
import { JobCard } from "@/components/jobs/JobCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getViewerCountry } from "@/lib/viewer-country";
import { prewarmRates } from "@/lib/currency";

/**
 * Dual-purpose /jobs/[segment] route:
 *
 *   1. SEO facet page — when {segment} is an EV-domain slug
 *      (battery-tech, charging-infra, …), render a domain-scoped job
 *      listing. URL: /jobs/battery-tech → ranks for "battery jobs",
 *      "battery engineer jobs", etc. The programmatic-SEO win — one
 *      indexable page per domain, reusing the real job query + JobCard
 *      (each linked detail page carries the canonical JobPosting JSON-LD).
 *
 *   2. Legacy single-job redirect — when {segment} is a JobPosting
 *      cuid, 308-redirect to the canonical /job/{slug} (preserves old
 *      shares + search-index links). This segment used to be [id];
 *      renamed to [segment] so one dynamic slot serves both.
 *
 * A domain slug and a cuid never collide (slugs are kebab words; ids
 * are 25-char cuids), so an ordered lookup disambiguates.
 */

const PAGE_SIZE = 24;

async function resolveDomain(segment: string) {
  return db.eVDomain.findUnique({
    where: { slug: segment },
    select: { slug: true, name: true, description: true },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ segment: string }>;
}): Promise<Metadata> {
  const { segment } = await params;
  const domain = await resolveDomain(segment);
  if (!domain) {
    // Legacy-id path → about to redirect; metadata is irrelevant.
    return { title: "Jobs", robots: { index: false, follow: false } };
  }
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/jobs/${domain.slug}`;
  const title = `${domain.name} Jobs in India — EV Careers`;
  const description =
    `Open ${domain.name.toLowerCase()} jobs across India's EV industry on eMobility Careers. ` +
    (domain.description ?? "Browse roles, salaries and top hiring companies.") +
    " Apply free.";
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: "eMobility Careers",
    },
  };
}

export default async function JobsSegmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ segment: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { segment } = await params;
  const domain = await resolveDomain(segment);

  // ─── Legacy single-job id → canonical slug redirect ──────────────
  if (!domain) {
    const job = await db.jobPosting.findUnique({
      where: { id: segment },
      select: { slug: true },
    });
    if (!job) notFound();
    permanentRedirect(`/job/${job.slug}`);
  }

  // ─── Domain facet page ───────────────────────────────────────────
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const session = await auth();

  let viewerIsDIYguru = false;
  if (session?.user) {
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { isDIYguruVerified: true },
    });
    viewerIsDIYguru = profile?.isDIYguruVerified ?? false;
  }

  const { jobs, total, pages } = await searchJobs({
    domain: domain.slug,
    viewerIsDIYguru,
    page,
    pageSize: PAGE_SIZE,
  });

  const viewerCountry = await getViewerCountry();
  await prewarmRates([viewerCountry, ...jobs.map((j) => j.country)]);

  return (
    <div className="container max-w-4xl py-8 md:py-10">
      <nav className="text-hint text-emce-text-muted">
        <Link href="/jobs" className="font-bold text-emce-dark hover:underline">EV jobs</Link>
        <span className="mx-1.5">›</span>
        <span>{domain.name}</span>
      </nav>

      <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
        {domain.name} jobs in India
      </h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        {total > 0
          ? `${total.toLocaleString("en-IN")} open ${domain.name.toLowerCase()} role${total === 1 ? "" : "s"} across the EV industry.`
          : `No open ${domain.name.toLowerCase()} roles right now — check back soon, or browse all EV jobs.`}
        {domain.description ? ` ${domain.description}` : ""}
      </p>

      {/* Sibling-domain rail — internal-linking scaffold so Google (and
          visitors) crawl across the facet set and reach the long tail. */}
      <div className="mt-4">
        <DomainRail activeSlug={domain.slug} />
      </div>

      <div className="mt-6">
        {jobs.length === 0 ? (
          <EmptyState
            icon="🔎"
            title={`No ${domain.name.toLowerCase()} jobs open right now`}
            body="New roles are posted daily. Browse the full board or set up a profile to get matched."
            action={
              <Button asChild>
                <Link href="/jobs">Browse all EV jobs →</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {jobs.map((j) => (
              <li key={j.id}>
                <JobCard job={j} matchScore={null} viewerCountry={viewerCountry} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/jobs/${domain.slug}?page=${page - 1}`}>← Prev</Link>
            </Button>
          )}
          <span className="text-sm text-emce-text-sec">Page {page} of {pages}</span>
          {page < pages && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/jobs/${domain.slug}?page=${page + 1}`}>Next →</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Pill rail of all EV domains — internal links across the facet set. */
async function DomainRail({ activeSlug }: { activeSlug: string }) {
  const domains = await db.eVDomain.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
    select: { slug: true, name: true },
  });
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/jobs"
        className="rounded-full bg-emce-light-soft px-3 py-1 text-xs font-bold text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
      >
        All EV jobs
      </Link>
      {domains.map((d) => (
        <Link
          key={d.slug}
          href={`/jobs/${d.slug}`}
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            d.slug === activeSlug
              ? "bg-emce-dark text-emce-light"
              : "bg-emce-light-soft text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
          }`}
        >
          {d.name}
        </Link>
      ))}
    </div>
  );
}
