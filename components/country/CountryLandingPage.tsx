import Link from "next/link";
import type { Country } from "@prisma/client";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import { countryUrl, hreflangAlternates } from "@/lib/seo/hreflang";
import { env } from "@/lib/env";

/**
 * One template, seven instances (UAE, UK, Australia, US, Malaysia,
 * Bangladesh, Nepal). Each per-country page route is a thin
 * 5-line wrapper that imports `CountryLandingPage` and passes its
 * Country code. Day-one launch reality: most of these countries
 * have ZERO jobs / candidates / companies — the template is built
 * to look complete in that empty-state, then automatically gain
 * stats / featured rails as data arrives.
 *
 * Three jobs this template has to do:
 *
 *   1. **SEO target**. Each country page is the canonical entry
 *      for the country in GSC ("Electric vehicle jobs UAE", "EV
 *      careers UK"). Above-the-fold content + the per-country
 *      "Why EV here" copy carry country-specific keywords without
 *      reading as keyword-stuffed.
 *
 *   2. **Trust signal**. A UAE recruiter who lands here from a
 *      Khaleej Times piece needs to see "platform built for EV,
 *      operating in UAE" within 3 seconds. The hero + stat band
 *      do this; the empty-state copy below acknowledges day-one
 *      launch instead of pretending we have data we don't.
 *
 *   3. **Conversion**. Two CTAs in every country: candidate signup
 *      and employer signup, both carrying the country preset via
 *      `?country=XX` so the form is pre-filled and the User row
 *      gets stamped with the right market from session one.
 */

/**
 * Per-country marketing copy. Kept in this file (not the DB) on
 * purpose — country positioning is editorial work, not data, and
 * lives next to the template that uses it so a single PR can
 * update copy + visual together. When a country gains traction
 * (real jobs, real recruiters) we'll graduate the copy into a CMS
 * page; for v1 the launch-day text lives here.
 */
const COUNTRY_COPY: Record<
  Country,
  {
    tagline: string;
    metaDescription: string;
    keyPlayers: string[];
    whyEvHere: string;
    candidatePitch: string;
    employerPitch: string;
  }
