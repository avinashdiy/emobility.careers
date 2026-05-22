import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { CompanyCard } from "@/components/companies/CompanyCard";
import { SUPPORTED_COUNTRY_LIST, isSupportedCountry, SUPPORTED_COUNTRIES } from "@/lib/countries";
import type { Country } from "@prisma/client";

export const metadata = {
  title: "EV companies hiring",
  description:
    "Browse verified EV companies hiring across India, UAE, UK, Australia, and the US — OEMs, startups, charging operators, battery makers, and Tier-1 suppliers.",
};

/**
 * Top-level companies directory. Country dimension (added in PR 5)
 * is an optional filter, not a partition — visitors land on the
 * "global" view by default and narrow with the dropdown. The
 * country-prefixed routes (`/uk/companies`, `/ae/companies`)
 * render the same data set but locked to a single country for
 * SEO purposes (their own canonical + hreflang cluster).
 */
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const sp = await searchParams;
  const paramCountry = sp.country?.toUpperCase();
  const countryFilter: Country | undefined = isSupportedCountry(paramCountry)
    ? (paramCountry as Country)
    : undefined;

  const companies = await db.company.findMany({
    where: {
      verificationStatus: "VERIFIED",
      // Country filter — union match across `hqCountry` AND the
      // `operatesInCountries` array (PR 8). Lets multi-region
      // employers (JLR UK + India, Tesla US + AU, etc.) surface
      // in every market they actually operate in.
      ...(countryFilter
        ? {
            OR: [
              { hqCountry: countryFilter },
              { operatesInCountries: { has: countryFilter } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { jobs: { where: { status: "OPEN" } } } } },
    orderBy: { name: "asc" },
  });

  // Distinct-count by country for the "Browse by region" rail —
  // single groupBy gives counts per country for the chip badges.
  // Cheap query; runs even when no country filter is active so the
  // chips are always present and informative.
  const countryCounts = await db.company.groupBy({
    by: ["hqCountry"],
    where: { verificationStatus: "VERIFIED" },
    _count: { _all: true },
  });
  const countryCountMap = new Map(
    countryCounts.map((g) => [g.hqCountry, g._count._all]),
  );

  return (
    <div className="container py-10">
      <PageHeader
        eyebrow="Companies"
        title={
          countryFilter
            ? `${SUPPORTED_COUNTRIES[countryFilter].flag} EV companies hiring in ${SUPPORTED_COUNTRIES[countryFilter].name}`
            : "EV companies hiring on emobility.careers"
        }
        accent="hiring"
        subtitle={
          <>
            <AnimatedNumber to={companies.length} />{" "}
            verified EV-industry employer{companies.length === 1 ? "" : "s"}
            {countryFilter
              ? ` in ${SUPPORTED_COUNTRIES[countryFilter].name}`
              : " — from startups to OEMs to charging operators"}
            .
          </>
        }
      />

      {/* Country filter row — visible always so a visitor exploring
          the global directory can narrow to their market in one
          click. Pre-fills from the `?country=` URL param. Chip
          badges show the per-country count so empty markets are
          visible up-front instead of a frustrated dropdown click. */}
      <Card className="mt-4 p-4">
        <form className="flex flex-wrap items-end gap-3" method="GET">
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="country-filter"
              className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-emce-text-muted"
            >
              Country
            </label>
            <NativeSelect
              id="country-filter"
              name="country"
              defaultValue={countryFilter ?? ""}
            >
              <option value="">🌍 All countries</option>
              {SUPPORTED_COUNTRY_LIST.map((c) => {
                const n = countryCountMap.get(c.code) ?? 0;
                return (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name} {n > 0 ? `(${n})` : ""}
                  </option>
                );
              })}
            </NativeSelect>
          </div>
          <Button type="submit" size="sm">
            Apply
          </Button>
          {countryFilter && (
            <Button asChild size="sm" variant="ghost">
              <Link href="/companies">Clear</Link>
            </Button>
          )}
        </form>
      </Card>

      {/* Prominent secondary nav to the A-Z directory. SEO-wise this
          also passes link equity to the per-letter pages. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emce-border bg-emce-light-soft p-4">
        <p className="text-body text-emce-text">
          Looking for a specific company?{" "}
          <span className="text-emce-text-sec">
            Browse alphabetically — A to Z.
          </span>
        </p>
        <Link
          href="/companies/a-z"
          className="inline-flex h-10 items-center justify-center rounded-md bg-emce-dark px-5 text-sm font-bold text-white hover:bg-emce-darkest"
        >
          📒 A–Z directory →
        </Link>
      </div>

      {companies.length === 0 ? (
        <EmptyState
          variant="mesh"
          icon="🏢"
          title={
            countryFilter
              ? `No verified companies in ${SUPPORTED_COUNTRIES[countryFilter].name} yet`
              : "No verified companies yet"
          }
          body={
            countryFilter
              ? "We're onboarding EV employers here now. If you run one, set up your hiring page below."
              : "Check back soon — verified EV employers are landing every week."
          }
          className="mt-6"
        />
      ) : (
        <ul className="emce-stagger mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <li key={c.id}>
              <CompanyCard company={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
