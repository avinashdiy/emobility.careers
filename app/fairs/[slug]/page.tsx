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
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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
  const visibleJobs = drive.driveJobs.filter(
    (dj) => dj.job.status === "OPEN" && dj.job.audience !== "INVITE_ONLY",
  );

  const isLive = drive.status === "IN_PROGRESS";
  const isClosed = drive.status === "CLOSED";
  const canApply = !isClosed && drive.status !== "DRAFT";

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
              <span>🏢 {drive.participatingCount} companies</span>
              <span>💼 {drive.jobsCount} roles</span>
            </div>
            <div className="mt-5">
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
            {visibleJobs.length === 0 ? (
              <Card className="mt-3 p-8 text-center">
                <p className="text-hint text-emce-text-muted">
                  Companies are still adding roles. Check back closer to the fair.
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
