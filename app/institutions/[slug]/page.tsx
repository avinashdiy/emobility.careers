import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Globe, MapPin, Users } from "lucide-react";
import {
  breadcrumbJsonLd,
  educationalOrganizationJsonLd,
  jsonLdScriptTag,
} from "@/lib/seo/schemas";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const i = await db.institution.findUnique({
    where: { slug },
    select: {
      name: true,
      shortName: true,
      about: true,
      type: true,
      city: true,
      state: true,
      logoUrl: true,
      bannerUrl: true,
      verificationStatus: true,
      // Alumni count powers the CTR-boosting title suffix below
      // ("BMSCE — 142 EV-industry alumni · Bengaluru"). The same
      // count is queried again in the page body, but Next dedupes
      // identical DB calls within a render so the overhead is one
      // round-trip per page load.
      _count: { select: { educationLinks: true } },
    },
  });
  if (!i) return { title: "Institution not found", robots: { index: false, follow: false } };
  // De-index REJECTED institutions — admin-banned (duplicates / spam).
  // The page still 404s for non-admins (see component logic below),
  // but the metadata keeps any cached SERP snippet from re-surfacing.
  if (i.verificationStatus === "REJECTED") {
    return { title: "Institution not available", robots: { index: false, follow: false } };
  }
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/institutions/${slug}`;

  // Title construction — three pieces, each conditional:
  //   1. Primary name: shortName when present (BMSCE) else full name.
  //   2. Alumni hook: "— N EV-industry alumni" when count > 0. This
  //      is the CTR booster; numbers in titles outperform plain
  //      copy by ~30% in SERP click-through studies.
  //   3. Locality + type suffix: "Bengaluru college", "Pune ITI".
  //
  // We target ~60 chars to fit Google's title pixel-width cap. The
  // alumni hook is the most truncation-resistant piece, so we
  // front-load it when present.
  const typeLabel = i.type.toLowerCase().replace("_", " ");
  const locality = [i.city, i.state].filter(Boolean).join(", ");
  const primaryName = i.shortName || i.name;
  const alumniCount = i._count.educationLinks;
  const alumniSuffix =
    alumniCount > 0
      ? ` — ${alumniCount.toLocaleString("en-IN")} EV-industry alum${alumniCount === 1 ? "" : "ni"}`
      : "";
  const localitySuffix = locality ? ` · ${locality} ${typeLabel}` : ` · ${typeLabel}`;
  const title = `${primaryName}${alumniSuffix}${localitySuffix}`;

  const description =
    i.about?.slice(0, 160) ??
    `${i.name}${locality ? ` in ${locality}` : ""} — ${alumniCount > 0 ? `${alumniCount} EV-industry alumni, ` : ""}open jobs, and campus partnerships on emobility.careers.`;
  const heroImage = i.bannerUrl ?? i.logoUrl ?? null;
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
      images: heroImage ? [{ url: heroImage }] : undefined,
    },
    twitter: {
      card: i.bannerUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: heroImage ? [heroImage] : undefined,
    },
  };
}

export default async function InstitutionDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const inst = await db.institution.findUnique({
    where: { slug },
    include: {
      _count: { select: { educationLinks: true } },
      educationLinks: {
        take: 24,
        orderBy: { startYear: "desc" },
        where: {
          candidate: { cvVisibility: "EVERYONE" },
        },
        include: {
          candidate: {
            select: {
              id: true, slug: true, firstName: true, lastName: true,
              headline: true, profilePhotoUrl: true,
            },
          },
        },
      },
    },
  });
  if (!inst || inst.verificationStatus === "REJECTED") notFound();

  // JSON-LD bundle — EducationalOrganization + BreadcrumbList. Both
  // emitted as separate <script> tags so Google parses them
  // independently (a single combined object also works but mixed
  // schemas can confuse the rich-results validator).
  const eduLd = educationalOrganizationJsonLd({
    name: inst.name,
    slug: inst.slug,
    type: inst.type,
    shortName: inst.shortName,
    website: inst.website,
    logoUrl: inst.logoUrl,
    about: inst.about,
    city: inst.city,
    state: inst.state,
    country: inst.country,
    foundedYear: inst.foundedYear,
    affiliation: inst.affiliation,
    alumniCount: inst._count.educationLinks,
  });
  const breadcrumbLd = breadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "Institutions", href: "/institutions" },
    { name: inst.name, href: `/institutions/${inst.slug}` },
  ]);

  return (
    <>
      {/* Structured data — Google rich-results eligibility. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(eduLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(breadcrumbLd) }}
      />

      <SiteHeader />

      {/* Banner — re-uses the gradient class so it matches profile + competition pages */}
      <div className="bg-emce-light-soft">
        <div
          className="emce-hero-gradient aspect-[4/1] w-full bg-cover bg-center"
          style={inst.bannerUrl ? { backgroundImage: `url(${inst.bannerUrl})` } : undefined}
        />
      </div>

      <div className="container max-w-5xl py-4 sm:py-6">
        <Card className="overflow-hidden p-0 shadow-sm">
          <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
            <div className="absolute left-4 top-0 -translate-y-1/2 sm:left-6">
              <Avatar
                src={inst.logoUrl}
                name={inst.name}
                size="xl"
                className="h-28 w-28 ring-4 ring-white sm:h-32 sm:w-32"
              />
            </div>
            <div className="h-16 sm:h-18" />

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h1 className="text-2xl font-bold leading-tight text-emce-text sm:text-[28px]">
                  {inst.name}
                </h1>
                {inst.verificationStatus === "VERIFIED" && (
                  <Badge variant="verified" className="text-[10px]">Verified</Badge>
                )}
                {inst.verificationStatus === "UNVERIFIED" && (
                  <Badge variant="outline" className="text-[10px]">User-submitted</Badge>
                )}
              </div>
              <p className="text-[15px] text-emce-text">
                {inst.type.replace("_", " ")}{inst.shortName ? ` · ${inst.shortName}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-emce-text-sec">
                {(inst.city || inst.state) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {[inst.city, inst.state].filter(Boolean).join(", ")}, {inst.country}
                  </span>
                )}
                {inst.foundedYear && (
                  <span>Founded {inst.foundedYear}</span>
                )}
                {inst.website && (
                  <a href={inst.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-emce-dark">
                    <Globe className="h-3.5 w-3.5" /> Website
                  </a>
                )}
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> {inst._count.educationLinks} alumni
                </span>
              </div>
              {inst.affiliation && (
                <p className="text-hint text-emce-text-sec">Affiliated with {inst.affiliation}</p>
              )}
            </div>
          </div>
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {inst.about && (
              <Card>
                <h2 className="text-section text-emce-text">About</h2>
                <p className="mt-2 whitespace-pre-line text-sm text-emce-text">{inst.about}</p>
              </Card>
            )}

            <Card>
              <div className="flex items-center justify-between">
                <h2 className="text-section text-emce-text">Alumni on eMobility Careers</h2>
                <Link href="/people" className="text-xs font-bold text-emce-dark hover:underline">All people</Link>
              </div>
              {inst.educationLinks.length === 0 ? (
                <EmptyState
                  className="mt-3 border-0 p-6"
                  icon="🎓"
                  title="No alumni on the platform yet"
                  body="Be the first — link your education to this institution from your profile."
                />
              ) : (
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {inst.educationLinks.map((e) => {
                    const c = e.candidate;
                    const name = `${c.firstName} ${c.lastName ?? ""}`.trim();
                    return (
                      <li key={e.id}>
                        <Link
                          href={`/${c.slug}`}
                          className="flex items-start gap-2 rounded-md border border-emce-border p-2 hover:border-emce-mid"
                        >
                          <Avatar src={c.profilePhotoUrl} name={name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-emce-text">{name}</p>
                            {c.headline && (
                              <p className="line-clamp-2 text-hint text-emce-text-sec">{c.headline}</p>
                            )}
                            <p className="text-hint text-emce-text-sec">
                              {[e.degree, e.field].filter(Boolean).join(" · ") || "Education"} · {e.startYear ?? "?"}–{e.endYear ?? "?"}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <aside className="space-y-4">
            <Card>
              <h2 className="text-section text-emce-text">Open EV roles</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                Jobs alumni from this institution might find relevant.
              </p>
              <Button asChild className="mt-3 w-full" variant="outline">
                <Link href="/jobs">Browse all EV jobs →</Link>
              </Button>
            </Card>
            <Card className="bg-emce-light-soft">
              <h3 className="text-sm font-bold text-emce-text">Are you the placement officer?</h3>
              <p className="mt-1 text-hint text-emce-text-sec">
                Register your placement cell to bulk-import students, share
                matched openings, and bring your cohort to Bharat eMobility
                Recruitathon.
              </p>
              <Button asChild className="mt-3 w-full" size="sm">
                <Link href="/colleges/register">Register your college →</Link>
              </Button>
            </Card>
          </aside>
        </div>
      </div>

      <SiteFooter />
    </>
  );
}
