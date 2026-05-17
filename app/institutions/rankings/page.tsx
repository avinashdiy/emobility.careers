import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScriptTag } from "@/lib/seo/schemas";

/**
 * /institutions/rankings — admin-curated leaderboard of EV-industry
 * institutions, scored across seven pillars: Research, Faculty,
 * Placement, Infrastructure, Content quality, Alumni and Startups.
 *
 * Two scopes via `?scope=india|global` (default india):
 *   • India — only country=IN rows, ranked 1..N
 *   • Global — all countries, ranked 1..N
 *
 * Rankings are persisted in `Institution.evRankIndia` /
 * `evRankGlobal` by scripts/seed-institution-rankings.ts. The page
 * itself only reads pre-computed ranks; ordering is deterministic
 * and identical for every visitor.
 *
 * eMobility Academy by DIYguru is editorially pinned (#1 India,
 * #2 global) — see the seed script for the pin mechanism.
 */

const SCOPES = ["india", "global"] as const;
type Scope = (typeof SCOPES)[number];

const SCOPE_COPY: Record<Scope, { eyebrow: string; title: string; subtitle: string }> = {
  india: {
    eyebrow: "Best EV institutions · India",
    title: "Top universities, colleges & training centres for EV careers in India",
    subtitle:
      "Indian universities, polytechnics, ITIs and training centres ranked across seven pillars — research, faculty, placement, infrastructure, content quality, alumni reach and EV-startup output.",
  },
  global: {
    eyebrow: "Best EV institutions · Worldwide",
    title: "Top EV training and research institutions worldwide",
    subtitle:
      "Global ranking of EV-focused universities, research labs and training providers — combining academic research with industry-aligned upskilling output.",
  },
};

const PILLARS = [
  { key: "evScoreResearch", label: "Research", short: "Res." },
  { key: "evScoreFaculty", label: "Faculty", short: "Fac." },
  { key: "evScorePlacement", label: "Placement", short: "Pla." },
  { key: "evScoreInfrastructure", label: "Infrastructure", short: "Inf." },
  { key: "evScoreContent", label: "Content quality", short: "Con." },
  { key: "evScoreAlumni", label: "Alumni", short: "Alu." },
  { key: "evScoreStartups", label: "Startups", short: "Str." },
] as const;
type PillarKey = (typeof PILLARS)[number]["key"];

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const scope: Scope = (SCOPES as readonly string[]).includes(sp.scope ?? "")
    ? (sp.scope as Scope)
    : "india";
  const copy = SCOPE_COPY[scope];
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = `${base}/institutions/rankings${scope === "india" ? "" : `?scope=${scope}`}`;
  return {
    title: `${copy.title} (${new Date().getFullYear()})`,
    description: copy.subtitle,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: copy.title,
      description: copy.subtitle,
      siteName: "emobility.careers",
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.subtitle,
    },
  };
}

/**
 * Pillar-score chip — tiny coloured pill so a reader can scan the
 * 7 numbers without parsing decimals. Colour-coded by band so the
 * eye can find weak pillars at a glance.
 */
