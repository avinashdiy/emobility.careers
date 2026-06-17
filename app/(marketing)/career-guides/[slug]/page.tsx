import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { env } from "@/lib/env";
import { breadcrumbJsonLd, faqPageJsonLd, jsonLdScriptTag } from "@/lib/seo/schemas";
import { CAREER_GUIDES, getCareerGuide } from "@/lib/career-guides/guides";
import { getSalaryRole, formatLakhs } from "@/lib/salary-compass";
import { searchJobs } from "@/server/jobs/queries";

/**
 * /career-guides/[slug] — long-form "how to become an X" depth page.
 * Hand-authored evergreen content (the prose earns the ranking) plus
 * LIVE data pulled at render: the crowd-sourced salary median and the
 * open-jobs count, with cross-links to the matching /salaries/[role]
 * and /jobs/[domain] facets. Emits Article + FAQPage + breadcrumb
 * JSON-LD. Revalidate hourly so the live figures stay fresh.
 */
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getCareerGuide(slug);
  if (!guide) return { title: "EV career guides", robots: { index: false, follow: false } };
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/career-guides/${guide.slug}`;
  return {
    title: guide.metaTitle,
    description: guide.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: guide.metaTitle,
      description: guide.metaDescription,
      siteName: "eMobility Careers",
    },
  };
}

export default async function CareerGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getCareerGuide(slug);
  if (!guide) notFound();

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = `${base}/career-guides/${guide.slug}`;

  // Live data — salary median + open-jobs count for the domain.
  const [salary, jobsResult] = await Promise.all([
    getSalaryRole(guide.salaryRoleSlug),
    searchJobs({ domain: guide.domainSlug, viewerIsDIYguru: false, page: 1, pageSize: 1 }),
  ]);
  const openJobs = jobsResult.total;

  const related = CAREER_GUIDES.filter((g) => g.slug !== guide.slug);

  const breadcrumb = breadcrumbJsonLd([
    { name: "Career guides", href: "/career-guides" },
    { name: `How to become a ${guide.role}`, href: `/career-guides/${guide.slug}` },
  ]);
  const faq = faqPageJsonLd(guide.faqs);
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: guide.metaTitle.slice(0, 110),
    description: guide.metaDescription,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: "eMobility Careers", url: base },
    publisher: {
      "@type": "Organization",
      name: "eMobility Careers",
      logo: { "@type": "ImageObject", url: `${base}/icon.png` },
    },
  };

  return (
    <div className="container max-w-3xl py-8 md:py-10">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(article) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(faq) }}
      />

      <nav className="text-hint text-emce-text-muted">
        <Link href="/career-guides" className="font-bold text-emce-dark hover:underline">Career guides</Link>
        <span className="mx-1.5">›</span>
        <span>{guide.role}</span>
      </nav>

      <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-emce-text md:text-4xl">
        How to become a {guide.role} in India
      </h1>
      <p className="mt-3 text-base text-emce-text-sec md:text-lg">{guide.summary}</p>

      {/* Live snapshot — salary + open jobs + domain */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Card className="bg-emce-light-soft">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">Median salary</p>
          {salary ? (
            <Link href={`/salaries/${guide.salaryRoleSlug}`} className="hover:underline">
              <p className="mt-1 text-2xl font-extrabold text-emce-mid-muted">{formatLakhs(salary.stat.medianLakhs)}</p>
              <p className="text-hint text-emce-text-sec">per year · see breakdown →</p>
            </Link>
          ) : (
            <p className="mt-1 text-sm text-emce-text-muted">Building dataset</p>
          )}
        </Card>
        <Card className="bg-emce-light-soft">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">Open jobs</p>
          <Link href={`/jobs/${guide.domainSlug}`} className="hover:underline">
            <p className="mt-1 text-2xl font-extrabold text-emce-text">{openJobs.toLocaleString("en-IN")}</p>
            <p className="text-hint text-emce-text-sec">in {guide.domainName} →</p>
          </Link>
        </Card>
        <Card className="bg-emce-light-soft">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">Domain</p>
          <Link href={`/jobs/${guide.domainSlug}`} className="hover:underline">
            <p className="mt-1 text-lg font-extrabold text-emce-text">{guide.domainName}</p>
            <p className="text-hint text-emce-text-sec">browse the domain →</p>
          </Link>
        </Card>
      </div>

      <article className="mt-8 space-y-10">
        {/* Overview */}
        <section>
          <h2 className="text-section text-emce-text">What does a {guide.role} do?</h2>
          <div className="mt-2 space-y-3 text-emce-text-sec">
            {guide.overview.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <ul className="mt-4 space-y-2">
            {guide.whatYouDo.map((d, i) => (
              <li key={i} className="flex gap-2 text-sm text-emce-text-sec">
                <span aria-hidden className="mt-0.5 text-emce-mid-muted">▹</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Skills */}
        <section>
          <h2 className="text-section text-emce-text">Skills you need</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-hint font-bold uppercase tracking-wide text-emce-mid-muted">Technical</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {guide.hardSkills.map((s) => (
                  <Badge key={s} variant="default">{s}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-hint font-bold uppercase tracking-wide text-emce-mid-muted">Professional</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {guide.softSkills.map((s) => (
                  <Badge key={s} variant="outline">{s}</Badge>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Qualifications */}
        <section>
          <h2 className="text-section text-emce-text">Qualifications</h2>
          <ul className="mt-3 space-y-2">
            {guide.qualifications.map((q, i) => (
              <li key={i} className="flex gap-2 text-sm text-emce-text-sec">
                <span aria-hidden className="mt-0.5 text-emce-mid-muted">🎓</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Steps */}
        <section>
          <h2 className="text-section text-emce-text">How to become a {guide.role}: step by step</h2>
          <ol className="mt-4 space-y-4">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emce-dark text-sm font-extrabold text-emce-light">
                  {i + 1}
                </span>
                <div>
                  <p className="font-bold text-emce-text">{s.title}</p>
                  <p className="mt-1 text-sm text-emce-text-sec">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Career path */}
        <section>
          <h2 className="text-section text-emce-text">Career path</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {guide.careerPath.map((step, i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="rounded-full bg-emce-light-soft px-3 py-1 text-xs font-bold text-emce-dark">
                  {step}
                </span>
                {i < guide.careerPath.length - 1 && <span aria-hidden className="text-emce-text-muted">→</span>}
              </span>
            ))}
          </div>
        </section>

        {/* Top employers */}
        <section>
          <h2 className="text-section text-emce-text">Who hires {guide.role}s in India?</h2>
          <p className="mt-2 text-sm text-emce-text-sec">
            Representative EV employers hiring for this role. See live openings in{" "}
            <Link href={`/jobs/${guide.domainSlug}`} className="font-bold text-emce-dark hover:underline">{guide.domainName}</Link>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {guide.topEmployers.map((e) => (
              <span key={e} className="rounded-full border border-emce-border px-3 py-1 text-sm text-emce-text-sec">
                {e}
              </span>
            ))}
          </div>
        </section>

        {/* CTAs */}
        <section className="rounded-xl border border-emce-mid bg-emce-light-soft p-5">
          <p className="text-section text-emce-text">Ready to start?</p>
          <p className="mt-1 text-sm text-emce-text-sec">
            {openJobs > 0
              ? `${openJobs.toLocaleString("en-IN")} ${guide.domainName} role${openJobs === 1 ? "" : "s"} are open right now.`
              : "Set up a profile and get matched the moment a role opens."}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`/jobs?q=${encodeURIComponent(guide.jobsQuery)}`}>See {guide.role} jobs →</Link>
            </Button>
            {salary && (
              <Button asChild variant="outline">
                <Link href={`/salaries/${guide.salaryRoleSlug}`}>View {guide.role} salary →</Link>
              </Button>
            )}
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-section text-emce-text">Frequently asked questions</h2>
          <dl className="mt-3 space-y-4">
            {guide.faqs.map((f, i) => (
              <div key={i}>
                <dt className="font-bold text-emce-text">{f.question}</dt>
                <dd className="mt-1 text-sm text-emce-text-sec">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Related guides */}
        {related.length > 0 && (
          <section>
            <h2 className="text-section text-emce-text">More EV career guides</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {related.map((g) => (
                <Link
                  key={g.slug}
                  href={`/career-guides/${g.slug}`}
                  className="rounded-full bg-emce-light-soft px-3 py-1 text-xs font-bold text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
                >
                  {g.role}
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}
