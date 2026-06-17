import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import type { Country } from "@prisma/client";
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
import { resolveCity, listCities } from "@/lib/jobs/cities";

/**
 * Triple-purpose /jobs/[segment] route. The dispatcher resolves the
 * segment in a fixed order — domain → city → legacy-id → 404:
 *
 *   1. SEO domain facet — {segment} is an EV-domain slug
 *      (battery-tech, charging-infra, …): a domain-scoped listing that
 *      ranks for "battery jobs", "battery engineer jobs", etc.
 *
 *   2. SEO city facet — {segment} is a known city slug (pune,
 *      bengaluru, …), derived from the free-text JobPosting.locations:
 *      a city-scoped listing that ranks for "EV jobs in Pune", etc.
 *
 *   3. Legacy single-job redirect — {segment} is a JobPosting cuid:
 *      308-redirect to the canonical /job/{slug} (preserves old shares
 *      + index links). This slot used to be [id].
 *
 * Domain slugs, city slugs and cuids don't collide in practice (slugs
 * are kebab words; ids are 25-char cuids), and the ordered lookup
 * disambiguates deterministically (a domain slug wins over a same-named
 * city). Each facet reuses the real job query + JobCard, so every
 * linked detail page still carries the canonical JobPosting JSON-LD —
 * this is pure internal linking + indexable surface area, no duplicate
 * job content.
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
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const domain = await resolveDomain(segment);
  if (domain) {
    const url = `${base}/jobs/${domain.slug}`;
    const title = `${domain.name} Jobs in India — EV Careers`;
    const description =
      `Open ${domain.name.toLowerCase()} jobs across India's EV industry on eMobility Careers. ` +
      (domain.description ?? "Browse roles, salaries and top hiring companies.") +
      " Apply free.";
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: { type: "website", url, title, description, siteName: "eMobility Careers" },
    };
  }

  const city = await resolveCity(segment);
  if (city) {
    const url = `${base}/jobs/${city.slug}`;
    // No "eMobility Careers" suffix — the root layout title template
    // already appends "| eMobility Careers" (avoids double-branding).
    const title = `EV Jobs in ${city.name} — Battery, Charging & Software Roles`;
    const description =
      `${city.count > 0 ? `${city.count} open` : "Browse"} electric-vehicle jobs in ${city.name} — ` +
      "battery, charging, motors, vehicle engineering and software roles at OEMs, startups and suppliers. Apply free on eMobility Careers.";
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: { type: "website", url, title, description, siteName: "eMobility Careers" },
    };
  }

  // Non-domain, non-city segment (a legacy job-id or junk). Don't
  // redirect/404 HERE — generateMetadata races with the page render and
  // a throw here can conflict with the page's own dispatch. The page
  // body owns the redirect/notFound (now that /jobs has no loading.tsx,
  // those emit hard 308/404). Return minimal, noindexed metadata.
  return { title: "Jobs", robots: { index: false, follow: false } };
}

export default async function JobsSegmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ segment: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { segment } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const domain = await resolveDomain(segment);
  const city = domain ? null : await resolveCity(segment);

  // ─── Non-domain, non-city segment → legacy single-job redirect / 404
  // With /jobs/loading.tsx removed, these throws emit hard 308/404.
  if (!domain && !city) {
    const job = await db.jobPosting.findUnique({
      where: { id: segment },
      select: { slug: true },
    });
    if (!job) notFound();
    permanentRedirect(`/job/${job.slug}`);
  }

  const session = await auth();
  let viewerIsDIYguru = false;
  if (session?.user) {
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { isDIYguruVerified: true },
    });
    viewerIsDIYguru = profile?.isDIYguruVerified ?? false;
  }

  // ─── Domain facet ────────────────────────────────────────────────
  if (domain) {
    const { jobs, total, pages } = await searchJobs({
      domain: domain.slug,
      viewerIsDIYguru,
      page,
      pageSize: PAGE_SIZE,
    });
    const viewerCountry = await getViewerCountry();
    await prewarmRates([viewerCountry, ...jobs.map((j) => j.country)]);

    return (
      <FacetView
        crumbLabel={domain.name}
        heading={`${domain.name} jobs in India`}
        subtitle={
          (total > 0
            ? `${total.toLocaleString("en-IN")} open ${domain.name.toLowerCase()} role${total === 1 ? "" : "s"} across the EV industry.`
            : `No open ${domain.name.toLowerCase()} roles right now — check back soon, or browse all EV jobs.`) +
          (domain.description ? ` ${domain.description}` : "")
        }
        rail={<DomainRail activeSlug={domain.slug} />}
        basePath={`/jobs/${domain.slug}`}
        jobs={jobs}
        total={total}
        page={page}
        pages={pages}
        viewerCountry={viewerCountry}
        emptyTitle={`No ${domain.name.toLowerCase()} jobs open right now`}
      />
    );
  }

  // ─── City facet ──────────────────────────────────────────────────
  // city is guaranteed non-null here (the !domain && !city guard above
  // already redirected/404'd otherwise).
  const c = city!;
  const { jobs, total, pages } = await searchJobs({
    location: c.name,
    viewerIsDIYguru,
    page,
    pageSize: PAGE_SIZE,
  });
  const viewerCountry = await getViewerCountry();
  await prewarmRates([viewerCountry, ...jobs.map((j) => j.country)]);

  return (
    <FacetView
      crumbLabel={c.name}
      heading={`EV jobs in ${c.name}`}
      subtitle={
        total > 0
          ? `${total.toLocaleString("en-IN")} open electric-vehicle role${total === 1 ? "" : "s"} in ${c.name} — battery, charging, motors, vehicle engineering and software.`
          : `No open EV roles in ${c.name} right now — check back soon, or browse all EV jobs.`
      }
      rail={<CityRail activeSlug={c.slug} />}
      basePath={`/jobs/${c.slug}`}
      jobs={jobs}
      total={total}
      page={page}
      pages={pages}
      viewerCountry={viewerCountry}
      emptyTitle={`No EV jobs in ${c.name} right now`}
    />
  );
}

/** Shared presentational shell for both domain + city facet pages. */
function FacetView({
  crumbLabel,
  heading,
  subtitle,
  rail,
  basePath,
  jobs,
  total,
  page,
  pages,
  viewerCountry,
  emptyTitle,
}: {
  crumbLabel: string;
  heading: string;
  subtitle: string;
  rail: ReactNode;
  basePath: string;
  jobs: Awaited<ReturnType<typeof searchJobs>>["jobs"];
  total: number;
  page: number;
  pages: number;
  viewerCountry: Country;
  emptyTitle: string;
}) {
  return (
    <div className="container max-w-4xl py-8 md:py-10">
      <nav className="text-hint text-emce-text-muted">
        <Link href="/jobs" className="font-bold text-emce-dark hover:underline">EV jobs</Link>
        <span className="mx-1.5">›</span>
        <span>{crumbLabel}</span>
      </nav>

      <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
        {heading}
      </h1>
      <p className="mt-1 text-sm text-emce-text-sec">{subtitle}</p>

      {/* Internal-linking rail — so Google (and visitors) crawl across
          the facet set and reach the long tail. */}
      <div className="mt-4">{rail}</div>

      <div className="mt-6">
        {jobs.length === 0 ? (
          <EmptyState
            icon="🔎"
            title={emptyTitle}
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
              <Link href={`${basePath}?page=${page - 1}`}>← Prev</Link>
            </Button>
          )}
          <span className="text-sm text-emce-text-sec">Page {page} of {pages}</span>
          {page < pages && (
            <Button asChild variant="outline" size="sm">
              <Link href={`${basePath}?page=${page + 1}`}>Next →</Link>
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

/** Pill rail of the busiest cities — internal links across city facets. */
async function CityRail({ activeSlug }: { activeSlug: string }) {
  const cities = (await listCities()).slice(0, 12);
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/jobs"
        className="rounded-full bg-emce-light-soft px-3 py-1 text-xs font-bold text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
      >
        All EV jobs
      </Link>
      {cities.map((c) => (
        <Link
          key={c.slug}
          href={`/jobs/${c.slug}`}
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            c.slug === activeSlug
              ? "bg-emce-dark text-emce-light"
              : "bg-emce-light-soft text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
          }`}
        >
          {c.name}
        </Link>
      ))}
    </div>
  );
}
