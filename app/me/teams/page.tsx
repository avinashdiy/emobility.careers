import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "My teams" };
export const dynamic = "force-dynamic";

/**
 * List view of every team the user is on — both ones they captain
 * and ones they joined as a member. Captain teams render first.
 *
 * Click → captain teams go to /me/teams/[id] (full dashboard);
 * member teams go to a read-only roster (v1 just sends them to the
 * captain dashboard which renders correctly because the auth gate
 * inside the dashboard route bounces non-captains back here — so we
 * point member rows at the public team page when published, or to
 * the competition page otherwise).
 */
export default async function MyTeamsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/teams");

  // Two queries: teams I captain vs teams I'm a member on. Pulling
  // in parallel keeps the page snappy.
  const [ledTeams, memberTeams] = await Promise.all([
    db.competitionRegistration.findMany({
      where: { leaderUserId: session.user.id },
      orderBy: { registeredAt: "desc" },
      include: {
        competition: { select: { slug: true, title: true, status: true, endsAt: true, resultsAt: true } },
        members: { select: { id: true, status: true } },
      },
    }),
    db.competitionTeamMember.findMany({
      where: {
        userId: session.user.id,
        status: "ACCEPTED",
        registration: { leaderUserId: { not: session.user.id } },
      },
      orderBy: { acceptedAt: "desc" },
      include: {
        registration: {
          include: {
            competition: { select: { slug: true, title: true, status: true } },
            leader: { select: { name: true, candidateProfile: { select: { profilePhotoUrl: true } } } },
          },
        },
      },
    }),
  ]);

  const totalCount = ledTeams.length + memberTeams.length;

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <PageHeader
        title="My teams"
        subtitle={
          totalCount === 0
            ? "Teams you captain or join show up here."
            : `${ledTeams.length} you captain · ${memberTeams.length} you joined`
        }
      />

      {totalCount === 0 ? (
        <EmptyState
          icon="🏁"
          title="You haven't joined a team yet"
          body="Browse EV challenges and either start a team as captain or wait for an invite from one."
          action={
            <Button asChild>
              <Link href="/competitions">Browse challenges →</Link>
            </Button>
          }
        />
      ) : (
        <>
          {ledTeams.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
                Teams you captain
              </h2>
              <ul className="space-y-2">
                {ledTeams.map((t) => {
                  const accepted = t.members.filter((m) => m.status === "ACCEPTED").length;
                  const pending = t.members.filter((m) => m.status === "INVITED").length;
                  return (
                    <li key={t.id}>
                      <Link href={`/me/teams/${t.id}`} className="block">
                        <Card className="p-4 hover:border-emce-mid hover:shadow-emce-hover">
                          <div className="flex flex-wrap items-center gap-3">
                            <Avatar src={t.teamLogoUrl} name={t.teamName ?? "T"} size="md" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-2">
                                <span className="font-bold text-emce-text">
                                  {t.teamName ?? "Untitled team"}
                                </span>
                                <Badge variant="success" size="sm">Captain</Badge>
                                <VerificationBadge status={t.verificationStatus} />
                                {t.publicPageStatus === "PUBLISHED" && (
                                  <Badge variant="default" size="sm">Public</Badge>
                                )}
                              </div>
                              <p className="text-hint text-emce-text-sec">
                                {t.competition.title}
                                {t.externalEvent && <> · {t.externalEvent}</>}
                                {t.institution && <> · {t.institution}</>}
                              </p>
                              <p className="text-hint text-emce-text-muted">
                                {accepted} accepted · {pending} pending · registered {relativeTime(t.registeredAt)}
                              </p>
                            </div>
                            <span className="text-hint text-emce-dark">Manage →</span>
                          </div>
                        </Card>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {memberTeams.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
                Teams you joined
              </h2>
              <ul className="space-y-2">
                {memberTeams.map((m) => {
                  const t = m.registration;
                  // Member rows link to: public page if published, else
                  // the competition page (still useful — they can read
                  // rules + see deadlines).
                  const target =
                    t.publicPageStatus === "PUBLISHED" && t.teamSlug
                      ? `/teams/${t.teamSlug}`
                      : `/competitions/${t.competition.slug}`;
                  return (
                    <li key={m.id}>
                      <Link href={target} className="block">
                        <Card className="p-4 hover:border-emce-mid hover:shadow-emce-hover">
                          <div className="flex flex-wrap items-center gap-3">
                            <Avatar src={t.teamLogoUrl} name={t.teamName ?? "T"} size="md" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-2">
                                <span className="font-bold text-emce-text">
                                  {t.teamName ?? "Untitled team"}
                                </span>
                                {m.positionTitle && (
                                  <Badge variant="default" size="sm">{m.positionTitle}</Badge>
                                )}
                              </div>
                              <p className="text-hint text-emce-text-sec">
                                {t.competition.title}
                                {t.externalEvent && <> · {t.externalEvent}</>}
                              </p>
                              <p className="text-hint text-emce-text-muted">
                                Captain {t.leader?.name ?? "—"} · joined {relativeTime(m.acceptedAt ?? m.invitedAt)}
                              </p>
                            </div>
                          </div>
                        </Card>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function VerificationBadge({ status }: { status: string }) {
  switch (status) {
    case "VERIFIED":
      return <Badge variant="success" size="sm">Verified</Badge>;
    case "PENDING_REVIEW":
      return <Badge variant="warning" size="sm">Pending</Badge>;
    case "REJECTED":
      return <Badge variant="danger" size="sm">Rejected</Badge>;
    default:
      return null;
  }
}
