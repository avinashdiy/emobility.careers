import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { env } from "@/lib/env";
import { breadcrumbJsonLd, jsonLdScriptTag } from "@/lib/seo/schemas";
import {
  getSalaryCompany,
  getSalaryCompanies,
  formatLakhs,
  salaryOccupationJsonLd,
} from "@/lib/salary-compass";

/**
 * /salaries/company/[slug] — per-company EV salary page (e.g.
 * /salaries/company/ather-energy). Ranks for "<company> salary" with
 * the real crowd-sourced median + per-role + per-experience breakdown
 * public, plus Occupation JSON-LD. Links through to the company's
 * profile + open jobs.
 */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getSalaryCompany(slug);
  if (!detail) return { title: "EV salaries", robots: { index: false, follow: false } };

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = `${base}/salaries/company/${detail.slug}`;
  const title = `${detail.name} Salary in India — Median ${formatLakhs(detail.stat.medianLakhs)}`;
  const description =
    `${detail.name} salaries in India: median ${formatLakhs(detail.stat.medianLakhs)} ` +
    `(₹${detail.stat.p25Lakhs}L–₹${detail.stat.p75Lakhs}L typical), from ${detail.count} anonymous ` +
    "submissions on eMobility Careers. See pay by role + experience, and add yours free.";
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title, description, siteName: "eMobility Careers" },
  };
}

export default async function CompanySalaryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getSalaryCompany(slug);
  if (!detail) notFound();

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = `${base}/salaries/company/${detail.slug}`;
  const siblings = (await getSalaryCompanies()).filter((c) => c.slug !== detail.slug).slice(0, 14);

  const breadcrumb = breadcrumbJsonLd([
    { name: "EV Salary Compass", href: "/salaries" },
    { name: detail.name, href: `/salaries/company/${detail.slug}` },
  ]);
  const occupation = salaryOccupationJsonLd({
    name: `${detail.name} — EV roles`,
    url,
    description: `Crowd-sourced ${detail.name} compensation across India's EV industry.`,
    stat: detail.stat,
  });

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(breadcrumb) }}
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(occupation) }}
        />

        <div className="container max-w-4xl py-8 md:py-10">
          <nav className="text-hint text-emce-text-muted">
            <Link href="/salaries" className="font-bold text-emce-dark hover:underline">EV Salary Compass</Link>
            <span className="mx-1.5">›</span>
            <span>{detail.name}</span>
          </nav>

          <div className="mt-2 flex items-center gap-3">
            <Avatar src={detail.logoUrl} name={detail.name} size="lg" />
            <h1 className="text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
              {detail.name} salaries in India
            </h1>
          </div>
          <p className="mt-1 text-sm text-emce-text-sec">
            Crowd-sourced from {detail.count} anonymous submissions. All figures are total CTC per year.
          </p>

          {/* Headline stat */}
          <Card className="mt-5 border-emce-mid bg-emce-light-soft">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">Median total CTC</p>
                <p className="mt-1 text-4xl font-extrabold text-emce-mid-muted md:text-5xl">
                  {formatLakhs(detail.stat.medianLakhs)}
                </p>
                <p className="mt-1 text-sm text-emce-text-sec">
                  Typical range {formatLakhs(detail.stat.p25Lakhs)} – {formatLakhs(detail.stat.p75Lakhs)} (p25–p75)
                </p>
              </div>
              {detail.companySlug && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/company/${detail.companySlug}`}>View company + jobs →</Link>
                </Button>
              )}
            </div>
          </Card>

          {/* Top roles within company */}
          {detail.topRoles.length > 0 && (
            <section className="mt-8">
              <h2 className="text-section text-emce-text">Pay by role at {detail.name}</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {detail.topRoles.map((r) => (
                  <li key={r.title}>
                    <Card>
                      <p className="line-clamp-2 text-sm font-bold text-emce-text">{r.title}</p>
                      <p className="mt-2 text-2xl font-extrabold text-emce-mid-muted">
                        {formatLakhs(r.stat.medianLakhs)}
                      </p>
                      <p className="mt-1 text-hint text-emce-text-muted">
                        median · {r.stat.count} submissions
                      </p>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* By experience tier */}
          <section className="mt-8">
            <h2 className="text-section text-emce-text">{detail.name} salary by experience</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {detail.tiers.map((t) => (
                <Card key={t.bucket}>
                  <p className="text-hint font-bold text-emce-text-sec">{t.label}</p>
                  {t.stat ? (
                    <>
                      <p className="mt-1 text-2xl font-extrabold text-emce-mid-muted">
                        {formatLakhs(t.stat.medianLakhs)}
                      </p>
                      <p className="mt-1 text-hint text-emce-text-muted">{t.stat.count} submissions</p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-emce-text-muted">Not enough data yet</p>
                  )}
                </Card>
              ))}
            </div>
          </section>

          <div className="mt-8">
            <Button asChild>
              <Link href="/salaries/submit">Add your salary (anonymous) →</Link>
            </Button>
          </div>

          {/* Sibling-company rail — internal linking across the facet set */}
          {siblings.length > 0 && (
            <section className="mt-10">
              <h2 className="text-section text-emce-text">Salaries at other EV employers</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/salaries/companies"
                  className="rounded-full bg-emce-light-soft px-3 py-1 text-xs font-bold text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
                >
                  All companies
                </Link>
                {siblings.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/salaries/company/${c.slug}`}
                    className="rounded-full bg-emce-light-soft px-3 py-1 text-xs font-bold text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
                  >
                    {c.name} · {formatLakhs(c.stat.medianLakhs)}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <p className="mt-8 text-hint text-emce-text-muted">
            Figures are crowd-sourced and admin-moderated; each metric needs ≥5 submissions. We only ever show
            aggregates, never individual entries.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
