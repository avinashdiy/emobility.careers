import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { env } from "@/lib/env";
import { breadcrumbJsonLd, jsonLdScriptTag } from "@/lib/seo/schemas";
import {
  getSalaryRole,
  getSalaryRoles,
  formatLakhs,
  salaryOccupationJsonLd,
} from "@/lib/salary-compass";

/**
 * /salaries/[role] — per-role EV salary page (e.g.
 * /salaries/battery-engineer). The highest-intent salary surface:
 * ranks for "battery engineer salary india" with the real crowd-sourced
 * median + p25-p75 band public (the content that earns the ranking) and
 * Occupation JSON-LD for Google's estimated-salary rich result. The
 * per-experience tiers are aggregate (≥5 samples each) so they're shown
 * publicly too; the submit-to-unlock mechanic gates the full browse.
 *
 * Revalidate every 5 min — medians shift slowly as submissions land,
 * and the underlying aggregates are unstable_cache'd anyway.
 */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ role: string }>;
}): Promise<Metadata> {
  const { role } = await params;
  const detail = await getSalaryRole(role);
  if (!detail) return { title: "EV salaries", robots: { index: false, follow: false } };

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = `${base}/salaries/${detail.slug}`;
  // No brand suffix — root layout template appends "| eMobility Careers".
  const title = `${detail.title} Salary in India — Median ${formatLakhs(detail.stat.medianLakhs)}`;
  const description =
    `${detail.title} salary in India: median ${formatLakhs(detail.stat.medianLakhs)} ` +
    `(₹${detail.stat.p25Lakhs}L–₹${detail.stat.p75Lakhs}L typical), from ${detail.count} anonymous ` +
    "EV-industry submissions on eMobility Careers. Compare by experience level + add yours free.";
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title, description, siteName: "eMobility Careers" },
  };
}

export default async function RoleSalaryPage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  const detail = await getSalaryRole(role);
  if (!detail) notFound();

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = `${base}/salaries/${detail.slug}`;
  const siblings = (await getSalaryRoles()).filter((r) => r.slug !== detail.slug).slice(0, 14);

  const breadcrumb = breadcrumbJsonLd([
    { name: "EV Salary Compass", href: "/salaries" },
    { name: detail.title, href: `/salaries/${detail.slug}` },
  ]);
  const occupation = salaryOccupationJsonLd({
    name: detail.title,
    url,
    description: `Crowd-sourced ${detail.title} compensation across India's EV industry.`,
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
            <span>{detail.title}</span>
          </nav>

          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
            {detail.title} salary in India
          </h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            Crowd-sourced from {detail.count} anonymous EV-industry submissions. All figures are total CTC per year.
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
              <div className="text-right">
                <p className="text-2xl font-extrabold text-emce-text">{detail.count}</p>
                <p className="text-hint text-emce-text-sec">submissions</p>
              </div>
            </div>
          </Card>

          {/* By experience tier */}
          <section className="mt-8">
            <h2 className="text-section text-emce-text">{detail.title} salary by experience</h2>
            <p className="mt-0.5 text-hint text-emce-text-sec">
              Median total CTC per experience band. Bands with fewer than 5 submissions are hidden.
            </p>
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

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`/jobs?q=${encodeURIComponent(detail.title)}`}>
                See open {detail.title} jobs →
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/salaries/submit">Add your salary (anonymous) →</Link>
            </Button>
          </div>

          {/* Sibling-role rail — internal linking across the facet set */}
          {siblings.length > 0 && (
            <section className="mt-10">
              <h2 className="text-section text-emce-text">Salaries for other EV roles</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/salaries/roles"
                  className="rounded-full bg-emce-light-soft px-3 py-1 text-xs font-bold text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
                >
                  All roles
                </Link>
                {siblings.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/salaries/${r.slug}`}
                    className="rounded-full bg-emce-light-soft px-3 py-1 text-xs font-bold text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
                  >
                    {r.title} · {formatLakhs(r.stat.medianLakhs)}
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
