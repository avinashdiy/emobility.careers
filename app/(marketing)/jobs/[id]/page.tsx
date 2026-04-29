import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { applyToJob, saveJob } from "@/server/jobs/actions";
import { ReportJobButton } from "@/components/jobs/ReportJobButton";
import { jobPostingJsonLd } from "@/lib/seo/job-schema";
import { breadcrumbJsonLd } from "@/lib/seo/schemas";
import { env } from "@/lib/env";
import { formatSalaryRange, relativeTime } from "@/lib/utils";
import { MapPin, Briefcase, Building2 } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const job = await db.jobPosting.findUnique({
    where: { id },
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
  const url = `${env.NEXT_PUBLIC_APP_URL}/jobs/${id}`;
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
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const job = await db.jobPosting.findUnique({
    where: { id },
    include: {
      company: true,
      evDomains: { include: { evDomain: true } },
      skills: { include: { skill: true } },
    },
  });
  if (!job) notFound();
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
    where: { id },
    data: { viewsCount: { increment: 1 } },
  }).catch(() => {});

  const session = await auth();
  let alreadyApplied = false;
  if (session?.user && session.user.role === "CANDIDATE") {
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (profile) {
      const existing = await db.application.findUnique({
        where: { jobId_candidateId: { jobId: id, candidateId: profile.id } },
      });
      alreadyApplied = !!existing;
    }
  }

  // JSON-LD JobPosting schema (Google for Jobs spec) + breadcrumb trail.
  // Two scripts on a page is fully spec-compliant; Google merges them.
  const jsonLd = jobPostingJsonLd(job);
  const breadcrumbLd = breadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "Jobs", href: "/jobs" },
    { name: job.company.name, href: `/company/${job.company.slug}` },
    { name: job.title, href: `/jobs/${job.id}` },
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
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="default">{job.profileMode}</Badge>
              <Badge variant="default">{job.seniorityLevel}</Badge>
              <Badge variant="default">{job.employmentType.replace("_", " ")}</Badge>
              {!job.salaryHidden && (job.salaryMin || job.salaryMax) && (
                <Badge variant="success">
                  {formatSalaryRange(
                    job.salaryMin ? Number(job.salaryMin) : null,
                    job.salaryMax ? Number(job.salaryMax) : null,
                    job.salaryCurrency,
                  )}
                </Badge>
              )}
              {job.evDomains.map((d) => (
                <Badge key={d.evDomain.slug} variant="success">{d.evDomain.name}</Badge>
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
          <Card className="p-6">
            <h3 className="text-section text-emce-text">Apply</h3>
            {alreadyApplied ? (
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
                  <Link href={`/signin?next=/jobs/${job.id}`}>Sign in to apply</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/signup?role=CANDIDATE&next=/jobs/${job.id}`}>Create candidate account</Link>
                </Button>
              </div>
            ) : session.user.role === "CANDIDATE" ? (
              <form action={applyToJob} className="mt-3 space-y-3">
                <input type="hidden" name="jobId" value={job.id} />
                <Textarea
                  name="coverLetter"
                  rows={4}
                  placeholder="Optional cover letter / why you're a great fit"
                  maxLength={4000}
                />
                <Button type="submit" className="w-full" size="lg">Apply now →</Button>
              </form>
            ) : (
              <p className="mt-3 text-hint text-emce-text-sec">
                Sign in as a candidate to apply.
              </p>
            )}
          </Card>

          {job.skills.length > 0 && (
            <Card className="p-6">
              <h3 className="text-section text-emce-text">Required skills</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {job.skills.map((s) => (
                  <Badge key={s.skill.id} variant="default">{s.skill.name}</Badge>
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

          <div className="pt-2 text-center">
            <ReportJobButton jobId={job.id} />
          </div>
        </aside>
      </div>
    </div>
  );
}