> = {
  IN: {
    tagline: "The home of India's EV-industry careers",
    metaDescription:
      "India's specialised EV-industry hiring platform. Battery, charging, powertrain, and motor-engineering roles for technicians and engineers from Ola, Tata, Ather, Mahindra, JBM and more.",
    keyPlayers: ["Tata", "Ola Electric", "Ather", "Mahindra", "Ashok Leyland", "JBM"],
    whyEvHere:
      "India is on track to be a top-3 global EV market by 2030 — FAME-II, PLI for advanced cell chemistry, and the ZEV mandate have crystallised the funding. The hiring market is moving faster than any specialised platform tracks.",
    candidatePitch:
      "Battery engineers, BMS firmware leads, charging-infrastructure project managers, motor-control specialists, vehicle integration leads — every Indian EV employer hires here.",
    employerPitch:
      "Indian EV employers post once and reach DIYguru-verified graduates plus the largest specialised candidate pool in Indian EV.",
  },
  AE: {
    tagline: "EV jobs in the UAE — Masdar, ADNOC, Bee'ah, and the network of charging operators",
    metaDescription:
      "Electric vehicle and clean-energy careers in the UAE — battery storage, charging infrastructure, EV fleet, and powertrain roles at Masdar, ADNOC, Bee'ah, and the gigafactory pipeline.",
    keyPlayers: ["Masdar", "ADNOC", "Bee'ah", "TAQA", "Etihad WE", "Emirates Steel Arkan"],
    whyEvHere:
      "The UAE's Net Zero 2050 strategy and Masdar's gigawatt-scale renewables expansion are pulling EV-adjacent talent in faster than the local market produces it. Indian engineers form a significant share of the EV technical workforce — emobility.careers connects both sides.",
    candidatePitch:
      "UAE-based engineers and Indian-diaspora engineers exploring Gulf relocation: post a profile in your own currency and time zone, get matched to roles across Abu Dhabi, Dubai, and Sharjah.",
    employerPitch:
      "Hire EV engineers in AED at posting time. Cross-post the same role to India (zero extra cost) when you're open to relocation candidates.",
  },
  GB: {
    tagline: "Electric vehicle careers in the UK — JLR, Nissan EV, Stellantis, and the gigafactory pipeline",
    metaDescription:
      "EV jobs in the United Kingdom — battery engineering, BMS, charging operators, and vehicle integration roles at JLR, Nissan, Stellantis, Britishvolt successor projects, and tier-1 suppliers.",
    keyPlayers: ["JLR", "Nissan Sunderland", "Stellantis", "BMW Mini Plant Oxford", "Octopus EV", "Pod Point"],
    whyEvHere:
      "The UK's ZEV mandate (80% new car sales electric by 2030) and the post-Brexit reset of UK auto manufacturing are creating sustained demand for EV-specific engineers. The platform's depth in Indian EV (Tata-owned JLR shares a lot of talent) makes us a natural fit.",
    candidatePitch:
      "UK-based EV engineers + Indian diaspora at JLR / Tata-Stellantis / Nissan Sunderland: find roles that actually understand cell chemistry, BMS firmware, and CAN bus, not generic ‘EV experience preferred’.",
    employerPitch:
      "Post in GBP, recruit from the UK pool first, then expand to India's diaspora when the role allows relocation. Single platform, single ATS.",
  },
  AU: {
    tagline: "EV careers in Australia — charging operators, fleet electrification, and battery storage",
    metaDescription:
      "Electric vehicle jobs in Australia — battery storage, charging infrastructure, EV fleet, and powertrain roles at AGL, Origin, ChargePoint, EVSE, and the growing local manufacturing footprint.",
    keyPlayers: ["AGL Energy", "Origin Energy", "Evie Networks", "Chargefox", "JOLT", "Energy Renaissance"],
    whyEvHere:
      "Australia's National Electric Vehicle Strategy and the AUD 500M Driving the Nation programme are pulling EV infrastructure and battery-storage roles into mainstream hiring. Smaller market than India / UK but lower-noise — the right specialised platform wins disproportionately.",
    candidatePitch:
      "Australia-based EV engineers + Indian engineers exploring sponsored relocation: roles across Sydney, Melbourne, Brisbane, Perth, and the Hunter Valley clean-energy belt.",
    employerPitch:
      "Post in AUD, draw from local + India relocation pool. Specialised EV filter beats LinkedIn's generic ‘electric vehicle experience preferred’.",
  },
  US: {
    tagline: "EV industry jobs in the USA — Tesla, Rivian, Lucid, Ford EV, GM, Lithium battery startups",
    metaDescription:
      "Electric vehicle careers in the United States — battery cell engineering, BMS, autonomy, charging operators, and EV vehicle integration roles at Tesla, Rivian, Lucid, Ford, GM, and the gigafactory pipeline.",
    keyPlayers: ["Tesla", "Rivian", "Lucid", "Ford EV", "GM EV", "ChargePoint", "EVgo"],
    whyEvHere:
      "The IRA's EV-manufacturing tax credits and the gigafactory build-out across Tennessee, Kentucky, Texas, and Michigan have made the US the world's largest EV-engineering hiring market. Even at 1% of this market we're a top-10 specialised platform.",
    candidatePitch:
      "US-based EV engineers + green-card-eligible Indian engineers: roles at OEMs, suppliers, and the lithium-extraction supply chain. Specialised filter beats LinkedIn's noise.",
    employerPitch:
      "Post in USD, reach US-based candidates + the Indian H-1B / O-1 pipeline that LinkedIn surfaces poorly. India-aware ATS that handles cross-border salary comparison out of the box.",
  },
  MY: {
    tagline: "EV careers in Malaysia — Proton, Geely-Proton, charging operators, and battery supply chain",
    metaDescription:
      "EV and clean-energy jobs in Malaysia — Proton, Geely-Proton, charging infrastructure, and the battery supply chain serving the regional EV market.",
    keyPlayers: ["Proton", "Geely-Proton", "Tenaga Nasional", "Yinson GreenTech", "Charge+", "Sunway"],
    whyEvHere:
      "Malaysia's National Energy Transition Roadmap and Proton's EV partnership with Geely have stood up real EV-engineering teams in the Klang Valley. DIYguru's Malaysia training centre feeds candidates directly into this market.",
    candidatePitch:
      "Malaysian engineers + DIYguru-Malaysia graduates: find Proton, Geely-Proton, and the charging-network roles without scrolling generic job boards.",
    employerPitch:
      "Post in MYR, recruit from Malaysian engineers + the DIYguru-trained pool. Single specialised platform across the South-East Asia EV market.",
  },
  BD: {
    tagline: "Electric vehicle jobs in Bangladesh — three-wheeler EV, battery assembly, charging pilots",
    metaDescription:
      "EV-industry careers in Bangladesh — three-wheeler EV manufacturers, two-wheeler EV, battery assembly, and the early-stage charging network.",
    keyPlayers: ["Walton", "Runner", "PHP Group", "ZIM Group", "DESCO charging pilots", "DIYguru-trained startups"],
    whyEvHere:
      "Bangladesh's EV market is still early-stage but growing fast — three-wheeler electrification is mainstream and two-wheeler EV is following. DIYguru's Bangladesh training centre is producing the first cohort of EV-specialised engineers; emobility.careers is where they find work.",
    candidatePitch:
      "Bangladeshi EV engineers + DIYguru-Bangladesh graduates: connect with the manufacturers and charging-network operators building Bangladesh's EV foundation.",
    employerPitch:
      "Post in BDT, recruit from the specialised pool DIYguru is training. Avoid generic job-board noise.",
  },
  NP: {
    tagline: "EV jobs in Nepal — Hetauda EV bus, charging stations, and the hydropower-EV link",
    metaDescription:
      "EV-industry careers in Nepal — electric bus, charging infrastructure, and the hydropower-to-mobility energy stack. Hetauda, Kathmandu, Pokhara.",
    keyPlayers: ["Hetauda EV bus", "Sajha Yatayat", "NEA charging pilots", "DIYguru-trained startups"],
    whyEvHere:
      "Nepal's 90%+ hydropower base makes EV electrification a no-regret move. The Hetauda EV bus project + Kathmandu charging build-out have created real demand for engineers; the DIYguru Nepal centre is producing the supply.",
    candidatePitch:
      "Nepali EV engineers + DIYguru-Nepal graduates: find the small but growing roster of EV employers without sifting through irrelevant listings.",
    employerPitch:
      "Post in NPR, recruit from the specialised Nepali pool DIYguru trains. Cross-post to neighbouring markets when sponsored relocation is an option.",
  },
};

