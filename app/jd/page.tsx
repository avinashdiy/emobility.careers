import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScriptTag } from "@/lib/seo/schemas";
import {
  JDCollarType,
  JDSeniority,
  JDFunctionalArea,
  type Prisma,
} from "@prisma/client";

/**
 * /jd — directory of EV-industry job description templates.
 *
 * SEO play: every listed JD has its own /jd/<slug> page whose
 * top fold (title, summary, overview, salary band, key skills) is
 * fully public. HRs / candidates searching "EV BMS engineer JD" or
 * "lithium battery technician salary" land on this directory or on
 * a detail page. Full body is gated behind sign-up (see /jd/[slug]).
 *
 * Filters via querystring:
 *   • ?q=     — title / summary text
 *   • ?collar=BLUE|GREY|WHITE|CXO
 *   • ?level= ENTRY|JUNIOR|MID|SENIOR|LEAD|PRINCIPAL|EXECUTIVE
 *   • ?fa=    JDFunctionalArea enum value
 *   • ?domain=<EVDomain slug>
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

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; collar?: string; level?: string; fa?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const facets: string[] = [];
  if (sp.collar && sp.collar in COLLAR_LABEL) facets.push(COLLAR_LABEL[sp.collar as JDCollarType]);
  if (sp.level && sp.level in SENIORITY_LABEL) facets.push(SENIORITY_LABEL[sp.level as JDSeniority]);
  if (sp.fa && sp.fa in FA_LABEL) facets.push(FA_LABEL[sp.fa as JDFunctionalArea]);
  const facetClause = facets.length ? ` — ${facets.join(", ")}` : "";

  const title = `EV job descriptions directory${facetClause} — 200+ role templates with salary bands`;
  const description =
    "Browse 200+ EV-industry job description templates — battery, charging, motors, manufacturing, software, sales, CXO. Each JD includes responsibilities, qualifications, India salary bands and interview prep. Built for HRs sourcing for the EV economy.";
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const params = new URLSearchParams();
  for (const k of ["q", "collar", "level", "fa"] as const) {
    if (sp[k]) params.set(k, sp[k]!);
  }
  const url = `${base}/jd${params.toString() ? `?${params}` : ""}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: "emobility.careers",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

function fmtLakhs(n: number | null | undefined): string | null {
  if (n == null) return null;
  // ₹3.5L / ₹12L / ₹1.4Cr
  if (n >= 100) return `₹${(n / 100).toFixed(n >= 1000 ? 0 : 1)}Cr`;
  return `₹${Number.isInteger(n) ? n : n.toFixed(1)}L`;
}

export default async function JDDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    collar?: string;
    level?: string;
    fa?: string;
    domain?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const collar =
    sp.collar && sp.collar in COLLAR_LABEL ? (sp.collar as JDCollarType) : undefined;
  const level =
    sp.level && sp.level in SENIORITY_LABEL ? (sp.level as JDSeniority) : undefined;
  const fa = sp.fa && sp.fa in FA_LABEL ? (sp.fa as JDFunctionalArea) : undefined;
  const domain = sp.domain?.trim() || undefined;

  const where: Prisma.JobDescriptionTemplateWhereInput = {
    status: "PUBLISHED",
  };
  if (collar) where.collarType = collar;
  if (level) where.seniority = level;
  if (fa) where.functionalArea = fa;
  if (domain) where.evDomain = { slug: domain };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
      { alternativeTitles: { has: q } },
      { keySkills: { has: q } },
    ];
  }

  const [list, totalPublished, evDomains, perCollar, perFA] = await Promise.all([
    db.jobDescriptionTemplate.findMany({
      where,
      orderBy: [{ viewCount: "desc" }, { title: "asc" }],
      take: 60,
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        collarType: true,
        seniority: true,
        functionalArea: true,
        evDomain: { select: { slug: true, name: true } },
        salaryMinLakhs: true,
        salaryMedianLakhs: true,
        salaryMaxLakhs: true,
        salaryCurrency: true,
        demandSignal: true,
        remoteFriendly: true,
        viewCount: true,
        keySkills: true,
      },
    }),
    db.jobDescriptionTemplate.count({ where: { status: "PUBLISHED" } }),
    db.eVDomain.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { slug: true, name: true },
    }),
    db.jobDescriptionTemplate.groupBy({
      by: ["collarType"],
      where: { status: "PUBLISHED" },
      _count: { _all: true },
    }),
    db.jobDescriptionTemplate.groupBy({
      by: ["functionalArea"],
      where: { status: "PUBLISHED" },
      _count: { _all: true },
    }),
  ]);

  const collarCount = Object.fromEntries(
    perCollar.map((c) => [c.collarType, c._count._all]),
  ) as Partial<Record<JDCollarType, number>>;
  const faCount = Object.fromEntries(
    perFA.map((c) => [c.functionalArea, c._count._all]),
  ) as Partial<Record<JDFunctionalArea, number>>;

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "Job descriptions", href: "/jd" },
  ]);
  const itemList = itemListJsonLd({
    items: list,
    itemUrl: (jd) => `${base}/jd/${jd.slug}`,
    itemName: (jd) => jd.title,
  });

  // Helper to build a query-string-preserving link (so picking a
  // collar doesn't blow away the search box, etc.).
  function withParam(name: string, value: string | undefined) {
    const u = new URLSearchParams();
    for (const k of ["q", "collar", "level", "fa", "domain"] as const) {
      const v = k === name ? value : sp[k];
      if (v) u.set(k, v);
    }
    return `/jd${u.toString() ? `?${u}` : ""}`;
  }

  return (
    <>
      <SiteHeader />
      <div className="container max-w-6xl py-6 md:py-10">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(breadcrumb) }}
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(itemList) }}
        />

        <PageHeader
          eyebrow="EV job descriptions"
          title="200+ ready-to-use EV job description templates"
          accent="hiring"
          subtitle="From battery operator to Chief Battery Officer — every role in India's EV economy, with responsibilities, requirements, salary bands and interview prep. Made for HRs and TPOs sourcing the next million EV jobs."
        />

        {/* Top-of-funnel CTA — the page is gated on the detail
            view; this banner sets expectations on the directory itself. */}
        <Card className="mt-4 border-emce-mid bg-emce-light-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-section text-emce-text">🔓 Full JDs unlock on sign-up</p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Browse summaries and salary bands here. Create a free account to access full
                responsibilities, interview question banks and career-path ladders for any of these
                roles.
              </p>
            </div>
            <Button asChild size="sm">
              <Link href="/signup?next=/jd">Create free account →</Link>
            </Button>
          </div>
        </Card>

        {/* Filter strip — keyword search + collar + level + FA. Posts
            via GET so each combination is a discrete, indexable URL. */}
        <Card className="mt-6 p-4">
          <form className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-4">
              <Input
                name="q"
                defaultValue={q}
                placeholder="Search role or skill (e.g. BMS, charging, line manager)"
              />
            </div>
            <div className="sm:col-span-2">
              <NativeSelect name="collar" defaultValue={collar ?? ""}>
                <option value="">Any collar</option>
                {Object.entries(COLLAR_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <NativeSelect name="level" defaultValue={level ?? ""}>
                <option value="">Any level</option>
                {Object.entries(SENIORITY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <NativeSelect name="fa" defaultValue={fa ?? ""}>
                <option value="">Any function</option>
                {Object.entries(FA_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full">
                Search
              </Button>
            </div>
            {/* Preserve domain filter when it's set, since it's not a
                visible select on the form (it's typically reached
                from a per-domain chip below). */}
            {domain && <input type="hidden" name="domain" value={domain} />}
          </form>

          {/* Collar quick chips — when a collar is active, an "all"
              chip lets the user clear it without manually editing
              the URL. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Link
              href={withParam("collar", undefined)}
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                !collar
                  ? "bg-emce-dark text-white"
                  : "border border-emce-border bg-white text-emce-dark hover:bg-emce-light-soft"
              }`}
            >
              All ({totalPublished})
            </Link>
            {(Object.keys(COLLAR_LABEL) as JDCollarType[]).map((c) => {
              const active = c === collar;
              const count = collarCount[c] ?? 0;
              if (count === 0 && !active) return null;
              return (
                <Link
                  key={c}
                  href={withParam("collar", c)}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    active
                      ? "bg-emce-dark text-white"
                      : "border border-emce-border bg-white text-emce-dark hover:bg-emce-light-soft"
                  }`}
                >
                  {COLLAR_LABEL[c]} ({count})
                </Link>
              );
            })}
          </div>

          {/* Functional-area chip row — secondary filter line. Long
              list so wrapped onto a flex-wrap row. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(Object.keys(FA_LABEL) as JDFunctionalArea[]).map((f) => {
              const active = f === fa;
              const count = faCount[f] ?? 0;
              if (count === 0 && !active) return null;
              return (
                <Link
                  key={f}
                  href={withParam("fa", active ? undefined : f)}
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                    active
                      ? "bg-emce-orange-light text-emce-orange-deep"
                      : "text-emce-text-sec hover:text-emce-dark"
                  }`}
                >
                  {FA_LABEL[f]} ({count})
                </Link>
              );
            })}
          </div>

          {/* EV-domain row — when domains exist, surface them as
              chips below the FA row so the user can drill into
              Battery / Charging / Motors. */}
          {evDomains.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {evDomains.map((d) => {
                const active = d.slug === domain;
                return (
                  <Link
                    key={d.slug}
                    href={withParam("domain", active ? undefined : d.slug)}
                    className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold ${
                      active
                        ? "bg-emce-mid text-white"
                        : "text-emce-text-muted hover:text-emce-dark"
                    }`}
                  >
                    {d.name}
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <p className="mt-4 text-sm text-emce-text-sec">
          {list.length} of {totalPublished} job descriptions shown
          {q && ` matching “${q}”`}
        </p>

        {list.length === 0 ? (
          <EmptyState
            className="mt-6"
            icon="📋"
            title="No JD templates match your filters"
            body="Try clearing the filters or run /admin/jd-templates to add new ones."
          />
        ) : (
          <ul className="emce-stagger mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {list.map((jd) => {
              const salaryBand =
                jd.salaryMinLakhs != null && jd.salaryMaxLakhs != null
                  ? `${fmtLakhs(jd.salaryMinLakhs)}–${fmtLakhs(jd.salaryMaxLakhs)}`
                  : fmtLakhs(jd.salaryMedianLakhs);
              return (
                <li key={jd.id}>
                  <Link href={`/jd/${jd.slug}`} className="block h-full">
                    <Card variant="interactive" className="h-full">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {COLLAR_LABEL[jd.collarType]}
                        </Badge>
                        <Badge variant="default" className="text-[10px]">
                          {SENIORITY_LABEL[jd.seniority].split(" ")[0]}
                        </Badge>
                        {jd.demandSignal && (
                          <Badge
                            variant={
                              /critical|high/i.test(jd.demandSignal) ? "success" : "warning"
                            }
                            className="text-[10px]"
                          >
                            {jd.demandSignal}
                          </Badge>
                        )}
                        {jd.remoteFriendly && (
                          <Badge variant="success" className="text-[10px]">
                            Remote-friendly
                          </Badge>
                        )}
                      </div>
                      <h3 className="mt-2 font-bold text-emce-text">{jd.title}</h3>
                      <p className="mt-1 line-clamp-2 text-hint text-emce-text-sec">
                        {jd.summary}
                      </p>
                      <div className="mt-3 flex flex-wrap items-baseline gap-2 text-hint">
                        {salaryBand && (
                          <span className="font-bold text-emce-mid-muted">{salaryBand}</span>
                        )}
                        {jd.evDomain && (
                          <span className="text-emce-text-muted">· {jd.evDomain.name}</span>
                        )}
                        <span className="text-emce-text-muted">· {FA_LABEL[jd.functionalArea]}</span>
                      </div>
                      {jd.keySkills.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {jd.keySkills.slice(0, 4).map((s) => (
                            <span
                              key={s}
                              className="rounded-sm bg-emce-light-soft px-1.5 py-0.5 text-[10px] font-semibold text-emce-text-sec"
                            >
                              {s}
                            </span>
                          ))}
                          {jd.keySkills.length > 4 && (
                            <span className="rounded-sm bg-emce-light-soft px-1.5 py-0.5 text-[10px] font-semibold text-emce-text-muted">
                              +{jd.keySkills.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {/* SEO body — short evergreen copy under the fold. Anchors
            the page for queries like "EV industry job descriptions"
            that aren't tied to a specific role. */}
        <section className="mt-12 rounded-xl bg-white p-6">
          <h2 className="text-section text-emce-text">Why a JD library for the EV industry</h2>
          <p className="mt-2 text-body text-emce-text-sec">
            India&apos;s EV industry is projected to add a million jobs by 2030 — across
            battery R&amp;D, charging-infra deployment, motor manufacturing, ADAS software,
            after-sales service, fleet operations and the senior leadership that runs them.
            Most of these roles don&apos;t have a settled job-description template the way
            traditional automotive or IT roles do. This library curates 200+ JDs covering blue-collar
            to CXO, each with realistic responsibilities, required qualifications, India-specific
            salary bands and interview-question banks tested with practitioners.
          </p>
          <p className="mt-2 text-body text-emce-text-sec">
            HRs can copy a JD straight into their ATS. Candidates can use them to study what each
            role looks like before applying. TPOs can hand them to students preparing for campus
            placements. Everything in the library is admin-curated, evergreen, and updated as the
            industry evolves.
          </p>
        </section>
      </div>
      <SiteFooter />
    </>
  );
}
