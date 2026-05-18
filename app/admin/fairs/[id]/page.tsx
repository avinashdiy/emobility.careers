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
import { AdminShell } from "@/components/layout/admin-shell";
import { InviteCompaniesPanel } from "@/components/recruitment-drives/InviteCompaniesPanel";
import { FairImageUploader } from "@/components/recruitment-drives/FairImageUploader";
import { FairAnalyticsWidget } from "@/components/recruitment-drives/FairAnalyticsWidget";
import { TracksEditor } from "@/components/recruitment-drives/TracksEditor";
import { ContactAndFaqEditor } from "@/components/recruitment-drives/ContactAndFaqEditor";
import { PartnersEditor } from "@/components/recruitment-drives/PartnersEditor";
import { SpeakersEditor } from "@/components/recruitment-drives/SpeakersEditor";
import { HeroAndPitchEditor } from "@/components/recruitment-drives/HeroAndPitchEditor";
import { getFairAnalytics } from "@/lib/recruitment-drive-analytics";
import {
  setRecruitmentDriveStatus as _setRecruitmentDriveStatus,
  removeCompanyFromDrive as _removeCompanyFromDrive,
  toggleDriveFeatured as _toggleDriveFeatured,
} from "@/server/recruitment-drives/actions";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Recruitment drive · admin" };
export const dynamic = "force-dynamic";

async function setRecruitmentDriveStatus(formData: FormData): Promise<void> {
  "use server";
  await _setRecruitmentDriveStatus(formData);
}
async function removeCompanyFromDrive(formData: FormData): Promise<void> {
  "use server";
  await _removeCompanyFromDrive(formData);
}
async function toggleDriveFeatured(formData: FormData): Promise<void> {
  "use server";
  await _toggleDriveFeatured(formData);
}

