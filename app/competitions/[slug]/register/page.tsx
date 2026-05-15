import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getCompetitionBySlug, getMyRegistration } from "@/server/competitions/queries";
import { RegisterForm } from "@/components/competitions/RegisterForm";
import { TeamRegisterForm } from "@/components/competitions/TeamRegisterForm";

export const metadata = { title: "Register" };

const PER_USER_TEAM_CAP = 5;

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/signin?next=/competitions/${slug}/register`);
  const c = await getCompetitionBySlug(slug);
  if (!c) notFound();
  if (c.status !== "LIVE") redirect(`/competitions/${slug}`);

  // Existing registration handling.
  //
  // Solo competitions stay one-team-per-user — so we keep the
  // straight redirect to /me/competitions. Team-based competitions
  // now allow multi-team: a captain who already leads ≥1 team for
  // this competition can still register another (up to a per-user
  // cap of 5 enforced server-side). To keep the UX clear, when
  // they have ≥1 existing team we surface a "you already have N
  // teams here" notice on the form rather than auto-redirecting —
  // they can choose to add another or jump back to /me/teams.
  // Members on someone else's team go straight to /me/competitions.
  const existing = await getMyRegistration(c.id, session.user.id);
  if (existing) {
    if (!c.isTeamBased) {
      redirect(`/me/competitions`);
    }
    if (existing.leaderUserId !== session.user.id) {
      redirect(`/me/competitions`);
    }
  }

  // Pull ALL teams the user already leads in this competition so we
  // can show the multi-team banner. Skipped for solo competitions
  // (we already redirected those above).
  const myTeams = c.isTeamBased
    ? await db.competitionRegistration.findMany({
        where: {
          competitionId: c.id,
          leaderUserId: session.user.id,
        },
        orderBy: { registeredAt: "desc" },
        select: {
          id: true,
          teamName: true,
          institution: true,
          members: { where: { status: "ACCEPTED" }, select: { id: true } },
        },
      })
    : [];
  const atUserCap = myTeams.length >= PER_USER_TEAM_CAP;

  return (
    <>
      <SiteHeader />
      <div className="container max-w-2xl space-y-4 py-6 md:py-8">
        <div>
          <h1 className="text-dashboard text-emce-text md:text-3xl">{c.title}</h1>
          <p className="mt-1 text-sm text-emce-text-sec">{c.tagline}</p>
        </div>

        {/* Multi-team banner — appears only when the captain already
            leads at least one team in THIS competition. Lists the
            existing teams (links to each dashboard) and either
            nudges them to create another one or hard-blocks at the
            per-user cap. */}
        {myTeams.length > 0 && (
          <Card className="border-emce-mid/30 bg-emce-light-soft/40 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-section text-emce-text">
                You already lead {myTeams.length} team{myTeams.length === 1 ? "" : "s"} here
              </h2>
              <Button asChild variant="outline" size="sm">
                <Link href="/me/teams">All my teams →</Link>
              </Button>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {myTeams.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/me/teams/${t.id}`}
                    className="font-bold text-emce-dark hover:underline"
                  >
                    {t.teamName ?? "(untitled)"}
                  </Link>
                  <span className="text-emce-text-sec">
                    {t.institution ? ` · ${t.institution}` : ""} · {t.members.length} member
                    {t.members.length === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
            {atUserCap ? (
              <p className="mt-3 rounded-md bg-emce-orange-light/60 p-2 text-hint text-emce-orange-deep">
                You&apos;ve hit the per-user cap of {PER_USER_TEAM_CAP} teams in
                this competition. Withdraw an existing one or contact admin.
              </p>
            ) : (
              <p className="mt-3 text-hint text-emce-text-sec">
                <Badge variant="default" size="sm">Multi-team allowed</Badge>{" "}
                Use the form below if you&apos;re registering another team
                (different college, junior cohort, etc.) — give it a distinct
                name.
              </p>
            )}
          </Card>
        )}

        {/* Team-based competitions get the dedicated team-creation
            form (with college / faculty / external-event fields). It
            posts to `createTeam` which sets up the registration row
            AND the team profile in one go, then routes the captain
            to the dashboard. Solo competitions stay on the legacy
            RegisterForm — no point making solo registrants fill in
            "faculty advisor" fields. */}
        {c.isTeamBased ? (
          atUserCap ? null : (
            <TeamRegisterForm
              competitionId={c.id}
              competitionTitle={c.title}
              minTeamSize={c.minTeamSize}
              maxTeamSize={c.maxTeamSize}
            />
          )
        ) : (
          <RegisterForm
            competitionId={c.id}
            competitionSlug={c.slug}
            isTeamBased={c.isTeamBased}
            minTeamSize={c.minTeamSize}
            maxTeamSize={c.maxTeamSize}
          />
        )}
      </div>
      <SiteFooter />
    </>
  );
}
