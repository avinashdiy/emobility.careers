import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { breadcrumbJsonLd, jsonLdScriptTag } from "@/lib/seo/schemas";
import {
  JDCollarType,
  JDSeniority,
  JDFunctionalArea,
} from "@prisma/client";

/**
 * /jd/[slug] — public detail page for a single EV JD template.
 *
 * Gating strategy (lead-gen):
 *   • Public (no auth) sees the SEO top fold — title, alternative
 *     titles, summary, overview, salary band, demand/remote chips,
 *     key skills, tools, typical companies, and the FIRST 3 bullets
 *     of responsibilities + requirements (with a "+N more locked"
 *     teaser).
 *   • Anyone signed in (any role, candidate or HR or admin) sees
 *     the full content — every bullet, certifications, sample
 *     interview questions, career-path ladder, reports, and the
 *     live salary medians computed from `SalarySubmission`.
 *
 * That split is the whole product hypothesis: HRs land via Google,
 * see enough to know the JD is good, then sign up to copy it into
 * their ATS. The visible-to-public portion is wide enough that
 * search engines treat the page as substantive (no doorway / thin
 * content); the gated portion is the bait.
 *
 * Schema-org: emits `Occupation` JSON-LD for SERP rich-result
 * eligibility.
 */

export const dynamic = "force-dynamic";

const COLLAR_LABEL: Record<JDCollarType, string> = {
  BLUE: "Blue-collar",
  GREY: "Skilled-trade",
  WHITE: "White-collar",
  CXO: "CXO / Executive",
};

const SENIORITY_LABEL: Record<JDSeniority, string> = {
  ENTRY: "Entry (0-1 yr)",
  JUNIOR: "Junior (1-3 yr)",
  MID: "Mid (3-6 yr)",
  SENIOR: "Senior (6-10 yr)",
  LEAD: "Lead / Staff (10-15 yr)",
  PRINCIPAL: "Principal / Director (15+ yr)",
  EXECUTIVE: "CXO / Head-of",
};

const FA_LABEL: Record<JDFunctionalArea, string> = {
  ENGINEERING: "Engineering",
  RESEARCH_AND_DEVELOPMENT: "R&D",
  SOFTWARE: "Software",
  DATA_AND_AI: "Data & AI",
  PRODUCT: "Product",
  DESIGN: "Design",
  MANUFACTURING: "Manufacturing",
  QUALITY: "Quality",
  SUPPLY_CHAIN: "Supply chain",
  OPERATIONS: "Operations",
  SERVICE_AND_AFTERSALES: "Service & after-sales",
  SALES: "Sales",
  MARKETING: "Marketing",
  BUSINESS_DEVELOPMENT: "Business development",
  HR_AND_RECRUITING: "HR & recruiting",
  FINANCE: "Finance",
  LEGAL_AND_COMPLIANCE: "Legal & compliance",
  STRATEGY: "Strategy",
  EXECUTIVE: "Executive",
};

