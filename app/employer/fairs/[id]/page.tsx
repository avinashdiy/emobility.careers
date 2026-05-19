import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { EmployerShell } from "@/components/layout/employer-shell";
import { BoothEditor } from "@/components/recruitment-drives/BoothEditor";
import { AttachJobForm } from "@/components/recruitment-drives/AttachJobForm";
import {
  acceptDriveInvite as _acceptDriveInvite,
  declineDriveInvite as _declineDriveInvite,
  detachJobFromDrive as _detachJobFromDrive,
} from "@/server/recruitment-drives/actions";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Recruitment drive · booth" };
export const dynamic = "force-dynamic";

// Page-level form-action shims (same pattern as the team module —
// underlying actions return FormState, page forms need void).
async function acceptDriveInvite(formData: FormData): Promise<void> {
  "use server";
  await _acceptDriveInvite(formData);
}
async function declineDriveInvite(formData: FormData): Promise<void> {
  "use server";
  await _declineDriveInvite(formData);
}
async function detachJobFromDrive(formData: FormData): Promise<void> {
  "use server";
  await _detachJobFromDrive(formData);
}

/**
 * Recruiter view of one recruitment drive: edit booth, attach
 * jobs, see all applicants who came through this fair (across all
 * the company's jobs at the fair).
 *
 * Layout:
 *
 *   1. Drive overview header — title, dates, venue, status.
 *   2. Booth editor — booth label, "what we're looking for" pitch.
 *      Disabled until invitation is CONFIRMED.
 *   3. Jobs at this fair — list of attached JobPostings with
 *      attach/detach affordance + optional challenge selector.
 *   4. Applicants — cross-job queue filtered by this drive id.
 *      Counts per stage so the recruiter sees the funnel at a
 *      glance. Each row links into the existing job's ATS
 *      filtered to the same fair.
 */