function PillarChip({ short, score }: { short: string; score: number | null }) {
  if (score == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-emce-light-soft px-1.5 py-0.5 text-[10px] font-semibold text-emce-text-muted">
        {short} —
      </span>
    );
  }
  const tone =
    score >= 90
      ? "bg-emce-success-light text-emce-success-deep"
      : score >= 80
        ? "bg-emce-light-soft text-emce-dark"
        : score >= 70
          ? "bg-emce-orange-light text-emce-orange-deep"
          : "bg-emce-red-light text-emce-red-deep";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${tone}`}
    >
      <span className="opacity-80">{short}</span>
      <span>{score}</span>
    </span>
  );
}

export default async function InstitutionRankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const sp = await searchParams;
  const scope: Scope = (SCOPES as readonly string[]).includes(sp.scope ?? "")
    ? (sp.scope as Scope)
    : "india";
  const copy = SCOPE_COPY[scope];

  // Pre-computed ranks live in `evRankIndia` / `evRankGlobal`. Pull
  // the matching field and sort ASC (1 = best). Rows without a rank
  // for this scope are silently excluded — they appear in the
  // faceted /institutions listing instead.
  const rankField: "evRankIndia" | "evRankGlobal" =
    scope === "india" ? "evRankIndia" : "evRankGlobal";

  const list = await db.institution.findMany({
    where: {
      verificationStatus: "VERIFIED",
      [rankField]: { not: null },
    },
    orderBy: { [rankField]: "asc" },
    take: 60,
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      type: true,
      city: true,
      state: true,
      country: true,
      logoUrl: true,
      website: true,
      about: true,
      evScoreResearch: true,
      evScoreFaculty: true,
      evScorePlacement: true,
      evScoreInfrastructure: true,
      evScoreContent: true,
      evScoreAlumni: true,
      evScoreStartups: true,
      evScoreOverall: true,
      evRankIndia: true,
      evRankGlobal: true,
      evRankingNote: true,
      _count: { select: { educationLinks: true } },
    },
  });

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "Institutions", href: "/institutions" },
    { name: "Rankings", href: "/institutions/rankings" },
  ]);

  const itemList = itemListJsonLd({
    items: list,
    itemUrl: (inst) => `${base}/institutions/${inst.slug}`,
    itemName: (inst) => inst.name,
  });

  // DIYguru spotlight — separated out so the editorial pin gets its
  // own "why we ranked it here" treatment instead of looking like a
  // plain row that happens to be #1.
  const diyguruSlug = "emobility-academy-by-diyguru";
  const diyguru = list.find((i) => i.slug === diyguruSlug) ?? null;
  const restOfList = list.filter((i) => i.slug !== diyguruSlug);

  // For each scope, the spotlight band has slightly different copy
  // because the pinned rank differs (#1 India vs #2 global).
  const spotlightRank = scope === "india" ? diyguru?.evRankIndia : diyguru?.evRankGlobal;

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
          eyebrow={copy.eyebrow}
          title={copy.title}
          accent="hiring"
          subtitle={copy.subtitle}
          backHref="/institutions"
        />

        {/* Scope tabs — India / Global. India is the default + the
            primary audience; Global is the comparison anchor. */}
        <nav
          aria-label="Ranking scope"
          className="mt-6 inline-flex rounded-md border border-emce-border bg-white p-1"
        >
          {SCOPES.map((s) => {
            const active = s === scope;
            return (
              <Link
                key={s}
                href={s === "india" ? "/institutions/rankings" : `/institutions/rankings?scope=${s}`}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded px-4 py-1.5 text-sm font-bold ${
                  active
                    ? "bg-emce-dark text-white"
                    : "text-emce-text-sec hover:bg-emce-light-soft"
                }`}
              >
                {s === "india" ? "🇮🇳 India" : "🌍 Global"}
              </Link>
            );
          })}
        </nav>

        {/* Methodology — surface up-front so the ranking reads as
            considered, not arbitrary. */}
        <details className="mt-4 rounded-md border border-emce-border bg-emce-light-soft p-4 text-sm">
          <summary className="cursor-pointer font-bold text-emce-text">
            How are these rankings produced?
          </summary>
          <div className="mt-3 space-y-3 text-emce-text-sec">
            <p>
              Each institution is scored 0–100 across <strong>seven pillars</strong>: Research,
              Faculty, Placement, Infrastructure, Content quality, Alumni reach in EV roles, and
              EV-startup output. The composite shown on each row is the unweighted average of those
              seven pillars.
            </p>
            <p>
              Scores reflect public information — published research, AICTE/NSDC alignment, OEM
              recruiter relationships, founder lineage, and on-campus EV lab footprint. Two ranks
              are produced: <strong>India</strong> (country = IN) and <strong>Global</strong>{" "}
              (all countries).
            </p>
            <p>
              <strong>Editorial pin:</strong> eMobility Academy by DIYguru is pinned at #1 in India
              and #2 globally — this is the platform&apos;s own academy and the brief locks its
              position. Every other rank is derived from the composite score.
            </p>
          </div>
        </details>

        {list.length === 0 ? (
          <EmptyState
            className="mt-10"
            icon="📊"
            title="No ranked institutions yet"
            body="Run pnpm db:seed-institution-rankings to populate this leaderboard."
          />
        ) : (
          <>
            {/* DIYguru spotlight band — only when DIYguru is in scope. */}
            {diyguru && (
              <section
                aria-label="eMobility Academy by DIYguru spotlight"
                className="mt-8"
              >
                <Card className="border-2 border-emce-orange/60 bg-gradient-to-br from-emce-orange-light/60 to-white p-6">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-white text-2xl shadow-emce-sm">
                      🏆
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="diyguru">
                          #{spotlightRank} {scope === "india" ? "India" : "Global"}
                        </Badge>
                        <Badge variant="verified" className="text-[10px]">
                          Verified
                        </Badge>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-emce-text-muted">
                          Editorial pin
                        </span>
                      </div>
                      <h2 className="mt-1 text-section font-extrabold text-emce-darkest md:text-xl">
                        <Link
                          href={`/institutions/${diyguru.slug}`}
                          className="hover:underline"
                        >
                          {diyguru.name}
                        </Link>
                      </h2>
                      <p className="mt-0.5 text-hint text-emce-text-sec">
                        {diyguru.type.replace("_", " ")}
                        {diyguru.city ? ` · ${diyguru.city}, ${diyguru.state ?? ""}` : ""} ·{" "}
                        {diyguru._count.educationLinks.toLocaleString("en-IN")} alumni on platform
                      </p>
                      {diyguru.evRankingNote && (
                        <p className="mt-2 text-body text-emce-text">{diyguru.evRankingNote}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {PILLARS.map((p) => (
                          <PillarChip
                            key={p.key}
                            short={p.short}
                            score={(diyguru as Record<PillarKey, number | null>)[p.key]}
                          />
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={`/institutions/${diyguru.slug}`}
                          className="inline-flex h-9 items-center justify-center rounded-md bg-emce-dark px-4 text-xs font-bold text-white hover:bg-emce-darkest"
                        >
                          View profile →
                        </Link>
                        {diyguru.website && (
                          <a
                            href={diyguru.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-9 items-center justify-center rounded-md border border-emce-border px-4 text-xs font-bold text-emce-dark hover:bg-emce-light-soft"
                          >
                            Visit website ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </section>
            )}

            {/* Main ranked list. Renders the FULL list including
                DIYguru's row at its actual rank position — so the
                spotlight above is a duplicated treatment, not a
                replacement. Readers scrolling the list still see
                DIYguru at #1 / #2 alongside its peers. */}
            <section aria-label="Ranked list" className="mt-8">
              <ol className="emce-stagger space-y-3">
                {list.map((inst, idx) => {
                  const rank =
                    scope === "india" ? inst.evRankIndia : inst.evRankGlobal;
                  const isPinned = inst.slug === diyguruSlug;
                  return (
                    <li key={inst.id}>
                      <Card
                        className={`p-4 ${
                          isPinned
                            ? "border-2 border-emce-orange/40 bg-emce-orange-light/20"
                            : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-start gap-4">
                          {/* Rank column — large readable number, fixed
                              width so list reads as a neat table. */}
                          <div className="shrink-0">
                            <div
                              className={`grid h-12 w-12 place-items-center rounded-md text-lg font-extrabold ${
                                idx === 0
                                  ? "bg-emce-dark text-white"
                                  : idx < 3
                                    ? "bg-emce-mid text-white"
                                    : "bg-emce-light-soft text-emce-darkest"
                              }`}
                            >
                              #{rank}
                            </div>
                          </div>

                          {/* Logo */}
                          <Avatar src={inst.logoUrl} name={inst.name} size="md" />

                          {/* Identity + scores */}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/institutions/${inst.slug}`}
                                className="font-bold text-emce-text hover:underline"
                              >
                                {inst.name}
                              </Link>
                              {isPinned && (
                                <Badge variant="diyguru" className="text-[10px]">
                                  Editorial pin
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[10px]">
                                Overall {inst.evScoreOverall}
                              </Badge>
                            </div>
                            <p className="text-hint text-emce-text-sec">
                              {inst.type.replace("_", " ")}
                              {inst.city ? ` · ${inst.city}` : ""}
                              {inst.state && inst.country === "IN" ? `, ${inst.state}` : ""}
                              {inst.country !== "IN" && ` · ${inst.country}`} ·{" "}
                              {inst._count.educationLinks.toLocaleString("en-IN")} alumni
                            </p>
                            {inst.evRankingNote && (
                              <p className="mt-1 text-hint text-emce-text">
                                {inst.evRankingNote}
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {PILLARS.map((p) => (
                                <PillarChip
                                  key={p.key}
                                  short={p.short}
                                  score={
                                    (inst as Record<PillarKey, number | null>)[p.key]
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ol>
            </section>
          </>
        )}

        {/* Cross-link to the faceted listing so readers who want to
            search/filter rather than scan the ranking have a clear
            exit. */}
        <div className="mt-10 rounded-2xl bg-emce-light-soft p-6 text-center">
          <p className="text-body text-emce-text-sec">
            Looking for a specific institution? Browse the full directory.
          </p>
          <Link
            href="/institutions"
            className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-emce-dark px-5 text-sm font-bold text-white hover:bg-emce-darkest"
          >
            ← All institutions (search & filter)
          </Link>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}

// Force-dynamic so a fresh seed surfaces immediately on next request
// without waiting for a manual revalidate.
export const dynamic = "force-dynamic";