function fmtLakhs(n: number | null | undefined): string | null {
  if (n == null) return null;
  if (n >= 100) return `₹${(n / 100).toFixed(n >= 1000 ? 0 : 1)}Cr`;
  return `₹${Number.isInteger(n) ? n : n.toFixed(1)}L`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const jd = await db.jobDescriptionTemplate.findUnique({
    where: { slug },
    select: {
      title: true,
      summary: true,
      metaTitle: true,
      metaDescription: true,
      status: true,
      salaryMinLakhs: true,
      salaryMaxLakhs: true,
    },
  });
  if (!jd || jd.status !== "PUBLISHED") {
    return { title: "Job description not found" };
  }
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = `${base}/jd/${slug}`;
  const title =
    jd.metaTitle ??
    `${jd.title} — job description, responsibilities & salary (India ${new Date().getFullYear()})`;
  const description =
    jd.metaDescription ??
    `${jd.summary} Includes responsibilities, qualifications${
      jd.salaryMinLakhs && jd.salaryMaxLakhs
        ? ` and India salary band (${fmtLakhs(jd.salaryMinLakhs)}–${fmtLakhs(jd.salaryMaxLakhs)})`
        : ""
    }.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      siteName: "emobility.careers",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Best-effort live salary medians from `SalarySubmission` matching
 * either `salaryRoleQuery` (admin LIKE pattern) or the canonical
 * `title`. We require ≥5 matching rows before showing a number, to
 * keep one-off outliers from anchoring the page. Falls back to the
 * static admin-set band when there aren't enough submissions.
 */
async function liveSalaryMedian(
  title: string,
  rolePattern: string | null,
): Promise<{ median: number; sample: number } | null> {
  const pattern = rolePattern && rolePattern.includes("%") ? rolePattern : `%${title}%`;
  const rows = await db.salarySubmission.findMany({
    where: {
      status: "APPROVED",
      jobTitle: { contains: pattern.replace(/%/g, ""), mode: "insensitive" },
    },
    select: { ctcLakhs: true },
    take: 200,
  });
  if (rows.length < 5) return null;
  const sorted = rows.map((r) => r.ctcLakhs).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return { median, sample: rows.length };
}

export default async function JDDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [session, jd] = await Promise.all([
    auth(),
    db.jobDescriptionTemplate.findUnique({
      where: { slug },
      include: {
        evDomain: { select: { slug: true, name: true } },
        author: { select: { name: true } },
      },
    }),
  ]);
  if (!jd || jd.status !== "PUBLISHED") notFound();

  const isAuthed = !!session?.user;
  const liveMedian = await liveSalaryMedian(jd.title, jd.salaryRoleQuery);

  // Fire-and-forget view counter — incremented every public render
  // so the directory's "most-viewed" ordering reflects real traffic.
  // Wrapped to never throw on a transient DB blip.
  db.jobDescriptionTemplate
    .update({ where: { id: jd.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => undefined);

  // Public preview: first 3 bullets shown, the rest gated.
  const PUBLIC_BULLETS = 3;
  const respPublic = jd.responsibilities.slice(0, PUBLIC_BULLETS);
  const respGated = isAuthed
    ? jd.responsibilities.slice(PUBLIC_BULLETS)
    : [];
  const reqPublic = jd.requirements.slice(0, PUBLIC_BULLETS);
  const reqGated = isAuthed ? jd.requirements.slice(PUBLIC_BULLETS) : [];

  const respHiddenCount = Math.max(0, jd.responsibilities.length - PUBLIC_BULLETS);
  const reqHiddenCount = Math.max(0, jd.requirements.length - PUBLIC_BULLETS);

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = `${base}/jd/${slug}`;

  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "Job descriptions", href: "/jd" },
    { name: jd.title, href: `/jd/${slug}` },
  ]);

  // Occupation JSON-LD — closest schema.org type for a JD template
  // (vs. JobPosting which implies a posted, hiring-now role).
  const occupationLd = {
    "@context": "https://schema.org",
    "@type": "Occupation",
    name: jd.title,
    description: jd.summary,
    occupationLocation: { "@type": "Country", name: "India" },
    ...(jd.salaryMinLakhs != null && jd.salaryMaxLakhs != null
      ? {
          estimatedSalary: {
            "@type": "MonetaryAmountDistribution",
            currency: jd.salaryCurrency,
            duration: jd.salaryPeriod === "MONTHLY" ? "P1M" : "P1Y",
            minValue: jd.salaryMinLakhs * 100_000,
            maxValue: jd.salaryMaxLakhs * 100_000,
            median: (jd.salaryMedianLakhs ?? null) != null ? jd.salaryMedianLakhs! * 100_000 : undefined,
          },
        }
      : {}),
    qualifications: jd.requirements.join("\n"),
    skills: jd.keySkills.join(", "),
    responsibilities: jd.responsibilities.slice(0, PUBLIC_BULLETS).join("\n"),
  };

  const salaryBand =
    jd.salaryMinLakhs != null && jd.salaryMaxLakhs != null
      ? `${fmtLakhs(jd.salaryMinLakhs)} – ${fmtLakhs(jd.salaryMaxLakhs)}`
      : fmtLakhs(jd.salaryMedianLakhs);

  const overviewParas = jd.overview
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <>
      <SiteHeader />
      <main className="container max-w-4xl py-6 md:py-10">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(breadcrumb) }}
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(occupationLd) }}
        />

        <nav className="text-hint text-emce-text-sec">
          <Link href="/jd" className="hover:underline">
            ← All EV job descriptions
          </Link>
        </nav>

        {/* Hero */}
        <header className="mt-3 border-b border-emce-border pb-6">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{COLLAR_LABEL[jd.collarType]}</Badge>
            <Badge variant="default">{SENIORITY_LABEL[jd.seniority]}</Badge>
            <Badge variant="outline">{FA_LABEL[jd.functionalArea]}</Badge>
            {jd.evDomain && <Badge variant="outline">{jd.evDomain.name}</Badge>}
            {jd.demandSignal && (
              <Badge
                variant={
                  /critical|high/i.test(jd.demandSignal) ? "success" : "warning"
                }
              >
                {jd.demandSignal} demand
              </Badge>
            )}
            {jd.remoteFriendly && <Badge variant="success">Remote-friendly</Badge>}
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-emce-text md:text-4xl">
            {jd.title}
          </h1>
          {jd.alternativeTitles.length > 0 && (
            <p className="mt-2 text-hint text-emce-text-sec">
              <span className="font-bold uppercase tracking-wide">Also known as:</span>{" "}
              {jd.alternativeTitles.join(" · ")}
            </p>
          )}
          <p className="mt-3 text-body text-emce-text">{jd.summary}</p>

          {/* Salary band — the headline number recruiters and candidates
              scan for. Shown to everyone (no gate) for SEO. */}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">
                Salary band · India
              </p>
              <p className="mt-1 text-section font-extrabold text-emce-darkest md:text-xl">
                {salaryBand ?? "Curating data"}
              </p>
              <p className="mt-1 text-hint text-emce-text-sec">
                {jd.salaryMedianLakhs != null && (
                  <>Median {fmtLakhs(jd.salaryMedianLakhs)}</>
                )}
                {jd.salaryPeriod === "MONTHLY" && " · per month"}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">
                Experience
              </p>
              <p className="mt-1 text-section font-extrabold text-emce-darkest md:text-xl">
                {jd.experienceMinYears}–{jd.experienceMaxYears} yrs
              </p>
              <p className="mt-1 text-hint text-emce-text-sec">
                {SENIORITY_LABEL[jd.seniority]}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">
                Hiring outlook
              </p>
              <p className="mt-1 text-section font-extrabold text-emce-darkest md:text-xl">
                {jd.demandSignal ?? "Steady"}
              </p>
              {jd.growthOutlook && (
                <p className="mt-1 text-hint text-emce-text-sec">{jd.growthOutlook}</p>
              )}
            </Card>
          </div>
        </header>

        {/* Overview — full, public */}
        <section className="mt-8" aria-labelledby="h-overview">
          <h2 id="h-overview" className="text-section text-emce-text">Role overview</h2>
          <div className="mt-2 space-y-3 text-body text-emce-text">
            {overviewParas.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>

        {/* Key skills + tools — fully public, drives keyword
            density for long-tail SEO ("BMS firmware engineer
            jobs", "OCPP charging operator JD"). */}
        {jd.keySkills.length > 0 && (
          <section className="mt-8" aria-labelledby="h-skills">
            <h2 id="h-skills" className="text-section text-emce-text">
              Key skills
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {jd.keySkills.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-emce-light-soft px-3 py-1 text-xs font-bold text-emce-text"
                >
                  {s}
                </span>
              ))}
            </div>
            {jd.tools.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">
                  Tools & software
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {jd.tools.map((t) => (
                    <span
                      key={t}
                      className="rounded-sm border border-emce-border px-2 py-0.5 text-xs font-semibold text-emce-text-sec"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Responsibilities — first 3 visible, rest gated */}
        <section className="mt-8" aria-labelledby="h-resp">
          <h2 id="h-resp" className="text-section text-emce-text">
            Responsibilities
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-emce-text">
            {respPublic.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
            {respGated.map((r, i) => (
              <li key={`g-${i}`}>{r}</li>
            ))}
          </ul>
          {!isAuthed && respHiddenCount > 0 && (
            <GatedTeaser
              count={respHiddenCount}
              label="more responsibilities"
              next={`/jd/${slug}`}
            />
          )}
        </section>

        {/* Requirements — same pattern */}
        <section className="mt-8" aria-labelledby="h-req">
          <h2 id="h-req" className="text-section text-emce-text">
            Requirements
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-emce-text">
            {reqPublic.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
            {reqGated.map((r, i) => (
              <li key={`g-${i}`}>{r}</li>
            ))}
          </ul>
          {!isAuthed && reqHiddenCount > 0 && (
            <GatedTeaser
              count={reqHiddenCount}
              label="more requirements"
              next={`/jd/${slug}`}
            />
          )}
        </section>

        {/* Typical employers + industries — public, helps the page
            rank for company-level queries ("Ola Electric battery
            engineer jobs"). */}
        {(jd.typicalCompanies.length > 0 || jd.typicalIndustries.length > 0) && (
          <section className="mt-8 grid gap-4 sm:grid-cols-2" aria-labelledby="h-where">
            <div>
              <h2 id="h-where" className="text-section text-emce-text">
                Typical employers
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {jd.typicalCompanies.length === 0 ? (
                  <p className="text-hint text-emce-text-muted">Across the EV ecosystem.</p>
                ) : (
                  jd.typicalCompanies.map((c) => (
                    <span
                      key={c}
                      className="rounded-sm bg-emce-light-soft px-2 py-0.5 text-xs font-semibold text-emce-text"
                    >
                      {c}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div>
              <h3 className="text-section text-emce-text">Industries</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {jd.typicalIndustries.map((i) => (
                  <span
                    key={i}
                    className="rounded-sm border border-emce-border px-2 py-0.5 text-xs font-semibold text-emce-text-sec"
                  >
                    {i}
                  </span>
                ))}
              </div>
              {jd.reportsTo && (
                <p className="mt-3 text-hint text-emce-text-sec">
                  <span className="font-bold uppercase tracking-wide">Reports to:</span>{" "}
                  {jd.reportsTo}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Live salary medians — only when ≥5 matching submissions
            exist. Public for SEO; the underlying SalarySubmission
            unlock still applies if the user clicks through to
            /salaries. */}
        {liveMedian && (
          <section className="mt-8" aria-labelledby="h-livesal">
            <h2 id="h-livesal" className="text-section text-emce-text">
              Live salary signal
            </h2>
            <Card className="mt-2 border-emce-mid bg-emce-light-soft p-4">
              <p className="text-body text-emce-text">
                Median CTC of <strong>{fmtLakhs(liveMedian.median)}</strong> across{" "}
                {liveMedian.sample} anonymous submissions from professionals on this platform —{" "}
                <Link href="/salaries" className="font-bold text-emce-dark hover:underline">
                  see the full Salary Compass →
                </Link>
              </p>
            </Card>
          </section>
        )}

        {/* ─── Gated content ─────────────────────────────────────
            Everything below this is gated for unauthed visitors:
            preferred qualifications, certifications, interview
            questions, career path, who-reports-to-this-role. We
            render either the full content (signed-in) or a single
            "sign-up to unlock" panel covering all gated sections.
        */}
        {!isAuthed ? (
          <GatedFullPanel slug={slug} />
        ) : (
          <>
            {jd.preferredQualifications.length > 0 && (
              <section className="mt-8" aria-labelledby="h-pref">
                <h2 id="h-pref" className="text-section text-emce-text">
                  Preferred qualifications
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-emce-text">
                  {jd.preferredQualifications.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </section>
            )}
            {jd.certifications.length > 0 && (
              <section className="mt-8" aria-labelledby="h-cert">
                <h2 id="h-cert" className="text-section text-emce-text">
                  Industry certifications that matter
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-emce-text">
                  {jd.certifications.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </section>
            )}
            {jd.careerPath.length > 0 && (
              <section className="mt-8" aria-labelledby="h-path">
                <h2 id="h-path" className="text-section text-emce-text">
                  Career path
                </h2>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-body text-emce-text">
                  {jd.careerPath.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              </section>
            )}
            {jd.reports.length > 0 && (
              <section className="mt-8" aria-labelledby="h-reports">
                <h2 id="h-reports" className="text-section text-emce-text">
                  Typically manages
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-emce-text">
                  {jd.reports.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            )}
            {jd.sampleInterviewQuestions.length > 0 && (
              <section className="mt-8" aria-labelledby="h-iq">
                <h2 id="h-iq" className="text-section text-emce-text">
                  Sample interview questions
                </h2>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-body text-emce-text">
                  {jd.sampleInterviewQuestions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}

        {/* Action bar — bottom of page */}
        <section className="mt-12 rounded-xl bg-emce-light-soft p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-section text-emce-text">
                Hiring for {jd.title.toLowerCase()}?
              </p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Post a job on emobility.careers — your listing reaches India&apos;s largest
                EV-trained candidate pool. Free trial for the first hire.
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/employer/onboarding">Post a job →</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/jd">More JDs</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

/**
 * Compact teaser for partially-gated sections (responsibilities /
 * requirements). Just a "+N more locked" line + a "Sign up" link.
 */
function GatedTeaser({
  count,
  label,
  next,
}: {
  count: number;
  label: string;
  next: string;
}) {
  return (
    <p className="mt-2 rounded-md border border-dashed border-emce-mid bg-emce-light-soft p-3 text-hint text-emce-text-sec">
      🔒 <strong>+{count}</strong> {label} hidden — {" "}
      <Link
        href={`/signup?next=${encodeURIComponent(next)}`}
        className="font-bold text-emce-dark hover:underline"
      >
        sign up free
      </Link>{" "}
      to reveal the full JD, certifications, interview questions and career-path ladder.
    </p>
  );
}

/**
 * Single "sign-up to unlock everything below" panel, rendered in
 * place of the entirely-gated sections (preferred qualifications,
 * certifications, career path, reports, interview questions).
 */
function GatedFullPanel({ slug }: { slug: string }) {
  const items = [
    "Preferred qualifications",
    "Industry certifications",
    "Career-path ladder",
    "Sample interview questions",
    "Reporting hierarchy",
  ];
  return (
    <section className="mt-10" aria-labelledby="h-gate">
      <Card className="border-2 border-dashed border-emce-mid bg-gradient-to-br from-emce-light-soft to-white p-6">
        <h2 id="h-gate" className="text-section text-emce-text">
          🔒 Unlock the full JD — free
        </h2>
        <p className="mt-2 text-body text-emce-text-sec">
          Create a free emobility.careers account to access the rest of this template plus 200+
          more EV job descriptions.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {items.map((label) => (
            <li
              key={label}
              className="flex items-center gap-2 rounded-md border border-emce-border bg-white p-3 text-sm font-semibold text-emce-text"
            >
              <span aria-hidden>🔓</span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href={`/signup?next=${encodeURIComponent(`/jd/${slug}`)}`}>
              Create free account
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={`/signin?next=${encodeURIComponent(`/jd/${slug}`)}`}>
              Sign in
            </Link>
          </Button>
        </div>
        <p className="mt-3 text-hint text-emce-text-muted">
          No credit card. Two-minute sign-up. Cancel anytime — every JD on the platform stays free.
        </p>
      </Card>
    </section>
  );
}
