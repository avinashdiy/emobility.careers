import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { acceptTeamInvite } from "@/server/competitions/actions";

/**
 * Team-invite landing.
 *
 * Three branches:
 *
 *   1. Signed-in user whose email matches the invite — show team
 *      preview + "Accept" button.
 *   2. Signed-in user whose email does NOT match — show the team
 *      preview but block accept and explain how to fix.
 *   3. Anonymous — render the same preview but with a Sign-up CTA
 *      that pre-fills the invited email + carries the token in the
 *      `next=` redirect, so post-signup → auto-accept lands them
 *      on the team page.
 *
 * The "preview" matters for the growth funnel: a fresh prospect
 * should see what they're signing up for (team name, college,
 * captain, the event they're competing in) before being asked to
 * create an account.
 */
export default async function TeamInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, token } = await params;
  const sp = await searchParams;
  const session = await auth();

  // Look up the invite up-front so anonymous visitors also see the
  // preview. Different CTAs render based on session state.
  const invite = await db.competitionTeamMember.findUnique({
    where: { inviteToken: token },
    include: {
      registration: {
        include: {
          competition: { select: { title: true, slug: true, status: true } },
          leader: {
            select: {
              name: true,
              candidateProfile: {
                select: { profilePhotoUrl: true, slug: true },
              },
            },
          },
        },
      },
    },
  });

  if (!invite) {
    return (
      <InvitePageShell title="Invite not found">
        <p className="text-emce-text-sec">
          This invite link doesn&apos;t look right. Ask the captain to send a fresh
          one — links expire after 14 days.
        </p>
      </InvitePageShell>
    );
  }
  if (invite.status === "REMOVED") {
    return (
      <InvitePageShell title="Invite withdrawn">
        <p className="text-emce-text-sec">
          The team captain withdrew this invite. If you still want to join, ask
          them to add you again.
        </p>
      </InvitePageShell>
    );
  }
  const expired =
    invite.inviteExpiresAt !== null && invite.inviteExpiresAt < new Date();
  if (expired) {
    return (
      <InvitePageShell title="Invite expired">
        <p className="text-emce-text-sec">
          This invite was valid for 14 days and has now expired. Ask the captain
          to resend — they can do that from the team dashboard.
        </p>
      </InvitePageShell>
    );
  }

  const team = invite.registration;
  const captain = team.leader;
  const captainName = captain?.name ?? "The captain";

  // Anonymous path — show preview, push to signup with the token
  // attached so post-signup re-lands here for auto-accept.
  if (!session?.user) {
    const signupHref = `/signup?role=CANDIDATE&next=${encodeURIComponent(
      `/competitions/${slug}/team-invite/${token}`,
    )}&inviteEmail=${encodeURIComponent(invite.invitedEmail ?? "")}`;
    const signinHref = `/signin?next=${encodeURIComponent(
      `/competitions/${slug}/team-invite/${token}`,
    )}`;
    return (
      <InvitePageShell title="">
        <TeamPreview
          teamName={team.teamName ?? "Untitled team"}
          institution={team.institution}
          externalEvent={team.externalEvent}
          competitionTitle={team.competition.title}
          captainName={captainName}
          captainPhotoUrl={captain?.candidateProfile?.profilePhotoUrl ?? null}
        />
        <div className="mt-5 space-y-2">
          <Button asChild className="w-full" size="lg">
            <Link href={signupHref}>Create account &amp; join team →</Link>
          </Button>
          <p className="text-center text-hint text-emce-text-muted">
            Already have an account?{" "}
            <Link href={signinHref} className="font-bold text-emce-dark hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </InvitePageShell>
    );
  }

  // Signed-in path — accept action.
  async function accept() {
    "use server";
    const r = await acceptTeamInvite(token);
    if (r.ok && r.teamId) {
      redirect(`/me/teams/${r.teamId}`);
    }
    if (r.ok) {
      redirect(`/me/competitions`);
    }
    redirect(
      `/competitions/${slug}/team-invite/${token}?error=${encodeURIComponent(
        r.message ?? "Couldn't accept the invite.",
      )}`,
    );
  }

  // Email-mismatch handling — block accept and explain.
  const sessionEmail = session.user.email?.toLowerCase() ?? "";
  const hardMismatch = invite.userId && invite.userId !== session.user.id;
  const emailMismatch =
    !invite.userId && invite.invitedEmail !== sessionEmail;

  return (
    <InvitePageShell title="">
      <TeamPreview
        teamName={team.teamName ?? "Untitled team"}
        institution={team.institution}
        externalEvent={team.externalEvent}
        competitionTitle={team.competition.title}
        captainName={captainName}
        captainPhotoUrl={captain?.candidateProfile?.profilePhotoUrl ?? null}
      />
      {sp.error && (
        <div className="mt-4 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
          {sp.error}
        </div>
      )}
      {hardMismatch || emailMismatch ? (
        <div className="mt-5 rounded-md border border-emce-orange bg-emce-orange-light/40 p-3 text-sm text-emce-text">
          <p className="font-bold">This invite was sent to a different email.</p>
          <p className="mt-1 text-emce-text-sec">
            Sign out and sign in with{" "}
            <strong>{invite.invitedEmail ?? "the invited address"}</strong>, or
            ask the captain to resend the invite to{" "}
            <strong>{sessionEmail}</strong>.
          </p>
        </div>
      ) : (
        <form action={accept} className="mt-5">
          <Button type="submit" className="w-full" size="lg">
            Join {team.teamName ?? "the team"} →
          </Button>
        </form>
      )}
    </InvitePageShell>
  );
}

function InvitePageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <div className="container max-w-md py-12">
        <Card className="p-6">
          {title && <h1 className="text-section text-emce-text">{title}</h1>}
          <div className={title ? "mt-2" : ""}>{children}</div>
        </Card>
      </div>
      <SiteFooter />
    </>
  );
}

function TeamPreview({
  teamName,
  institution,
  externalEvent,
  competitionTitle,
  captainName,
  captainPhotoUrl,
}: {
  teamName: string;
  institution: string | null;
  externalEvent: string | null;
  competitionTitle: string;
  captainName: string;
  captainPhotoUrl: string | null;
}) {
  return (
    <div>
      <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
        Team invitation
      </p>
      <h1 className="mt-1 text-2xl font-extrabold text-emce-text">
        {captainName} invited you to {teamName}
      </h1>
      <div className="mt-3 space-y-2 rounded-md bg-emce-light-soft/60 p-3">
        <div className="flex items-center gap-2">
          <Avatar src={captainPhotoUrl} name={captainName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-emce-text">{captainName}</p>
            <p className="text-hint text-emce-text-sec">Team captain</p>
          </div>
        </div>
        <div className="border-t border-emce-border pt-2 text-sm">
          <p className="text-emce-text">
            <span className="text-emce-text-sec">Competing in: </span>
            <strong>{competitionTitle}</strong>
          </p>
          {externalEvent && (
            <p className="mt-1 text-emce-text">
              <Badge variant="success" size="sm">
                {externalEvent}
              </Badge>
            </p>
          )}
          {institution && (
            <p className="mt-1 text-hint text-emce-text-sec">📍 {institution}</p>
          )}
        </div>
      </div>
    </div>
  );
}
