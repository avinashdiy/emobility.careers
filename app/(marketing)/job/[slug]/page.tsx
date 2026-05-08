import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShareDropdown } from "@/components/social/ShareDropdown";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { applyToJob, saveJob } from "@/server/jobs/actions";
import { getJobResponseStats } from "@/lib/sla";
import { ResponseTimePill } from "@/components/recruiter/ResponseTimePill";
import { ReportJobButton } from "@/components/jobs/ReportJobButton";
import { MatchScoreCard } from "@/components/jobs/MatchScoreCard";
import { getOrComputeCandidateMatch } from "@/server/matching/candidate-match";
import { COMPLETENESS_THRESHOLDS } from "@/lib/profile-completeness";
import { jobPostingJsonLd } from "@/lib/seo/job-schema";
import { breadcrumbJsonLd } from "@/lib/seo/schemas";
import { env } from "@/lib/env";
import { formatSalaryRange, relativeTime } from "@/lib/utils";
import { MapPin, Briefcase, Building2 } from "lucide-react";

/**
 * Public single-job page. Canonical URL is `/job/{slug}` — slugs are
 * generated at job-create time as `${title}-${company-slug}` so they
 * are SEO-friendly + collision-safe across companies posting the
 * same role title. The legacy `/jobs/{id}` URL still works via a
 * 301 redirect at app/(marketing)/jobs/[id]/page.tsx so inbound
 * links from search engines and existing share threads don't 404.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const job = await db.jobPosting.findUnique({
    where: { slug },
    select: {
      title: true, description: true, status: true, locations: true,
      workMode: true, employmentType: true, company: { select: { name: true } },
    },
  });
  // Don't leak draft / closed jobs to crawlers.
  if (!job || job.status !== "OPEN") {
    return { title: "Job not found", robots: { index: false, follow: false } };
  }
  const fullTitle = `${job.title} at ${job.company.name}`;
  const cityPart = job.locations.length > 0 ? ` · ${job.locations.slice(0, 2).join(", ")}` : (job.workMode === "REMOTE" ? " · Remote" : "");
  const description = job.description.replace(/\s+/g, " ").slice(0, 200);
  const url = `${env.NEXT_PUBLIC_APP_URL}/job/${slug}`;
  return {
    title: `${fullTitle}${cityPart}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: fullTitle,
      description,
      siteName: "eMobility Careers",
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
    },
  };
}

export default async function PublicJobDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; fair?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  // Optional `?fair=<driveId>` carry-through. Set when the candidate
  // arrived from /fairs/[slug] — we pipe it into the apply form's
  // hidden input so the resulting Application is correctly tagged
  // with the recruitment-drive source. Validation happens server-
  // side in applyToJob; here we just trust-and-forward.
  const fairId = typeof sp.fair === "string" ? sp.fair : null;

  const job = await db.jobPosting.findUnique({
    where: { slug },
    include: {
      company: true,
      evDomains: { include: { evDomain: true } },
      skills: { include: { skill: true } },
    },
  });
  if (!job) {
    // Diagnostic log — emitted whenever a job-detail URL 404s. Lands
    // in the pino stream so /admin/operations or `docker compose logs
    // web` reveals the slug being missed (typically: a stale share
    // link, a renamed-then-renamed-back row, or a job that was
    // hard-deleted via the SQL console).
    logger.warn({ slug }, "[job-detail] 404 — slug not found in jobPosting");
    notFound();
  }
  // 404 if the parent company has been admin-banned (REJECTED).
  // Mirrors the gate on /company/[slug] so deep-links from old shares
  // / search-engine cache stop resolving to the company's content.
  if (job.company.verificationStatus === "REJECTED") {
    logger.warn(
      { slug, jobId: job.id, companyId: job.companyId, companyName: job.company.name },
      "[job-detail] 404 — parent company REJECTED",
    );
    notFound();
  }
  // DIYGURU_ONLY listings are reserved for verified students. We 404
  // for anyone else — that's strictly more private than redirecting
  // since the URL itself doesn't leak (and admins / employers viewing
  // their own job still see it via the employer console).
  if (job.audience === "DIYGURU_ONLY") {
    const session = await auth();
    let allow = false;
    if (session?.user) {
      if (session.user.role === "ADMIN") allow = true;
      else if (session.user.role === "EMPLOYER") {
        const employer = await db.employerProfile.findUnique({
          where: { userId: session.user.id },
          select: { companyId: true },
        });
        if (employer?.companyId === job.companyId) allow = true;
      } else {
        const profile = await db.candidateProfile.findUnique({
          where: { userId: session.user.id },
          select: { isDIYguruVerified: true },
        });
        if (profile?.isDIYguruVerified) allow = true;
      }
    } else {
      // Signed-out viewer hitting a DIYGURU_ONLY job — bounce to
      // /signin with `?next=` instead of 404. They might be a
      // verified DIYguru student who just hasn't logged in yet,
      // and a hard 404 would lose the click.
      redirect(`/signin?next=${encodeURIComponent(`/job/${slug}`)}`);
    }
    if (!allow) {
      logger.warn(
        { slug, jobId: job.id, audience: job.audience, viewerRole: session?.user?.role ?? "anon" },
        "[job-detail] 404 — DIYGURU_ONLY audience gate failed",
      );
      notFound();
    }
  }
  if (job.audience === "INVITE_ONLY") {
    // INVITE_ONLY is browsable only via the application URL someone has
    // already received. Same allow-list shape as DIYGURU_ONLY: ADMIN /
    // employer-of-company / candidate-with-existing-application.
    const session = await auth();
    let allow = false;
    if (session?.user) {
      if (session.user.role === "ADMIN") allow = true;
      else if (session.user.role === "EMPLOYER") {
        const employer = await db.employerProfile.findUnique({
          where: { userId: session.user.id },
          select: { companyId: true },
        });
        if (employer?.companyId === job.companyId) allow = true;
      } else {
        const profile = await db.candidateProfile.findUnique({
          where: { userId: session.user.id },
          select: { id: true },
        });
        if (profile) {
          const app = await db.application.findUnique({
            where: { jobId_candidateId: { jobId: job.id, candidateId: profile.id } },
            select: { id: true },
          });
          if (app) allow = true;
        }
      }
    } else {
      // Same nudge — sign-in first, then re-evaluate. A user who
      // received an invite link via email is signed-out by default
      // until they click through.
      redirect(`/signin?next=${encodeURIComponent(`/job/${slug}`)}`);
    }
    if (!allow) {
      logger.warn(
        { slug, jobId: job.id, audience: job.audience, viewerRole: session?.user?.role ?? "anon" },
        "[job-detail] 404 — INVITE_ONLY audience gate failed",
      );
      notFound();
    }
  }
  if (job.status !== "OPEN") {
    return (
      <div className="container max-w-2xl py-20 text-center">
        <h1 className="text-2xl font-extrabold text-emce-text">This role is no longer accepting applications</h1>
        <p className="mt-2 text-emce-text-sec">
          Browse{" "}
          <Link href="/jobs" className="font-bold text-emce-dark underline">
            similar jobs →
          </Link>
        </p>
      </div>
    );
  }

  // Track view (fire-and-forget)
  await db.jobPosting.update({
    where: { id: job.id },
    data: { viewsCount: { increment: 1 } },
  }).catch(() => {});

  // Recruiter response-time pill data — falls back to company-level
  // signal when the job itself is too new (see getJobResponseStats).
  const responseStats = await getJobResponseStats(job.id);

  const session = await auth();
  let alreadyApplied = false;
  // Cache the candidate's completeness so the apply CTA can reflect the
  // 90% gate without making the user click through to find out it'll
  // bounce them. The pct is also passed into the message so they know
  // exactly how far they are.
  let candidateCompleteness: number | null = null;
  // The match score panel — populated only for logged-in candidates with
  // a profile attached. We compute (or pull cached) once here so the
  // sidebar card and any inline references can share the same payload
  // without re-querying.
  let candidateMatch: Awaited<ReturnType<typeof getOrComputeCandidateMatch>> = null;
  if (session?.user && session.user.role === "CANDIDATE") {
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, profileCompleteness: true },
    });
    if (profile) {
      candidateCompleteness = profile.profileCompleteness;
      const existing = await db.application.findUnique({
        where: { jobId_candidateId: { jobId: job.id, candidateId: profile.id } },
      });
      alreadyApplied = !!existing;
      // Don't block the page on a slow embed call — race against a 4s
      // ceiling and fall through to "no match shown" if we miss it.
      // The next visit will hit the cache, so no permanent regression.
      candidateMatch = await Promise.race([
        getOrComputeCandidateMatch(profile.id, job.id),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
    }
  }

  // JSON-LD JobPosting schema (Google for Jobs spec) + breadcrumb trail.
  // Two scripts on a page is fully spec-compliant; Google merges them.
  const jsonLd = jobPostingJsonLd(job);
  const breadcrumbLd = breadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "Jobs", href: "/jobs" },
    { name: job.company.name, href: `/company/${job.company.slug}` },
    { name: job.title, href: `/job/${job.slug}` },
  ]);

  return (
    <div className="container max-w-4xl py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {sp.error && (
        <div className="mb-4 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">{sp.error}</div>
      )}

      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-md bg-emce-light-soft text-xl font-extrabold text-emce-dark">
            {job.company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={job.company.logoUrl} alt={job.company.name} className="h-full w-full object-cover" />
            ) : (
              job.company.name[0]?.toUpperCase()
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-emce-text md:text-3xl">{job.title}</h1>
            <Link href={`/company/${job.company.slug}`} className="text-sm font-bold text-emce-dark hover:underline">
              <Building2 className="mr-1 inline h-3.5 w-3.5" />
              {job.company.name}
            </Link>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-emce-text-sec">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {job.locations.join(", ") || "Remote"} · {job.workMode.toLowerCase()}
              </span>
              {(job.experienceMin != null || job.experienceMax != null) && (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="h-4 w-4" /> {job.experienceMin ?? 0}–{job.experienceMax ?? "+"} yrs
                </span>
              )}
            </div>
            {/* Compact-size badges so the meta row sits at LinkedIn-style
                density — the default pill size dominated the card on
                wide screens, especially when 5–7 badges stack here. */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {job.audience === "DIYGURU_ONLY" && (
                <Badge variant="verified" size="sm">
                  ⭐ DIYguru exclusive
                </Badge>
              )}
              <Badge variant="default" size="sm">{job.profileMode}</Badge>
              <Badge variant="default" size="sm">{job.seniorityLevel}</Badge>
              <Badge variant="default" size="sm">{job.employmentType.replace("_", " ")}</Badge>
              {/* Recruiter response-time signal — only renders when we
                  have ≥5 samples in the last 90 days. */}
              <ResponseTimePill stats={responseStats} />
              {!job.salaryHidden && (job.salaryMin || job.salaryMax) && (
                <Badge variant="success" size="sm">
                  {formatSalaryRange(
                    job.salaryMin ? Number(job.salaryMin) : null,
                    job.salaryMax ? Number(job.salaryMax) : null,
                    job.salaryCurrency,
                  )}
                </Badge>
              )}
              {job.evDomains.map((d) => (
                <Badge key={d.evDomain.slug} variant="success" size="sm">{d.evDomain.name}</Badge>
              ))}
            </div>
            {job.publishedAt && (
              <div className="mt-2 text-hint text-emce-text-muted">Posted {relativeTime(job.publishedAt)}</div>
            )}
          </div>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-6">
            <h2 className="text-section text-emce-text">About the role</h2>
            <p className="mt-2 whitespace-pre-line text-body text-emce-text-sec">{job.description}</p>
          </Card>
          {job.responsibilities && (
            <Card className="p-6">
              <h2 className="text-section text-emce-text">Responsibilities</h2>
              <p className="mt-2 whitespace-pre-line text-body text-emce-text-sec">{job.responsibilities}</p>
            </Card>
          )}
          {job.requirements && (
            <Card className="p-6">
              <h2 className="text-section text-emce-text">Requirements</h2>
              <p className="mt-2 whitespace-pre-line text-body text-emce-text-sec">{job.requirements}</p>
            </Card>
          )}
          {job.benefits && (
            <Card className="p-6">
              <h2 className="text-section text-emce-text">Benefits</h2>
              <p className="mt-2 whitespace-pre-line text-body text-emce-text-sec">{job.benefits}</p>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          {/* Match-score card — only for logged-in candidates with a
              profile, computed (or cache-hit) above. Lives at the top
              of the apply column so it answers "should I bother?"
              before the candidate scrolls to read responsibilities. */}
          {candidateMatch && <MatchScoreCard match={candidateMatch} />}

          <Card className="p-6">
            <h3 className="text-section text-emce-text">Apply</h3>
            {/* External-apply jobs: when the listing carries an
                applicationUrl, this site is acting purely as a
                discovery layer. We don't own the funnel — bounce the
                candidate straight out to the employer's career page,
                regardless of sign-in state. Skip the internal form. */}
            {job.applicationUrl ? (
              <div className="mt-3 space-y-2">
                <Button asChild className="w-full" size="lg">
                  <a
                    href={job.applicationUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    Apply on {job.company.name} →
                  </a>
                </Button>
                <p className="text-hint text-emce-text-sec">
                  Opens the employer&apos;s career page in a new tab.
                  Listings sourced from public career pages — apply
                  directly with the company.
                </p>
              </div>
            ) : alreadyApplied ? (
              <div className="mt-3">
                <Badge variant="success">✓ Applied</Badge>
                <p className="mt-2 text-hint text-emce-text-sec">
                  You&apos;ve already applied. Track this in{" "}
                  <Link href="/me/applications" className="font-bold text-emce-dark underline">my applications</Link>.
                </p>
              </div>
            ) : !session?.user ? (
              <div className="mt-3 space-y-2">
                <Button asChild className="w-full">
                  <Link href={`/signin?next=/job/${job.slug}`}>Sign in to apply</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/signup?role=CANDIDATE&next=/job/${job.slug}`}>Create candidate account</Link>
                </Button>
              </div>
            ) : session.user.role === "CANDIDATE" ? (
              candidateCompleteness !== null && candidateCompleteness < COMPLETENESS_THRESHOLDS.APPLY ? (
                // Hard gate — apply server action would redirect anyway,
                // but showing the locked state up-front avoids a useless
                // form submission round-trip. Threshold lives on
                // COMPLETENESS_THRESHOLDS so a future tweak is one
                // constant change.
                <div className="mt-3 space-y-2">
                  <div className="rounded-md border border-emce-orange bg-emce-orange-light p-3 text-sm">
                    <p className="font-bold text-emce-orange">
                      🔒 Complete your profile to apply
                    </p>
                    <p className="mt-1 text-emce-text">
                      Your profile is <strong>{candidateCompleteness}%</strong>. Reach{" "}
                      <strong>{COMPLETENESS_THRESHOLDS.APPLY}%</strong> and the apply button unlocks.
                    </p>
                  </div>
                  <Button asChild className="w-full" size="lg">
                    <Link href={`/me/profile?incomplete=apply&pct=${candidateCompleteness}&jobId=${job.id}`}>
                      Complete profile to apply →
                    </Link>
                  </Button>
                </div>
              ) : (
                <form action={applyToJob} className="mt-3 space-y-3">
                  <input type="hidden" name="jobId" value={job.id} />
                  {/* Carry the fair-attribution forward when the
                      candidate landed here from /fairs/[slug]. The
                      server action validates the driveId is real +
                      has this job attached before stamping the
                      Application row. */}
                  {fairId && (
                    <input type="hidden" name="recruitmentDriveId" value={fairId} />
                  )}
                  <Textarea
                    name="coverLetter"
                    rows={4}
                    placeholder="Optional cover letter / why you're a great fit"
                    maxLength={4000}
                  />
                  <Button type="submit" className="w-full" size="lg">Apply now →</Button>
                </form>
              )
            ) : (
              <p className="mt-3 text-hint text-emce-text-sec">
                Sign in as a candidate to apply.
              </p>
            )}
          </Card>

          {job.skills.length > 0 && (
            <Card className="p-6">
              <h3 className="text-section text-emce-text">Required skills</h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {job.skills.map((s) => (
                  <Badge key={s.skill.id} variant="default" size="sm">{s.skill.name}</Badge>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-6">
            <h3 className="text-section text-emce-text">About {job.company.name}</h3>
            {job.company.description && (
              <p className="mt-2 text-body text-emce-text-sec">{job.company.description}</p>
            )}
            <Link
              href={`/company/${job.company.slug}`}
              className="mt-3 inline-block text-hint font-bold text-emce-dark hover:underline"
            >
              View company →
            </Link>
          </Card>

          {session?.user?.role === "CANDIDATE" && !alreadyApplied && (
            <form action={saveJob}>
              <input type="hidden" name="jobId" value={job.id} />
              <Button type="submit" variant="outline" className="w-full">
                ☆ Save for later
              </Button>
            </form>
          )}

          {/* Share — full row of platform icons (LinkedIn / X /
              Facebook / WhatsApp / Email / Copy / Native). Renders
              for everyone (anon visitors too) since job pages are
              shareable signal regardless of session. */}
          <div className="border-t border-emce-border pt-3">
            <ShareDropdown
              url={`${env.NEXT_PUBLIC_APP_URL}/job/${job.slug}`}
              title={`${job.title} at ${job.company.name}`}
              description={`${job.company.name} is hiring a ${job.title}${job.locations[0] ? ` in ${job.locations[0]}` : ""} — apply on eMobility Careers.`}
              label="Share this job"
              className="w-full"
            />
          </div>

          <div className="pt-2 text-center">
            <ReportJobButton jobId={job.id} />
          </div>
        </aside>
      </div>
    </div>
  );
}
