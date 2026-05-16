import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { SubmitButton } from "@/components/ui/submit-button";
import { AIProgress } from "@/components/ui/ai-progress";
import { Badge } from "@/components/ui/badge";
// Wave B #17 — AI applicant summary
import { ensureApplicationSummary, refreshApplicationSummary } from "@/server/ai-summary/actions";
import { Avatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { EmployerShell } from "@/components/layout/employer-shell";
import { moveStage, addNote, rateApplication } from "@/server/ats/actions";
import { scheduleInterview, cancelInterview } from "@/server/interviews/actions";
import { startThreadFromApplication } from "@/server/messaging/actions";
import { assignAssessment } from "@/server/assessments/actions";
import { getResumeDownloadUrl } from "@/server/candidates/actions";
import { ApplicationStage } from "@prisma/client";
import { relativeTime } from "@/lib/utils";

/**
 * Order applications appear in the sibling sidebar — same flow as
 * the kanban board, then REJECTED / WITHDRAWN appended so they're
 * still reachable for review but de-emphasised.
 */
const STAGE_ORDER: ApplicationStage[] = [
  "APPLIED",
  "SCREENED",
  "SHORTLISTED",
  "ASSESSMENT",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
];

const STAGE_PILL: Record<ApplicationStage, string> = {
  APPLIED: "bg-emce-light-soft text-emce-dark",
  SCREENED: "bg-blue-50 text-blue-800",
  SHORTLISTED: "bg-emce-light-soft text-[#1e5a32]",
  ASSESSMENT: "bg-emce-orange-light text-[#8a4a1a]",
  INTERVIEW: "bg-amber-50 text-amber-900",
  OFFER: "bg-emerald-50 text-emerald-900",
  HIRED: "bg-emerald-100 text-emerald-900",
  REJECTED: "bg-rose-50 text-rose-800",
  WITHDRAWN: "bg-slate-100 text-slate-700",
};

export default async function ApplicationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());

  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const application = await db.application.findUnique({
    where: { id },
    include: {
      job: { select: { id: true, title: true, companyId: true } },
      candidate: {
        include: {
          experiences: { orderBy: { startDate: "desc" }, take: 5 },
          skills: { include: { skill: true } },
          evDomains: { include: { evDomain: true } },
          // Pull the User.phone as a fallback — older signups stored
          // phone on User (via SMS-OTP onboarding) and never copied it
          // onto CandidateProfile.phone. Render whichever is set.
          user: { select: { phone: true, email: true } },
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
      history: {
        orderBy: { at: "desc" },
        take: 10,
        include: { byUser: { select: { name: true } } },
      },
      interviews: { orderBy: { scheduledAt: "desc" } },
      messageThread: { select: { id: true } },
      assessmentAttempts: {
        orderBy: { startedAt: "desc" },
        include: { assessment: { select: { title: true, type: true, passingScore: true } } },
      },
    },
  });
  if (!application) notFound();
  if (session.user.role !== "ADMIN" && application.job.companyId !== employer.companyId) redirect("/403");

  const c = application.candidate;
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
  const resumeHref = c.resumeUrl ? await getResumeDownloadUrl({ applicationId: application.id }) : null;

  // Wave B #17 — lazy-generate the AI applicant summary the first
  // time a recruiter opens the application. Bounded latency via
  // gpt-4o-mini; we await inline (the page is server-rendered
  // anyway). Subsequent opens hit the cached row.
  let aiSummary = application.aiSummary;
  let aiSummaryAt = application.aiSummaryAt;
  if (!aiSummary) {
    const r = await ensureApplicationSummary(application.id);
    if (r.summary) {
      aiSummary = r.summary;
      aiSummaryAt = new Date();
    }
  }

  const jobAssessments = await db.assessment.findMany({
    where: { jobId: application.job.id },
    select: { id: true, title: true, type: true, passingScore: true },
  });

  // Sibling applications for the same job — drives the left sidebar
  // and the prev/next nav at the top of the main column. Capped at
  // 500 to keep the page snappy on very large pipelines; an enterprise
  // recruiter reviewing #501 should narrow first via the ATS board.
  const siblings = await db.application.findMany({
    where: { jobId: application.job.id },
    orderBy: [{ appliedAt: "asc" }],
    take: 500,
    select: {
      id: true,
      stage: true,
      matchScore: true,
      candidate: {
        select: {
          firstName: true,
          lastName: true,
          profilePhotoUrl: true,
          isDIYguruVerified: true,
          headline: true,
        },
      },
    },
  });
  // Stable, stage-ordered list used for prev/next navigation. Inside
  // a stage we preserve appliedAt order (oldest application first)
  // so review marches forward the same way the kanban renders.
  const orderedSiblings = STAGE_ORDER.flatMap((stage) =>
    siblings.filter((s) => s.stage === stage),
  );
  const currentIndex = orderedSiblings.findIndex((s) => s.id === application.id);
  const prevSibling =
    currentIndex > 0 ? orderedSiblings[currentIndex - 1] : null;
  const nextSibling =
    currentIndex >= 0 && currentIndex < orderedSiblings.length - 1
      ? orderedSiblings[currentIndex + 1]
      : null;
  const groupedSiblings = STAGE_ORDER.map((stage) => ({
    stage,
    apps: siblings.filter((s) => s.stage === stage),
  })).filter((g) => g.apps.length > 0);

  return (
    <EmployerShell>
      <div className="container max-w-7xl py-6">
        {/* Two-column shell — left sidebar lists every applicant on
            this job so the recruiter can step through them without
            bouncing back to the kanban board. The sidebar is hidden
            below lg; on mobile we fall back to the prev/next buttons
            in the main column. */}
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <Link
                href={`/employer/jobs/${application.job.id}/ats`}
                className="inline-flex items-center text-hint font-bold text-emce-text-sec hover:text-emce-dark"
              >
                ← Back to ATS
              </Link>
              <p className="mt-3 text-hint font-bold uppercase tracking-wide text-emce-text-muted">
                {application.job.title}
              </p>
              <p className="text-hint text-emce-text-muted">
                {siblings.length} applicant{siblings.length === 1 ? "" : "s"}
              </p>
              <nav className="mt-3 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
                {groupedSiblings.map(({ stage, apps }) => (
                  <div key={stage} className="mb-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STAGE_PILL[stage]}`}>
                        {stage}
                      </span>
                      <span className="text-hint text-emce-text-muted">{apps.length}</span>
                    </div>
                    <ul className="space-y-0.5">
                      {apps.map((s) => {
                        const isCurrent = s.id === application.id;
                        const sName = [s.candidate.firstName, s.candidate.lastName]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <li key={s.id}>
                            <Link
                              href={`/employer/applications/${s.id}`}
                              aria-current={isCurrent ? "page" : undefined}
                              className={`flex items-center gap-2 rounded-md p-1.5 text-sm transition ${
                                isCurrent
                                  ? "bg-emce-light-soft font-bold text-emce-darkest ring-1 ring-emce-mid"
                                  : "text-emce-text hover:bg-emce-light-soft/60"
                              }`}
                            >
                              <Avatar
                                src={s.candidate.profilePhotoUrl}
                                name={sName}
                                size="sm"
                              />
                              <span className="min-w-0 flex-1 truncate">{sName}</span>
                              {s.candidate.isDIYguruVerified && (
                                <span title="DIYguru verified" className="text-[10px]">⭐</span>
                              )}
                              {s.matchScore != null && (
                                <span className="text-[10px] font-bold text-emce-dark">
                                  {Math.round(s.matchScore * 100)}%
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </div>
          </aside>

          <div className="min-w-0">
            {/* Header: mobile back-link + prev/next sibling navigation.
                On desktop the back-link lives in the sidebar; we keep
                it inline here as well so mobile users have a way out. */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/employer/jobs/${application.job.id}/ats`}
                className="text-hint font-bold text-emce-text-sec hover:text-emce-dark lg:hidden"
              >
                ← Back to ATS
              </Link>
              <div className="ml-auto flex items-center gap-2">
                {prevSibling ? (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/employer/applications/${prevSibling.id}`}
                      aria-label="Previous candidate"
                    >
                      ← Prev
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    ← Prev
                  </Button>
                )}
                <span className="text-hint text-emce-text-muted">
                  {currentIndex >= 0
                    ? `${currentIndex + 1} / ${orderedSiblings.length}`
                    : "—"}
                </span>
                {nextSibling ? (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/employer/applications/${nextSibling.id}`}
                      aria-label="Next candidate"
                    >
                      Next →
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Next →
                  </Button>
                )}
                <Badge variant="default">{application.stage}</Badge>
              </div>
            </div>

        <Card className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex items-start gap-3 sm:contents">
              <Avatar src={c.profilePhotoUrl} name={fullName} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-extrabold text-emce-text sm:text-2xl">{fullName}</h1>
                  {c.isDIYguruVerified && <Badge variant="verified">⭐ DIYguru</Badge>}
                  <Badge variant="default">{c.profileMode}</Badge>
                </div>
                {c.headline && <p className="mt-1 text-emce-text-sec">{c.headline}</p>}
                <p className="mt-2 text-hint text-emce-text-muted">
                  {c.location ?? "—"} · {(c.totalExperienceMonths / 12).toFixed(1)} yrs · Applied {relativeTime(application.appliedAt)}
                </p>
                {application.matchScore != null && (
                  <div className="mt-3">
                    <Badge variant="success">{Math.round(application.matchScore * 100)}% match</Badge>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-row flex-wrap gap-2 sm:flex-col">
              <Button asChild variant="outline" size="sm">
                <Link href={`/${c.slug}`}>Full profile →</Link>
              </Button>
              {resumeHref && (
                <Button asChild variant="ghost" size="sm">
                  <a href={resumeHref} target="_blank" rel="noopener noreferrer">View resume</a>
                </Button>
              )}
            </div>
          </div>

          {/* Wave B #17 — AI applicant summary. Lazily generated on
              first open; recruiter can refresh after a stage change
              or once the candidate's profile shows new content. */}
          {aiSummary && (
            <div
              className="mt-4 rounded-md border border-emce-mid/40 bg-emce-light-soft/40 p-3"
              role="region"
              aria-live="polite"
              aria-label="AI candidate summary"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emce-mid-muted">
                  ✨ AI summary
                  {aiSummaryAt && (
                    <span className="ml-2 font-normal normal-case text-emce-text-muted">
                      {relativeTime(aiSummaryAt)}
                    </span>
                  )}
                </p>
                <form action={refreshApplicationSummary} className="flex flex-col items-end gap-2">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <SubmitButton variant="ghost" size="sm" pendingLabel="…">
                    Refresh
                  </SubmitButton>
                  <AIProgress
                    steps={["Reading profile", "Synthesising", "Writing"]}
                    stepMs={1500}
                  />
                </form>
              </div>
              <p className="mt-2 text-body text-emce-text">{aiSummary}</p>
            </div>
          )}

          {/*
            Contact row — unconditional. The candidate has applied to
            this employer's job, which IS the consent signal (matches
            lib/profile-visibility.ts → canSeeContact, where an
            employer with an application relationship always sees
            contact). We deliberately ignore `c.contactVisibility`
            here because applying THROUGH the platform is itself the
            "yes, share my contact" act. Candidates who don't want a
            specific recruiter to see their phone shouldn't apply to
            that job. Phone + email fall back to the User record (some
            legacy candidates onboarded via SMS-OTP have phone there
            but not on CandidateProfile).
          */}
          {(c.phone || c.user?.phone || c.email || c.user?.email) && (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-emce-border pt-3 text-sm">
              <span className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
                Contact
              </span>
              {(c.email || c.user?.email) && (
                <a
                  href={`mailto:${c.email ?? c.user?.email}`}
                  className="font-semibold text-emce-dark hover:underline"
                >
                  ✉️ {c.email ?? c.user?.email}
                </a>
              )}
              {(c.phone || c.user?.phone) && (
                <a
                  href={`tel:${c.phone ?? c.user?.phone}`}
                  className="font-semibold text-emce-dark hover:underline"
                >
                  📞 {c.phone ?? c.user?.phone}
                </a>
              )}
              <span className="text-hint text-emce-text-muted">
                Shared because the candidate applied to this role.
              </span>
            </div>
          )}
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {application.coverLetter && (
              <Card className="p-6">
                <h2 className="text-section text-emce-text">Cover letter</h2>
                <p className="mt-2 whitespace-pre-line text-body text-emce-text-sec">{application.coverLetter}</p>
              </Card>
            )}

            {resumeHref && (
              <Card className="p-6">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-section text-emce-text">Resume</h2>
                  <a
                    href={resumeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-hint font-bold text-emce-dark hover:underline"
                  >
                    Open in new tab →
                  </a>
                </div>
                <iframe
                  src={resumeHref}
                  title="Resume preview"
                  className="h-[640px] w-full rounded-md border border-emce-border bg-emce-light-soft"
                />
              </Card>
            )}

            {c.experiences.length > 0 && (
              <Card className="p-6">
                <h2 className="text-section text-emce-text">Experience</h2>
                <ul className="mt-3 space-y-3">
                  {c.experiences.map((e) => (
                    <li key={e.id} className="border-l-2 border-emce-mid pl-3">
                      <div className="font-bold text-emce-text">{e.title}</div>
                      <div className="text-hint text-emce-text-sec">
                        {e.company} · {e.startDate.toISOString().slice(0, 7)} – {e.current ? "Present" : (e.endDate?.toISOString().slice(0, 7) ?? "?")}
                      </div>
                      {e.description && <p className="mt-1 text-body text-emce-text-sec">{e.description}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card className="p-6">
              <h2 className="text-section text-emce-text">Notes ({application.notes.length})</h2>
              <form action={addNote} className="mt-3">
                <input type="hidden" name="applicationId" value={application.id} />
                <Textarea name="body" rows={3} placeholder="Add a note for your team..." required maxLength={4000} />
                <div className="mt-2 flex items-center justify-between">
                  <NativeSelect name="visibility" defaultValue="TEAM" className="w-32">
                    <option value="TEAM">Team</option>
                    <option value="PRIVATE">Private</option>
                  </NativeSelect>
                  <Button type="submit" size="sm">Add note</Button>
                </div>
              </form>
              <ul className="mt-4 space-y-3">
                {application.notes.map((n) => (
                  <li key={n.id} className="rounded-md border border-emce-border p-3">
                    <div className="flex items-center justify-between text-hint text-emce-text-muted">
                      <span><strong>{n.author.name ?? "Recruiter"}</strong> · {relativeTime(n.createdAt)}</span>
                      <Badge variant="outline">{n.visibility}</Badge>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-body text-emce-text">{n.body}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card className="p-6">
              <h3 className="text-section text-emce-text">Move stage</h3>
              <form action={moveStage} className="mt-3 space-y-2">
                <input type="hidden" name="applicationId" value={application.id} />
                <NativeSelect name="toStage" defaultValue={application.stage}>
                  {Object.values(ApplicationStage).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </NativeSelect>
                <Textarea name="reason" rows={2} placeholder="Optional reason / message" />
                <Button type="submit" className="w-full">Apply</Button>
              </form>
            </Card>

            <Card className="p-6">
              <h3 className="text-section text-emce-text">Schedule interview</h3>
              <form action={scheduleInterview} className="mt-3 space-y-2">
                <input type="hidden" name="applicationId" value={application.id} />
                <input
                  type="datetime-local"
                  name="scheduledAt"
                  required
                  className="h-10 w-full rounded-md border-[1.5px] border-emce-border bg-white px-3 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    name="durationMins"
                    min="15"
                    max="180"
                    defaultValue={45}
                    className="h-10 rounded-md border-[1.5px] border-emce-border bg-white px-3 text-sm"
                  />
                  <NativeSelect name="mode" defaultValue="VIDEO">
                    <option value="VIDEO">Video</option>
                    <option value="PHONE">Phone</option>
                    <option value="ONSITE">On-site</option>
                  </NativeSelect>
                </div>
                <input
                  name="meetingUrl"
                  type="url"
                  placeholder="https://meet.google.com/..."
                  className="h-10 w-full rounded-md border-[1.5px] border-emce-border bg-white px-3 text-sm"
                />
                <input
                  name="location"
                  placeholder="Or address"
                  className="h-10 w-full rounded-md border-[1.5px] border-emce-border bg-white px-3 text-sm"
                />
                <Button type="submit" className="w-full">Schedule + send invite</Button>
              </form>

              {application.interviews.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-emce-border pt-3 text-hint">
                  {application.interviews.map((iv) => (
                    <li key={iv.id} className="flex items-center justify-between gap-2">
                      <span className="text-emce-text-sec">
                        <strong className="text-emce-text">{iv.scheduledAt.toLocaleString()}</strong>
                        {" · "}{iv.mode}{" · "}{iv.durationMins}m
                        {iv.status !== "SCHEDULED" && <Badge variant="outline" className="ml-2">{iv.status}</Badge>}
                      </span>
                      {iv.status === "SCHEDULED" && (
                        <form action={cancelInterview}>
                          <input type="hidden" name="id" value={iv.id} />
                          <ConfirmSubmit
                            confirm={`Cancel the ${iv.scheduledAt.toLocaleString()} interview? Candidate will be notified.`}
                            size="sm"
                            variant="ghost"
                          >
                            Cancel
                          </ConfirmSubmit>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="text-section text-emce-text">Message candidate</h3>
              {application.messageThread ? (
                <Button asChild variant="outline" className="mt-3 w-full">
                  <Link href={`/employer/messages/${application.messageThread.id}`}>Open conversation →</Link>
                </Button>
              ) : (
                <form action={startThreadFromApplication} className="mt-3">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <Button type="submit" className="w-full">Start conversation</Button>
                </form>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="text-section text-emce-text">Assessments</h3>
              {jobAssessments.length === 0 ? (
                <p className="mt-2 text-hint text-emce-text-sec">
                  No assessments configured for this job.{" "}
                  <Link href={`/employer/jobs/${application.job.id}/assessments`} className="font-bold text-emce-dark hover:underline">Create one →</Link>
                </p>
              ) : (
                <>
                  <form action={assignAssessment} className="mt-3 space-y-2">
                    <input type="hidden" name="applicationId" value={application.id} />
                    <NativeSelect name="assessmentId" required defaultValue="">
                      <option value="" disabled>Select assessment…</option>
                      {jobAssessments.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title} ({a.type}, pass at {a.passingScore}%)
                        </option>
                      ))}
                    </NativeSelect>
                    <SubmitButton className="w-full" pendingLabel="Assigning…">
                      Assign &amp; notify candidate
                    </SubmitButton>
                  </form>

                  {application.assessmentAttempts.length > 0 && (
                    <ul className="mt-4 space-y-1 border-t border-emce-border pt-3 text-hint">
                      {application.assessmentAttempts.map((at) => (
                        <li key={at.id}>
                          <strong className="text-emce-text">{at.assessment.title}</strong>
                          {at.submittedAt ? (
                            <Badge variant={at.passed ? "success" : "warning"} className="ml-2">
                              {at.score ?? 0}% · {at.passed ? "passed" : "didn't pass"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="ml-2">In progress</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="text-section text-emce-text">Rate</h3>
              <div className="mt-3 flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <form key={n} action={rateApplication}>
                    <input type="hidden" name="applicationId" value={application.id} />
                    <input type="hidden" name="rating" value={n} />
                    <button
                      type="submit"
                      className={`text-xl ${(application.rating ?? 0) >= n ? "text-emce-orange-deep" : "text-emce-text-muted hover:text-emce-orange-deep"}`}
                      aria-label={`Rate ${n}`}
                    >
                      ★
                    </button>
                  </form>
                ))}
              </div>
            </Card>

            {c.skills.length > 0 && (
              <Card className="p-6">
                <h3 className="text-section text-emce-text">Skills</h3>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.skills.map((s) => (
                    <Badge key={s.skill.id} variant="default">{s.skill.name}</Badge>
                  ))}
                </div>
              </Card>
            )}

            <Card className="p-6">
              <h3 className="text-section text-emce-text">Stage history</h3>
              <ul className="mt-3 space-y-2 text-hint">
                {application.history.map((h) => (
                  <li key={h.id} className="text-emce-text-sec">
                    <strong>{h.toStage}</strong>
                    {h.fromStage && ` (from ${h.fromStage})`}
                    <span className="ml-2 text-emce-text-muted">{relativeTime(h.at)}</span>
                    {h.byUser?.name && <span className="ml-1 text-emce-text-muted">· {h.byUser.name}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
          </div>
        </div>
      </div>
    </EmployerShell>
  );
}
