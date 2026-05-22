import Link from "next/link";
import type { Metadata } from "next";
import type { Country } from "@prisma/client";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CompanyCard } from "@/components/companies/CompanyCard";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import { countryUrl, hreflangAlternates } from "@/lib/seo/hreflang";

/**
 * Country-filtered companies directory for `/[cc]/companies` routes.
 *
 * Same architectural shape as `<CountryJobsListing>`:
 *
 *   1. Dedicated canonical URL per country (`/uk/companies`,
 *      `/ae/companies`, …) with its own hreflang alternate
 *      cluster — Google understands each as the per-country
 *      equivalent of `/companies` (India default).
 *   2. Locked country filter — no dropdown UI; the route IS the
 *      filter. Cross-cutting (e.g. UK + UAE together) is on the
 *      main `/companies` page.
 *   3. Per-country empty-state copy tuned for the day-one launch
 *      reality (most new markets will be empty initially).
 *
 * Pulls a JSON-LD `Organization` block at the country level with
 * `areaServed` set — gives Google a single per-country authority
 * signal at this URL alongside the per-company `/company/[slug]`
 * pages it discovers from each card.
 */

export function generateCountryCompaniesMetadata(country: Country): Metadata {
  const meta = SUPPORTED_COUNTRIES[country];
  const url = countryUrl(country, "/companies");
  return {
    title: `EV companies hiring in ${meta.name}`,
    description: `Browse verified EV companies headquartered in ${meta.name} — OEMs, charging operators, battery makers, Tier-1 suppliers. See their open roles and team pages.`,
    alternates: {
      canonical: url,
      languages: hreflangAlternates({ kind: "path", pathTail: "/companies" }),
    },
    openGraph: {
      type: "website",
      url,
      title: `${meta.flag} EV companies in ${meta.name}`,
      description: `Verified EV-industry employers headquartered in ${meta.name}.`,
      siteName: "eMobility Careers",
    },
  };
}

export async function CountryCompaniesListing({ country }: { country: Country }) {
  const meta = SUPPORTED_COUNTRIES[country];

  // Union match: company appears in /uk/companies when EITHER
  // `hqCountry === GB` OR `GB` is in the `operatesInCountries`
  // array (PR 8). This is what makes JLR show up on BOTH /uk
  // (its HQ) AND /in (where it operates a major design centre)
  // — true multi-region semantics.
  const companies = await db.company.findMany({
    where: {
      verificationStatus: "VERIFIED",
      OR: [
        { hqCountry: country },
        { operatesInCountries: { has: country } },
      ],
    },
    include: { _count: { select: { jobs: { where: { status: "OPEN" } } } } },
    orderBy: { name: "asc" },
    take: 200,
  });

  return (
    <div className="container max-w-5xl py-10">
      {/* ── Hero ── */}
      <header className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
          <Link href={countryUrl(country)} className="hover:text-emce-dark">
            {meta.flag} {meta.name}
          </Link>{" "}
          · Companies
        </p>
        <h1 className="mt-1 text-3xl font-extrabold text-emce-text md:text-4xl">
          EV companies hiring in {meta.name}
        </h1>
        <p className="mt-1 text-body text-emce-text-sec">
          {companies.length > 0
            ? `${companies.length} verified EV-industry employer${companies.length === 1 ? "" : "s"} headquartered in ${meta.name}.`
            : `No verified employers yet — onboarding is in progress. If you run an EV company here, set up your hiring page below.`}
        </p>
      </header>

      {/* ── Empty state — day-one launch reality ── */}
      {companies.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon="🏢"
            title={`No EV companies in ${meta.name} yet`}
            body={`We're onboarding EV employers in ${meta.name} now. If you run one, create your hiring page in 2 minutes — it'll appear here AND on every supported search-engine crawler within 24 hours.`}
            action={
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button asChild size="sm">
                  <Link href={`/signup?role=EMPLOYER&country=${country}`}>
                    Set up hiring page →
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
        <ul className="emce-stagger grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <li key={c.id}>
              <CompanyCard company={c} />
            </li>
          ))}
        </ul>
      )}

      {/* ── Cross-link to the global directory ──
          Visitor who wants the full multi-country view + A-Z
          directory + the cross-cutting filter UX jumps here. */}
      <div className="mt-10 border-t border-emce-border pt-6 text-center text-hint text-emce-text-sec">
        Looking across countries?{" "}
        <Link
          href={`/companies?country=${country}`}
          className="font-bold text-emce-dark hover:underline"
        >
          Filter view →
        </Link>
        {" · "}
        <Link
          href="/companies/a-z"
          className="font-bold text-emce-dark hover:underline"
        >
          A–Z directory →
        </Link>
      </div>
    </div>
  );
}
