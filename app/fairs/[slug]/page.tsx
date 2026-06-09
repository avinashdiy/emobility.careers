import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { SiteHeader } from "@/components/layout/site-header";
import { RecruitathonHeaderBar } from "@/components/recruitathon/RecruitathonHeaderBar";
import { getRecruitathonViewerStatus } from "@/lib/recruitathon/viewer-status";
import { recruitmentFairJsonLd, jsonLdScriptTag } from "@/lib/seo/schemas";
import { SiteFooter } from "@/components/layout/site-footer";
import { ShareDropdown } from "@/components/social/ShareDropdown";
import { VenueMap } from "@/components/recruitment-drives/VenueMap";
import { env } from "@/lib/env";
import { formatSalaryRange } from "@/lib/utils";
import { htmlOrFallback } from "@/lib/cms/job-sanitize";
import {
  registerForDrive,
  startLiveBoothChat,
} from "@/server/recruitment-drives/registrations";
import { evaluateFairEligibility, FAIR_GAP_COPY } from "@/lib/fair-eligibility";

export const dynamic = "force-dynamic";

/**
 * Public landing for a recruitment drive (job fair).
 *
 * Visible only when status is OPEN, IN_PROGRESS, or CLOSED. DRAFT
 * 404s for non-admins; admins see a preview banner so they can
 * sanity-check before publishing. CANCELLED 404s for everyone — a
 * cancelled fair shouldn't keep capturing search-engine traffic.
 *
 * Section layout (top to bottom):
 *
 *   1. Hero — banner image (or brand gradient), title, tagline,
 *      live/upcoming/closed badge, dates, venue, share button.
 *   2. About — rich description from the admin who created it.
 *   3. Participating companies — grid of CONFIRMED-status booths
 *      with logo, name, booth label, "about at fair" pitch.
 *   4. Open roles — list of jobs across all participating
 *      companies, with apply CTA (Sign in to apply / Apply now)
 *      that carries the drive id forward to the apply server
 *      action so the Application row gets the correct
 *      `recruitmentDriveId` + `source = CAMPUS` tags.
 *   5. Recap — once status = CLOSED, hides apply CTAs and shows
 *      "X applications received, Y companies participated" stats.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const drive = await db.recruitmentDrive.findUnique({
    where: { slug },
    select: {
      title: true,
      tagline: true,
      city: true,
      bannerImageUrl: true,
      heroImageUrl: true,
      status: true,
    },
  });
  if (!drive || drive.status === "DRAFT" || drive.status === "CANCELLED") {
    return { title: "Fair not found", robots: { index: false, follow: false } };
  }
  const description =
    drive.tagline ??
    `EV-industry recruitment drive in ${drive.city}. Multiple companies hiring across battery, charging, motor, and software roles.`;
  // Prefer hero (16:9, designed for social) over banner (3:1, designed
  // for /fairs grid). Both are public-read S3 URLs so OG crawlers
  // (WhatsApp, LinkedIn, Twitter) can fetch them directly.
  // A fair's own hero/banner wins (most specific). Otherwise the
  // branded job-fair image (/og/fairs.jpg) — more on-topic for a fair
  // share than the generic office photo, and the default for every
  // fair that hasn't uploaded its own artwork.
  const ogImage = drive.heroImageUrl || drive.bannerImageUrl || "/og/fairs.jpg";
  return {
    title: `${drive.title} · ${drive.city}`,
    description,
    alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/fairs/${slug}` },
    openGraph: {
      type: "website",
      url: `${env.NEXT_PUBLIC_APP_URL}/fairs/${slug}`,
      title: drive.title,
      description,
      images: [ogImage],
      siteName: "emobility.careers",
    },
    twitter: {
      card: "summary_large_image",
      title: drive.title,
      description,
      images: [ogImage],
    },
  };
}

export default async function FairLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ track?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const trackFilter = (sp.track ?? "").trim().toLowerCase();
  const session = await auth();

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug },
    include: {
      participatingCompanies: {
        where: { status: "CONFIRMED" },
        orderBy: { confirmedAt: "asc" },
        include: {
          company: {
            select: {
              id: true,
              slug: true,
              name: true,
              logoUrl: true,
              about: true,
            },
          },
        },
      },
      driveJobs: {
        orderBy: [{ sortOrder: "asc" }, { attachedAt: "desc" }],
        include: {
          job: {
            select: {
              id: true,
              slug: true,
              title: true,
              workMode: true,
              employmentType: true,
              locations: true,
              experienceMin: true,
              experienceMax: true,
              salaryMin: true,
              salaryMax: true,
              salaryCurrency: true,
              salaryPeriod: true,
              salaryHidden: true,
              status: true,
              audience: true,
            },
          },
          company: {
            select: { id: true, slug: true, name: true, logoUrl: true },
          },
          challengeAssessment: {
            select: { id: true, title: true, type: true, durationMins: true },
          },
          track: { select: { id: true, slug: true, name: true } },
        },
      },
      // F1 — tracks for the chip filter row. Sorted by admin's
      // configured order; "All" chip is rendered client-side first.
      tracks: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, slug: true, name: true, color: true, description: true },
      },
      // Marketing additions — event partners + speakers panel.
      eventPartners: {
        orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          type: true,
          logoUrl: true,
          url: true,
          caption: true,
        },
      },
      speakers: {
        orderBy: [{ role: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          title: true,
          affiliation: true,
          photoUrl: true,
          bio: true,
          role: true,
        },
      },
    },
  });
  if (!drive) notFound();

  // Visibility gates.
  const isAdmin = session?.user?.role === "ADMIN";
  if (drive.status === "CANCELLED") notFound();
  if (drive.status === "DRAFT" && !isAdmin) notFound();
  const previewMode = drive.status === "DRAFT" && isAdmin;

  // Filter out detached / draft / closed jobs from the public list
  // — admin can see them in preview mode for sanity checking but
  // candidates shouldn't see closed roles in the apply CTA.
  const allOpenJobs = drive.driveJobs.filter(
    (dj) => dj.job.status === "OPEN" && dj.job.audience !== "INVITE_ONLY",
  );
  // F1 — apply the ?track=<slug> filter. A `track` param of
  // "other" surfaces jobs with no track set (the implicit bucket).
  // Empty / invalid params fall through to all-jobs.
  const validTrackSlugs = new Set(drive.tracks.map((t) => t.slug));
  const visibleJobs =
    trackFilter && (validTrackSlugs.has(trackFilter) || trackFilter === "other")
      ? allOpenJobs.filter((dj) =>
          trackFilter === "other"
            ? dj.track === null
            : dj.track?.slug === trackFilter,
        )
      : allOpenJobs;
  // Counts per track for the chip badges. Includes "Other" only
  // when there are unbinned jobs to surface.
  const trackCounts = new Map<string, number>();
  for (const dj of allOpenJobs) {
    const key = dj.track?.slug ?? "other";
    trackCounts.set(key, (trackCounts.get(key) ?? 0) + 1);
  }
  const hasOtherJobs = (trackCounts.get("other") ?? 0) > 0;

  // Marketing hero-stat display: prefer the admin's aspirational
  // target until the live counter overtakes it. Pre-launch a fair
  // with 0 registered candidates reading "0+ candidates" kills
  // momentum; admin sets `heroStatCandidatesTarget = 1000` and the
  // hero reads "1,000+" until 1,001 actually register.
  const displayCandidatesCount = Math.max(
    drive.registeredCount,
    drive.heroStatCandidatesTarget ?? 0,
  );
  const displayCompaniesCount = Math.max(
    drive.participatingCount,
    drive.heroStatCompaniesTarget ?? 0,
  );
  const displayPositionsCount = Math.max(
    drive.jobsCount,
    drive.heroStatPositionsTarget ?? 0,
  );
  // Show the "+" suffix only when we're rendering an aspirational
  // target (the brochure pattern). Once real counts overtake the
  // target, the suffix drops to read as a precise number.
  const candidatesIsTarget = drive.registeredCount < (drive.heroStatCandidatesTarget ?? 0);
  const companiesIsTarget = drive.participatingCount < (drive.heroStatCompaniesTarget ?? 0);
  const positionsIsTarget = drive.jobsCount < (drive.heroStatPositionsTarget ?? 0);

  // Group event partners by type for the public panel — academic
  // / government / certifier / industry / etc. Each group renders
  // as its own labelled logo strip so colleges instantly find the
  // academic affiliations.
  const partnersByType = new Map<
    typeof drive.eventPartners[number]["type"],
    typeof drive.eventPartners
  >();
  for (const p of drive.eventPartners) {
    const bucket = partnersByType.get(p.type) ?? [];
    bucket.push(p);
    partnersByType.set(p.type, bucket);
  }

  // Speakers grouped by role — Patron/Chair surface first as a
  // smaller "leadership" row; Keynote/Panellist/Dignitary/Speaker
  // fall into a wider grid below.
  const leadership = drive.speakers.filter((s) =>
    s.role === "PATRON" || s.role === "CHAIR",
  );
  const otherSpeakers = drive.speakers.filter((s) =>
    s.role !== "PATRON" && s.role !== "CHAIR",
  );

  const isLive = drive.status === "IN_PROGRESS";
  const isClosed = drive.status === "CLOSED";
  const canApply = !isClosed && drive.status !== "DRAFT";

  // #2 Fair-attendee registration — the candidate's current
  // registration (if any) so the hero CTA can flip between
  // "Register" / "View your pass" / "You're checked in" / "Finish
  // your profile to register".
  //
  // We also compute fair-eligibility here so the hero CTA can
  // surface the EXACT gaps inline ("✓ verify email — 1 click") and
  // the candidate never lands at /me/profile?incomplete=fair from
  // a server-action redirect surprised — they see the gates on the
  // public page first.
  let myRegistration: { id: string; status: string; checkInCode: string } | null = null;
  let myEligibility: ReturnType<typeof evaluateFairEligibility> | null = null;
  // Owner-gated: any logged-in user with a CandidateProfile can
  // register to ATTEND a fair (as a candidate). EMPLOYERs who are
  // booth-staff use the separate `/employer/fairs/*` surfaces; this
  // is the attendee path. The previous role===CANDIDATE check
  // excluded dual-persona recruiters who legitimately wanted to
  // attend as job-seekers.
  let hasCandidateProfile = false;
  if (session?.user) {
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        profileCompleteness: true,
        resumeUrl: true,
        aiResumeUrl: true,
        phone: true,
        user: { select: { emailVerifiedAt: true, phone: true } },
      },
    });
    if (profile) {
      hasCandidateProfile = true;
      myRegistration = await db.recruitmentDriveRegistration.findUnique({
        where: { driveId_candidateId: { driveId: drive.id, candidateId: profile.id } },
        select: { id: true, status: true, checkInCode: true },
      });
      myEligibility = evaluateFairEligibility(
        {
          profileCompleteness: profile.profileCompleteness,
          resumeUrl: profile.resumeUrl,
          aiResumeUrl: profile.aiResumeUrl,
          phone: profile.phone,
        },
        profile.user,
      );
    }
  }
  // Whitelist of statuses that allow registration — safer than
  // blacklisting CLOSED / DRAFT because a new status added later
  // (e.g. CANCELLED, which already exists in the enum but was
  // previously accidentally allowed by the blacklist) would default
  // to "allowed" with that pattern. With a whitelist, anything new
  // defaults to "not allowed" until explicitly enabled.
  const registrationOpen =
    (drive.status === "OPEN" || drive.status === "IN_PROGRESS") &&
    (!drive.registrationClosesAt || drive.registrationClosesAt > new Date());

  // Viewer status drives the header bar's CTA labels (Register vs.
  // View pass / dashboard). Cheap — three parallel queries on
  // indexed columns; only fires for signed-in viewers.
  const viewerStatus = await getRecruitathonViewerStatus(
    session?.user?.id ?? null,
    drive.id,
  );

  // schema.org Event JSON-LD — drives Google rich-results carousel +
  // unblocks WhatsApp / LinkedIn / Twitter preview cards on shares.
  // Renders as a raw <script type="application/ld+json"> tag in the
  // page body (App Router doesn't have a first-class "structured
  // data" helper yet so we inline). DRAFT/CANCELLED already short-
  // circuit metadata robots:no-index above; the script renders
  // regardless because crawlers can still hit those URLs via direct
  // shares.
  const fairJsonLd = recruitmentFairJsonLd({
    slug: drive.slug,
    title: drive.title,
    tagline: drive.tagline,
    description: drive.description,
    bannerImageUrl: drive.bannerImageUrl,
    heroImageUrl: drive.heroImageUrl,
    startsAt: drive.startsAt,
    endsAt: drive.endsAt,
    status: drive.status,
    city: drive.city,
    state: drive.state,
    country: drive.country,
    venueName: drive.venueName,
    venueAddress: drive.venueAddress,
    registrationOpensAt: drive.registrationOpensAt,
    registrationClosesAt: drive.registrationClosesAt,
  });

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(fairJsonLd) }} />
      <SiteHeader />
      <RecruitathonHeaderBar
        driveSlug={drive.slug}
        driveTitle={drive.title}
        registrationOpen={registrationOpen}
        viewerStatus={viewerStatus}
      />
      <main className="min-h-screen bg-emce-light-bg">
        {previewMode && (
          <div className="bg-emce-orange-light py-2 text-center text-sm text-emce-text">
            <strong>Draft preview</strong> — not visible to the public.{" "}
            <Link
              href={`/admin/fairs/${drive.id}`}
              className="font-bold text-emce-dark hover:underline"
            >
              Open admin →
            </Link>
          </div>
        )}

        {/* ─── Hero ────────────────────────────────────────────
            Premium, enterprise-credible. Layered backdrop:
              1. `bg-emce-mesh` base — multi-stop green radial-on-
                 linear gradient anchoring depth in the brand greens
                 (emce-darkest → emce-dark → emce-dark-deep with
                 emce-mid + emce-light highlight halos)
              2. Banner image (when uploaded) drops over the mesh at
                 25% opacity with `mix-blend-soft-light` so it adds
                 texture but the green still owns the page
              3. Left-side dark gradient on banner mode keeps the
                 text-heavy left column high-contrast on light
                 banners; bottom vignette eases the transition into
                 the next section's lighter surface.
            Headline uses the `text-hero` token (clamp 32-42px / 800
            / -0.02em tracking) — enterprise hero scale. */}
        <section className="relative overflow-hidden">
          {/* Base — always present green-mesh gradient */}
          <div aria-hidden className="absolute inset-0 bg-emce-mesh" />
          {/* Banner overlay (texture, not content) — when a banner
              is uploaded we drop a uniform 25% darkest-green wash
              ON TOP of the banner BEFORE the left gradient so even
              the rightmost edge (where the left gradient ends) is
              never raw banner. This is the WCAG hardening pass:
              CTAs on the right of the hero row sit on a backdrop
              that mixes (75% green mesh × 25% banner) × +25% green
              wash, keeping the white-text contrast above ~5.5:1 on
              any banner brightness. */}
          {drive.bannerImageUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={drive.bannerImageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-soft-light"
              />
              {/* Uniform baseline tint — guards the right column on
                  bright banners. ~25% emce-darkest never disappears,
                  regardless of where the visitor's eye lands. */}
              <div aria-hidden className="absolute inset-0 bg-emce-darkest/25" />
              {/* Left-side dark wash + sustained right-edge tint
                  (`to-emce-darkest/20` instead of `to-transparent`)
                  so the rightmost CTAs / hiring-partner anchor /
                  share trigger keep ~5.5:1 contrast on any banner. */}
              <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-emce-darkest/80 via-emce-darkest/50 to-emce-darkest/20" />
            </>
          )}
          {/* Bottom vignette — deepened from /40 h-32 to /55 h-40
              so the CTA row (which wraps to multiple lines on mobile
              and sits at the bottom of the hero) always has a darker
              ground beneath. White CTAs on white backdrops with a
              translucent fill need this floor; without it mobile
              looked marginal on bright banners. */}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-emce-darkest/55 to-transparent" />

          <div className="container relative max-w-5xl py-16 text-white md:py-24">
            {/* Status + date chip row — subtle backdrop-blur pills so
                they read as ambient meta, not loud CTAs. */}
            <div className="flex flex-wrap items-center gap-2">
              {isLive && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emce-light px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emce-darkest shadow-emce">
                  <span aria-hidden className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emce-darkest" />
                  Live now
                </span>
              )}
              {isClosed && (
                <span className="inline-flex items-center rounded-full border border-white/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/80">
                  Closed
                </span>
              )}
              {drive.status === "OPEN" && drive.startsAt > new Date() && (
                <span className="inline-flex items-center rounded-full border border-white/30 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm">
                  Upcoming
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm">
                <span aria-hidden>📅</span> {formatDateRange(drive.startsAt, drive.endsAt)}
              </span>
            </div>

            {/* Headline — text-hero token, max-w to prevent ultra-wide
                line-lengths on long event titles. */}
            <h1 className="mt-6 max-w-3xl text-hero text-white">
              {drive.title}
            </h1>
            {drive.tagline && (
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/85 md:text-lg">
                {drive.tagline}
              </p>
            )}

            {/* Compact meta strip — venue + location only. The
                candidate / company / role counts move OUT of the
                hero and into the dedicated stat band below where
                they get the oversized-numeral treatment. */}
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/75">
              {drive.venueName && (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden>🏟️</span> {drive.venueName}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>📍</span> {drive.city}
                {drive.state ? `, ${drive.state}` : ""}
              </span>
            </div>

            {/* CTAs — pill shape, semibold weight, layered shadow.
                Primary candidate path uses the emce-light fill for
                pop against the dark hero; secondary employer + TPO
                paths use a translucent backdrop-blur chip so they
                read as supportive options without competing for the
                primary visual weight. */}
            <div className="mt-8 flex flex-wrap items-center gap-2">
              {registrationOpen && !session?.user && (
                <>
                  <Link
                    href={`/fairs/${drive.slug}/register?as=candidate`}
                    className="inline-flex h-11 items-center rounded-full bg-emce-light px-6 text-sm font-semibold text-emce-darkest shadow-emce-lg transition hover:bg-emce-mid hover:shadow-emce-hover"
                  >
                    🎓 Register as candidate
                  </Link>
                  <Link
                    href={`/fairs/${drive.slug}/register?as=employer`}
                    className="inline-flex h-11 items-center rounded-full border border-white/25 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
                  >
                    🏢 Register company
                  </Link>
                  <Link
                    href={`/fairs/${drive.slug}/register?as=tpo`}
                    className="inline-flex h-11 items-center rounded-full border border-white/25 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
                  >
                    📋 Register as TPO
                  </Link>
                </>
              )}
              {registrationOpen && hasCandidateProfile && !myRegistration && (
                myEligibility?.ok ? (
                  <form action={registerForDrive}>
                    <input type="hidden" name="driveId" value={drive.id} />
                    <button
                      type="submit"
                      className="inline-flex h-11 items-center rounded-full bg-emce-light px-6 text-sm font-semibold text-emce-darkest shadow-emce-lg transition hover:bg-emce-mid hover:shadow-emce-hover"
                    >
                      Register to attend
                    </button>
                  </form>
                ) : (
                  <Link
                    href={`/me/profile?incomplete=fair&fairSlug=${drive.slug}`}
                    className="inline-flex h-11 items-center rounded-full bg-emce-light px-6 text-sm font-semibold text-emce-darkest shadow-emce-lg transition hover:bg-emce-mid hover:shadow-emce-hover"
                  >
                    Finish profile to register
                  </Link>
                )
              )}
              {myRegistration && myRegistration.status !== "CANCELLED" && (
                <Link
                  href={`/me/fairs/${drive.slug}/pass`}
                  className="inline-flex h-11 items-center rounded-full bg-emce-light px-6 text-sm font-semibold text-emce-darkest shadow-emce-lg transition hover:bg-emce-mid hover:shadow-emce-hover"
                >
                  {myRegistration.status === "CHECKED_IN" ? "✓ Checked in — view pass" : "View your fair pass"}
                </Link>
              )}
              {!isClosed && (
                <a
                  href="#hiring-partner-cta"
                  className="inline-flex h-11 items-center rounded-full border border-white/25 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
                >
                  Participate as a hiring partner
                </a>
              )}
              <ShareDropdown
                url={`${env.NEXT_PUBLIC_APP_URL}/fairs/${drive.slug}`}
                title={drive.title}
                description={drive.tagline ?? `EV recruitment drive in ${drive.city}`}
                label="Share"
              />
            </div>
          </div>
        </section>

        <div className="container max-w-5xl space-y-8 py-8 md:py-10">
          {/* Eligibility-gaps panel — only renders for a signed-in
              candidate who isn't already registered AND has at
              least one gap. Right at the top of the body so the
              candidate doesn't scroll past it. Each gap maps to a
              labelled fix link (see FAIR_GAP_COPY). When all gaps
              clear, the panel disappears and the hero CTA flips
              to a real Register button. */}
          {registrationOpen &&
            hasCandidateProfile &&
            !myRegistration &&
            myEligibility &&
            !myEligibility.ok && (
              <section className="rounded-lg border-2 border-emce-orange/50 bg-emce-orange-light p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-orange-deep">
                  Almost there
                </p>
                <h2 className="text-section text-emce-text">
                  Complete {myEligibility.missing.length}{" "}
                  {myEligibility.missing.length === 1 ? "thing" : "things"} to register
                </h2>
                <p className="mt-1 text-hint text-emce-text-sec">
                  Your profile is{" "}
                  <strong className="text-emce-text">
                    {myEligibility.completeness}% complete
                  </strong>
                  . We require {myEligibility.threshold}% plus an uploaded
                  CV, phone number, and verified email so recruiters can
                  reach you on fair day.
                </p>
                <ul className="mt-3 space-y-2">
                  {myEligibility.missing.map((gap) => {
                    const copy = FAIR_GAP_COPY[gap];
                    return (
                      <li
                        key={gap}
                        className="flex items-center justify-between gap-3 rounded-md border border-emce-orange/40 bg-white p-3"
                      >
                        <span className="font-bold text-emce-text">
                          {copy.label}
                        </span>
                        <Link
                          href={copy.href}
                          className="inline-flex h-8 shrink-0 items-center rounded-md bg-emce-dark px-3 text-xs font-bold text-emce-light hover:bg-emce-dark-deep"
                        >
                          {copy.cta} →
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

          {/* Eligibility-success confirmation — small green pill so
              the candidate knows the register button above will
              actually work. Only when ok=true AND they haven't yet
              registered (otherwise the "View your pass" CTA above
              already tells the right story). */}
          {registrationOpen &&
            hasCandidateProfile &&
            !myRegistration &&
            myEligibility?.ok && (
              <p className="rounded-md border border-emce-mid/40 bg-emce-light-soft/40 p-3 text-hint text-emce-success-deep">
                ✓ You&apos;re eligible to register. Profile {myEligibility.completeness}% complete.
              </p>
            )}

          {/* ─── Stat band ─────────────────────────────────────
              Single cohesive centerpiece — NOT four equal grey
              boxes. Hierarchy:
                • PRIMARY headline metric (candidates) — oversized
                  numeral in emce-dark, centered, the "this is what
                  this fair brings" anchor commitment
                • SECONDARY trio (companies / positions / tracks) —
                  medium numerals on a single horizontal row beneath,
                  separated by hairline dividers (no card boxes)
              FULL-BLEED white section — uses the
              `relative left-1/2 -translate-x-1/2 w-screen` escape
              trick to break out of the body container's max-w-5xl
              centering and span the viewport edge-to-edge. Without
              this the band only bleeds 16px past container padding
              and reads as a misaligned card rather than a section
              break. py-16/md:py-20 gives the centerpiece breathing
              room. */}
          {(displayCandidatesCount > 0 ||
            displayCompaniesCount > 0 ||
            displayPositionsCount > 0 ||
            drive.tracks.length > 0) && (
            <section className="relative left-1/2 w-screen -translate-x-1/2 bg-white py-16 md:py-20">
              <div className="container mx-auto max-w-4xl text-center">
                {/* Section eyebrow — gives the band a frame without
                    a card border */}
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
                  What to expect
                </p>

                {/* PRIMARY metric — oversized */}
                {displayCandidatesCount > 0 && (
                  <div className="mt-4">
                    <p className="text-[64px] font-extrabold leading-none tracking-tight text-emce-dark md:text-[88px]">
                      {displayCandidatesCount.toLocaleString("en-IN")}
                      {candidatesIsTarget ? "+" : ""}
                    </p>
                    <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-emce-text-sec md:text-base">
                      Pre-screened candidates
                    </p>
                  </div>
                )}

                {/* SECONDARY trio — divider-separated row, no boxes.
                    On mobile each cell stacks (no dividers shown via
                    `sm:divide-x` only). On sm+ they share width via
                    `flex-1` and divide via hairlines. */}
                {(displayCompaniesCount > 0 ||
                  displayPositionsCount > 0 ||
                  drive.tracks.length > 0) && (
                  <div className="mt-10 flex flex-wrap items-stretch justify-center divide-emce-border sm:mt-12 sm:flex-nowrap sm:divide-x">
                    {displayCompaniesCount > 0 && (
                      <SecondaryStat
                        value={displayCompaniesCount}
                        suffix={companiesIsTarget ? "+" : ""}
                        label="Hiring companies"
                      />
                    )}
                    {displayPositionsCount > 0 && (
                      <SecondaryStat
                        value={displayPositionsCount}
                        suffix={positionsIsTarget ? "+" : ""}
                        label="Open positions"
                      />
                    )}
                    {drive.tracks.length > 0 && (
                      <SecondaryStat
                        value={drive.tracks.length}
                        suffix=""
                        label={drive.tracks.length === 1 ? "Industry track" : "Industry tracks"}
                      />
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Participating companies — logo rail. Visual proof
              "look who's hiring". The full booth grid still
              renders further down with booth labels + pitches; this
              is the quick scan-the-logos rail. */}
          {drive.participatingCompanies.length > 0 && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
                Hiring at this fair
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {drive.participatingCompanies.map((p) => (
                  <Link
                    key={`logo-${p.id}`}
                    href={`/company/${p.company.slug}`}
                    title={p.company.name}
                    className="group inline-flex h-14 min-w-[7rem] items-center justify-center rounded-md border border-emce-border bg-white px-3 transition-shadow hover:border-emce-mid/60 hover:shadow-emce"
                  >
                    {p.company.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.company.logoUrl}
                        alt={p.company.name}
                        className="max-h-10 max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-hint font-bold text-emce-text">
                        {p.company.name}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Affiliations & partners — academic / government /
              certifier / industry endorsements, grouped by type so
              colleges find the academic strip + companies find the
              regulatory one. Each strip is labelled. */}
          {drive.eventPartners.length > 0 && (
            <section className="rounded-lg border border-emce-border bg-white p-5">
              <h2 className="text-section text-emce-text">Affiliations &amp; partners</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                Academic, government, and industry endorsements backing this fair.
              </p>
              <div className="mt-4 space-y-4">
                {(["ACADEMIC", "GOVERNMENT", "CERTIFIER", "INDUSTRY", "ASSOCIATION", "MEDIA", "OTHER"] as const).map(
                  (type) => {
                    const group = partnersByType.get(type);
                    if (!group || group.length === 0) return null;
                    return (
                      <div key={type}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-text-muted">
                          {partnerGroupLabel(type)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          {group.map((partner) => {
                            const inner = (
                              <span className="inline-flex h-12 min-w-[6rem] items-center justify-center gap-2 rounded-md border border-emce-border bg-emce-light-soft/40 px-3 py-1.5">
                                {partner.logoUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={partner.logoUrl}
                                    alt={partner.name}
                                    className="max-h-8 max-w-full object-contain"
                                    title={partner.caption ?? partner.name}
                                  />
                                ) : (
                                  <span className="text-hint font-bold text-emce-text">
                                    {partner.name}
                                  </span>
                                )}
                              </span>
                            );
                            return partner.url ? (
                              <a
                                key={partner.id}
                                href={partner.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={partner.caption ?? partner.name}
                                className="hover:opacity-90"
                              >
                                {inner}
                              </a>
                            ) : (
                              <span key={partner.id} title={partner.caption ?? partner.name}>
                                {inner}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </section>
          )}

          {/* Floor map — venue layout image showing where each
              booth sits. Auto-hides when not uploaded. Lazy-loaded
              + large click target so candidates can zoom on mobile
              by long-pressing → Save Image. */}
          {drive.floorMapUrl && (
            <section
              id="floor-map"
              aria-labelledby="floor-map-heading"
              className="scroll-mt-20 rounded-lg border border-emce-border bg-white p-5 md:p-6"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
                    Venue
                  </p>
                  <h2 id="floor-map-heading" className="text-section text-emce-text">
                    Floor map
                  </h2>
                </div>
                <p className="hidden text-hint text-emce-text-sec sm:block">
                  Long-press on mobile to save
                </p>
              </div>
              <a
                href={`${drive.floorMapUrl}?v=${drive.updatedAt.getTime()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block overflow-hidden rounded-md border border-emce-border bg-emce-light-soft transition hover:border-emce-mid"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${drive.floorMapUrl}?v=${drive.updatedAt.getTime()}`}
                  alt={`${drive.title} floor map`}
                  loading="lazy"
                  className="w-full"
                />
              </a>
              <p className="mt-2 text-hint text-emce-text-sec">
                Each booth&apos;s label appears under its company on the
                Participating partners list above.
              </p>
            </section>
          )}

          {/* Brochure downloads — public PDF collateral. Two
              audience variants (hiring partners + colleges). The
              card auto-hides when no brochures are uploaded yet, so
              fairs without admin-uploaded brochures don't show an
              empty placeholder. Cache-busting `?v=updatedAt` keeps a
              freshly re-uploaded brochure from being served stale
              from CDN caches (the underlying S3 key is stable). */}
          {(drive.hiringPartnerBrochureUrl || drive.collegeBrochureUrl) && (
            <section
              id="brochures"
              aria-labelledby="brochures-heading"
              className="scroll-mt-20 rounded-lg border border-emce-border bg-white p-5 md:p-6"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
                    Downloads
                  </p>
                  <h2 id="brochures-heading" className="text-section text-emce-text">
                    Brochures
                  </h2>
                </div>
                <p className="hidden text-hint text-emce-text-sec sm:block">
                  PDF · share with your team
                </p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {drive.hiringPartnerBrochureUrl && (
                  <a
                    href={`${drive.hiringPartnerBrochureUrl}?v=${drive.updatedAt.getTime()}`}
                    download
                    className="group flex items-start gap-3 rounded-md border border-emce-border bg-emce-light-soft/40 p-4 transition hover:border-emce-mid hover:bg-emce-light-soft"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white text-xl">
                      🏢
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-emce-text">For hiring partners</p>
                      <p className="mt-0.5 text-hint text-emce-text-sec">
                        Booth packages, sponsor tiers, candidate footfall, past-edition ROI.
                      </p>
                      <p className="mt-1 text-xs font-bold text-emce-dark group-hover:underline">
                        📥 Download PDF →
                      </p>
                    </div>
                  </a>
                )}
                {drive.collegeBrochureUrl && (
                  <a
                    href={`${drive.collegeBrochureUrl}?v=${drive.updatedAt.getTime()}`}
                    download
                    className="group flex items-start gap-3 rounded-md border border-emce-border bg-emce-light-soft/40 p-4 transition hover:border-emce-mid hover:bg-emce-light-soft"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white text-xl">
                      🎓
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-emce-text">For colleges &amp; TPOs</p>
                      <p className="mt-0.5 text-hint text-emce-text-sec">
                        Cohort onboarding, roster CSV import, expected outcomes, fair-day logistics.
                      </p>
                      <p className="mt-1 text-xs font-bold text-emce-dark group-hover:underline">
                        📥 Download PDF →
                      </p>
                    </div>
                  </a>
                )}
              </div>
            </section>
          )}

          {/* Why participate — hiring-partner pitch blocks.
              Brochure pattern of 3 boxes ("Pre-Event / During /
              Post-Event"). Render as a 2-3 column grid; if fewer
              blocks, columns collapse cleanly. */}
          {Array.isArray(drive.pitchForHiringPartners) && drive.pitchForHiringPartners.length > 0 && (
            // `id="hiring-partner-cta"` is the anchor target of
            // the hero's "Participate as a hiring partner" button.
            // Putting it on this section means a click scrolls
            // straight to the pitch + the conversion panel below.
            <section
              id="hiring-partner-cta"
              className="scroll-mt-20 rounded-lg bg-emce-light-soft/40 p-5 md:p-6"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
                For hiring partners
              </p>
              <h2 className="text-section text-emce-text">Why hire here</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {(drive.pitchForHiringPartners as { heading: string; body: string }[]).map(
                  (block, idx) => (
                    <div
                      key={`hp-${idx}`}
                      className="rounded-md border border-emce-border bg-white p-4"
                    >
                      <p className="font-bold text-emce-text">{block.heading}</p>
                      <p className="mt-2 whitespace-pre-line text-body text-emce-text-sec">
                        {block.body}
                      </p>
                    </div>
                  ),
                )}
              </div>

              {/* Dual-path conversion panel — separates candidates
                  from hiring partners so each audience sees the right
                  next step. Candidate path: sign up + register for
                  the fair (or register directly if signed in).
                  Hiring-partner path: sign up as employer + WhatsApp
                  / email shortcuts. WhatsApp falls back to the DIYguru
                  central number (9910918719) when no per-drive
                  contact is set. */}
              <div className="mt-6 grid gap-4 rounded-md border border-emce-mid/40 bg-white p-5 md:grid-cols-2">
                {/* Candidate path */}
                <div className="space-y-3 border-emce-border md:border-r md:pr-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
                    For candidates
                  </p>
                  <p className="text-section text-emce-text">
                    Ready to participate as a candidate?
                  </p>
                  <p className="text-hint text-emce-text-sec">
                    {registrationOpen
                      ? "Create your free emobility.careers profile, then register for the fair. We'll send your check-in pass + match you to recruiters who fit your background."
                      : "Registration for this drive is now closed. Create a profile so you're matched to the next fair the moment it opens."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {!session?.user ? (
                      <Link
                        href={`/signup?next=${encodeURIComponent(`/fairs/${drive.slug}`)}`}
                        className="inline-flex h-10 items-center rounded-md bg-emce-dark px-5 text-sm font-bold text-white hover:bg-emce-darkest"
                      >
                        ✍️ Sign up + register
                      </Link>
                    ) : myRegistration && myRegistration.status !== "CANCELLED" ? (
                      <Link
                        href={`/me/fairs/${drive.slug}/pass`}
                        className="inline-flex h-10 items-center rounded-md bg-emce-dark px-5 text-sm font-bold text-white hover:bg-emce-darkest"
                      >
                        ✓ View your fair pass
                      </Link>
                    ) : registrationOpen && hasCandidateProfile ? (
                      myEligibility?.ok ? (
                        <form action={registerForDrive}>
                          <input type="hidden" name="driveId" value={drive.id} />
                          <button
                            type="submit"
                            className="inline-flex h-10 items-center rounded-md bg-emce-dark px-5 text-sm font-bold text-white hover:bg-emce-darkest"
                          >
                            Register for this fair →
                          </button>
                        </form>
                      ) : (
                        <Link
                          href={`/me/profile?incomplete=fair&fairSlug=${drive.slug}`}
                          className="inline-flex h-10 items-center rounded-md bg-emce-dark px-5 text-sm font-bold text-white hover:bg-emce-darkest"
                        >
                          Finish profile to register
                        </Link>
                      )
                    ) : null}
                  </div>
                </div>

                {/* Hiring-partner path */}
                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
                    For hiring partners
                  </p>
                  <p className="text-section text-emce-text">
                    Ready to participate as an employer?
                  </p>
                  <p className="text-hint text-emce-text-sec">
                    Share your JDs with{" "}
                    {drive.primaryContactName ?? "our placement team"} and we&apos;ll
                    pre-screen candidates from the pool 2 weeks before the fair.
                    Participation is free for companies with active hiring mandates.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/employer/onboarding"
                      className="inline-flex h-10 items-center rounded-md bg-emce-dark px-5 text-sm font-bold text-white hover:bg-emce-darkest"
                    >
                      🏢 Sign up as employer
                    </Link>
                    <a
                      href={`https://wa.me/${(drive.primaryContactPhone ?? "+919910918719").replace(/[^\d]/g, "")}?text=${encodeURIComponent(
                        `Hi! We'd like to participate as a hiring partner at ${drive.title}.`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center rounded-md border-2 border-emce-dark px-5 text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
                    >
                      💬 WhatsApp
                    </a>
                    {drive.primaryContactEmail && (
                      <a
                        href={`mailto:${drive.primaryContactEmail}?subject=${encodeURIComponent(
                          `Hiring partner enquiry — ${drive.title}`,
                        )}&body=${encodeURIComponent(
                          `Hi ${drive.primaryContactName ?? "team"},\n\nWe'd like to participate as a hiring partner at ${drive.title}. Here are our open positions:\n\n- Role 1:\n- Role 2:\n\nLooking forward to hearing from you.`,
                        )}`}
                        className="inline-flex h-10 items-center rounded-md border-2 border-emce-dark px-5 text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
                      >
                        ✉️ Email
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* For candidates pitch — same shape, audience-flipped. */}
          {Array.isArray(drive.pitchForCandidates) && drive.pitchForCandidates.length > 0 && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
                For candidates
              </p>
              <h2 className="text-section text-emce-text">Why attend</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {(drive.pitchForCandidates as { heading: string; body: string }[]).map(
                  (block, idx) => (
                    <div
                      key={`cp-${idx}`}
                      className="rounded-md border border-emce-border bg-white p-4"
                    >
                      <p className="font-bold text-emce-text">{block.heading}</p>
                      <p className="mt-2 whitespace-pre-line text-body text-emce-text-sec">
                        {block.body}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

          {/* Speakers / leadership panel. Patrons + Chairs render
              as a slim top "Leadership" row; remaining speakers
              fall into a 3-4 column grid. Brochure equivalent of
              the "Event Leadership & Dignitaries" panel. */}
          {drive.speakers.length > 0 && (
            <section className="rounded-lg border border-emce-border bg-white p-5">
              <h2 className="text-section text-emce-text">Leadership &amp; speakers</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                Patron, event chair, keynote speakers, and dignitaries gracing
                this fair.
              </p>

              {leadership.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {leadership.map((s) => (
                    <SpeakerCard key={s.id} speaker={s} highlight />
                  ))}
                </div>
              )}

              {otherSpeakers.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {otherSpeakers.map((s) => (
                    <SpeakerCard key={s.id} speaker={s} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* About */}
          {drive.description && (
            <Card className="p-6">
              <h2 className="text-section text-emce-text">About this drive</h2>
              <div
                className="prose prose-sm mt-3 max-w-none text-body text-emce-text-sec"
                dangerouslySetInnerHTML={{ __html: htmlOrFallback(drive.description) }}
              />
            </Card>
          )}

          {/* Venue map — falls back to a text card when lat/lng
              aren't set (e.g. virtual fairs or admin hasn't pinned
              the venue yet). */}
          <section>
            <h2 className="text-section text-emce-text">Venue</h2>
            <p className="mt-1 text-hint text-emce-text-sec">
              Tap directions to open in your maps app.
            </p>
            <div className="mt-3">
              <VenueMap
                lat={drive.venueLat ? Number(drive.venueLat) : null}
                lng={drive.venueLng ? Number(drive.venueLng) : null}
                venueName={drive.venueName}
                venueAddress={drive.venueAddress}
                city={drive.city}
                state={drive.state}
              />
            </div>
          </section>

          {/* Participating companies */}
          {drive.participatingCompanies.length > 0 && (
            <section>
              <h2 className="text-section text-emce-text">Participating companies</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                {drive.participatingCount} confirmed {drive.participatingCount === 1 ? "company" : "companies"}.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {drive.participatingCompanies.map((p) => (
                  <Card key={p.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar src={p.company.logoUrl} name={p.company.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/company/${p.company.slug}`}
                          className="block truncate font-bold text-emce-text hover:underline"
                        >
                          {p.company.name}
                        </Link>
                        {p.boothLabel && (
                          <p className="text-hint text-emce-text-muted">📍 {p.boothLabel}</p>
                        )}
                      </div>
                    </div>
                    {p.aboutAtFair && (
                      <p className="mt-2 line-clamp-3 text-hint text-emce-text-sec">
                        {p.aboutAtFair}
                      </p>
                    )}
                    {/* #4 Live booth chat — only available while the
                        fair is IN_PROGRESS and only to signed-in
                        candidates. Recruiter-side / signed-out users
                        see the booth without the chat button (so the
                        button doesn't tease an action they can't
                        take). Clicking mints a peer thread tagged
                        FAIR_LIVE_CHAT and redirects into the message
                        view. */}
                    {isLive && hasCandidateProfile && (
                      <form action={startLiveBoothChat} className="mt-3">
                        <input type="hidden" name="driveCompanyId" value={p.id} />
                        <Button type="submit" variant="outline" size="sm" className="w-full">
                          💬 Chat live with the team
                        </Button>
                      </form>
                    )}
                    {/* Slot booking link — always renders on the
                        booth card (the slot picker page itself
                        handles the signed-in / registered / eligible
                        gates and surfaces the right nudge). Lets
                        candidates discover slots before committing
                        to a sign-in flow. */}
                    <Link
                      href={`/fairs/${drive.slug}/booths/${p.id}/slots`}
                      className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-md border border-emce-border bg-white px-3 text-xs font-bold text-emce-dark hover:bg-emce-light-soft"
                    >
                      📅 Book interview slot
                    </Link>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Open roles */}
          <section>
            <h2 className="text-section text-emce-text">Open roles</h2>
            <p className="mt-1 text-hint text-emce-text-sec">
              {visibleJobs.length} {visibleJobs.length === 1 ? "role" : "roles"} from
              participating companies.
              {visibleJobs.some((j) => j.challengeAssessment) && (
                <> Some roles have a screening challenge — complete it to be shortlisted.</>
              )}
            </p>
            {/* F1 — Industry-track filter chips. Only renders when
                the admin defined at least one track. Built as plain
                <Link> anchors (no client JS) so chips work without
                hydration + the URL is shareable + Google indexes the
                per-track views. */}
            {drive.tracks.length > 0 && (
              <nav
                aria-label="Filter by industry track"
                className="mt-3 flex flex-wrap items-center gap-1.5"
              >
                <Link
                  href={`/fairs/${drive.slug}`}
                  className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-bold transition ${
                    !trackFilter || (!validTrackSlugs.has(trackFilter) && trackFilter !== "other")
                      ? "bg-emce-dark text-emce-light"
                      : "bg-emce-light-soft text-emce-text-sec hover:bg-emce-mid/30"
                  }`}
                >
                  All
                  <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-[10px] tabular-nums">
                    {allOpenJobs.length}
                  </span>
                </Link>
                {drive.tracks.map((t) => {
                  const count = trackCounts.get(t.slug) ?? 0;
                  if (count === 0) return null;
                  const active = trackFilter === t.slug;
                  return (
                    <Link
                      key={t.id}
                      href={`/fairs/${drive.slug}?track=${t.slug}`}
                      title={t.description ?? undefined}
                      className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-bold transition ${
                        active
                          ? "bg-emce-dark text-emce-light"
                          : "bg-emce-light-soft text-emce-text-sec hover:bg-emce-mid/30"
                      }`}
                    >
                      {t.name}
                      <span
                        className={`ml-1.5 rounded-full px-1.5 text-[10px] tabular-nums ${
                          active ? "bg-white/20" : "bg-white/60 text-emce-text-muted"
                        }`}
                      >
                        {count}
                      </span>
                    </Link>
                  );
                })}
                {hasOtherJobs && (
                  <Link
                    href={`/fairs/${drive.slug}?track=other`}
                    className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-bold transition ${
                      trackFilter === "other"
                        ? "bg-emce-dark text-emce-light"
                        : "bg-emce-light-soft text-emce-text-sec hover:bg-emce-mid/30"
                    }`}
                  >
                    Other
                    <span className="ml-1.5 rounded-full bg-white/60 px-1.5 text-[10px] tabular-nums text-emce-text-muted">
                      {trackCounts.get("other")}
                    </span>
                  </Link>
                )}
              </nav>
            )}
            {visibleJobs.length === 0 ? (
              <Card className="mt-3 p-8 text-center">
                <p className="text-hint text-emce-text-muted">
                  {trackFilter
                    ? "No roles in this track yet. Try another."
                    : "Companies are still adding roles. Check back closer to the fair."}
                </p>
              </Card>
            ) : (
              <ul className="mt-3 space-y-3">
                {visibleJobs.map((dj) => (
                  <li key={dj.id}>
                    <Card className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="flex items-start gap-3 sm:w-2/3">
                          <Avatar
                            src={dj.company.logoUrl}
                            name={dj.company.name}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/job/${dj.job.slug}?fair=${drive.id}`}
                              className="block font-bold text-emce-text hover:underline"
                            >
                              {dj.job.title}
                            </Link>
                            <p className="text-hint text-emce-text-sec">
                              <Link
                                href={`/company/${dj.company.slug}`}
                                className="hover:underline"
                              >
                                {dj.company.name}
                              </Link>
                              {" · "}
                              {dj.job.locations[0] ?? "Remote"}
                              {" · "}
                              {dj.job.workMode.toLowerCase()}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {dj.challengeAssessment && (
                                <Badge variant="warning" size="sm">
                                  🧪 {dj.challengeAssessment.type.toLowerCase()} screening
                                  {dj.challengeAssessment.durationMins && (
                                    <> · {dj.challengeAssessment.durationMins} min</>
                                  )}
                                </Badge>
                              )}
                              {(dj.job.experienceMin != null || dj.job.experienceMax != null) && (
                                <Badge variant="default" size="sm">
                                  {dj.job.experienceMin ?? 0}–{dj.job.experienceMax ?? "+"} yrs
                                </Badge>
                              )}
                              {!dj.job.salaryHidden &&
                                (dj.job.salaryMin || dj.job.salaryMax) && (
                                  <Badge variant="success" size="sm">
                                    {formatSalaryRange(
                                      dj.job.salaryMin ? Number(dj.job.salaryMin) : null,
                                      dj.job.salaryMax ? Number(dj.job.salaryMax) : null,
                                      dj.job.salaryCurrency,
                                      dj.job.salaryPeriod,
                                    )}
                                  </Badge>
                                )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 sm:w-1/3 sm:items-end">
                          {canApply ? (
                            <Button asChild size="sm" className="w-full sm:w-auto">
                              <Link href={`/job/${dj.job.slug}?fair=${drive.id}`}>
                                {session?.user ? "Apply now →" : "Sign in to apply →"}
                              </Link>
                            </Button>
                          ) : (
                            <Badge variant="outline">Fair closed</Badge>
                          )}
                        </div>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* F4 — Hiring-partner contact card. Only renders when at
              least one of the three fields is set (admin-curated). */}
          {(drive.primaryContactName || drive.primaryContactPhone || drive.primaryContactEmail) && (
            <Card className="border-emce-mid/40 bg-emce-light-soft/30 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
                Hiring partner? Talk to us.
              </p>
              {drive.primaryContactName && (
                <p className="mt-1 text-section text-emce-text">
                  {drive.primaryContactName}
                </p>
              )}
              <div className="mt-3 flex flex-col gap-1.5 text-body text-emce-text-sec">
                {drive.primaryContactPhone && (
                  <a
                    href={`tel:${drive.primaryContactPhone.replace(/[^+\d]/g, "")}`}
                    className="hover:text-emce-dark"
                  >
                    📞 {drive.primaryContactPhone}
                  </a>
                )}
                {drive.primaryContactPhone && (
                  <a
                    href={`https://wa.me/${drive.primaryContactPhone.replace(/[^\d]/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-emce-dark"
                  >
                    💬 WhatsApp the same number
                  </a>
                )}
                {drive.primaryContactEmail && (
                  <a
                    href={`mailto:${drive.primaryContactEmail}`}
                    className="hover:text-emce-dark"
                  >
                    ✉️ {drive.primaryContactEmail}
                  </a>
                )}
              </div>
            </Card>
          )}

          {/* F4 — FAQ accordion. `Array.isArray` gate because Prisma
              types Json as `JsonValue`, which is broader than
              `unknown[]`. Each entry uses `<details>` for
              zero-JS expand/collapse semantics — chunks render
              instantly without hydration, and keyboard nav works
              out of the box. */}
          {Array.isArray(drive.faq) && drive.faq.length > 0 && (
            <section>
              <h2 className="text-section text-emce-text">
                Frequently asked questions
              </h2>
              <ul className="mt-3 space-y-2">
                {(drive.faq as { q: string; a: string }[]).map((entry, idx) => (
                  <li key={idx}>
                    <details className="rounded-md border border-emce-border bg-white">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-body font-bold text-emce-text hover:bg-emce-light-soft/60">
                        <span>{entry.q}</span>
                        <span aria-hidden className="text-emce-text-muted">▸</span>
                      </summary>
                      <div className="border-t border-emce-border px-4 py-3 text-body text-emce-text-sec whitespace-pre-line">
                        {entry.a}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Recap (closed only) */}
          {isClosed && (
            <Card className="border-emce-mid/30 bg-emce-light-soft/40 p-5 text-center">
              <p className="text-section text-emce-darkest">Fair recap</p>
              <p className="mt-2 text-emce-text-sec">
                <strong>{drive.applicationsCount}</strong> applications received from
                <strong> {drive.participatingCount}</strong> participating companies.
                Listed jobs remain live — apply directly via the company pages.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/fairs">See upcoming fairs →</Link>
              </Button>
            </Card>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function formatDateRange(start: Date, end: Date): string {
  const s = start.toLocaleDateString("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (start.toDateString() === end.toDateString()) {
    return `${s}, ${start.getFullYear()}`;
  }
  const e = end.toLocaleDateString("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${s} — ${e}, ${end.getFullYear()}`;
}

/**
 * Brochure-style "big number" stat tile. Used for the public fair
 * page's marketing hero strip — `1,000+ / 50+ / 500+ / 5`. The
 * `+` is owned by the caller (only set when we're rendering an
 * aspirational target, not a precise live count).
 */
/**
 * Secondary stat cell — used in the stat band trio below the primary
 * (candidates) headline metric. Hairline-divider-separated, no box.
 * `flex-1` so the three cells share width equally; vertical padding
 * matches the divider rhythm. Numeral weight is emce-dark / 700 to
 * sit one tier below the primary's emce-dark / 800 + oversize without
 * competing for first attention.
 */
function SecondaryStat({
  value,
  suffix,
  label,
}: {
  value: number;
  suffix: string;
  label: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-4 sm:py-2">
      <p className="text-3xl font-bold tracking-tight text-emce-dark md:text-4xl">
        {value.toLocaleString("en-IN")}
        {suffix}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-emce-text-sec">
        {label}
      </p>
    </div>
  );
}

function SpeakerCard({
  speaker,
  highlight = false,
}: {
  speaker: {
    id: string;
    name: string;
    title: string | null;
    affiliation: string | null;
    photoUrl: string | null;
    bio: string | null;
    role: string;
  };
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-md p-3 ${
        highlight
          ? "border border-emce-mid/40 bg-emce-light-soft/40"
          : "border border-emce-border bg-white"
      }`}
    >
      <SpeakerAvatar src={speaker.photoUrl} name={speaker.name} />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-emce-text">{speaker.name}</p>
        {(speaker.title || speaker.affiliation) && (
          <p className="text-hint text-emce-text-sec">
            {[speaker.title, speaker.affiliation].filter(Boolean).join(" · ")}
          </p>
        )}
        {speaker.bio && (
          <p className="mt-1 line-clamp-2 text-hint text-emce-text-muted">
            {speaker.bio}
          </p>
        )}
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
          {speakerRoleLabel(speaker.role)}
        </p>
      </div>
    </div>
  );
}

function SpeakerAvatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        className="h-12 w-12 shrink-0 rounded-full object-cover"
      />
    );
  }
  // Initials fallback — keeps the card from looking incomplete
  // when an admin adds a speaker without a photo.
  const initials = name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emce-light-soft text-sm font-bold text-emce-dark">
      {initials}
    </div>
  );
}

function partnerGroupLabel(t: string): string {
  switch (t) {
    case "ACADEMIC": return "Academic partners";
    case "GOVERNMENT": return "Government partners";
    case "CERTIFIER": return "Certifier / skill councils";
    case "INDUSTRY": return "Industry endorsements";
    case "ASSOCIATION": return "Industry associations";
    case "MEDIA": return "Media partners";
    default: return "Partners";
  }
}

function speakerRoleLabel(r: string): string {
  switch (r) {
    case "PATRON": return "Patron";
    case "CHAIR": return "Event Chair";
    case "KEYNOTE": return "Keynote";
    case "PANELIST": return "Panellist";
    case "DIGNITARY": return "Dignitary";
    case "COORDINATOR": return "Coordinator";
    default: return "Speaker";
  }
}
