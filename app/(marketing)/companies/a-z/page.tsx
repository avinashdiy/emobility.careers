import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { breadcrumbJsonLd, jsonLdScriptTag } from "@/lib/seo/schemas";

export const dynamic = "force-dynamic";

// 26 letters + a "#" bucket for company names that start with a
// digit / symbol (e.g. "22Kymco", "3M EV Materials"). Single source
// of truth used by the chip nav + the bucket-derivation function.
const LETTERS = [
  "A","B","C","D","E","F","G","H","I","J","K","L","M",
  "N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
  "#",
] as const;
type Letter = (typeof LETTERS)[number];

/** First-letter bucket for a name. Anything non-A-Z falls into "#". */
function bucketFor(name: string): Letter {
  const first = name.trim().charAt(0).toUpperCase();
  return (LETTERS as readonly string[]).includes(first) ? (first as Letter) : "#";
}

function isValidLetter(s: string | undefined): s is Letter {
  return !!s && (LETTERS as readonly string[]).includes(s);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ letter?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const letter = isValidLetter(sp.letter?.toUpperCase()) ? sp.letter!.toUpperCase() as Letter : "A";
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = `${base}/companies/a-z?letter=${letter}`;
  const title = `EV companies starting with "${letter}" — A to Z directory`;
  const description = `Browse every verified EV-industry company on emobility.careers whose name starts with "${letter}" — OEMs, battery makers, charging operators, Tier-1 suppliers, fleets, and more.`;
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

export default async function CompanyAtoZPage({
  searchParams,
}: {
  searchParams: Promise<{ letter?: string }>;
}) {
  const sp = await searchParams;
  const letter: Letter = isValidLetter(sp.letter?.toUpperCase())
    ? (sp.letter!.toUpperCase() as Letter)
    : "A";

  // One SELECT pulls every verified company — keeps the per-letter
  // count badges accurate without an extra round-trip per letter.
  // ~530 rows in prod, well under the implicit query limit.
  const companies = await db.company.findMany({
    where: { verificationStatus: "VERIFIED" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      companyType: true,
      hqLocation: true,
      description: true,
      _count: { select: { jobs: { where: { status: "OPEN" } } } },
    },
  });

  // Build per-letter counts in one pass — then slice the active
  // letter's companies for render.
  const countByLetter = new Map<Letter, number>();
  for (const l of LETTERS) countByLetter.set(l, 0);
  for (const c of companies) {
    const b = bucketFor(c.name);
    countByLetter.set(b, (countByLetter.get(b) ?? 0) + 1);
  }
  const activeCompanies = companies.filter((c) => bucketFor(c.name) === letter);

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  // JSON-LD: breadcrumb so SERP shows a clean trail (Home →
  // Companies → A to Z → <Letter>).
  const breadcrumbLd = breadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "Companies", href: "/companies" },
    { name: "A to Z directory", href: "/companies/a-z" },
    { name: letter, href: `/companies/a-z?letter=${letter}` },
  ]);

  return (
    <div className="container py-8 md:py-10">
      {/* Breadcrumb JSON-LD — improves SERP appearance + lets users
          jump back to /companies from the rich result. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(breadcrumbLd) }}
      />

      <PageHeader
        eyebrow="Companies · A to Z"
        title={`EV companies starting with "${letter}"`}
        accent="hiring"
        subtitle={
          <>
            {activeCompanies.length.toLocaleString("en-IN")} verified EV-industry
            employer{activeCompanies.length === 1 ? "" : "s"} ·{" "}
            {companies.length.toLocaleString("en-IN")} across all letters.
          </>
        }
        backHref="/companies"
      />

      {/* A–Z chip nav. Each chip is a server-rendered link so it
          works without JS and feeds Search Console a discrete URL
          per letter (each canonical-tagged via generateMetadata). */}
      <nav
        aria-label="Alphabetical company index"
        className="mt-6 flex flex-wrap gap-1.5"
      >
        {LETTERS.map((l) => {
          const count = countByLetter.get(l) ?? 0;
          const isActive = l === letter;
          const isEmpty = count === 0;
          return (
            <Link
              key={l}
              href={`/companies/a-z?letter=${l}`}
              aria-current={isActive ? "page" : undefined}
              className={[
                "inline-flex h-10 min-w-[42px] items-center justify-center rounded-md border px-3 text-sm font-extrabold transition",
                isActive
                  ? "border-emce-dark bg-emce-dark text-white"
                  : isEmpty
                    ? "border-emce-border bg-emce-light-soft text-emce-text-muted cursor-not-allowed hover:bg-emce-light-soft"
                    : "border-emce-border bg-white text-emce-dark hover:border-emce-mid hover:bg-emce-light-soft",
              ].join(" ")}
              // Empty letters still render as links (for crawlability)
              // but are visually muted. Click works — lands on the
              // "no companies" empty state.
            >
              <span>{l}</span>
              {!isEmpty && (
                <span className="ml-1.5 rounded-sm bg-white/15 px-1 text-[10px] font-bold text-current">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Active-letter section */}
      <section className="mt-8" aria-labelledby="letter-heading">
        <h2 id="letter-heading" className="sr-only">
          Companies starting with {letter}
        </h2>

        {activeCompanies.length === 0 ? (
          <EmptyState
            variant="mesh"
            icon="🔎"
            title={`No companies starting with "${letter}" yet`}
            body={
              letter === "#"
                ? "No companies with names starting with a digit or symbol."
                : `As more EV companies join emobility.careers, the "${letter}" bucket will fill up. Meanwhile, try a different letter above.`
            }
            className="mt-6"
          />
        ) : (
          <ul className="emce-stagger grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {activeCompanies.map((c) => (
              <li key={c.id}>
                <Link href={`/company/${c.slug}`}>
                  <Card variant="interactive" className="h-full">
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-md bg-emce-light-soft text-base font-extrabold text-emce-dark">
                        {c.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.logoUrl}
                            alt={c.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          c.name[0]?.toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-1 font-bold text-emce-text">
                          {c.name}
                        </h3>
                        <p className="line-clamp-1 text-hint text-emce-text-sec">
                          {c.companyType.toLowerCase()}
                          {c.hqLocation && ` · ${c.hqLocation}`}
                        </p>
                      </div>
                    </div>
                    {c.description && (
                      <p className="mt-3 line-clamp-2 text-body text-emce-text-sec">
                        {c.description}
                      </p>
                    )}
                    {c._count.jobs > 0 && (
                      <div className="mt-3">
                        <Badge variant="success">
                          {c._count.jobs} open job
                          {c._count.jobs === 1 ? "" : "s"}
                        </Badge>
                      </div>
                    )}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bottom nav — back to the faceted /companies search for users
          who want filters instead of a letter index. */}
      <div className="mt-10 rounded-2xl bg-emce-light-soft p-6 text-center">
        <p className="text-body text-emce-text-sec">
          Need to filter by type, location, or hiring status?
        </p>
        <Link
          href="/companies"
          className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-emce-dark px-5 text-sm font-bold text-white hover:bg-emce-darkest"
        >
          ← Back to /companies (faceted search)
        </Link>
      </div>

      {/* Hidden but crawlable — all other letters' URLs as <link>
          tags so search engines discover the full directory even if
          the chip nav above doesn't get crawled. Belt and braces. */}
      <div className="sr-only">
        {LETTERS.filter((l) => l !== letter).map((l) => (
          <a key={l} href={`${base}/companies/a-z?letter=${l}`}>
            Companies starting with {l}
          </a>
        ))}
      </div>
    </div>
  );
}
