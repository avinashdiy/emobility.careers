import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase, GraduationCap, Trophy, Users, Bookmark, MessageCircle, Bell } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { GradientHero } from "@/components/ui/gradient-hero";
import { StatTile } from "@/components/ui/stat-tile";
import { VerifyEmailBanner } from "@/components/auth/VerifyEmailBanner";
import { ProfileCompletenessCard } from "@/components/profile/ProfileCompletenessCard";
import { ProductTour } from "@/components/onboarding/ProductTour";
import { ApplicationTracker } from "@/components/candidate/ApplicationTracker";
import { evaluateProfile } from "@/lib/profile-completeness";
import { getCandidateApplicationStats } from "@/lib/applications-stats";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "My dashboard" };

const APPLICATION_STAGE_TONE: Record<string, "default" | "warning" | "verified" | "outline"> = {
  APPLIED: "outline",
  SCREENED: "default",
  SHORTLISTED: "verified",
  ASSESSMENT: "warning",
  INTERVIEW: "warning",
  OFFER: "verified",
  HIRED: "verified",
  REJECTED: "outline",
  WITHDRAWN: "outline",
};

export default async function MeDashboard() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me");
  if (session.user.role === "ADMIN") redirect("/admin");
  // EMPLOYERs are intentionally NOT redirected away. Both personas
  // coexist now; /me always renders the candidate view, /employer
  // renders the recruiter view, and the persona switcher in the header
  // navigates between them. The candidate dashboard query below uses
  // CandidateProfile (auto-seeded at signup), so an employer who
  // clicks "Switch to candidate view" lands here without a 404.

  const profileInclude = {
    _count: { select: { applications: true, savedJobs: true, experiences: true, education: true } },
    evDomains: { include: { evDomain: true } },
    skills: { select: { skillId: true } },
    experiences: { select: { id: true } },
    education: { select: { id: true } },
    certifications: { select: { id: true } },
    projects: { select: { id: true } },
    user: {
      select: {
        email: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        productTourCompletedAt: true,
      },
    },
  } as const;

  let profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    include: profileInclude,
  });
  // Legacy employer-only users (signed up before the auto-create
  // landed) reach here without a CandidateProfile. Switching to the
  // candidate persona shouldn't bounce them through /onboarding;
  // lazy-create a stub with their existing User name/email and
  // continue rendering the dashboard. New signups already get a
  // profile created in events.createUser + the email signup action,
  // so this branch only ever fires for back-compat users.
  if (!profile) {
    const dbUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true },
    });
    const fullName = (dbUser?.name ?? "").trim();
    const [firstName, ...rest] = fullName.split(/\s+/).filter(Boolean);
    const slugSeed = fullName || dbUser?.email?.split("@")[0] || "member";
    const { withUniqueSlug } = await import("@/lib/slug");
    await withUniqueSlug(slugSeed, (slug) =>
      db.candidateProfile.create({
        data: {
          userId: session.user.id,
          slug,
          firstName: firstName || "Member",
          lastName: rest.join(" ") || null,
          email: dbUser?.email ?? null,
        },
      }),
    );
    profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      include: profileInclude,
    });
  }
  if (!profile) redirect("/onboarding");

  // Pillar pulls — kept narrow + parallel so the dashboard stays snappy.
  const [
    recentApplications,
    upcomingInterview,
    upcomingMentorshipSession,
    pastMentorshipCount,
    activeCompetitions,
    pendingInvites,
    recentNotifications,
    mentor,
    suggestedMentors,
    suggestedCompetitions,
  ] = await Promise.all([
    db.application.findMany({
      where: { candidateId: profile.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { job: { select: { id: true, slug: true, title: true, company: { select: { name: true, logoUrl: true } } } } },
    }),
    db.interview.findFirst({
      where: {
        application: { candidateId: profile.id },
        status: "SCHEDULED",
        scheduledAt: { gte: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
      include: { application: { include: { job: { select: { title: true } } } } },
    }),
    db.mentorshipSession.findFirst({
      where: {
        menteeUserId: session.user.id,
        status: "CONFIRMED",
        scheduledAt: { gte: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
      include: {
        mentor: {
          select: {
            headline: true,
            user: { select: { candidateProfile: { select: { firstName: true, lastName: true, slug: true, profilePhotoUrl: true } } } },
          },
        },
      },
    }),
    db.mentorshipSession.count({ where: { menteeUserId: session.user.id, status: "COMPLETED" } }),
    db.competitionRegistration.findMany({
      where: {
        OR: [{ leaderUserId: session.user.id }, { members: { some: { userId: session.user.id } } }],
        competition: { status: { in: ["LIVE", "JUDGING"] } },
      },
      take: 5,
      orderBy: { registeredAt: "desc" },
      include: { competition: { select: { id: true, slug: true, title: true, endsAt: true, type: true } } },
    }),
    db.connection.count({ where: { recipientId: session.user.id, status: "PENDING" } }),
    db.notification.findMany({
      where: { userId: session.user.id, channel: "IN_APP" },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    db.mentorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, isPublished: true, kycStatus: true },
    }),
    db.mentorProfile.findMany({
      where: { isPublished: true, kycStatus: "APPROVED" },
      orderBy: [{ avgRating: "desc" }, { totalSessions: "desc" }],
      take: 3,
      include: {
        user: {
          select: {
            candidateProfile: { select: { firstName: true, lastName: true, slug: true, profilePhotoUrl: true } },
          },
        },
      },
    }),
    db.competition.findMany({
      where: { status: "LIVE", endsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 3,
      include: { hostCompany: { select: { name: true, logoUrl: true } } },
    }),
  ]);

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  // Use the canonical scorer + denormalised column. We pass the full
  // profile relations so `evaluateProfile` returns the section-level
  // breakdown the gauge UI needs for the "Next steps" list.
  const completeness = evaluateProfile(profile, {
    phoneVerified: !!profile.user.phoneVerifiedAt,
    emailVerified: !!profile.user.emailVerifiedAt,
  });
  const applicationStats = await getCandidateApplicationStats(profile.id);

  return (
    <div className="container max-w-6xl space-y-6 py-6 md:py-8">
      {/* First-login welcome walkthrough — only fires while
          productTourCompletedAt is null. The component closes itself and
          stamps the column on Skip / Get started. */}
      {!profile.user.productTourCompletedAt && <ProductTour />}
      {!profile.user.emailVerifiedAt && <VerifyEmailBanner email={profile.user.email} />}

        {/* Hero greeting — animated mesh-gradient panel with stat tiles
            embedded directly into the hero so the dashboard reads as
            "this is your control centre" rather than "here is a small
            welcome card followed by a row of numbers". */}
        <GradientHero className="rounded-lg shadow-emce-lg" size="comfortable">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <Avatar
                  src={profile.profilePhotoUrl}
                  name={fullName}
                  size="lg"
                  openToWork={profile.openToWork}
                  hiring={profile.hiringNow}
                  className="ring-white/40"
                />
                <div>
                  <h1 className="text-2xl font-extrabold leading-tight text-white sm:text-3xl">
                    Hi {profile.firstName} <span className="inline-block animate-float">👋</span>
                  </h1>
                  {profile.headline && (
                    <p className="mt-1 text-sm text-white/75">{profile.headline}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {profile.isDIYguruVerified && (
                      <Badge variant="diyguru">⭐ DIYguru Verified</Badge>
                    )}
                    <Badge
                      variant="outline"
                      className="border-white/30 text-white/85 bg-white/5"
                    >
                      {profile.profileMode}
                    </Badge>
                    {profile.openToWork && <Badge variant="live">Open to work</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="border-white/40 bg-white/5 text-white hover:bg-white/15">
                  <Link href={`/${profile.slug}`}>Preview public profile</Link>
                </Button>
                <Button asChild size="sm" variant="glow">
                  <Link href="/me/profile">Edit profile</Link>
                </Button>
              </div>
            </div>

            {/* Stat strip lives inside the hero so the eye lands "name → at-a-glance numbers"
                in one visual unit. Tiles use the `hero` variant — translucent cards over
                the mesh that still pop on dark. */}
            <div className="emce-stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Link href="/me/applications" className="block">
                <StatTile
                  label="Applications"
                  value={profile._count.applications}
                  icon={<Briefcase className="h-4 w-4" />}
                  variant="hero"
                />
              </Link>
              <Link href="/me/sessions" className="block">
                <StatTile
                  label="Mentor sessions"
                  value={pastMentorshipCount + (upcomingMentorshipSession ? 1 : 0)}
                  icon={<GraduationCap className="h-4 w-4" />}
                  variant="hero"
                />
              </Link>
              <Link href="/me/competitions" className="block">
                <StatTile
                  label="Competitions"
                  value={activeCompetitions.length}
                  icon={<Trophy className="h-4 w-4" />}
                  variant="hero"
                />
              </Link>
              <Link href="/me/network" className="block">
                <StatTile
                  label="Connections"
                  value={profile.connectionsCount}
                  icon={<Users className="h-4 w-4" />}
                  variant="hero"
                />
              </Link>
            </div>
          </div>
        </GradientHero>

        {completeness.pct < 100 && (
          <Card animate>
            <ProfileCompletenessCard result={completeness} variant="inline" />
          </Card>
        )}

        {/* Application tracker — LinkedIn-style "Applied · Interviewed ·
            Offers · Hired · Active" strip. Hidden when zero applications. */}
        {applicationStats.applied > 0 && <ApplicationTracker stats={applicationStats} />}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Recent applications */}
            <Card>
              <SectionHeader title="Recent applications" cta={{ label: "All →", href: "/me/applications" }} />
              {recentApplications.length === 0 ? (
                <EmptyState
                  icon={<Briefcase className="mx-auto h-8 w-8 text-emce-text-sec" />}
                  title="No applications yet"
                  body="Apply to your first EV role to start tracking progress here."
                  action={<Button asChild variant="accent" size="sm"><Link href="/jobs">Browse jobs →</Link></Button>}
                  className="border-0 p-6"
                />
              ) : (
                <ul className="mt-3 divide-y divide-emce-border">
                  {recentApplications.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-2 py-3">
                      <div className="flex items-start gap-3">
                        <Avatar src={a.job.company.logoUrl} name={a.job.company.name} size="sm" />
                        <div>
                          <Link href={`/job/${a.job.slug}`} className="font-bold text-emce-text hover:underline">{a.job.title}</Link>
                          <p className="text-hint text-emce-text-sec">{a.job.company.name} · Applied {relativeTime(a.appliedAt)}</p>
                        </div>
                      </div>
                      <Badge variant={APPLICATION_STAGE_TONE[a.stage]} className="text-[10px]">{a.stage}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Active competitions */}
            <Card>
              <SectionHeader title="Active competitions" cta={{ label: "All →", href: "/me/competitions" }} />
              {activeCompetitions.length === 0 ? (
                <EmptyState
                  icon={<Trophy className="mx-auto h-8 w-8 text-emce-text-sec" />}
                  title="Not competing yet"
                  body="Hackathons, case studies, and ideathons are happening across the EV ecosystem."
                  action={<Button asChild size="sm"><Link href="/competitions">Browse competitions →</Link></Button>}
                  className="border-0 p-6"
                />
              ) : (
                <ul className="mt-3 divide-y divide-emce-border">
                  {activeCompetitions.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-2 py-3">
                      <div>
                        <Link href={`/competitions/${r.competition.slug}`} className="font-bold text-emce-text hover:underline">
                          {r.competition.title}
                        </Link>
                        <p className="text-hint text-emce-text-sec">
                          {r.competition.type.replace("_", " ")} · ends {relativeTime(r.competition.endsAt)}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/competitions/${r.competition.slug}/submit`}>Submit</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Suggested mentors */}
            {!mentor?.isPublished && suggestedMentors.length > 0 && (
              <Card>
                <SectionHeader title="Mentors you might like" cta={{ label: "All →", href: "/mentors" }} />
                <ul className="mt-3 grid gap-3 sm:grid-cols-3">
                  {suggestedMentors.map((m) => {
                    const cp = m.user.candidateProfile;
                    const name = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : "Mentor";
                    return (
                      <li key={m.id}>
                        <Link
                          href={cp ? `/mentors/${cp.slug}` : "#"}
                          className="block rounded-md border border-emce-border p-3 hover:border-emce-mid"
                        >
                          <div className="flex items-center gap-2">
                            <Avatar src={cp?.profilePhotoUrl} name={name} size="sm" />
                            <span className="text-sm font-bold text-emce-text">{name}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-hint text-emce-text-sec">{m.headline}</p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </div>

          <aside className="space-y-6">
            {/* Upcoming events */}
            {(upcomingInterview || upcomingMentorshipSession) && (
              <Card>
                <h2 className="text-section text-emce-text">Coming up</h2>
                <ul className="mt-3 space-y-3">
                  {upcomingInterview && (
                    <li className="flex items-start gap-2">
                      <Briefcase className="mt-0.5 h-4 w-4 text-emce-text-sec" />
                      <div>
                        <Link href="/me/interviews" className="text-sm font-bold text-emce-text hover:underline">
                          Interview · {upcomingInterview.application.job.title}
                        </Link>
                        <p className="text-hint text-emce-text-sec">
                          {upcomingInterview.scheduledAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      </div>
                    </li>
                  )}
                  {upcomingMentorshipSession && (
                    <li className="flex items-start gap-2">
                      <GraduationCap className="mt-0.5 h-4 w-4 text-emce-text-sec" />
                      <div>
                        <Link href="/me/sessions" className="text-sm font-bold text-emce-text hover:underline">
                          Mentor session · {upcomingMentorshipSession.mentor.user.candidateProfile?.firstName ?? "Mentor"}
                        </Link>
                        <p className="text-hint text-emce-text-sec">
                          {upcomingMentorshipSession.scheduledAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      </div>
                    </li>
                  )}
                </ul>
              </Card>
            )}

            {/* Network nudge */}
            {pendingInvites > 0 && (
              <Card className="bg-emce-light-soft">
                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 h-5 w-5 text-emce-darkest" />
                  <div>
                    <p className="font-bold text-emce-text">{pendingInvites} pending connection{pendingInvites === 1 ? "" : "s"}</p>
                    <p className="text-hint text-emce-text-sec">Accept or decline to keep your network curated.</p>
                  </div>
                </div>
                <Button asChild className="mt-3 w-full" size="sm">
                  <Link href="/me/network">Open invitations →</Link>
                </Button>
              </Card>
            )}

            {/* Mentor onboarding nudge */}
            {!mentor && profile.totalExperienceMonths >= 24 && (
              <Card className="bg-emce-darkest text-white">
                <p className="font-bold">Help the next wave</p>
                <p className="mt-1 text-sm text-white/80">
                  You have {Math.round(profile.totalExperienceMonths / 12)}+ years in EV. Set up a mentor profile to coach students and freshers — free or paid, your call.
                </p>
                <Button asChild variant="accent" size="sm" className="mt-3 w-full">
                  <Link href="/me/mentor">Become a mentor →</Link>
                </Button>
              </Card>
            )}

            {mentor?.kycStatus === "APPROVED" && !mentor.isPublished && (
              <Card className="bg-emce-light-soft">
                <p className="font-bold text-emce-text">You're approved as a mentor 🎉</p>
                <p className="mt-1 text-sm text-emce-text-sec">Set your hours and publish to start receiving bookings.</p>
                <Button asChild className="mt-3 w-full" size="sm">
                  <Link href="/me/mentor/availability">Set availability →</Link>
                </Button>
              </Card>
            )}

            {/* Notifications preview */}
            <Card>
              <SectionHeader title="Recent notifications" cta={{ label: "All →", href: "/me/notifications" }} />
              {recentNotifications.length === 0 ? (
                <EmptyState
                  icon={<Bell className="mx-auto h-8 w-8 text-emce-text-sec" />}
                  title="All caught up"
                  className="border-0 p-4"
                />
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {recentNotifications.map((n) => (
                    <li key={n.id} className={`rounded-md p-2 ${n.readAt ? "" : "bg-emce-light-soft"}`}>
                      <Link href={n.link ?? "#"} className="block">
                        <p className="font-bold text-emce-text">{n.title}</p>
                        <p className="line-clamp-2 text-hint text-emce-text-sec">{n.body}</p>
                        <p className="mt-0.5 text-[10px] text-emce-text-sec">{relativeTime(n.createdAt)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Suggested competitions */}
            {suggestedCompetitions.length > 0 && (
              <Card>
                <SectionHeader title="Live competitions" cta={{ label: "All →", href: "/competitions" }} />
                <ul className="mt-3 space-y-2">
                  {suggestedCompetitions.map((c) => (
                    <li key={c.id}>
                      <Link href={`/competitions/${c.slug}`} className="flex items-start gap-2 rounded-md p-2 hover:bg-emce-light-soft">
                        <Avatar src={c.hostCompany.logoUrl} name={c.hostCompany.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-sm font-bold text-emce-text">{c.title}</p>
                          <p className="text-hint text-emce-text-sec">{c.hostCompany.name} · ends {relativeTime(c.endsAt)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Quick links */}
            <Card>
              <h2 className="text-section text-emce-text">Quick links</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <QuickLink href="/me/saved" icon={<Bookmark className="h-3.5 w-3.5" />} label="Saved" />
                <QuickLink href="/me/messages" icon={<MessageCircle className="h-3.5 w-3.5" />} label="Messages" />
                <QuickLink href="/me/alerts" icon={<Bell className="h-3.5 w-3.5" />} label="Alerts" />
                <QuickLink href="/me/preferences" icon={<Bell className="h-3.5 w-3.5" />} label="Preferences" />
              </div>
            </Card>
          </aside>
        </div>
    </div>
  );
}

function SectionHeader({ title, cta }: { title: string; cta?: { label: string; href: string } }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-section text-emce-text">{title}</h2>
      {cta && <Link href={cta.href} className="text-xs font-bold text-emce-dark hover:underline">{cta.label}</Link>}
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 rounded-md border border-emce-border px-2.5 py-1.5 font-semibold text-emce-text hover:border-emce-mid">
      {icon}<span>{label}</span>
    </Link>
  );
}

