import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { auth } from "@/lib/auth";
import { getSlugRedirect } from "@/lib/slug-redirects";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { ShareDropdown } from "@/components/social/ShareDropdown";
import {
  EntityReviewsSection,
  buildReviewJsonLdChunk,
  type ReviewItem,
} from "@/components/reviews/EntityReviewsSection";
import {
  EntityDiscussionSection,
  type DiscussionThreadCard,
} from "@/components/discussions/EntityDiscussionSection";
import { Globe, MapPin, Calendar, Users } from "lucide-react";
import {
  breadcrumbJsonLd,
  educationalOrganizationJsonLd,
  jsonLdScriptTag,
} from "@/lib/seo/schemas";

/**
 * Public institution detail page — Company-style layout.
 *
 * Hero: cover banner + logo + name + Verified pill + type + location.
 * Tabs: Home / Programs / Research / Alumni / Placements / Reviews / Discussion.
 *
 * The first six tabs render content directly; the Discussion tab
 * deep-links to the per-thread sub-route /institutions/<slug>/discuss/<threadSlug>.
 *
 * SEO: emits EducationalOrganization + AggregateRating + Review JSON-LD
 * so Google can rank the page for "[institution name] reviews",
 * "[institution name] placement", "[institution name] alumni" queries.
 */

const TABS = ["home", "programs", "research", "alumni", "placements", "reviews", "discuss"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  home: "Home",
  programs: "Programs",
  research: "Research",
  alumni: "Alumni",
  placements: "Placement report",
  reviews: "Reviews",
  discuss: "Discussion",
};

