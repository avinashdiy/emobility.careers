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
import { PageHeader } from "@/components/ui/page-header";
import { TeamProfileEditor } from "@/components/teams/TeamProfileEditor";
import { BulkInvitePanel } from "@/components/teams/BulkInvitePanel";
import { TransferCaptaincyForm } from "@/components/teams/TransferCaptaincyForm";
import {
  submitTeamForVerification as _submitTeamForVerification,
  publishTeamPage as _publishTeamPage,
  hideTeamPage as _hideTeamPage,
  transferCaptaincy as _transferCaptaincy,
  revokeTeamInvite,
  removeTeamMember,
} from "@/server/competitions/team-actions";

// Page-level form actions only accept `() => Promise<void>`. The
// underlying actions return FormState (so client useActionState
// callers can read messages). We wrap with `void` shims here to
// satisfy Next.js's form-action typing without losing the action's
// own internal redirects + revalidates.
async function submitTeamForVerification(formData: FormData): Promise<void> {
  "use server";
  await _submitTeamForVerification(formData);
}
async function publishTeamPage(formData: FormData): Promise<void> {
  "use server";
  await _publishTeamPage(formData);
}
async function hideTeamPage(formData: FormData): Promise<void> {
  "use server";
  await _hideTeamPage(formData);
}
async function transferCaptaincy(formData: FormData): Promise<void> {
  "use server";
  await _transferCaptaincy(formData);
}
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Team dashboard" };
export const dynamic = "force-dynamic";

/**
 * Captain dashboard for a single team. Locked to the registration's
 * leaderUserId — non-captain members hit /me/teams to navigate to
 * a read-only roster view (separate page; not built in v1).
 *
 * Sections, top to bottom:
 *   1. Header with team name, status badges, captain action row
 *      (publish / hide / submit-for-verification)
 *   2. Submit-for-verification banner if UNVERIFIED + ready
 *   3. Profile editor (TeamProfileEditor)
 *   4. Members roster + BulkInvitePanel
 *   5. Submission status (link to submit page when stage is open)
 *
 * The dashboard is the "captain's home base" through the entire
 * competition lifecycle: pre-registration prep, member onboarding,
 * verification, submission, results.
 */
