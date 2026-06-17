import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { env } from "@/lib/env";
import { getSalaryRoles, formatLakhs } from "@/lib/salary-compass";

/**
 * /salaries/roles — browse-all-roles hub. Public list of every EV role
 * with enough submissions to show a median, each linking to its
 * /salaries/[role] detail page. Gives Google one crawlable page that
 * discovers + internally links the whole role-facet set, and ranks for
 * "EV salaries by role / EV job salaries India".
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "EV salaries by role in India — median pay for every EV job",
  description:
    "Median total CTC for every EV-industry role in India — battery, charging, motors, powertrain, vehicle engineering and software. Crowd-sourced, anonymous, updated continuously on eMobility Careers.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/salaries/roles` },
};

export default async function SalaryRolesHubPage() {
  const roles = await getSalaryRoles();

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-4xl py-8 md:py-12">
          <nav className="text-hint text-emce-text-muted">
            <Link href="/salaries" className="font-bold text-emce-dark hover:underline">EV Salary Compass</Link>
            <span className="mx-1.5">›</span>
            <span>By role</span>
          </nav>

          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
            EV salaries by role
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-emce-text-sec md:text-base">
            Median total CTC for every EV-industry role with enough data. Pick a role for the full
            experience-level breakdown, or browse{" "}
            <Link href="/salaries/companies" className="font-bold text-emce-dark hover:underline">salaries by company</Link>.
          </p>

          {roles.length === 0 ? (
            <Card className="mt-8 text-center text-emce-text-sec">
              Not enough submissions yet. Be the first —{" "}
              <Link href="/salaries/submit" className="font-bold text-emce-dark hover:underline">add yours</Link>.
            </Card>
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((r) => (
                <li key={r.slug}>
                  <Link href={`/salaries/${r.slug}`} className="block">
                    <Card className="h-full transition hover:border-emce-mid hover:shadow-emce-hover">
                      <p className="line-clamp-2 text-sm font-bold text-emce-text">{r.title}</p>
                      <p className="mt-2 text-2xl font-extrabold text-emce-mid-muted">
                        {formatLakhs(r.stat.medianLakhs)}
                      </p>
                      <p className="mt-1 text-hint text-emce-text-sec">
                        {formatLakhs(r.stat.p25Lakhs)} – {formatLakhs(r.stat.p75Lakhs)} · {r.count} submissions
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