export default async function EmployerFairDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect(`/signin?next=/employer/fairs`);
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    select: { companyId: true },
  });
  if (!employer?.companyId) redirect("/employer");

  const { id } = await params;

  const part = await db.recruitmentDriveCompany.findUnique({
    where: {
      driveId_companyId: { driveId: id, companyId: employer.companyId },
    },
    include: {
      drive: {
        select: {
          id: true,
          slug: true,
          title: true,
          city: true,
          state: true,
          venueName: true,
          venueAddress: true,
          startsAt: true,
          endsAt: true,
          status: true,
          // F1 — tracks available on this fair (for the AttachJobForm
          // picker). Sorted by the admin's defined sortOrder.
          tracks: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: { id: true, name: true },
          },
        },
      },
    },
  });
  if (!part) {
    // The current company isn't on this fair — admin / employer
    // who clicked an invite that no longer applies. Bounce home.
    redirect("/employer/fairs");
  }

  // Pull jobs the company has attached + jobs they could attach
  // (their OPEN jobs not already on this fair). Single round-trip
  // each.
  const [attached, available, applications] = await Promise.all([
    db.recruitmentDriveJob.findMany({
      where: { driveId: id, companyId: employer.companyId },
      orderBy: [{ sortOrder: "asc" }, { attachedAt: "desc" }],
      include: {
        job: {
          select: {
            id: true,
            slug: true,
            title: true,
            status: true,
            appliesCount: true,
          },
        },
        challengeAssessment: {
          select: { id: true, title: true, type: true, durationMins: true },
        },
      },
    }),
    db.jobPosting.findMany({
      where: {
        companyId: employer.companyId,
        status: "OPEN",
        recruitmentDriveJobs: { none: { driveId: id } },
      },
      orderBy: { publishedAt: "desc" },
      take: 50,
      // Prisma doesn't allow `select` + `include` together. We use
      // `select` to project the columns we need + the relation
      // selection inline.
      select: {
        id: true,
        title: true,
        assessments: {
          select: { id: true, title: true, type: true, durationMins: true },
        },
      },
    }),
    // Only fetch applicants once the company is CONFIRMED — for
    // INVITED / WITHDRAWN states we don't show the queue.
    part.status === "CONFIRMED"
      ? db.application.findMany({
          where: {
            recruitmentDriveId: id,
            job: { companyId: employer.companyId },
          },
          orderBy: { appliedAt: "desc" },
          take: 200,
          include: {
            candidate: {
              select: {
                slug: true,
                firstName: true,
                lastName: true,
                profilePhotoUrl: true,
                headline: true,
              },
            },
            job: { select: { id: true, slug: true, title: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  // Funnel-stage counts for the at-a-glance summary above the row list.
  const stageCounts: Record<string, number> = {};
  for (const a of applications) {
    stageCounts[a.stage] = (stageCounts[a.stage] ?? 0) + 1;
  }

  const isPending = part.status === "INVITED";
  const isConfirmed = part.status === "CONFIRMED";

  return (
    <EmployerShell>
      <div className="container max-w-5xl space-y-6 py-6 md:py-8">
        <div>
          <Link
            href="/employer/fairs"
            className="text-hint text-emce-dark hover:underline"
          >
            ← All recruitment drives
          </Link>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <h1 className="text-dashboard text-emce-text md:text-3xl">
              {part.drive.title}
            </h1>
            <DriveStatusBadge status={part.drive.status} />
          </div>
          <p className="text-hint text-emce-text-sec">
            📍 {part.drive.venueName ? `${part.drive.venueName}, ` : ""}
            {part.drive.city}
            {part.drive.state ? `, ${part.drive.state}` : ""} ·{" "}
            {part.drive.startsAt.toLocaleDateString("en-IN", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          {/* Quick-link row — pre-event match list + booth interview
              slots. Only shown when the company is CONFIRMED on the
              fair (otherwise these routes 403). */}
          {part.status === "CONFIRMED" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/employer/fairs/${part.drive.id}/matches`}
                className="inline-flex h-9 items-center rounded-md border border-emce-border bg-white px-3 text-xs font-bold text-emce-dark hover:bg-emce-light-soft"
              >
                🎯 Pre-event matches
              </Link>
              <Link
                href={`/employer/fairs/${part.drive.id}/slots`}
                className="inline-flex h-9 items-center rounded-md border border-emce-border bg-white px-3 text-xs font-bold text-emce-dark hover:bg-emce-light-soft"
              >
                📅 Interview slots
              </Link>
            </div>
          )}
        </div>

        {/* Pending invitation banner */}
        {isPending && (
          <Card className="border-emce-orange/40 bg-emce-orange-light/30 p-4">
            <h2 className="text-section text-emce-text">
              You&apos;re invited to this drive
            </h2>
            <p className="mt-1 text-hint text-emce-text-sec">
              Confirm to set up your booth. After confirmation you can attach
              jobs, edit your pitch, and start receiving applications.
            </p>
            <div className="mt-3 flex gap-2">
              <form action={acceptDriveInvite}>
                <input type="hidden" name="driveId" value={part.drive.id} />
                <Button type="submit">Confirm participation</Button>
              </form>
              <form action={declineDriveInvite}>
                <input type="hidden" name="driveId" value={part.drive.id} />
                <ConfirmSubmit
                  variant="ghost"
                  confirm="Decline this invitation? Admin can re-invite you later if your team changes its mind."
                >
                  Decline
                </ConfirmSubmit>
              </form>
            </div>
          </Card>
        )}

        {/* Booth editor */}
        {isConfirmed && (
          <BoothEditor
            driveId={part.drive.id}
            boothLabel={part.boothLabel}
            aboutAtFair={part.aboutAtFair}
          />
        )}

        {/* Jobs */}
        {isConfirmed && (
          <Card className="p-5">
            <h2 className="text-section text-emce-text">Roles at this fair</h2>
            <p className="mt-1 text-hint text-emce-text-sec">
              {attached.length} attached. Adding a screening challenge
              auto-gates the ATS — recruiters can&apos;t move candidates past
              ASSESSMENT until they pass.
            </p>

            {attached.length > 0 && (
              <ul className="mt-3 space-y-2">
                {attached.map((dj) => (
                  <li
                    key={dj.id}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-emce-border bg-white p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/employer/jobs/${dj.job.id}/ats?fair=${part.drive.id}`}
                        className="font-bold text-emce-text hover:underline"
                      >
                        {dj.job.title}
                      </Link>
                      <p className="text-hint text-emce-text-sec">
                        {dj.job.appliesCount} total applications ·{" "}
                        {dj.challengeAssessment ? (
                          <span className="text-emce-dark">
                            🧪 challenge: {dj.challengeAssessment.title}
                          </span>
                        ) : (
                          <span className="text-emce-text-muted">no screening challenge</span>
                        )}
                      </p>
                    </div>
                    <form action={detachJobFromDrive}>
                      <input type="hidden" name="driveId" value={part.drive.id} />
                      <input type="hidden" name="jobId" value={dj.job.id} />
                      <ConfirmSubmit
                        variant="ghost"
                        size="sm"
                        confirm={`Remove "${dj.job.title}" from this fair? Existing applications stay tagged with the fair so historical reporting still works.`}
                      >
                        Remove
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {available.length > 0 ? (
              <div className="mt-4 border-t border-emce-border pt-4">
                <AttachJobForm
                  driveId={part.drive.id}
                  tracks={part.drive.tracks}
                  candidates={available.map((j) => ({
                    id: j.id,
                    title: j.title,
                    assessments: j.assessments.map((a) => ({
                      id: a.id,
                      title: a.title,
                      type: a.type,
                      durationMins: a.durationMins,
                    })),
                  }))}
                />
              </div>
            ) : attached.length === 0 ? (
              <p className="mt-4 text-hint text-emce-text-muted">
                No OPEN jobs found at your company. Create a job first, then
                attach it here.
              </p>
            ) : null}
          </Card>
        )}

        {/* Applicants */}
        {isConfirmed && (
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-section text-emce-text">Applicants from this fair</h2>
              {applications.length > 0 && (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`/api/employer/fairs/${part.drive.id}/applicants.csv`}
                    download
                  >
                    ⬇ Export CSV
                  </a>
                </Button>
              )}
            </div>
            {applications.length === 0 ? (
              <p className="mt-2 text-hint text-emce-text-muted">
                No applications yet. Once candidates apply via /fairs/{part.drive.slug},
                they&apos;ll appear here.
              </p>
            ) : (
              <>
                <p className="mt-1 text-hint text-emce-text-sec">
                  {applications.length} {applications.length === 1 ? "applicant" : "applicants"} across all your roles at this fair.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 border-b border-emce-border pb-3">
                  {Object.entries(stageCounts).map(([stage, count]) => (
                    <Badge key={stage} variant="default" size="sm">
                      {stage.toLowerCase()}: {count}
                    </Badge>
                  ))}
                </div>
                <ul className="mt-3 space-y-2">
                  {applications.slice(0, 50).map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 rounded-md border border-emce-border bg-white p-3"
                    >
                      <Avatar
                        src={a.candidate.profilePhotoUrl}
                        name={`${a.candidate.firstName} ${a.candidate.lastName ?? ""}`.trim()}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/${a.candidate.slug}`}
                          className="block font-bold text-emce-text hover:underline"
                        >
                          {a.candidate.firstName} {a.candidate.lastName ?? ""}
                        </Link>
                        <p className="text-hint text-emce-text-sec line-clamp-1">
                          For{" "}
                          <Link
                            href={`/employer/jobs/${a.job.id}/ats?fair=${part.drive.id}`}
                            className="hover:underline"
                          >
                            {a.job.title}
                          </Link>{" "}
                          · {relativeTime(a.appliedAt)}
                        </p>
                      </div>
                      <Badge variant="default" size="sm">
                        {a.stage.toLowerCase()}
                      </Badge>
                    </li>
                  ))}
                </ul>
                {applications.length > 50 && (
                  <p className="mt-3 text-center text-hint text-emce-text-muted">
                    Showing first 50. Open the per-job ATS for the full pipeline.
                  </p>
                )}
              </>
            )}
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          {/* Booth-day tools — visible to confirmed booths only.
              Scanner = booth-day code lookup; pre-screen = pre-event
              candidate list with filters. */}
          {part.status === "CONFIRMED" && (
            <>
              <Button asChild size="sm">
                <Link href={`/employer/fairs/${part.drive.id}/scan`}>📷 Booth scanner</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/employer/fairs/${part.drive.id}/candidates`}>👥 Pre-screen candidates</Link>
              </Button>
            </>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`/fairs/${part.drive.slug}`}>View public fair page →</Link>
          </Button>
        </div>
      </div>
    </EmployerShell>
  );
}

function DriveStatusBadge({ status }: { status: string }) {
  if (status === "IN_PROGRESS") return <Badge variant="success">Live now</Badge>;
  if (status === "OPEN") return <Badge variant="default">Open</Badge>;
  if (status === "CLOSED") return <Badge variant="outline">Closed</Badge>;
  if (status === "CANCELLED") return <Badge variant="danger">Cancelled</Badge>;
  return <Badge variant="default">{status}</Badge>;
}
