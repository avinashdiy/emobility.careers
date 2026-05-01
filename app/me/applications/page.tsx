import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { getCandidateApplicationStats } from "@/lib/applications-stats";
import { ApplicationTracker } from "@/components/candidate/ApplicationTracker";
import {
  JobTrackerBoard,
  type TrackerApplication,
  type TrackerSavedJob,
} from "@/components/candidate/JobTrackerBoard";
import {
  JobTrackerTimeline,
  type TimelineEvent,
} from "@/components/candidate/JobTrackerTimeline";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "My applications" };

const VIEWS = [
  { value: "board", label: "Kanban" },
  { value: "timeline", label: "Timeline" },
] as const;
type View = (typeof VIEWS)[number]["value"];

export default async function MyApplications({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; view?: View }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/applications");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");

  const sp = await searchParams;
  const view: View = sp.view === "timeline" ? "timeline" : "board";

  // Pull everything in parallel — applications + saved jobs + stats +
  // (for timeline) StageHistory rows. The kanban needs the candidate's
  // own private notes as a single string per application; the
  // timeline needs the StageHistory + the application's appliedAt as
  // an "applied" event.
  const [applications, saved, stats, history, privateNotes] = await Promise.all([
    db.application.findMany({
      where: { candidateId: profile.id },
      orderBy: { appliedAt: "desc" },
      include: {
        job: {
          include: { company: { select: { name: true, slug: true, logoUrl: true } } },
        },
      },
    }),
    db.savedJob.findMany({
      where: { candidateId: profile.id },
      orderBy: { createdAt: "desc" },
      include: {
        job: {
          include: { company: { select: { name: true, slug: true, logoUrl: true } } },
        },
      },
    }),
    getCandidateApplicationStats(profile.id),
    view === "timeline"
      ? db.stageHistory.findMany({
          where: {
            application: { candidateId: profile.id },
          },
          orderBy: { at: "desc" },
          take: 100,
          include: {
            application: {
              select: {
                id: true,
                job: {
                  include: {
                    company: { select: { name: true, logoUrl: true } },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    // Private notes — the candidate's own ApplicationNote rows. We
    // join them in client-side here so each kanban card carries the
    // string directly.
    db.applicationNote.findMany({
      where: {
        authorId: session.user.id,
        visibility: "PRIVATE",
        application: { candidateId: profile.id },
      },
      select: { applicationId: true, body: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Pre-filter: hide saved jobs the candidate has already applied to,
  // so they don't appear in BOTH the Saved column and the Applied
  // column. (They're still saved in the DB; we just don't render
  // duplicates.)
  const appliedJobIds = new Set(applications.map((a) => a.job.id));
  const savedNotApplied = saved.filter((s) => !appliedJobIds.has(s.job.id));

  // Build the latest-private-note-per-application map. Most recent
  // wins (already ordered desc above).
  const noteByApp = new Map<string, string>();
  for (const n of privateNotes) {
    if (!noteByApp.has(n.applicationId)) noteByApp.set(n.applicationId, n.body);
  }

  const kanbanApps: TrackerApplication[] = applications.map((a) => ({
    id: a.id,
    stage: a.stage,
    appliedAt: a.appliedAt.toISOString(),
    matchScore: a.matchScore,
    privateNote: noteByApp.get(a.id) ?? null,
    job: {
      id: a.job.id,
      slug: a.job.slug,
      title: a.job.title,
      company: {
        name: a.job.company.name,
        slug: a.job.company.slug,
        logoUrl: a.job.company.logoUrl,
      },
    },
  }));
  const kanbanSaved: TrackerSavedJob[] = savedNotApplied.map((s) => ({
    jobId: s.jobId,
    savedAt: s.createdAt.toISOString(),
    job: {
      id: s.job.id,
      slug: s.job.slug,
      title: s.job.title,
      company: {
        name: s.job.company.name,
        slug: s.job.company.slug,
        logoUrl: s.job.company.logoUrl,
      },
    },
  }));

  // Timeline events. Synthesise an "applied" event from each
  // Application.appliedAt because the StageHistory rows usually
  // don't include the initial APPLIED row (the AS-IS data has them
  // for transitions only).
  const timelineEvents: TimelineEvent[] = view === "timeline" ? [
    ...applications.map((a) => ({
      id: `app:${a.id}`,
      at: a.appliedAt,
      kind: "applied",
      fromStage: null,
      toStage: "APPLIED",
      byCandidate: true,
      job: {
        id: a.job.id,
        slug: a.job.slug,
        title: a.job.title,
        company: { name: a.job.company.name, logoUrl: a.job.company.logoUrl },
      },
    })),
    ...history.map((h) => ({
      id: h.id,
      at: h.at,
      kind: h.toStage === "WITHDRAWN" ? "withdrawn" : "stage_change",
      fromStage: h.fromStage,
      toStage: h.toStage,
      // We don't have a clean "did the candidate trigger this"
      // signal — the only candidate-driven transition is to
      // WITHDRAWN, so use that as the heuristic.
      byCandidate: h.toStage === "WITHDRAWN",
      job: {
        id: h.application.job.id,
        slug: h.application.job.slug,
        title: h.application.job.title,
        company: {
          name: h.application.job.company.name,
          logoUrl: h.application.job.company.logoUrl,
        },
      },
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()) : [];

  const totalCards = applications.length + savedNotApplied.length;

  return (
    <div className="container max-w-6xl space-y-6 py-10">
      <PageHeader
        title="My applications"
        subtitle={`${applications.length} application${applications.length === 1 ? "" : "s"} · ${savedNotApplied.length} saved`}
      />

      {applications.length > 0 && <ApplicationTracker stats={stats} />}

      {sp.notice && (
        <div className="rounded-md bg-emce-light-soft p-3 text-sm text-emce-dark">
          {sp.notice}
        </div>
      )}

      {/* View toggle — keeps the URL queryable so a recruiter glance at
          a candidate's bookmark survives a page reload. */}
      <div className="flex items-center gap-1 rounded-md border border-emce-border p-1">
        {VIEWS.map((v) => (
          <Link
            key={v.value}
            href={`/me/applications?view=${v.value}`}
            className={`flex-1 rounded px-3 py-1.5 text-center text-xs font-bold ${
              v.value === view
                ? "bg-emce-light-soft text-emce-darkest"
                : "text-emce-text-sec hover:text-emce-text"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      {totalCards === 0 ? (
        <EmptyState
          icon="📨"
          title="No applications or saved jobs yet"
          body="Browse jobs and save the interesting ones — they'll show up here in the Saved column."
          action={
            <Button asChild>
              <Link href="/jobs">Find jobs →</Link>
            </Button>
          }
        />
      ) : view === "board" ? (
        <JobTrackerBoard applications={kanbanApps} saved={kanbanSaved} />
      ) : (
        <JobTrackerTimeline events={timelineEvents} />
      )}
    </div>
  );
}
