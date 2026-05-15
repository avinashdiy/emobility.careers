import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import type { Metadata } from "next";
import { env } from "@/lib/env";
import { htmlOrFallback, stripHtml } from "@/lib/cms/job-sanitize";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const drive = await db.campusDrive.findUnique({
    where: { slug },
    select: {
      title: true, institution: true, city: true,
      description: true,
      driveDate: true,
      company: { select: { name: true } },
    },
  });
  if (!drive) return { title: "Drive not found", robots: { index: false, follow: false } };
  const dateStr = drive.driveDate.toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
  // Strip HTML before slicing so meta-description / OG cards don't
  // leak `<p>` / `<strong>` markup from the rich-text body.
  const plainDescription = drive.description ? stripHtml(drive.description) : "";
  return {
    title: `${drive.title} — ${drive.institution} · ${drive.company.name}`,
    description:
      (plainDescription && plainDescription.slice(0, 200)) ||
      `Campus drive at ${drive.institution}${drive.city ? `, ${drive.city}` : ""} on ${dateStr}.`,
    alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/campus/${slug}` },
  };
}

/**
 * Public campus-drive landing page. Generated server-side from CampusDrive
 * + linked JobPostings + (optional) banner + description. Replaces the
 * old free-text landingPageUrl field — admins still see that field for
 * legacy / external drives, but new drives auto-fill it with /campus/{slug}.
 *
 * Layout:
 *   [Banner / hero gradient]
 *   [Title + dates + location]
 *   [Description]
 *   [Linked open jobs]
 *   [Register CTA]
 */
export default async function DriveLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const drive = await db.campusDrive.findUnique({
    where: { slug },
    include: {
      company: { select: { id: true, slug: true, name: true, logoUrl: true } },
      jobs: {
        include: {
          job: {
            select: {
              id: true, slug: true, title: true, locations: true, workMode: true,
              employmentType: true, status: true, salaryMin: true, salaryMax: true,
              salaryHidden: true, salaryCurrency: true,
            },
          },
        },
      },
    },
  });
  if (!drive) notFound();

  // Drive must be live (OPEN / IN_PROGRESS / COMPLETED) to be visible.
  // DRAFT + CANCELLED stay 404 so the slug doesn't leak unpublished work.
  if (drive.status === "DRAFT" || drive.status === "CANCELLED") notFound();

  const startDay = drive.driveDate.toLocaleDateString("en-IN", { day: "numeric" });
  const startMon = drive.driveDate.toLocaleDateString("en-IN", { month: "short" }).toUpperCase();
  const startYear = drive.driveDate.toLocaleDateString("en-IN", { year: "numeric" });
  const dateRange = drive.driveEndDate && drive.driveEndDate.getTime() !== drive.driveDate.getTime()
    ? `${drive.driveDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${drive.driveEndDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
    : drive.driveDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <SiteHeader />
      <article className="min-h-screen">
        {/* Hero — taller banner with an event-style date "stamp" overlay
            on the bottom-left, à la Eventbrite / LinkedIn Events. The
            stamp gives an at-a-glance "when is this?" cue that recruiter
            posters and DIYguru students alike scan first. */}
        <header className="relative overflow-hidden">
          {drive.bannerImageUrl ? (
            <div className="h-72 w-full bg-emce-light-soft sm:h-80">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={drive.bannerImageUrl}
                alt={drive.title}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="emce-hero-gradient h-64 w-full sm:h-80" />
          )}
          <div className="container -mt-16 max-w-4xl">
            <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
              {/* Calendar stamp — replaces the "Avatar" slot. Big day +
                  month uppercase, brand-green border. The host company
                  logo moves into the metadata row below where it belongs. */}
              <div className="flex h-24 w-20 flex-shrink-0 flex-col items-center justify-center rounded-lg border-2 border-emce-mid bg-white text-center shadow-emce ring-4 ring-white">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-emce-mid-muted">
                  {startMon}
                </span>
                <span className="text-3xl font-extrabold leading-none text-emce-text">
                  {startDay}
                </span>
                <span className="mt-0.5 text-[10px] font-bold text-emce-text-sec">
                  {startYear}
                </span>
              </div>
              <div className="flex-1">
                <Badge variant="default" className="mb-2 text-[10px] uppercase tracking-wide">
                  Campus drive
                </Badge>
                <h1 className="text-2xl font-extrabold leading-tight text-emce-text sm:text-3xl">
                  {drive.title}
                </h1>
                <p className="mt-1 text-sm text-emce-text-sec">
                  Hosted by{" "}
                  <Link
                    href={`/company/${drive.company.slug}`}
                    className="inline-flex items-center gap-1.5 font-bold text-emce-dark hover:underline"
                  >
                    <Avatar src={drive.company.logoUrl} name={drive.company.name} size="sm" />
                    {drive.company.name}
                  </Link>
                  {" "}at{" "}
                  <strong className="text-emce-text">{drive.institution}</strong>
                  {drive.city && <>, {drive.city}</>}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1 rounded-md bg-emce-light-soft px-2.5 py-1 font-bold text-emce-darkest">
                    📅 {dateRange}
                  </span>
                  {drive.maxCandidates && (
                    <span className="rounded-md bg-emce-light-soft px-2.5 py-1 text-emce-text-sec">
                      Up to {drive.maxCandidates} candidates
                    </span>
                  )}
                  <Badge
                    variant={
                      drive.status === "OPEN" || drive.status === "IN_PROGRESS" ? "success"
                      : drive.status === "COMPLETED" ? "outline"
                      : "warning"
                    }
                  >
                    {drive.status.replace("_", " ")}
                  </Badge>
                </div>
              </div>
            </Card>
          </div>
        </header>

        <section className="container max-w-4xl py-8 space-y-6">
          {drive.description && (
            <Card>
              <h2 className="text-section text-emce-text">About this drive</h2>
              <div
                className="prose prose-sm mt-3 max-w-none text-body text-emce-text"
                dangerouslySetInnerHTML={{ __html: htmlOrFallback(drive.description) }}
              />
            </Card>
          )}

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-section text-emce-text">Roles open at this drive</h2>
              <span className="text-hint text-emce-text-sec">
                {drive.jobs.length} {drive.jobs.length === 1 ? "role" : "roles"}
              </span>
            </div>
            {drive.jobs.length === 0 ? (
              <p className="mt-3 text-sm text-emce-text-sec">
                Roles will be linked here closer to the drive date.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-emce-border">
                {drive.jobs.map(({ job }) => (
                  <li key={job.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/job/${job.slug}`}
                        className="block font-bold text-emce-text hover:underline"
                      >
                        {job.title}
                      </Link>
                      <p className="text-hint text-emce-text-sec">
                        {job.locations[0] ?? drive.city ?? "On campus"} · {job.workMode.toLowerCase()} · {job.employmentType.toLowerCase()}
                      </p>
                    </div>
                    {job.status === "OPEN" ? (
                      <Button asChild size="sm">
                        <Link href={`/job/${job.slug}`}>Apply →</Link>
                      </Button>
                    ) : (
                      <Badge variant="outline">{job.status}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {(drive.contactName || drive.contactEmail || drive.contactPhone) && (
            <Card>
              <h2 className="text-section text-emce-text">Drive coordinator</h2>
              <p className="mt-2 text-sm text-emce-text">
                {drive.contactName && <strong>{drive.contactName}</strong>}
                {drive.contactName && (drive.contactEmail || drive.contactPhone) && " · "}
                {drive.contactEmail && (
                  <a
                    href={`mailto:${drive.contactEmail}`}
                    className="font-bold text-emce-dark hover:underline"
                  >
                    {drive.contactEmail}
                  </a>
                )}
                {drive.contactEmail && drive.contactPhone && " · "}
                {drive.contactPhone && (
                  <a
                    href={`tel:${drive.contactPhone}`}
                    className="font-bold text-emce-dark hover:underline"
                  >
                    {drive.contactPhone}
                  </a>
                )}
              </p>
            </Card>
          )}
        </section>
      </article>
      <SiteFooter />
    </>
  );
}