export default async function CaptainTeamDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/signin?next=/me/teams/${id}`);

  const team = await db.competitionRegistration.findUnique({
    where: { id },
    include: {
      competition: {
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          minTeamSize: true,
          maxTeamSize: true,
          registrationClosesAt: true,
          endsAt: true,
          resultsAt: true,
        },
      },
      members: {
        orderBy: [{ role: "asc" }, { invitedAt: "asc" }],
        include: {
          user: {
            select: {
              name: true,
              email: true,
              candidateProfile: {
                select: { slug: true, profilePhotoUrl: true, headline: true },
              },
            },
          },
        },
      },
      submissions: { include: { stage: true } },
    },
  });
  if (!team) notFound();
  if (team.leaderUserId !== session.user.id) {
    // Non-captain members get bounced to the read-only listing.
    // Future: a /me/teams/[id]/view page rendered for members.
    redirect("/me/teams");
  }

  const acceptedMembers = team.members.filter((m) => m.status === "ACCEPTED");
  const pendingInvites = team.members.filter((m) => m.status === "INVITED");
  const removedMembers = team.members.filter((m) => m.status === "REMOVED");
  const memberCount = acceptedMembers.length;
  const remainingSlots = Math.max(
    0,
    (team.competition.maxTeamSize ?? 50) - memberCount - pendingInvites.length,
  );

  // Verification readiness — same gate the server enforces, mirrored
  // here so the UI tells the captain WHY the button is disabled.
  const verificationReady = Boolean(
    team.institution && team.facultyAdvisor && team.facultyEmail,
  );

  // Hydrate `socialLinks` JSON to a typed shape for the editor prop.
  const socialLinks =
    team.socialLinks && typeof team.socialLinks === "object" && !Array.isArray(team.socialLinks)
      ? (team.socialLinks as {
          instagram?: string;
          linkedin?: string;
          website?: string;
          youtube?: string;
        })
      : null;

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <PageHeader
        title={team.teamName ?? "Untitled team"}
        subtitle={
          <>
            <Link href={`/competitions/${team.competition.slug}`} className="hover:underline">
              {team.competition.title}
            </Link>
            {team.externalEvent && <> · {team.externalEvent}</>}
            {team.institution && <> · {team.institution}</>}
          </>
        }
      />

      {/* Status row — verification + publish badges + share button */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <VerificationBadge status={team.verificationStatus} />
          <PublicPageBadge
            status={team.publicPageStatus}
            slug={team.teamSlug}
          />
          <span className="text-hint text-emce-text-muted">
            Registered {relativeTime(team.registeredAt)}
          </span>
          <span className="text-hint text-emce-text-muted">
            {memberCount} accepted · {pendingInvites.length} pending
          </span>
          <div className="ml-auto flex gap-2">
            {team.publicPageStatus === "PUBLISHED" && team.teamSlug && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/teams/${team.teamSlug}`}>View public page →</Link>
              </Button>
            )}
            {team.verificationStatus === "VERIFIED" &&
              team.publicPageStatus !== "PUBLISHED" && (
                <form action={publishTeamPage}>
                  <input type="hidden" name="teamId" value={team.id} />
                  <Button type="submit" size="sm">Publish public page</Button>
                </form>
              )}
            {team.publicPageStatus === "PUBLISHED" && (
              <form action={hideTeamPage}>
                <input type="hidden" name="teamId" value={team.id} />
                <ConfirmSubmit
                  variant="ghost"
                  size="sm"
                  confirm="Hide your public team page? It stops showing on /pulse and at /teams/[slug]. You can republish anytime."
                >
                  Hide page
                </ConfirmSubmit>
              </form>
            )}
          </div>
        </div>
      </Card>

      {/* Verification banner — only when UNVERIFIED or REJECTED */}
      {(team.verificationStatus === "UNVERIFIED" ||
        team.verificationStatus === "REJECTED") && (
        <Card className="border-emce-orange/40 bg-emce-orange-light/30 p-4">
          <h3 className="text-section text-emce-text">
            {team.verificationStatus === "REJECTED"
              ? "Verification rejected"
              : "Submit your team for verification"}
          </h3>
          {team.verificationStatus === "REJECTED" && team.verificationNote && (
            <p className="mt-1 text-sm text-emce-text">
              <strong>Admin note:</strong> {team.verificationNote}
            </p>
          )}
          <p className="mt-1 text-sm text-emce-text-sec">
            Verified teams can publish a public team page and are eligible for
            prize disbursement when results are announced. You can still
            register members and submit your prototype right now — verification
            only gates the public page and prize money.
          </p>
          {!verificationReady && (
            <p className="mt-2 text-hint text-emce-orange">
              Add your <strong>institution</strong>, <strong>faculty advisor name</strong>, and
              <strong> faculty email</strong> in the profile below before submitting.
            </p>
          )}
          <form action={submitTeamForVerification} className="mt-3">
            <input type="hidden" name="teamId" value={team.id} />
            <Button type="submit" size="sm" disabled={!verificationReady}>
              Submit for verification →
            </Button>
          </form>
        </Card>
      )}
      {team.verificationStatus === "PENDING_REVIEW" && (
        <Card className="border-emce-mid/30 bg-emce-light-soft/40 p-4">
          <p className="text-sm font-bold text-emce-darkest">
            ⏳ Awaiting admin review
          </p>
          <p className="mt-1 text-hint text-emce-text-sec">
            We&apos;ll notify you the moment a verifier acts on your submission.
            Most reviews complete in 1–3 business days.
          </p>
        </Card>
      )}

      {/* Members roster */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-section text-emce-text">
            Members ({memberCount}/{team.competition.maxTeamSize ?? "?"})
          </h2>
          <p className="text-hint text-emce-text-muted">
            Min team size: {team.competition.minTeamSize ?? 1}
          </p>
        </div>
        <ul className="mt-3 space-y-2">
          {acceptedMembers.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-emce-border bg-white p-3"
            >
              <Avatar
                src={m.user?.candidateProfile?.profilePhotoUrl ?? null}
                name={m.user?.name ?? m.invitedEmail ?? "?"}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  {m.user?.candidateProfile?.slug ? (
                    <Link
                      href={`/${m.user.candidateProfile.slug}`}
                      className="font-bold text-emce-text hover:underline"
                    >
                      {m.user?.name ?? m.invitedEmail}
                    </Link>
                  ) : (
                    <span className="font-bold text-emce-text">
                      {m.user?.name ?? m.invitedEmail}
                    </span>
                  )}
                  {m.role === "LEADER" && <Badge variant="success" size="sm">Captain</Badge>}
                  {m.positionTitle && (
                    <Badge variant="default" size="sm">{m.positionTitle}</Badge>
                  )}
                </div>
                {m.user?.candidateProfile?.headline && (
                  <p className="text-hint text-emce-text-sec line-clamp-1">
                    {m.user.candidateProfile.headline}
                  </p>
                )}
              </div>
              {m.role !== "LEADER" && (
                <form action={removeTeamMember}>
                  <input type="hidden" name="memberId" value={m.id} />
                  <ConfirmSubmit
                    variant="ghost"
                    size="sm"
                    confirm={`Remove ${m.user?.name ?? m.invitedEmail} from the team?`}
                  >
                    Remove
                  </ConfirmSubmit>
                </form>
              )}
            </li>
          ))}
        </ul>

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <>
            <p className="mt-5 text-hint font-bold uppercase tracking-wide text-emce-text-muted">
              Pending ({pendingInvites.length})
            </p>
            <ul className="mt-2 space-y-2">
              {pendingInvites.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-emce-border bg-emce-light-soft/30 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-emce-text">
                      {m.invitedEmail}
                      {m.user?.name && <span className="text-emce-text-muted"> · {m.user.name}</span>}
                    </p>
                    <p className="text-hint text-emce-text-muted">
                      Sent {relativeTime(m.invitedAt)}
                      {m.inviteExpiresAt && (
                        <> · expires {relativeTime(m.inviteExpiresAt)}</>
                      )}
                    </p>
                  </div>
                  <form action={revokeTeamInvite}>
                    <input type="hidden" name="memberId" value={m.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Revoke
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Removed roster — collapsed, audit only */}
        {removedMembers.length > 0 && (
          <details className="mt-4 group">
            <summary className="cursor-pointer list-none text-hint font-bold text-emce-dark hover:underline">
              <span className="group-open:hidden">{removedMembers.length} removed →</span>
              <span className="hidden group-open:inline">Hide removed</span>
            </summary>
            <ul className="mt-2 space-y-1">
              {removedMembers.map((m) => (
                <li key={m.id} className="text-hint text-emce-text-muted">
                  {m.user?.name ?? m.invitedEmail} — removed
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {/* Bulk invite */}
      <BulkInvitePanel teamId={team.id} remainingSlots={remainingSlots} />

      {/* Captain transfer — collapsed by default */}
      <TransferCaptaincyForm
        teamId={team.id}
        teamName={team.teamName ?? "this team"}
        action={transferCaptaincy}
        candidates={acceptedMembers
          .filter((m) => m.role !== "LEADER" && m.userId)
          .map((m) => ({
            userId: m.userId!,
            displayName: m.user?.name ?? m.user?.email ?? m.invitedEmail ?? "(member)",
            positionTitle: m.positionTitle,
          }))}
      />

      {/* Profile editor */}
      <TeamProfileEditor
        team={{
          id: team.id,
          teamName: team.teamName,
          teamBio: team.teamBio,
          teamLogoUrl: team.teamLogoUrl,
          institution: team.institution,
          institutionId: team.institutionId,
          externalEvent: team.externalEvent,
          externalTeamId: team.externalTeamId,
          facultyAdvisor: team.facultyAdvisor,
          facultyEmail: team.facultyEmail,
          socialLinks,
        }}
      />

      {/* Submission link — when the competition has an active submission stage */}
      <Card className="p-4">
        <h3 className="text-section text-emce-text">Submission</h3>
        {team.submissions.length === 0 ? (
          <>
            <p className="mt-1 text-hint text-emce-text-sec">
              You haven&apos;t submitted yet. Once the host opens a submission
              stage, the submit form lives at the competition page.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href={`/competitions/${team.competition.slug}/submit`}>
                Go to submission →
              </Link>
            </Button>
          </>
        ) : (
          <ul className="mt-2 space-y-2">
            {team.submissions.map((s) => (
              <li key={s.id} className="rounded-md border border-emce-border p-3">
                <p className="font-bold text-emce-text">{s.title}</p>
                <p className="text-hint text-emce-text-sec">
                  Stage: {s.stage.kind.toLowerCase()} · submitted{" "}
                  {relativeTime(s.submittedAt)}
                  {s.isLate && <Badge variant="warning" size="sm" className="ml-2">Late</Badge>}
                </p>
                {s.prototypeVideoUrl && (
                  <p className="mt-1 text-hint">
                    <a
                      href={s.prototypeVideoUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="font-bold text-emce-dark hover:underline"
                    >
                      Prototype video →
                    </a>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function VerificationBadge({ status }: { status: string }) {
  switch (status) {
    case "VERIFIED":
      return <Badge variant="success">✓ Verified team</Badge>;
    case "PENDING_REVIEW":
      return <Badge variant="warning">Verification pending</Badge>;
    case "REJECTED":
      return <Badge variant="danger">Verification rejected</Badge>;
    default:
      return <Badge variant="outline">Unverified</Badge>;
  }
}

function PublicPageBadge({ status, slug }: { status: string; slug: string | null }) {
  if (!slug) return null;
  if (status === "PUBLISHED") return <Badge variant="success">Public · /teams/{slug}</Badge>;
  if (status === "HIDDEN") return <Badge variant="outline">Page hidden</Badge>;
  return <Badge variant="default">Draft page</Badge>;
}
