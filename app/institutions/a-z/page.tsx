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

// 26 letters + "#" bucket for names that start with a digit / symbol
// (e.g. "3M Catalysts", "International Centre for…"). Single source
// of truth used by the chip nav + the bucket-derivation function.
//
// Mirrors /companies/a-z so the UX is identical across the two
// directory pages — same visual chip layout, same per-letter count
// badge, same empty-state copy with the letter interpolated.
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
  const letter = isValidLetter(sp.letter?.toUpperCase())
    ? (sp.letter!.toUpperCase() as Letter)
    : "A";
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = `${base}/institutions/a-z?letter=${letter}`;
  const title = `EV-industry institutions starting with "${letter}" — A to Z`;
  const description = `Browse every university, college, polytechnic, ITI, research institute and training centre on emobility.careers whose name starts with "${letter}" — feeding India's EV workforce.`;
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

export default async function InstitutionAtoZPage({
  searchParams,
}: {
  searchParams: Promise<{ letter?: string }>;
}) {
  const sp = await searchParams;
  const letter: Letter = isValidLetter(sp.letter?.toUpperCase())
    ? (sp.letter!.toUpperCase() as Letter)
    : "A";

  // One SELECT pulls every non-rejected institution — keeps the
  // per-letter counts accurate without an extra round-trip. ~970 rows
  // in prod, comfortably under the implicit query limit.
  //
  // Unlike companies (which only surface VERIFIED rows because the
  // ATS-side claim flow gates that), institutions render at any
  // verification state except REJECTED — every IIT / NIT / polytechnic
  // / ITI in the seed dataset would otherwise hide behind UNVERIFIED.
  const institutions = await db.institution.findMany({
    where: { verificationStatus: { not: "REJECTED" } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      type: true,
      city: true,
      state: true,
      verificationStatus: true,
      _count: { select: { educationLinks: true } },
    },
  });

  // Build per-letter counts in one pass — then slice the active
  // letter's rows for render.
  const countByLetter = new Map<Letter, number>();
  for (const l of LETTERS) countByLetter.set(l, 0);
  for (const i of institutions) {
    const b = bucketFor(i.name);
    countByLetter.set(b, (countByLetter.get(b) ?? 0) + 1);
  }
  const activeInstitutions = institutions.filter((i) => bucketFor(i.name) === letter);

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  // JSON-LD: breadcrumb so SERP shows a clean trail (Home →
  // Institutions → A to Z → <Letter>).
  const breadcrumbLd = breadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "Institutions", href: "/institutions" },
    { name: "A to Z directory", href: "/institutions/a-z" },
    { name: letter, href: `/institutions/a-z?letter=${letter}` },
  ]);

  return (
    <div className="container py-8 md:py-10">
      {/* Breadcrumb JSON-LD — improves SERP appearance + lets users
          jump back to /institutions from the rich result. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(breadcrumbLd) }}
      />

      <PageHeader
        eyebrow="Institutions · A to Z"
        title={`EV-industry institutions starting with "${letter}"`}
        accent="hiring"
        subtitle={
          <>
            {activeInstitutions.length.toLocaleString("en-IN")} institution
            {activeInstitutions.length === 1 ? "" : "s"} ·{" "}
            {institutions.length.toLocaleString("en-IN")} across all letters.
          </>
        }
        backHref="/institutions"
      />

      {/* A–Z chip nav. Each chip is a server-rendered link so it works
          without JS and feeds Search Console a discrete URL per letter
          (each canonical-tagged via generateMetadata). */}
      <nav
        aria-label="Alphabetical institution index"
        className="mt-6 flex flex-wrap gap-1.5"
      >
        {LETTERS.map((l) => {
          const count = countByLetter.get(l) ?? 0;
          const isActive = l === letter;
          const isEmpty = count === 0;
          return (
            <Link
              key={l}
              href={`/institutions/a-z?letter=${l}`}
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
              // "no institutions" empty state.
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
          Institutions starting with {letter}
        </h2>

        {activeInstitutions.length === 0 ? (
          <EmptyState
            variant="mesh"
            icon="🎓"
            title={`No institutions starting with "${letter}" yet`}
            body={
              letter === "#"
                ? "No institutions with names starting with a digit or symbol."
                : `As more institutions join emobility.careers, the "${letter}" bucket will fill up. Meanwhile, try a different letter above.`
            }
            className="mt-6"
          />
        ) : (
          <ul className="emce-stagger grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {activeInstitutions.map((i) => (
              <li key={i.id}>
                <Link href={`/institutions/${i.slug}`}>
                  <Card variant="interactive" className="h-full">
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-md bg-emce-light-soft text-base font-extrabold text-emce-dark">
                        {i.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={i.logoUrl}
                            alt={i.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          i.name[0]?.toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="line-clamp-1 font-bold text-emce-text">
                            {i.name}
                          </h3>
                          {i.verificationStatus === "VERIFIED" && (
                            <Badge variant="verified" className="text-[10px]">
                              Verified
                            </Badge>
                          )}
                        </div>
                        <p className="line-clamp-1 text-hint text-emce-text-sec">
                          {i.type.replace("_", " ").toLowerCase()}
                          {i.city && ` · ${i.city}`}
                          {i.state && i.state !== i.city && `, ${i.state}`}
                        </p>
                      </div>
                    </div>
                    {i._count.educationLinks > 0 && (
                      <div className="mt-3">
                        <Badge variant="default">
                          {i._count.educationLinks.toLocaleString("en-IN")}{" "}
                          alumni on platform
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

      {/* Bottom nav — back to the faceted /institutions search for
          users who want type/location filters instead of a letter
          index. Mirrors the /companies/a-z bottom nav. */}
      <div className="mt-10 rounded-2xl bg-emce-light-soft p-6 text-center">
        <p className="text-body text-emce-text-sec">
          Need to filter by type, city, or search by name?
        </p>
        <Link
          href="/institutions"
          className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-emce-dark px-5 text-sm font-bold text-white hover:bg-emce-darkest"
        >
          ← Back to /institutions (faceted search)
        </Link>
      </div>

      {/* Hidden but crawlable — all other letters' URLs as plain anchors
          so search engines discover the full directory even if the chip
          nav above doesn't get crawled. Belt and braces. */}
      <div className="sr-only">
        {LETTERS.filter((l) => l !== letter).map((l) => (
          <a key={l} href={`${base}/institutions/a-z?letter=${l}`}>
            Institutions starting with {l}
          </a>
        ))}
      </div>
    </div>
  );
}
