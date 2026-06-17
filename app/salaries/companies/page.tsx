import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { env } from "@/lib/env";
import { getSalaryCompanies, formatLakhs } from "@/lib/salary-compass";

/**
 * /salaries/companies — browse-all-companies hub. Public list of every
 * EV employer with enough submissions to show a median, each linking to
 * its /salaries/company/[slug] detail page. Crawl-discovery + internal
 * linking for the whole company-facet set; ranks for "EV company
 * salaries India / top-paying EV companies".
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "EV company salaries in India — what top EV employers pay",
  description:
    "Median total CTC at India's EV employers — OEMs, startups and suppliers across battery, charging, motors and software. Crowd-sourced, anonymous, updated continuously on eMobility Careers.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/salaries/companies` },
};

export default async function SalaryCompaniesHubPage() {
  const companies = await getSalaryCompanies();

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-4xl py-8 md:py-12">
          <nav className="text-hint text-emce-text-muted">
            <Link href="/salaries" className="font-bold text-emce-dark hover:underline">EV Salary Compass</Link>
            <span className="mx-1.5">›</span>
            <span>By company</span>
          </nav>

          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
            EV salaries by company
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-emce-text-sec md:text-base">
            Median total CTC at every EV employer with enough data. Pick a company for the full
            role + experience breakdown, or browse{" "}
            <Link href="/salaries/roles" className="font-bold text-emce-dark hover:underline">salaries by role</Link>.
          </p>

          {companies.length === 0 ? (
            <Card className="mt-8 text-center text-emce-text-sec">
              Not enough submissions yet. Be the first —{" "}
              <Link href="/salaries/submit" className="font-bold text-emce-dark hover:underline">add yours</Link>.
            </Card>
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {companies.map((c) => (
                <li key={c.slug}>
                  <Link href={`/salaries/company/${c.slug}`} className="block">
                    <Card className="h-full transition hover:border-emce-mid hover:shadow-emce-hover">
                      <div className="flex items-center gap-3">
                        <Avatar src={c.logoUrl} name={c.name} size="md" />
                        <p className="min-w-0 truncate font-bold text-emce-text">{c.name}</p>
                      </div>
                      <p className="mt-3 text-2xl font-extrabold text-emce-mid-muted">
                        {formatLakhs(c.stat.medianLakhs)}
                      </p>
                      <p className="mt-1 text-hint text-emce-text-sec">
                        median · {c.count} submission{c.count === 1 ? "" : "s"}
                      </p>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