export default async function AdminFairDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;

  const drive = await db.recruitmentDrive.findUnique({
    where: { id },
    include: {
      participatingCompanies: {
        orderBy: [{ status: "asc" }, { invitedAt: "asc" }],
        include: {
          company: {
            select: { id: true, slug: true, name: true, logoUrl: true },
          },
          _count: { select: { driveJobs: true } },
        },
      },
      createdBy: { select: { name: true, email: true } },
      // F1 + F4 — tracks list (for the TracksEditor) and the
      // contact + faq columns (for the ContactAndFaqEditor). All
      // pulled in the same round-trip so the page renders in one
      // shot.
      tracks: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { _count: { select: { jobs: true } } },
      },
      // Marketing additions — event partners + speakers panel.
      // Both ordered by the admin's chosen sortOrder so re-renders
      // are stable.
      eventPartners: {
        orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      },
      speakers: {
        orderBy: [{ role: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!drive) notFound();

  // Surface an at-a-glance funnel — useful when the fair is OPEN
  // and the admin wants to know if companies are confirming.
  const inviteCount = drive.participatingCompanies.filter((p) => p.status === "INVITED").length;
  const confirmedCount = drive.participatingCompanies.filter((p) => p.status === "CONFIRMED").length;
  const withdrawnCount = drive.participatingCompanies.filter((p) => p.status === "WITHDRAWN").length;

  // Companies the admin can still invite — verified employers not
  // already on the drive. We pull a window (top 200 by name); for
  // production you'd want server-side search. We pre-build the
  // "already on" set so the picker filters cleanly.
  const onIds = new Set(drive.participatingCompanies.map((p) => p.companyId));
  // Pull invite-eligible companies + per-fair analytics + currently-
  // enrolled candidates in parallel so the admin page doesn't add
  // a serial round-trip on top of the existing query.
  const [candidates, analytics, enrolledCandidates, enrolledCount] = await Promise.all([
    db.company.findMany({
      where: { verificationStatus: "VERIFIED" },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, slug: true, logoUrl: true },
    }),
    getFairAnalytics(drive.id),
    // Pull enrolled candidates — most recent first, capped at 200
    // for the in-page table; pagination ships when we cross that.
    db.recruitmentDriveRegistration.findMany({
      where: { driveId: drive.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        candidate: {
          select: {
            id: true,
            slug: true,
            firstName: true,
            lastName: true,
            headline: true,
            profilePhotoUrl: true,
            user: { select: { email: true } },
          },
        },
      },
    }),
    db.recruitmentDriveRegistration.count({ where: { driveId: drive.id } }),
  ]);
  const eligibleCandidates = candidates.filter((c) => !onIds.has(c.id));

  return (
    <AdminShell>
      <div className="container max-w-5xl space-y-6 py-6 md:py-8">
        <div>
          <Link href="/admin/fairs" className="text-hint text-emce-dark hover:underline">
            ← All drives
          </Link>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <h1 className="text-dashboard text-emce-text">{drive.title}</h1>
            <Badge variant={drive.status === "IN_PROGRESS" ? "success" : drive.status === "DRAFT" ? "outline" : "default"}>
              {drive.status.replace(/_/g, " ").toLowerCase()}
            </Badge>
          </div>
          <p className="text-hint text-emce-text-sec">
            📍 {drive.city}
            {drive.state ? `, ${drive.state}` : ""} ·{" "}
            {drive.startsAt.toLocaleDateString("en-IN", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · created by {drive.createdBy.name ?? drive.createdBy.email}{" "}
            {relativeTime(drive.createdAt)}
          </p>
          {/* Day-of + pre-fair quick links */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/fairs/${drive.id}/edit`}>
                ✏️ Edit base fields
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/fairs/${drive.id}/check-in`}>
                🪪 Check-in scanner
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/fairs/${drive.id}/roster`}>
                📥 Import roster (CSV)
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/fairs/${drive.id}/slots`}>
                📅 Interview slots
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/fairs/${drive.slug}`} target="_blank" rel="noopener noreferrer">
                ↗ Public page
              </Link>
            </Button>
          </div>
        </div>

        {/* Hero / banner uploader */}
        <Card className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-section text-emce-text">Imagery</h2>
            <div className="flex items-center gap-2">
              {drive.featuredAt && (
                <Badge variant="success" size="sm">⭐ Featured</Badge>
              )}
              <form action={toggleDriveFeatured}>
                <input type="hidden" name="driveId" value={drive.id} />
                <Button type="submit" variant="outline" size="sm">
                  {drive.featuredAt ? "Unfeature" : "Feature on /pulse + home"}
                </Button>
              </form>
            </div>
          </div>
          <p className="mt-1 text-hint text-emce-text-sec">
            Banner shows in the /fairs grid; hero is the full-bleed background
            on the public landing. Both are auto-cropped centre.
          </p>
          <div className="mt-3">
            <FairImageUploader
              driveId={drive.id}
              bannerUrl={drive.bannerImageUrl}
              heroUrl={drive.heroImageUrl}
            />
          </div>
        </Card>

        {/* Lifecycle controls */}
        <Card className="p-4">
          <h2 className="text-section text-emce-text">Lifecycle</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Transitions: DRAFT → OPEN → IN_PROGRESS → CLOSED. CANCELLED is a
            dead-end any state can hop to.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {drive.status === "DRAFT" && (
              <form action={setRecruitmentDriveStatus}>
                <input type="hidden" name="driveId" value={drive.id} />
                <input type="hidden" name="status" value="OPEN" />
                <Button type="submit" size="sm">
                  Publish &amp; open registration →
                </Button>
              </form>
            )}
            {drive.status === "OPEN" && (
              <form action={setRecruitmentDriveStatus}>
                <input type="hidden" name="driveId" value={drive.id} />
                <input type="hidden" name="status" value="IN_PROGRESS" />
                <Button type="submit" size="sm">
                  Mark live now
                </Button>
              </form>
            )}
            {(drive.status === "OPEN" || drive.status === "IN_PROGRESS") && (
              <form action={setRecruitmentDriveStatus}>
                <input type="hidden" name="driveId" value={drive.id} />
                <input type="hidden" name="status" value="CLOSED" />
                <ConfirmSubmit
                  variant="ghost"
                  size="sm"
                  confirm="Close this drive? The public landing keeps the recap section but apply CTAs go away."
                >
                  Close drive
                </ConfirmSubmit>
              </form>
            )}
            {drive.status !== "CLOSED" && drive.status !== "CANCELLED" && (
              <form action={setRecruitmentDriveStatus}>
                <input type="hidden" name="driveId" value={drive.id} />
                <input type="hidden" name="status" value="CANCELLED" />
                <ConfirmSubmit
                  variant="ghost"
                  size="sm"
                  confirm="Cancel this drive? The public landing 404s for everyone (including SEO crawlers)."
                >
                  Cancel
                </ConfirmSubmit>
              </form>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/fairs/${drive.slug}`}>View public page →</Link>
            </Button>
          </div>
        </Card>

        {/* Participating companies */}
        <Card className="p-4">
          <h2 className="text-section text-emce-text">Participating companies</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            {confirmedCount} confirmed · {inviteCount} pending invitations
            {withdrawnCount > 0 && <> · {withdrawnCount} withdrawn</>}
          </p>

          {drive.participatingCompanies.length > 0 && (
            <ul className="mt-3 space-y-2">
              {drive.participatingCompanies.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-emce-border bg-white p-3"
                >
                  <Avatar src={p.company.logoUrl} name={p.company.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/company/${p.company.slug}`}
                      className="block truncate font-bold text-emce-text hover:underline"
                    >
                      {p.company.name}
                    </Link>
                    <p className="text-hint text-emce-text-muted">
                      {p.boothLabel ? `📍 ${p.boothLabel} · ` : ""}
                      {p._count.driveJobs} role{p._count.driveJobs === 1 ? "" : "s"} attached
                      {p.confirmedAt ? <> · confirmed {relativeTime(p.confirmedAt)}</> : <> · invited {relativeTime(p.invitedAt)}</>}
                    </p>
                  </div>
                  <ParticipationStatus status={p.status} />
                  {p.status !== "WITHDRAWN" && (
                    <form action={removeCompanyFromDrive}>
                      <input type="hidden" name="participationId" value={p.id} />
                      <ConfirmSubmit
                        variant="ghost"
                        size="sm"
                        confirm={`Remove ${p.company.name} from this drive? Their jobs detach automatically; existing applications stay tagged for reporting.`}
                      >
                        Remove
                      </ConfirmSubmit>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 border-t border-emce-border pt-4">
            <InviteCompaniesPanel
              driveId={drive.id}
              candidates={eligibleCandidates}
            />
          </div>
        </Card>

        {/* F1 — Industry tracks. Admin defines the track list here;
            recruiters then pick from those tracks when attaching a
            job to their booth. Public fair page renders matching
            filter chips. */}
        <TracksEditor driveId={drive.id} tracks={drive.tracks} />

        {/* F4 — Primary contact + FAQ for the public fair page.
            Both are admin-curated; both surface only when set. */}
        <ContactAndFaqEditor
          driveId={drive.id}
          initialContactName={drive.primaryContactName}
          initialContactPhone={drive.primaryContactPhone}
          initialContactEmail={drive.primaryContactEmail}
          initialFaq={Array.isArray(drive.faq) ? (drive.faq as { q: string; a: string }[]) : []}
        />

        {/* Marketing-grade additions — partners panel + speakers
            panel + hero stat targets + pitch blocks. All admin-
            curated; each renders on the public page only when set. */}
        <PartnersEditor driveId={drive.id} partners={drive.eventPartners} />
        <SpeakersEditor driveId={drive.id} speakers={drive.speakers} />
        <HeroAndPitchEditor
          driveId={drive.id}
          initialHeroCandidates={drive.heroStatCandidatesTarget}
          initialHeroCompanies={drive.heroStatCompaniesTarget}
          initialHeroPositions={drive.heroStatPositionsTarget}
          initialHiringPartnersPitch={
            Array.isArray(drive.pitchForHiringPartners)
              ? (drive.pitchForHiringPartners as { heading: string; body: string }[])
              : []
          }
          initialCandidatesPitch={
            Array.isArray(drive.pitchForCandidates)
              ? (drive.pitchForCandidates as { heading: string; body: string }[])
              : []
          }
        />

        {/* High-level totals — three big numbers above the
            full-fat analytics widget so the admin sees the
            headline before scrolling into the funnel. */}
        <Card className="p-4">
          <h2 className="text-section text-emce-text">At a glance</h2>
          <div className="mt-2 grid grid-cols-3 gap-3 text-center">
            <Stat label="Companies" value={drive.participatingCount} />
            <Stat label="Roles" value={drive.jobsCount} />
            <Stat label="Applications" value={drive.applicationsCount} />
          </div>
        </Card>

        {/* Detailed analytics — funnel, daily applies sparkline,
            top roles by applications. */}
        <FairAnalyticsWidget data={analytics} />

        {/* Enrolled candidates — the per-drive list of who has
            registered, with check-in status. Top 200 newest by
            default; the per-candidate row links into the public
            profile so admins can browse before the fair. */}
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-section text-emce-text">
              Enrolled candidates ({enrolledCount.toLocaleString("en-IN")})
            </h2>
            <span className="text-hint text-emce-text-sec">
              {enrolledCount > 200 && (
                <>Showing the most-recent 200. Use the roster CSV exporter (coming soon) for the full list.</>
              )}
            </span>
          </div>
          {enrolledCandidates.length === 0 ? (
            <p className="mt-3 text-hint text-emce-text-muted">
              No candidate registrations yet. As soon as candidates click
              &ldquo;Register for this fair&rdquo; on the public page, they&apos;ll
              show up here.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-emce-border">
              {enrolledCandidates.map((r) => {
                const name = [r.candidate.firstName, r.candidate.lastName]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Avatar
                      src={r.candidate.profilePhotoUrl}
                      name={name}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/${r.candidate.slug}`}
                        className="font-bold text-emce-text hover:underline"
                      >
                        {name || "Unnamed candidate"}
                      </Link>
                      {r.candidate.headline && (
                        <p className="line-clamp-1 text-hint text-emce-text-sec">
                          {r.candidate.headline}
                        </p>
                      )}
                      <p className="text-hint text-emce-text-muted">
                        {r.candidate.user?.email ?? "no email"} · code{" "}
                        <code className="font-mono">{r.checkInCode}</code> ·{" "}
                        {r.source} · registered {relativeTime(r.createdAt)}
                      </p>
                    </div>
                    <Badge
                      variant={
                        r.status === "CHECKED_IN"
                          ? "success"
                          : r.status === "NO_SHOW"
                            ? "warning"
                            : r.status === "CANCELLED"
                              ? "outline"
                              : "default"
                      }
                      size="sm"
                    >
                      {r.status.replace("_", " ").toLowerCase()}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

function ParticipationStatus({ status }: { status: string }) {
  if (status === "CONFIRMED") return <Badge variant="success" size="sm">Confirmed</Badge>;
  if (status === "INVITED") return <Badge variant="warning" size="sm">Pending</Badge>;
  return <Badge variant="outline" size="sm">Withdrawn</Badge>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-emce-border bg-emce-light-soft/40 p-3">
      <p className="text-2xl font-extrabold text-emce-darkest">{value}</p>
      <p className="text-hint text-emce-text-muted">{label}</p>
    </div>
  );
}
