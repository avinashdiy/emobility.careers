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
      status: true,
    },
  });
  if (!drive || drive.status === "DRAFT" || drive.status === "CANCELLED") {
    return { title: "Fair not found", robots: { index: false, follow: false } };
  }
  const description =
    drive.tagline ??
    `EV-industry recruitment drive in ${drive.city}. Multiple companies hiring across battery, charging, motor, and software roles.`;
  return {
    title: `${drive.title} · ${drive.city}`,
    description,
    alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/fairs/${slug}` },
    openGraph: {
      type: "website",
      url: `${env.NEXT_PUBLIC_APP_URL}/fairs/${slug}`,
      title: drive.title,
      description,
      images: drive.bannerImageUrl ? [drive.bannerImageUrl] : undefined,
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
  if (session?.user?.role === "CANDIDATE") {
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
  const registrationOpen =
    drive.status !== "CLOSED" &&
    drive.status !== "DRAFT" &&
    (!drive.registrationClosesAt || drive.registrationClosesAt > new Date());

  return (
    <>
      <SiteHeader />
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

        {/* Hero */}
        <section className="relative">
          {drive.bannerImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={drive.bannerImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="emce-hero-gradient absolute inset-0" />
          )}
          <div className="absolute inset-0 bg-black/40" />
          <div className="container relative max-w-5xl py-10 text-white md:py-14">
            <div className="flex flex-wrap items-center gap-2">
              {isLive && <Badge variant="warning">🔴 Live now</Badge>}
              {isClosed && <Badge variant="outline">Closed</Badge>}
              {drive.status === "OPEN" && drive.startsAt > new Date() && (
                <Badge variant="default">Upcoming</Badge>
              )}
              <span className="text-hint">
                📅 {formatDateRange(drive.startsAt, drive.endsAt)}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight md:text-4xl">
              {drive.title}
            </h1>
            {drive.tagline && (
              <p className="mt-2 max-w-2xl text-white/85 md:text-lg">{drive.tagline}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {drive.venueName && <span>🏟️ {drive.venueName}</span>}
              <span>
                📍 {drive.city}
                {drive.state ? `, ${drive.state}` : ""}
              </span>
              {/* Marketing hero stat strip. `+` suffix appears only
                  while we're rendering the aspirational target (live
                  count hasn't overtaken it yet) — once the real
                  number passes the target, the suffix drops. */}
              <span>
                👥 {displayCandidatesCount.toLocaleString("en-IN")}
                {candidatesIsTarget ? "+" : ""} candidates
              </span>
              <span>
                🏢 {displayCompaniesCount.toLocaleString("en-IN")}
                {companiesIsTarget ? "+" : ""} companies
              </span>
              <span>
                💼 {displayPositionsCount.toLocaleString("en-IN")}
                {positionsIsTarget ? "+" : ""} roles
              </span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {/* #2 Attendee registration CTA — separate from
                  applying to any specific job. Three states the user
                  can be in: not signed in / no registration yet /
                  already registered. Closed fairs hide the CTA
                  entirely. */}
              {registrationOpen && !session?.user && (
                <Link
                  href={`/signin?next=/fairs/${drive.slug}`}
                  className="inline-flex h-10 items-center rounded-md bg-emce-light px-5 text-sm font-bold text-emce-darkest hover:bg-emce-mid"
                >
                  Register to attend
                </Link>
              )}
              {registrationOpen && session?.user?.role === "CANDIDATE" && !myRegistration && (
                myEligibility?.ok ? (
                  <form action={registerForDrive}>
                    <input type="hidden" name="driveId" value={drive.id} />
                    <button
                      type="submit"
                      className="inline-flex h-10 items-center rounded-md bg-emce-light px-5 text-sm font-bold text-emce-darkest hover:bg-emce-mid"
                    >
                      Register to attend
                    </button>
                  </form>
                ) : (
                  // Not-eligible state — render a deep-link to the
                  // profile editor instead of the register button.
                  // The actual eligibility CARD with per-gap fixes
                  // sits in the body below the hero; this button is
                  // just the quick affordance to get there.
                  <Link
                    href={`/me/profile?incomplete=fair&fairSlug=${drive.slug}`}
                    className="inline-flex h-10 items-center rounded-md bg-emce-light px-5 text-sm font-bold text-emce-darkest hover:bg-emce-mid"
                  >
                    Finish profile to register
                  </Link>
                )
              )}
              {myRegistration && myRegistration.status !== "CANCELLED" && (
                <Link
                  href={`/me/fairs/${drive.slug}/pass`}
                  className="inline-flex h-10 items-center rounded-md bg-emce-light px-5 text-sm font-bold text-emce-darkest hover:bg-emce-mid"
                >
                  {myRegistration.status === "CHECKED_IN" ? "✓ Checked in — view pass" : "View your fair pass"}
                </Link>
              )}
              {/* Company-side CTA — anchors down to the
                  hiring-partner pitch block + contact card. Always
                  visible (not gated on auth) because the audience
                  reading "I want to hire here" is typically a
                  recruiter who isn't logged in to a candidate
                  account. Visual weight kept secondary to the
                  primary candidate CTA via a transparent border. */}
              {!isClosed && (
                <a
                  href="#hiring-partner-cta"
                  className="inline-flex h-10 items-center rounded-md border-2 border-white/80 px-5 text-sm font-bold text-white hover:bg-white/10"
                >
                  Participate as a hiring partner
                </a>
              )}
              <ShareDropdown
                url={`${env.NEXT_PUBLIC_APP_URL}/fairs/${drive.slug}`}
                title={drive.title}
                description={drive.tagline ?? `EV recruitment drive in ${drive.city}`}
                label="Share this fair"
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
            session?.user?.role === "CANDIDATE" &&
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
            session?.user?.role === "CANDIDATE" &&
            !myRegistration &&
            myEligibility?.ok && (
              <p className="rounded-md border border-emce-mid/40 bg-emce-light-soft/40 p-3 text-hint text-emce-success-deep">
                ✓ You&apos;re eligible to register. Profile {myEligibility.completeness}% complete.
              </p>
            )}

          {/* Marketing hero stat tiles. Distinct from the hero
              header's inline stats — these are the brochure's
              boxed "1,000+ / 50+ / 500+" panel. They appear at the
              top of the body so the eye lands on them after the
              hero. Render only when there's something to show
              (either a target is set OR real counts > 0). */}
          {(displayCandidatesCount > 0 ||
            displayCompaniesCount > 0 ||
            displayPositionsCount > 0 ||
            drive.tracks.length > 0) && (
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroStat
                value={displayCandidatesCount}
                suffix={candidatesIsTarget ? "+" : ""}
                label="Pre-screened candidates"
              />
              <HeroStat
                value={displayCompaniesCount}
                suffix={companiesIsTarget ? "+" : ""}
                label="Hiring companies"
              />
              <HeroStat
                value={displayPositionsCount}
                suffix={positionsIsTarget ? "+" : ""}
                label="Open positions"
              />
              <HeroStat
                value={drive.tracks.length}
                suffix=""
                label={drive.tracks.length === 1 ? "Industry track" : "Industry tracks"}
              />
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

              {/* Inline conversion panel — recruiter reads the
                  pitch above, lands on the WhatsApp/email CTAs here
                  with zero scrolling away. Renders only when an
                  admin set the contact details. Mailto pre-fills a
                  subject line referencing the fair so the recruiter
                  doesn't have to type one. */}
              {(drive.primaryContactPhone || drive.primaryContactEmail) && (
                <div className="mt-6 rounded-md border border-emce-mid/40 bg-white p-4 md:flex md:items-center md:justify-between md:gap-4">
                  <div>
                    <p className="text-section text-emce-text">
                      Ready to participate?
                    </p>
                    <p className="mt-1 text-hint text-emce-text-sec">
                      Share your JDs with{" "}
                      {drive.primaryContactName ?? "our placement team"} and we&apos;ll
                      pre-screen candidates from the pool 2 weeks before the fair.
                      Participation is free for companies with active hiring mandates.
                    </p>
                  </div>
                  <div className="mt-3 flex shrink-0 flex-wrap gap-2 md:mt-0">
                    {drive.primaryContactPhone && (
                      <a
                        href={`https://wa.me/${drive.primaryContactPhone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(
                          `Hi! We'd like to participate as a hiring partner at ${drive.title}.`,
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 items-center rounded-md bg-emce-light px-5 text-sm font-bold text-emce-darkest hover:bg-emce-mid"
                      >
                        💬 WhatsApp to participate
                      </a>
                    )}
                    {drive.primaryContactEmail && (
                      <a
                        href={`mailto:${drive.primaryContactEmail}?subject=${encodeURIComponent(
                          `Hiring partner enquiry — ${drive.title}`,
                        )}&body=${encodeURIComponent(
                          `Hi ${drive.primaryContactName ?? "team"},\n\nWe'd like to participate as a hiring partner at ${drive.title}. Here are our open positions:\n\n- Role 1:\n- Role 2:\n\nLooking forward to hearing from you.`,
                        )}`}
                        className="inline-flex h-10 items-center rounded-md border-2 border-emce-dark px-5 text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
                      >
                        ✉️ Email to participate
                      </a>
                    )}
                  </div>
                </div>
              )}
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
                    {isLive && session?.user?.role === "CANDIDATE" && (
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
function HeroStat({
  value,
  suffix,
  label,
}: {
  value: number;
  suffix: string;
  label: string;
}) {
  return (
    <div className="rounded-md border border-emce-border bg-white p-4 text-center">
      <p className="text-2xl font-extrabold tracking-tight text-emce-darkest md:text-3xl">
        {value.toLocaleString("en-IN")}
        {suffix}
      </p>
      <p className="mt-1 text-hint text-emce-text-sec">{label}</p>
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
