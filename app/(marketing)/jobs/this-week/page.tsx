// /jobs/this-week — "EV jobs this week": openings at Indian EV employers, checked on the employer's
// own careers site and linked there (lib/ev-jobs-week, refreshed weekly by file), plus the newest
// open jobs posted on emobility.careers. Linked from the "EV Jobs 2027" guidebook (emobility.academy).

import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, BadgeCheck, BookOpen, MapPin } from "lucide-react";

import { JobCard } from "@/components/jobs/JobCard";
import { searchJobs } from "@/server/jobs/queries";
import { getViewerCountry } from "@/lib/viewer-country";
import { prewarmRates } from "@/lib/currency";
import { TRACK_LABEL, loadWeeklyJobs, type EvTrack, type WeeklyJob } from "@/lib/ev-jobs-week";

export const dynamic = "force-dynamic";

const GUIDE_URL = "https://emobility.academy/ev-jobs-guide";

export const metadata: Metadata = {
  title: "EV Jobs This Week in India — Verified Electric Vehicle Openings",
  description:
    "This week's electric vehicle job openings in India: battery, BMS, embedded, charging, EV technician and design roles, each checked on the employer's own careers site with a direct apply link.",
  alternates: { canonical: "/jobs/this-week" },
};

const TRACK_ORDER: EvTrack[] = ["technician", "battery", "embedded", "charging", "design", "business"];

function fmt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function ExternalJob({ job }: { job: WeeklyJob }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{job.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {job.company}
          <span aria-hidden> · </span>
          <MapPin className="mr-0.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
          {job.location}
        </p>
        <p className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full bg-muted px-2 py-0.5">{job.level}</span>
          <span className="rounded-full bg-muted px-2 py-0.5">{job.type}</span>
          {job.experience && <span className="rounded-full bg-muted px-2 py-0.5">{job.experience}</span>}
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">
            <BadgeCheck className="h-3 w-3" aria-hidden /> Checked {fmt(job.verifiedOn)}
          </span>
        </p>
      </div>
      <a
        href={job.applyUrl}
        target="_blank"
        rel="noopener nofollow"
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        Apply on {job.company.length > 22 ? "company site" : job.company} <ArrowUpRight className="h-4 w-4" aria-hidden />
      </a>
    </li>
  );
}

export default async function EvJobsThisWeekPage() {
  const [weekly, platform] = await Promise.all([
    loadWeeklyJobs(),
    searchJobs({ page: 1, pageSize: 9 }).catch(() => ({ jobs: [] as Awaited<ReturnType<typeof searchJobs>>["jobs"] })),
  ]);
  const viewerCountry = await getViewerCountry();
  await prewarmRates([viewerCountry, ...platform.jobs.map((j) => j.country)]);
  const jobs = weekly?.jobs ?? [];
  const byTrack = TRACK_ORDER.map((t) => ({ track: t, jobs: jobs.filter((j) => j.track === t) })).filter((g) => g.jobs.length);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <header className="rounded-2xl bg-gradient-to-br from-emerald-900 to-emerald-700 p-6 text-white sm:p-10">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-200">{weekly?.edition ?? "This week"}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">EV jobs this week in India</h1>
        <p className="mt-3 max-w-2xl text-emerald-50/90">
          Openings at Indian electric vehicle companies, checked on each employer&apos;s own careers site. Every link goes straight to the company&apos;s job page — no middlemen, no copied listings.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <a href={`${GUIDE_URL}?utm_source=emobility.careers&utm_medium=jobs-this-week`} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-semibold text-emerald-900 hover:bg-emerald-50">
            <BookOpen className="h-4 w-4" aria-hidden /> Free guide: EV Jobs 2027 (PDF)
          </a>
          <Link href="/jobs" className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-4 py-2 font-semibold text-white hover:bg-white/10">
            Browse all jobs on emobility.careers
          </Link>
        </div>
        {weekly?.updatedOn && <p className="mt-4 text-xs text-emerald-100/80">Updated {fmt(weekly.updatedOn)} · {jobs.length} openings · refreshed every week</p>}
      </header>

      {byTrack.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
          This week&apos;s list is being checked. Meanwhile, browse <Link href="/jobs" className="font-semibold underline">all open EV jobs</Link>.
        </p>
      ) : (
        <nav aria-label="Job tracks" className="mt-8 flex flex-wrap gap-2 text-sm">
          {byTrack.map((g) => (
            <a key={g.track} href={`#${g.track}`} className="rounded-full border border-border px-3 py-1.5 hover:bg-muted">
              {TRACK_LABEL[g.track]} ({g.jobs.length})
            </a>
          ))}
        </nav>
      )}

      {byTrack.map((g) => (
        <section key={g.track} id={g.track} className="mt-10 scroll-mt-24">
          <h2 className="text-xl font-bold text-foreground">{TRACK_LABEL[g.track]}</h2>
          <ul className="mt-4 space-y-3">
            {g.jobs.map((j) => (
              <ExternalJob key={j.applyUrl} job={j} />
            ))}
          </ul>
        </section>
      ))}

      {platform.jobs.length > 0 && (
        <section className="mt-14">
          <h2 className="text-xl font-bold text-foreground">Open on emobility.careers</h2>
          <p className="mt-1 text-sm text-muted-foreground">Posted directly by EV employers on this platform — apply with your emobility.careers profile.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {platform.jobs.map((j) => (
              <JobCard key={j.id} job={j} viewerCountry={viewerCountry} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-14 rounded-2xl border border-border bg-muted/40 p-6 sm:p-8">
        <h2 className="text-lg font-bold text-foreground">How this list works</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Each opening was open on the employer&apos;s own careers page on the date shown. Openings close often — if a link has expired, check the company&apos;s careers page for similar roles.</li>
          <li>Listings drop off three weeks after they were last checked.</li>
          <li>We never charge candidates and never ask for fees to apply. Report a suspicious listing to the employer directly.</li>
        </ul>
        <p className="mt-4 text-sm">
          Want the full map of 2027 EV roles, skills and the careers pages of 300+ Indian EV companies?{" "}
          <a href={GUIDE_URL} className="font-semibold text-primary underline">Get the free EV Jobs 2027 guidebook</a>.
        </p>
      </section>
    </main>
  );
}
