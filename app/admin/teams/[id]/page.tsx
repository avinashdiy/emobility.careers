import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { adminVerifyTeam as _adminVerifyTeam } from "@/server/competitions/team-actions";

// Form-action shim — the underlying server action returns FormState
// for callers that use useActionState; here we just need a void.
async function adminVerifyTeam(formData: FormData): Promise<void> {
  "use server";
  await _adminVerifyTeam(formData);
}
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Team verification" };
export const dynamic = "force-dynamic";

export default async function AdminTeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;
  const team = await db.competitionRegistration.findUnique({
    where: { id },
    include: {
      competition: { select: { slug: true, title: true } },
      leader: {
        select: {
          email: true,
          name: true,
          emailVerifiedAt: true,
          createdAt: true,
          candidateProfile: { select: { slug: true, profilePhotoUrl: true, headline: true } },
        },
      },
      members: {
        orderBy: [{ role: "asc" }, { invitedAt: "asc" }],
        include: {
          user: {
            select: {
              email: true,
              name: true,
              candidateProfile: { select: { slug: true, profilePhotoUrl: true } },
            },
          },
        },
      },
      verifiedBy: { select: { name: true, email: true } },
    },
  });
  if (!team) notFound();

  const accepted = team.members.filter((m) => m.status === "ACCEPTED");
  const pending = team.members.filter((m) => m.status === "INVITED");

  return (
    <AdminShell>
      <div className="container max-w-3xl space-y-5 py-8">
        <div>
          <Link href="/admin/teams" className="text-hint text-emce-dark hover:underline">
            ← Back to queue
          </Link>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <h1 className="text-dashboard text-emce-text">{team.teamName ?? "(untitled)"}</h1>
            <VerificationBadge status={team.verificationStatus} />
          </div>
          <p className="text-hint text-emce-text-sec">
            Competing in{" "}
            <Link
              href={`/competitions/${team.competition.slug}`}
              className="font-bold text-emce-dark hover:underline"
            >
              {team.competition.title}
            </Link>
            {team.externalEvent && <> · {team.externalEvent}</>}
            {team.externalTeamId && <> · #{team.externalTeamId}</>}
          </p>
        </div>

        {/* Captain card */}
        <Card className="p-4">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Captain
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Avatar
              src={team.leader.candidateProfile?.profilePhotoUrl ?? null}
              name={team.leader.name ?? team.leader.email}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-emce-text">
                {team.leader.candidateProfile?.slug ? (
                  <Link
                    href={`/${team.leader.candidateProfile.slug}`}
                    className="hover:underline"
                  >
                    {team.leader.name ?? team.leader.email}
                  </Link>
                ) : (
                  team.leader.name ?? team.leader.email
                )}
              </p>
              <p className="text-hint text-emce-text-sec">{team.leader.email}</p>
              <p className="text-hint text-emce-text-muted">
                Email verified:{" "}
                {team.leader.emailVerifiedAt ? "✓" : "✗"} · Account created{" "}
                {relativeTime(team.leader.createdAt)}
              </p>
            </div>
          </div>
        </Card>

        {/* Verification details */}
        <Card className="p-4">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Verification details
          </p>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <DetailRow label="Institution" value={team.institution} />
            <DetailRow label="Faculty advisor" value={team.facultyAdvisor} />
            <DetailRow label="Faculty email" value={team.facultyEmail} mono />
            <DetailRow label="External event" value={team.externalEvent} />
            <DetailRow label="External team ID" value={team.externalTeamId} mono />
            <DetailRow
              label="Status"
              value={team.verificationStatus.replace("_", " ").toLowerCase()}
            />
          </dl>
          {team.verifiedAt && (
            <p className="mt-3 text-hint text-emce-text-muted">
              Verified {relativeTime(team.verifiedAt)} by {team.verifiedBy?.name ?? team.verifiedBy?.email ?? "—"}
            </p>
          )}
          {team.verificationNote && (
            <div className="mt-3 rounded-md bg-emce-light-soft p-2 text-sm text-emce-text">
              <strong>Note:</strong> {team.verificationNote}
            </div>
          )}
        </Card>

        {/* Members audit */}
        <Card className="p-4">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Members ({accepted.length} accepted · {pending.length} pending)
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {accepted.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-2">
                <strong className="text-emce-text">{m.user?.name ?? m.invitedEmail}</strong>
                <span className="text-emce-text-sec">{m.user?.email ?? m.invitedEmail}</span>
                {m.role === "LEADER" && <Badge variant="success" size="sm">Captain</Badge>}
                {m.positionTitle && <span className="text-hint text-emce-text-muted">· {m.positionTitle}</span>}
              </li>
            ))}
            {pending.map((m) => (
              <li key={m.id} className="text-hint text-emce-text-muted">
                ⏳ {m.invitedEmail} (pending)
              </li>
            ))}
          </ul>
        </Card>

        {/* Verify / reject form */}
        {team.verificationStatus !== "VERIFIED" && (
          <Card className="border-emce-mid/30 bg-emce-light-soft/40 p-4">
            <h2 className="text-section text-emce-text">Action</h2>
            <p className="mt-1 text-hint text-emce-text-sec">
              Mark verified once you&apos;ve confirmed the team is real (faculty
              email reachable, college matches the captain&apos;s profile, no
              red flags in member emails). Reject with a note explaining what
              the captain needs to fix.
            </p>
            <form action={adminVerifyTeam} className="mt-3 space-y-3">
              <input type="hidden" name="teamId" value={team.id} />
              <Textarea
                name="note"
                rows={2}
                placeholder="Optional admin note (required for rejection)."
                maxLength={2000}
              />
              <div className="flex flex-wrap gap-2">
                <input type="hidden" name="decision" value="VERIFIED" />
                <ConfirmSubmit
                  variant="default"
                  size="sm"
                  confirm="Mark this team verified? They'll be able to publish the public page and receive prize disbursement."
                >
                  ✓ Mark verified
                </ConfirmSubmit>
              </div>
            </form>
            <form action={adminVerifyTeam} className="mt-2">
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="decision" value="REJECTED" />
              <input type="hidden" name="note" value="See note in team detail." />
              <ConfirmSubmit
                variant="ghost"
                size="sm"
                confirm="Reject this team? Captain is notified. They can fix and re-submit."
              >
                ✗ Reject
              </ConfirmSubmit>
            </form>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-hint text-emce-text-muted">{label}</dt>
      <dd className={mono ? "font-mono text-sm text-emce-text" : "text-sm text-emce-text"}>
        {value ?? <span className="text-emce-text-muted italic">—</span>}
      </dd>
    </div>
  );
}

function VerificationBadge({ status }: { status: string }) {
  switch (status) {
    case "VERIFIED": return <Badge variant="success">Verified</Badge>;
    case "PENDING_REVIEW": return <Badge variant="warning">Pending</Badge>;
    case "REJECTED": return <Badge variant="danger">Rejected</Badge>;
    default: return <Badge variant="outline">Unverified</Badge>;
  }
}