const INSTITUTION_CRITERIA_LABELS: Record<string, string> = {
  facultyRating: "Faculty",
  infrastructureRating: "Infrastructure",
  placementRating: "Placement",
  contentRating: "Content quality",
  alumniRating: "Alumni network",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const inst = await db.institution.findUnique({
    where: { slug },
    select: {
      name: true,
      shortName: true,
      type: true,
      city: true,
      state: true,
      country: true,
      logoUrl: true,
      bannerUrl: true,
      about: true,
      verificationStatus: true,
    },
  });
  if (!inst || inst.verificationStatus === "REJECTED") {
    return { title: "Institution not available", robots: { index: false, follow: false } };
  }
  const display = inst.shortName ?? inst.name;
  const description =
    inst.about ??
    `${display} — ${inst.type.replace("_", " ").toLowerCase()} in ${
      [inst.city, inst.state].filter(Boolean).join(", ") || inst.country
    }. View programs, alumni, placements and reviews on emobility.careers.`;
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/institutions/${slug}`;
  // Branded /og/home.jpg fallback so the card is never imageless when
  // the institution has neither a banner nor a logo.
  const heroImage = inst.bannerUrl ?? inst.logoUrl ?? "/og/home.jpg";
  return {
    title: `${inst.name} — Programs, Alumni, Reviews`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: inst.name,
      description,
      siteName: "eMobility Careers",
      images: [{ url: heroImage }],
    },
    twitter: {
      card: "summary_large_image",
      title: inst.name,
      description,
      images: [heroImage],
    },
  };
}

export const dynamic = "force-dynamic";

export default async function InstitutionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;

  // 308 first if there's a redirect rule for this slug (handles
  // merged DIYguru variants + any future institution merges).
  const redirectTo = await getSlugRedirect("INSTITUTION", slug);
  if (redirectTo && redirectTo !== slug) {
    permanentRedirect(`/institutions/${redirectTo}`);
  }

  const sp = await searchParams;
  const activeTab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as Tab)
    : "home";

  const [session, inst] = await Promise.all([
    auth(),
    db.institution.findUnique({
      where: { slug },
      include: {
        _count: { select: { educationLinks: true, reviews: true } },
        educationLinks: {
          take: 24,
          orderBy: { startYear: "desc" },
          where: { candidate: { cvVisibility: "EVERYONE" } },
          include: {
            candidate: {
              select: {
                id: true,
                slug: true,
                firstName: true,
                lastName: true,
                headline: true,
                profilePhotoUrl: true,
              },
            },
          },
        },
      },
    }),
  ]);
  if (!inst) notFound();
  if (inst.verificationStatus === "REJECTED" && session?.user?.role !== "ADMIN") notFound();

  const isSignedIn = !!session?.user;
  const baseHref = `/institutions/${inst.slug}`;
  const display = inst.shortName ?? inst.name;
  const locationLine = [inst.city, inst.state].filter(Boolean).join(", ") || inst.country;

  // Reviews + discussion are loaded only when needed, so tabs that
  // don't need them stay fast.
  const [reviews, threads] = await Promise.all([
    activeTab === "reviews" || activeTab === "home"
      ? db.institutionReview.findMany({
          where: { institutionId: inst.id, status: "PUBLISHED" },
          orderBy: [{ helpfulCount: "desc" }, { createdAt: "desc" }],
          take: 20,
          include: {
            reviewerUser: { select: { name: true, candidateProfile: { select: { slug: true } } } },
          },
        })
      : Promise.resolve([]),
    activeTab === "discuss" || activeTab === "home"
      ? db.entityDiscussionThread.findMany({
          where: {
            entityType: "INSTITUTION",
            entityId: inst.id,
            status: "PUBLISHED",
          },
          orderBy: { lastActivity: "desc" },
          take: 20,
          include: {
            authorUser: {
              select: {
                name: true,
                candidateProfile: { select: { slug: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  // Reviews → renderable shape for the shared component.
  const reviewItems: ReviewItem[] = reviews.map((r) => ({
    id: r.id,
    headline: r.headline,
    pros: r.pros,
    cons: r.cons,
    overallRating: r.overallRating,
    axisScores: {
      facultyRating: r.facultyRating,
      infrastructureRating: r.infrastructureRating,
      placementRating: r.placementRating,
      contentRating: r.contentRating,
      alumniRating: r.alumniRating,
    },
    reviewerLabel: r.reviewerUser?.name ?? "Anonymous reviewer",
    reviewerJobTitle:
      r.programName && r.graduationYear
        ? `${r.programName} · ${r.graduationYear}`
        : r.programName ?? null,
    reviewerLocation:
      r.relationship.toLowerCase().replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    verifiedBadge: r.reviewerUserId ? "Verified profile" : undefined,
    createdAt: r.createdAt,
    helpfulCount: r.helpfulCount,
  }));

  // Threads → renderable shape.
  const threadCards: DiscussionThreadCard[] = threads.map((t) => ({
    id: t.id,
    slug: t.slug,
    title: t.title,
    body: t.body,
    replyCount: t.replyCount,
    upvoteCount: t.upvoteCount,
    createdAt: t.createdAt,
    lastActivity: t.lastActivity,
    authorName: t.authorUser.name ?? "Anonymous",
    authorSlug: t.authorUser.candidateProfile?.slug ?? null,
  }));

  // JSON-LD — EducationalOrganization + Aggregate review.
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const orgLd = educationalOrganizationJsonLd({
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
  }) as Record<string, unknown>;
  const reviewChunk = buildReviewJsonLdChunk(reviewItems);
  const orgWithReviews = reviewChunk ? { ...orgLd, ...reviewChunk } : orgLd;
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "Institutions", href: "/institutions" },
    { name: inst.name, href: `/institutions/${inst.slug}` },
  ]);

  return (
    <>
      <SiteHeader />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(orgWithReviews) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(breadcrumb) }}
      />

      <ToastFromSearchParams />

      <main className="container max-w-5xl py-4 sm:py-6">
        {/* LinkedIn-style institution header card — mirrors the
            /company/[slug] visual pattern exactly. Banner slab
            inside an overflow-hidden Card; large square logo tile
            absolutely positioned to float over the banner edge so
            the page reads like a company / school profile rather
            than the old loose "Avatar + sidebar" arrangement. */}
        <Card className="overflow-hidden p-0 shadow-sm">
          <div
            className={`h-32 sm:h-44 ${inst.bannerUrl ? "" : "emce-hero-gradient"}`}
            style={
              inst.bannerUrl
                ? { backgroundImage: `url(${inst.bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                : undefined
            }
          />
          <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
            {/* Floating logo tile — same dimensions as the company
                page (24×24 on mobile, 32×32 on desktop). Falls back
                to the first letter on a coloured tile when no
                logoUrl is set, matching the company-page placeholder. */}
            <div className="absolute left-4 top-0 -translate-y-1/2 sm:left-6">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-lg border border-emce-border bg-white text-2xl font-extrabold text-emce-dark shadow-sm sm:h-32 sm:w-32">
                {inst.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={inst.logoUrl}
                    alt={inst.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  display[0]?.toUpperCase()
                )}
              </div>
            </div>
            {/* Spacer below the floating logo. Avatar centre sits
                on the banner edge, so we need ~80px / 96px before
                the name to clear the bottom half of the tile.
                `h-18` is silently 0 in Tailwind — use `h-20` /
                `h-24`. */}
            <div className="h-20 sm:h-24" />

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h1 className="text-2xl font-bold leading-tight text-emce-text sm:text-[28px]">
                  {inst.name}
                </h1>
                {inst.verificationStatus === "VERIFIED" && (
                  <Badge variant="verified" className="text-[10px]">Verified</Badge>
                )}
                {inst.verificationStatus === "PENDING" && (
                  <Badge variant="warning" className="text-[10px]">Pending review</Badge>
                )}
              </div>
              {inst.about && (
                <p className="line-clamp-2 text-[15px] text-emce-text">
                  {inst.about}
                </p>
              )}
              {/* Meta row — type · location · founded · website · alumni
                  All on one wrapping line so the card stays dense. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-emce-text-sec">
                <span>{inst.type.replace("_", " ").toLowerCase()}</span>
                {locationLine && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {locationLine}, {inst.country}
                  </span>
                )}
                {inst.foundedYear && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> Founded {inst.foundedYear}
                  </span>
                )}
                {inst.website && (
                  <a
                    href={inst.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-emce-dark"
                  >
                    <Globe className="h-3.5 w-3.5" /> Website
                  </a>
                )}
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {inst._count.educationLinks.toLocaleString("en-IN")} alumni
                </span>
              </div>
              {inst.affiliation && (
                <p className="text-hint text-emce-text-muted">
                  Affiliated with {inst.affiliation}
                </p>
              )}
              {inst.accreditations.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {inst.accreditations.map((a) => (
                    <Badge key={a} variant="default" size="sm" className="text-[10px]">
                      {a}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons row — matches the company page button
                layout (compact, inline, with Visit Website + Share
                at the right edge). */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button asChild size="sm">
                <Link href={`${baseHref}/review`}>✍️ Write a review</Link>
              </Button>
              {inst.website && (
                <Button asChild variant="outline" size="sm">
                  <a href={inst.website} target="_blank" rel="noopener noreferrer">
                    Visit website ↗
                  </a>
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Tab nav — server-rendered so each tab is its own indexable URL */}
        <nav
          aria-label="Institution sections"
          className="mt-4 flex flex-wrap gap-1 border-b border-emce-border"
        >
          {TABS.map((t) => {
            const active = t === activeTab;
            const href = t === "home" ? baseHref : `${baseHref}?tab=${t}`;
            return (
              <Link
                key={t}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-t px-4 py-2 text-sm font-bold ${
                  active
                    ? "border-b-2 border-emce-dark text-emce-darkest"
                    : "text-emce-text-sec hover:text-emce-text"
                }`}
              >
                {TAB_LABELS[t]}
                {t === "reviews" && inst._count.reviews > 0 && (
                  <span className="ml-1.5 text-[10px] text-emce-text-muted">
                    {inst._count.reviews}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Tab bodies */}
        <div className="mt-6">
          {activeTab === "home" && (
            <HomeTab
              inst={inst}
              reviews={reviewItems}
              threads={threadCards}
              isSignedIn={isSignedIn}
              entityHref={baseHref}
            />
          )}
          {activeTab === "programs" && <ProgramsTab inst={inst} />}
          {activeTab === "research" && <ResearchTab inst={inst} />}
          {activeTab === "alumni" && (
            <AlumniTab
              educationLinks={inst.educationLinks}
              count={inst._count.educationLinks}
            />
          )}
          {activeTab === "placements" && <PlacementsTab inst={inst} />}
          {activeTab === "reviews" && (
            <EntityReviewsSection
              reviews={reviewItems}
              criteriaLabels={INSTITUTION_CRITERIA_LABELS}
              writeReviewHref={`${baseHref}/review`}
              entityName={inst.name}
            />
          )}
          {activeTab === "discuss" && (
            <EntityDiscussionSection
              threads={threadCards}
              entityType="INSTITUTION"
              entityId={inst.id}
              entityHref={baseHref}
              isSignedIn={isSignedIn}
            />
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

// ─── Tab bodies ────────────────────────────────────────────────

type InstWithRanking = {
  id: string;
  about: string | null;
  foundedYear: number | null;
  affiliation: string | null;
  type: string;
  city: string | null;
  state: string | null;
  country: string;
  evScoreOverall: number | null;
  evScoreResearch: number | null;
  evScoreFaculty: number | null;
  evScorePlacement: number | null;
  evScoreInfrastructure: number | null;
  evScoreContent: number | null;
  evScoreAlumni: number | null;
  evScoreStartups: number | null;
  evRankIndia: number | null;
  evRankGlobal: number | null;
  evRankingNote: string | null;
  // Enrichment surface
  oemCollaborations: unknown;
  topRecruiters: string[];
  programsOffered: unknown;
};

function HomeTab({
  inst,
  reviews,
  threads,
  isSignedIn,
  entityHref,
}: {
  inst: InstWithRanking & { _count: { educationLinks: number; reviews: number } };
  reviews: ReviewItem[];
  threads: DiscussionThreadCard[];
  isSignedIn: boolean;
  entityHref: string;
}) {
  // Pre-resolve enrichment data for the home-tab quick-look cards.
  const oem = asArray<OemCollabSpec>(inst.oemCollaborations);
  const programs = asArray<ProgramSpec>(inst.programsOffered);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {inst.about && (
          <Card className="p-5">
            <h2 className="text-section text-emce-text">About</h2>
            <p className="mt-2 text-body text-emce-text">{inst.about}</p>
          </Card>
        )}

        {/* Programs quick-look — first 4 with a "See all" link to the
            Programs tab. Skipped when no enrichment data exists. */}
        {programs.length > 0 && (
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-section text-emce-text">Featured programs</h2>
              <Link
                href={`${entityHref}?tab=programs`}
                className="text-hint font-bold text-emce-dark hover:underline"
              >
                See all {programs.length} →
              </Link>
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {programs.slice(0, 4).map((p, idx) => (
                <li
                  key={`${p.name}-${idx}`}
                  className="rounded-md border border-emce-border p-3"
                >
                  <p className="font-bold text-emce-text">{p.name}</p>
                  <p className="text-hint text-emce-text-muted">
                    {p.level}
                    {p.duration && ` · ${p.duration}`}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* OEM collaborations — high-signal for both candidates
            (placement aspiration) and recruiters (talent pipeline). */}
        {oem.length > 0 && (
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-section text-emce-text">OEM collaborations</h2>
              <Link
                href={`${entityHref}?tab=research`}
                className="text-hint font-bold text-emce-dark hover:underline"
              >
                Full list →
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {oem.slice(0, 12).map((o, idx) => (
                <Badge key={`${o.oem}-${idx}`} variant="default" className="text-[11px]">
                  {o.oem}
                </Badge>
              ))}
              {oem.length > 12 && (
                <Badge variant="outline" className="text-[11px]">
                  +{oem.length - 12} more
                </Badge>
              )}
            </div>
          </Card>
        )}

        {/* Top recruiters preview */}
        {inst.topRecruiters.length > 0 && (
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-section text-emce-text">Top recruiters</h2>
              <Link
                href={`${entityHref}?tab=placements`}
                className="text-hint font-bold text-emce-dark hover:underline"
              >
                Placement report →
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {inst.topRecruiters.slice(0, 14).map((r) => (
                <Badge key={r} variant="outline" className="text-[11px]">
                  {r}
                </Badge>
              ))}
              {inst.topRecruiters.length > 14 && (
                <span className="text-hint text-emce-text-muted">
                  +{inst.topRecruiters.length - 14} more
                </span>
              )}
            </div>
          </Card>
        )}

        {/* Recent reviews snippet — first 3, with "see all" link to
            the Reviews tab. Helps the home tab feel substantial even
            before a candidate clicks into a sub-tab. */}
        {reviews.length > 0 && (
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-section text-emce-text">Recent reviews</h2>
              <Link
                href={`${entityHref}?tab=reviews`}
                className="text-hint font-bold text-emce-dark hover:underline"
              >
                See all {inst._count.reviews} →
              </Link>
            </div>
            <ul className="mt-3 space-y-3">
              {reviews.slice(0, 3).map((r) => (
                <li key={r.id} className="border-l-2 border-emce-mid pl-3">
                  <p className="text-hint font-bold text-emce-text">{r.headline}</p>
                  <p className="mt-0.5 text-hint text-emce-text-muted">
                    {r.reviewerLabel} · {r.reviewerLocation} · {"★".repeat(r.overallRating)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Recent discussion snippet */}
        {threads.length > 0 && (
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-section text-emce-text">Recent discussion</h2>
              <Link
                href={`${entityHref}?tab=discuss`}
                className="text-hint font-bold text-emce-dark hover:underline"
              >
                See all →
              </Link>
            </div>
            <ul className="mt-3 space-y-2">
              {threads.slice(0, 3).map((t) => (
                <li key={t.id}>
                  <Link
                    href={`${entityHref}/discuss/${t.slug}`}
                    className="text-hint font-bold text-emce-text hover:underline"
                  >
                    {t.title}
                  </Link>
                  <p className="text-hint text-emce-text-muted">
                    {t.authorName} · {t.replyCount} repl{t.replyCount === 1 ? "y" : "ies"}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <aside className="space-y-6">
        {/* Open EV roles CTA — same surface as the screenshot */}
        <Card className="p-5">
          <p className="text-section text-emce-text">Open EV roles</p>
          <p className="mt-1 text-hint text-emce-text-sec">
            Jobs alumni from this institution might find relevant.
          </p>
          <Button asChild variant="outline" className="mt-3 w-full">
            <Link href="/jobs">Browse all EV jobs →</Link>
          </Button>
        </Card>

        {/* Ranking pillar card — only when scoring exists */}
        {inst.evScoreOverall != null && (
          <Card className="p-5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">
              EV-industry ranking
            </p>
            <p className="mt-1 text-3xl font-extrabold text-emce-darkest">
              {inst.evScoreOverall}
              <span className="text-hint text-emce-text-sec">/100</span>
            </p>
            {(inst.evRankIndia || inst.evRankGlobal) && (
              <p className="mt-1 text-hint text-emce-text-sec">
                {inst.evRankIndia && `#${inst.evRankIndia} India`}
                {inst.evRankIndia && inst.evRankGlobal && " · "}
                {inst.evRankGlobal && `#${inst.evRankGlobal} global`}
              </p>
            )}
            {inst.evRankingNote && (
              <p className="mt-2 text-hint text-emce-text">{inst.evRankingNote}</p>
            )}
            <Link
              href="/institutions/rankings"
              className="mt-3 inline-block text-hint font-bold text-emce-dark hover:underline"
            >
              See full rankings →
            </Link>
          </Card>
        )}

        {/* TPO / placement-cell CTA */}
        <Card className="border-emce-mid bg-emce-light-soft p-5">
          <p className="text-section text-emce-text">Are you the placement officer?</p>
          <p className="mt-1 text-hint text-emce-text-sec">
            Register your placement cell to bulk-import students, share matched openings
            and bring your cohort to Bharat eMobility Recruitathon.
          </p>
          <Button asChild className="mt-3 w-full">
            <Link href="/colleges/register">Register your college →</Link>
          </Button>
        </Card>

        {/* Sign-in hook for unauthed visitors */}
        {!isSignedIn && (
          <Card className="border-dashed p-5">
            <p className="text-section text-emce-text">Join the conversation</p>
            <p className="mt-1 text-hint text-emce-text-sec">
              Sign up free to follow this institution, post reviews, ask questions in the
              discussion forum and apply with one click to EV roles.
            </p>
            <Button asChild className="mt-3 w-full">
              <Link href={`/signup?next=${encodeURIComponent(entityHref)}`}>
                Create free account
              </Link>
            </Button>
          </Card>
        )}
      </aside>
    </div>
  );
}

// ─── JSON shapes for enrichment data ────────────────────────
// Kept loose-typed (JsonValue cast on read) so that admin-edited
// rows with extra/missing fields render gracefully.

interface ProgramSpec {
  name: string;
  level?: string;
  duration?: string;
  evFocus?: string;
  seats?: number;
  fees?: string;
}
interface ResearchCentreSpec {
  name: string;
  focus?: string;
  established?: number;
  headFaculty?: string;
  website?: string;
}
interface OemCollabSpec {
  oem: string;
  type?: string;
  since?: number;
  projects?: string;
}
interface OngoingResearchSpec {
  title: string;
  area?: string;
  lead?: string;
  funding?: string;
  status?: string;
}
interface NotableAlumnusSpec {
  name: string;
  currentRole: string;
  currentCompany: string;
  batch?: string;
}
interface PlacementStatsSpec {
  medianCtcLakhs?: number;
  placementRate?: number;
  highestCtcLakhs?: number;
  recruiterCount?: number;
  year?: number;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
function asObject<T>(value: unknown): T | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : null;
}

function ProgramsTab({
  inst,
}: {
  inst: { type: string; about: string | null; programsOffered: unknown };
}) {
  const programs = asArray<ProgramSpec>(inst.programsOffered);
  if (programs.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-section text-emce-text">Programs offered</h2>
        <p className="mt-2 text-body text-emce-text-sec">
          Detailed programs offered by this institution will appear here as the
          institution claims their profile and submits curriculum data. The institution
          type ({inst.type.replace("_", " ").toLowerCase()}) signals their primary focus.
        </p>
        <div className="mt-4 rounded-lg bg-emce-light-soft p-4 text-hint text-emce-text-sec">
          <p className="font-bold text-emce-text">Are you affiliated with this institution?</p>
          <p className="mt-1">
            Register your placement cell or claim this page to add detailed program info,
            curriculum, fees and admission details.
          </p>
          <div className="mt-3">
            <Button asChild size="sm" variant="outline">
              <Link href="/colleges/register">Claim this institution</Link>
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // Group by level for cleaner scanning
  const byLevel = programs.reduce<Record<string, ProgramSpec[]>>((acc, p) => {
    const key = p.level ?? "OTHER";
    (acc[key] ||= []).push(p);
    return acc;
  }, {});
  const levelOrder = ["UG", "PG", "PHD", "DIPLOMA", "CERTIFICATE", "OTHER"];
  const levelLabel: Record<string, string> = {
    UG: "Undergraduate",
    PG: "Postgraduate",
    PHD: "Doctoral",
    DIPLOMA: "Diploma",
    CERTIFICATE: "Certificate / Short course",
    OTHER: "Other",
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-section text-emce-text">Programs offered ({programs.length})</h2>
        <p className="mt-1 text-hint text-emce-text-sec">
          Programs and courses available at this institution.
        </p>
      </Card>

      {levelOrder
        .filter((lv) => byLevel[lv]?.length)
        .map((lv) => (
          <Card key={lv} className="p-5">
            <h3 className="text-section text-emce-text">{levelLabel[lv]}</h3>
            <ul className="mt-3 space-y-3">
              {byLevel[lv]!.map((p, idx) => (
                <li key={`${p.name}-${idx}`} className="border-l-2 border-emce-mid pl-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-bold text-emce-text">{p.name}</p>
                    {p.duration && (
                      <span className="text-hint text-emce-text-muted">{p.duration}</span>
                    )}
                  </div>
                  {p.evFocus && (
                    <p className="mt-1 text-hint text-emce-text-sec">{p.evFocus}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-2 text-hint text-emce-text-muted">
                    {p.seats != null && <span>Seats: {p.seats}</span>}
                    {p.fees && <span>· {p.fees}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
    </div>
  );
}

function ResearchTab({
  inst,
}: {
  inst: {
    evScoreResearch: number | null;
    about: string | null;
    researchOverview: string | null;
    researchCentres: unknown;
    ongoingResearch: unknown;
    facilities: string[];
    oemCollaborations: unknown;
    industryPartnerships: string[];
  };
}) {
  const centres = asArray<ResearchCentreSpec>(inst.researchCentres);
  const projects = asArray<OngoingResearchSpec>(inst.ongoingResearch);
  const oem = asArray<OemCollabSpec>(inst.oemCollaborations);
  const hasAny =
    inst.researchOverview ||
    centres.length > 0 ||
    projects.length > 0 ||
    inst.facilities.length > 0 ||
    oem.length > 0 ||
    inst.industryPartnerships.length > 0;

  if (!hasAny && inst.evScoreResearch == null) {
    return (
      <Card className="p-6">
        <h2 className="text-section text-emce-text">Research output</h2>
        <p className="mt-2 text-body text-emce-text-sec">
          Research output for this institution is not yet captured in our dataset.
        </p>
        <p className="mt-4 text-hint text-emce-text-sec">
          Want a public research project page on emobility.careers?{" "}
          <Link href="/colleges/register" className="font-bold text-emce-dark hover:underline">
            Register your placement cell
          </Link>{" "}
          — verified TPOs get a research-publication and lab-equipment editor.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {(inst.researchOverview || inst.evScoreResearch != null) && (
        <Card className="p-5">
          <h2 className="text-section text-emce-text">Research overview</h2>
          {inst.evScoreResearch != null && (
            <p className="mt-2 text-hint text-emce-text-muted">
              Research pillar score:{" "}
              <strong className="text-emce-text">{inst.evScoreResearch}/100</strong> on
              the emobility.careers institution-ranking rubric. See{" "}
              <Link href="/institutions/rankings" className="font-bold text-emce-dark hover:underline">
                full rankings →
              </Link>
            </p>
          )}
          {inst.researchOverview && (
            <p className="mt-3 text-body text-emce-text">{inst.researchOverview}</p>
          )}
        </Card>
      )}

      {centres.length > 0 && (
        <Card className="p-5">
          <h2 className="text-section text-emce-text">
            Research centres ({centres.length})
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {centres.map((c, idx) => (
              <li key={`${c.name}-${idx}`} className="rounded-lg border border-emce-border p-4">
                <p className="font-bold text-emce-text">{c.name}</p>
                {c.focus && (
                  <p className="mt-1 text-hint text-emce-text-sec">{c.focus}</p>
                )}
                <p className="mt-2 text-hint text-emce-text-muted">
                  {c.established && `Established ${c.established}`}
                  {c.established && c.headFaculty && " · "}
                  {c.headFaculty && `Head: ${c.headFaculty}`}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {oem.length > 0 && (
        <Card className="p-5">
          <h2 className="text-section text-emce-text">
            OEM collaborations ({oem.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {oem.map((o, idx) => (
              <li
                key={`${o.oem}-${idx}`}
                className="flex flex-wrap items-baseline justify-between gap-3 rounded-md border border-emce-border p-3"
              >
                <div className="min-w-0">
                  <p className="font-bold text-emce-text">{o.oem}</p>
                  {o.projects && (
                    <p className="mt-0.5 text-hint text-emce-text-sec">{o.projects}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-hint">
                  {o.type && (
                    <Badge variant="outline" size="sm" className="text-[10px]">
                      {o.type}
                    </Badge>
                  )}
                  {o.since && <span className="text-emce-text-muted">since {o.since}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {projects.length > 0 && (
        <Card className="p-5">
          <h2 className="text-section text-emce-text">Ongoing research projects</h2>
          <ul className="mt-3 space-y-2">
            {projects.map((p, idx) => (
              <li key={`${p.title}-${idx}`} className="border-l-2 border-emce-mid pl-3">
                <p className="font-bold text-emce-text">{p.title}</p>
                <p className="mt-0.5 text-hint text-emce-text-sec">
                  {p.area}
                  {p.lead && ` · Lead: ${p.lead}`}
                  {p.funding && ` · Funded by ${p.funding}`}
                  {p.status && (
                    <>
                      {" "}
                      ·{" "}
                      <Badge variant="default" size="sm" className="text-[10px]">
                        {p.status}
                      </Badge>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {inst.facilities.length > 0 && (
        <Card className="p-5">
          <h2 className="text-section text-emce-text">Major facilities & labs</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {inst.facilities.map((f) => (
              <li key={f} className="flex items-start gap-2 text-body text-emce-text">
                <span className="text-emce-mid">▪</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {inst.industryPartnerships.length > 0 && (
        <Card className="p-5">
          <h2 className="text-section text-emce-text">Industry & government partnerships</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {inst.industryPartnerships.map((p) => (
              <Badge key={p} variant="outline" className="text-[11px]">
                {p}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function AlumniTab({
  educationLinks,
  count,
}: {
  educationLinks: {
    id: string;
    candidate: {
      id: string;
      slug: string;
      firstName: string | null;
      lastName: string | null;
      headline: string | null;
      profilePhotoUrl: string | null;
    } | null;
  }[];
  count: number;
}) {
  const linkedCandidates = educationLinks
    .map((e) => e.candidate)
    .filter((c): c is NonNullable<typeof c> => !!c);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-section text-emce-text">
          Alumni on emobility.careers ({count.toLocaleString("en-IN")})
        </h2>
        <Link href="/people" className="text-hint font-bold text-emce-dark hover:underline">
          All people →
        </Link>
      </div>

      {linkedCandidates.length === 0 ? (
        <EmptyState
          icon="🎓"
          title="No alumni on the platform yet"
          body="Be the first — link your education to this institution from your profile."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {linkedCandidates.map((c) => (
            <li key={c.id}>
              <Link href={`/${c.slug}`}>
                <Card className="p-4 transition hover:border-emce-mid hover:shadow-emce-hover">
                  <div className="flex items-center gap-3">
                    <Avatar src={c.profilePhotoUrl} name={`${c.firstName ?? ""} ${c.lastName ?? ""}`} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-bold text-emce-text">
                        {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                      </p>
                      {c.headline && (
                        <p className="truncate text-hint text-emce-text-sec">{c.headline}</p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PlacementsTab({
  inst,
}: {
  inst: {
    evScorePlacement: number | null;
    _count: { educationLinks: number };
    placementStats: unknown;
    placementOverview: string | null;
    topRecruiters: string[];
    notableAlumni: unknown;
  };
}) {
  const stats = asObject<PlacementStatsSpec>(inst.placementStats);
  const alumni = asArray<NotableAlumnusSpec>(inst.notableAlumni);
  const recruiters = inst.topRecruiters;

  // Compose stat cards from whatever data exists.
  const statCards: { label: string; value: string; subtle?: string }[] = [];
  if (stats?.medianCtcLakhs != null) {
    statCards.push({
      label: "Median CTC",
      value: `₹${stats.medianCtcLakhs}L`,
      subtle: stats.year ? `${stats.year} cohort` : undefined,
    });
  }
  if (stats?.placementRate != null) {
    statCards.push({
      label: "Placement rate",
      value: `${stats.placementRate}%`,
    });
  }
  if (stats?.highestCtcLakhs != null) {
    statCards.push({
      label: "Highest CTC",
      value: `₹${stats.highestCtcLakhs}L`,
    });
  }
  if (stats?.recruiterCount != null) {
    statCards.push({
      label: "Recruiters visited",
      value: stats.recruiterCount.toLocaleString("en-IN"),
    });
  }
  // Always include platform stats as a backstop.
  statCards.push({
    label: "Alumni on emobility.careers",
    value: inst._count.educationLinks.toLocaleString("en-IN"),
  });
  if (inst.evScorePlacement != null) {
    statCards.push({
      label: "Placement pillar score",
      value: `${inst.evScorePlacement}/100`,
      subtle: "emobility.careers ranking",
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-section text-emce-text">Placement report</h2>
        {inst.placementOverview && (
          <p className="mt-2 text-body text-emce-text">{inst.placementOverview}</p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map((s) => (
            <div key={s.label} className="rounded-lg border border-emce-border p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">
                {s.label}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-emce-darkest">{s.value}</p>
              {s.subtle && (
                <p className="mt-1 text-hint text-emce-text-muted">{s.subtle}</p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {recruiters.length > 0 && (
        <Card className="p-5">
          <h3 className="text-section text-emce-text">
            Top recruiters ({recruiters.length})
          </h3>
          <p className="mt-1 text-hint text-emce-text-sec">
            Companies that consistently hire from this institution.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {recruiters.map((r) => (
              <Badge key={r} variant="default" className="text-[11px]">
                {r}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {alumni.length > 0 && (
        <Card className="p-5">
          <h3 className="text-section text-emce-text">Notable alumni</h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {alumni.map((a, idx) => (
              <li
                key={`${a.name}-${idx}`}
                className="rounded-md border border-emce-border p-3"
              >
                <p className="font-bold text-emce-text">{a.name}</p>
                <p className="mt-0.5 text-hint text-emce-text-sec">
                  {a.currentRole}
                  {a.currentCompany && ` · ${a.currentCompany}`}
                </p>
                {a.batch && (
                  <p className="text-hint text-emce-text-muted">{a.batch}</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="bg-emce-light-soft p-5">
        <p className="font-bold text-emce-text">
          Are you a placement officer at this institution?
        </p>
        <p className="mt-1 text-hint text-emce-text-sec">
          Register your placement cell to upload official placement reports, run
          campus drives and bring your students into the emobility.careers job
          marketplace.
        </p>
        <div className="mt-3">
          <Button asChild size="sm">
            <Link href="/colleges/register">Register placement cell →</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