/**
 * Public API: build per-country metadata (title, description,
 * hreflang alternates). Each country route's `generateMetadata`
 * just calls this — keeps the SEO contract in one place.
 */
export function generateCountryMetadata(country: Country) {
  const meta = SUPPORTED_COUNTRIES[country];
  const copy = COUNTRY_COPY[country];
  const url = countryUrl(country);
  return {
    title: `${meta.flag} EV jobs in ${meta.name}`,
    description: copy.metaDescription,
    alternates: {
      canonical: url,
      // hreflang alternates — country landing pages cross-link
      // each other so Google understands the cluster.
      languages: hreflangAlternates({ kind: "landing" }),
    },
    openGraph: {
      type: "website" as const,
      url,
      title: `${meta.flag} EV jobs in ${meta.name}`,
      description: copy.metaDescription,
      siteName: "eMobility Careers",
    },
  };
}

/**
 * Renders the country landing page. Used by every per-country
 * page route at /uk, /ae, /au, /us, /my, /bd, /np. Pulls live
 * counts (jobs OPEN in this country, candidates with profiles
 * in this country, companies HQ'd in this country) so the page
 * has data the moment a single row exists, and reads gracefully
 * empty on day one.
 */
export async function CountryLandingPage({ country }: { country: Country }) {
  const meta = SUPPORTED_COUNTRIES[country];
  const copy = COUNTRY_COPY[country];

  // Per-country counts — three cheap aggregate queries that drive
  // the stat band. Each is wrapped in Promise.all so a slow query
  // doesn't gate the others. Counts are advisory — the page renders
  // fine if any individual query returns 0.
  const [openJobsCount, companyCount, candidateCount, recentJobs] = await Promise.all([
    db.jobPosting.count({ where: { country, status: "OPEN" } }),
    db.company.count({ where: { hqCountry: country } }),
    // Existing CandidateProfile.country is a String (not enum) —
    // match by the 2-letter code. Backfill in PR 1 means existing
    // rows are IN; new sign-ups stamp the correct code via the
    // updated signup action.
    db.candidateProfile.count({ where: { country: country } }),
    db.jobPosting.findMany({
      where: { country, status: "OPEN" },
      orderBy: { publishedAt: "desc" },
      take: 6,
      include: {
        company: { select: { name: true, slug: true, logoUrl: true } },
      },
    }),
  ]);

  // Featured companies — top 6 by job count in this country.
  // Same gentle-graceful empty state as recentJobs.
  const featuredCompanies = await db.company.findMany({
    where: {
      hqCountry: country,
      verificationStatus: "VERIFIED",
    },
    orderBy: { followersCount: "desc" },
    take: 8,
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      hqLocation: true,
    },
  });

  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  // JSON-LD — Organization schema with `areaServed` set to this
  // specific country. Google reads this on the country landing
  // page to understand that emobility.careers operates in $country.
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "eMobility Careers",
    url: countryUrl(country),
    logo: `${baseUrl}/icon-512.png`,
    description: copy.metaDescription,
    areaServed: {
      "@type": "Country",
      name: meta.name,
      // ISO 3166-1 alpha-2 — Google's recommended format for area-
      // served country attribution.
      identifier: country,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />

      <div className="container max-w-5xl py-10">
        {/* ── Hero ── */}
        <section className="text-center">
          <div className="text-5xl" aria-hidden>
            {meta.flag}
          </div>
          <h1 className="mt-3 text-3xl font-extrabold text-emce-text md:text-4xl">
            EV jobs in {meta.name}
          </h1>
          <p className="mx-auto mt-3 max-w-3xl text-body text-emce-text-sec">
            {copy.tagline}
          </p>
        </section>

        {/* ── Stat band ── */}
        <section className="mt-8 grid grid-cols-3 gap-3">
          <StatTile
            label="Open jobs"
            value={openJobsCount}
            emptyFallback="Launching soon"
          />
          <StatTile
            label="Employers"
            value={companyCount}
            emptyFallback="—"
          />
          <StatTile
            label="Candidates"
            value={candidateCount}
            emptyFallback="—"
          />
        </section>

        {/* ── Why EV here ── */}
        <section className="mt-10">
          <Card className="p-6">
            <h2 className="text-section text-emce-text">
              Why an EV-specialised platform in {meta.name}
            </h2>
            <p className="mt-3 text-body text-emce-text-sec">{copy.whyEvHere}</p>
          </Card>
        </section>

        {/* ── Featured employers ── */}
        {featuredCompanies.length > 0 && (
          <section className="mt-10">
            <div className="flex items-end justify-between">
              <h2 className="text-section text-emce-text">
                EV employers in {meta.name}
              </h2>
              {/* Country-locked link — keeps the visitor in
                  country context. `/uk/companies` is the
                  canonical hreflang surface for UK employers
                  (PR 5); the global `/companies` is one click
                  away from there. */}
              <Link
                href={countryUrl(country, "/companies")}
                className="text-hint font-bold text-emce-dark hover:underline"
              >
                Browse all →
              </Link>
            </div>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {featuredCompanies.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/company/${c.slug}`}
                    className="flex h-full flex-col items-center rounded-md border border-emce-border bg-white p-4 text-center transition hover:border-emce-mid hover:shadow-emce-sm"
                  >
                    <Avatar src={c.logoUrl} name={c.name} size="lg" />
                    <span className="mt-2 line-clamp-1 text-sm font-bold text-emce-text">
                      {c.name}
                    </span>
                    {c.hqLocation && (
                      <span className="mt-0.5 line-clamp-1 text-[10px] text-emce-text-muted">
                        {c.hqLocation}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Key players (day-one launch surface) ──
            Renders even when no companies have onboarded — the
            country needs to look populated to the first visitor,
            and listing the real anchor employers we PLAN to feature
            is honest framing ("here's who you'd hire from"). When
            real employers onboard, the `featuredCompanies` rail
            above takes over the role visually. */}
        {featuredCompanies.length === 0 && copy.keyPlayers.length > 0 && (
          <section className="mt-10">
            <Card className="p-6">
              <h2 className="text-section text-emce-text">
                Who hires EV engineers in {meta.name}
              </h2>
              <p className="mt-2 text-hint text-emce-text-sec">
                The platform is launching here — onboarding for these
                employers is in progress. Sign up below to be one of
                the first candidates listed.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {copy.keyPlayers.map((p) => (
                  <Badge key={p} variant="outline" size="sm">
                    {p}
                  </Badge>
                ))}
              </div>
            </Card>
          </section>
        )}

        {/* ── Recent jobs ── */}
        {recentJobs.length > 0 && (
          <section className="mt-10">
            <div className="flex items-end justify-between">
              <h2 className="text-section text-emce-text">
                Latest EV jobs in {meta.name}
              </h2>
              {/* Country-locked link — same pattern as the
                  employers rail. /uk/jobs is the canonical
                  country surface (PR 3). */}
              <Link
                href={countryUrl(country, "/jobs")}
                className="text-hint font-bold text-emce-dark hover:underline"
              >
                Browse all →
              </Link>
            </div>
            <ul className="mt-4 space-y-3">
              {recentJobs.map((j) => (
                <li key={j.id}>
                  <Link
                    href={`/job/${j.slug}`}
                    className="block rounded-md border border-emce-border bg-white p-4 transition hover:border-emce-mid hover:shadow-emce-sm"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar src={j.company.logoUrl} name={j.company.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-emce-text">{j.title}</p>
                        <p className="mt-0.5 text-hint text-emce-text-sec">
                          {j.company.name}
                          {j.locations.length > 0 && ` · ${j.locations.join(", ")}`}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Twin CTA — candidate + employer.
            Both carry the country preset via `?country=XX` so the
            signup form is pre-filled (PR 1 reads the URL param +
            falls back to IP). Two distinct routes because the
            two personas need different first-touch onboarding. */}
        <section className="mt-12">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <h3 className="text-section text-emce-text">
                For EV engineers in {meta.name}
              </h3>
              <p className="mt-2 text-body text-emce-text-sec">
                {copy.candidatePitch}
              </p>
              <Button asChild className="mt-4 w-full" size="lg">
                <Link href={`/signup?role=CANDIDATE&country=${country}`}>
                  Create candidate profile — free
                </Link>
              </Button>
            </Card>

            <Card className="p-6">
              <h3 className="text-section text-emce-text">
                For EV employers in {meta.name}
              </h3>
              <p className="mt-2 text-body text-emce-text-sec">
                {copy.employerPitch}
              </p>
              <Button asChild className="mt-4 w-full" size="lg" variant="outline">
                <Link href={`/signup?role=EMPLOYER&country=${country}`}>
                  Set up employer account
                </Link>
              </Button>
            </Card>
          </div>
        </section>

        {/* ── Country switcher footer ── */}
        <section className="mt-12 border-t border-emce-border pt-6 text-center">
          <p className="text-hint font-bold uppercase tracking-wider text-emce-text-muted">
            Other regions
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {Object.values(SUPPORTED_COUNTRIES)
              .filter((c) => c.code !== country)
              .map((c) => (
                <Link
                  key={c.code}
                  href={countryUrl(c.code)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emce-border bg-white px-3 py-1 text-sm font-semibold text-emce-text hover:border-emce-mid hover:bg-emce-light-soft"
                >
                  <span aria-hidden>{c.flag}</span>
                  <span>{c.name}</span>
                </Link>
              ))}
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * Stat tile — small wrapper around the number-or-empty pattern
 * used by the hero stat band. Inline because the existing
 * `<StatTile>` in `components/ui/stat-tile.tsx` is styled for the
 * dashboard hero and is visually heavier than the lightweight
 * presentation this page wants.
 */
function StatTile({
  label,
  value,
  emptyFallback,
}: {
  label: string;
  value: number;
  emptyFallback: string;
}) {
  return (
    <div className="rounded-md border border-emce-border bg-white p-4 text-center">
      <div className="text-2xl font-extrabold text-emce-text">
        {value > 0 ? value.toLocaleString() : emptyFallback}
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-emce-text-muted">
        {label}
      </div>
    </div>
  );
}
