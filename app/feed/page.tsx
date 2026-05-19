import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark, Briefcase, Users, Trophy, GraduationCap, Eye, TrendingUp, Calendar, Compass } from "lucide-react";
import { DISCOVER_ITEMS } from "@/components/layout/discover-items";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RichPostComposer } from "@/components/social/RichPostComposer";
import { PostCard, type FeedPostShape } from "@/components/social/PostCard";
import { ConnectButton } from "@/components/social/ConnectButton";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { EvNewsCard } from "@/components/feed/EvNewsCard";
import { getFeed, getForYouFeed, suggestConnections, getConnectionStatus, getViewerPollVotes } from "@/server/social/queries";
import { getProfileViewStats } from "@/server/profile/views";
import { isFeatureOff, FeatureOffNotice } from "@/components/layout/FeatureGate";
import { relativeTime } from "@/lib/utils";

export const metadata = {
  title: "Feed",
  description:
    "The EV-industry social feed — posts from engineers, recruiters, mentors, and companies across battery, charging, and powertrain. Discover jobs and people.",
};

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  if (await isFeatureOff("feature.social_enabled")) return <FeatureOffNotice title="Social feed" />;
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/feed");
  const { tab } = await searchParams;
  // Two surfaces, one URL — `?tab=for-you` switches to topic-driven
  // posts (filtered by HashtagSubscription), default is the social-
  // graph feed. Treat anything else as the default to avoid a 404
  // door for typos.
  const activeTab: "following" | "for-you" = tab === "for-you" ? "for-you" : "following";

  const me = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      slug: true,
      firstName: true,
      lastName: true,
      headline: true,
      profilePhotoUrl: true,
      connectionsCount: true,
      followersCount: true,
      postsCount: true,
    },
  });
  if (!me) redirect("/onboarding");

  // Companies user can post on behalf of
  const teamCompanies = await db.employerProfile.findMany({
    where: { userId: session.user.id },
    select: { company: { select: { id: true, name: true, logoUrl: true, slug: true } } },
  });

  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [
    feedResult,
    suggestions,
    weeklyPosts,
    weeklyReactions,
    weeklyComments,
    profileViewStats,
    liveCompetitions,
    upcomingMentorshipSession,
    latestJobs,
    upcomingFairs,
    upcomingEvents,
  ] = await Promise.all([
    activeTab === "for-you"
      ? getForYouFeed({ viewerId: session.user.id, limit: 20 })
      : getFeed({ viewerId: session.user.id, limit: 20 }).then((posts) => ({ posts, subscribedCount: -1 })),
    suggestConnections(session.user.id, 4),
    db.post.count({ where: { authorId: session.user.id, createdAt: { gte: since7d } } }),
    db.postReaction.count({ where: { post: { authorId: session.user.id }, createdAt: { gte: since7d } } }),
    db.postComment.count({ where: { post: { authorId: session.user.id }, createdAt: { gte: since7d } } }),
    // Real LinkedIn-style "Who viewed your profile" — uses the
    // ProfileView table now. 7-day window matches LinkedIn's free-
    // tier surface; the /me/views detail page covers the longer
    // history. The widget links there for the full list.
    getProfileViewStats(session.user.id, 7),
    db.competition.findMany({
      where: { status: "LIVE", endsAt: { gte: new Date() } },
      orderBy: { endsAt: "asc" },
      take: 3,
      select: {
        id: true, slug: true, title: true, endsAt: true, type: true, totalPrizePoolMinor: true, prizeCurrency: true,
        hostCompany: { select: { name: true, logoUrl: true } },
      },
    }),
    db.mentorshipSession.findFirst({
      where: { menteeUserId: session.user.id, status: "CONFIRMED", scheduledAt: { gte: new Date() } },
      orderBy: { scheduledAt: "asc" },
      select: {
        scheduledAt: true,
        mentor: {
          select: {
            user: { select: { candidateProfile: { select: { firstName: true, lastName: true, slug: true } } } },
          },
        },
      },
    }),
    // Latest open jobs for the right-rail "Latest jobs" widget (LinkedIn
    // analogue: their "Jobs based on your activity" card). v1 is a recency
    // sort; v2 will rank by AI match score against the viewer's embedding.
    db.jobPosting.findMany({
      where: { status: "OPEN", publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      take: 5,
      select: {
        id: true, slug: true, title: true, locations: true, workMode: true,
        publishedAt: true,
        company: { select: { name: true, logoUrl: true, slug: true } },
      },
    }),
    // Upcoming recruitment fairs — mirrors the profile-page sidebar.
    // OPEN or IN_PROGRESS, end date in the future so a fair that
    // wrapped yesterday doesn't keep surfacing as "upcoming".
    db.recruitmentDrive.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        endsAt: { gte: new Date() },
      },
      orderBy: { startsAt: "asc" },
      take: 3,
      select: {
        id: true, slug: true, title: true, city: true, state: true,
        startsAt: true, endsAt: true,
      },
    }),
    // Upcoming events — webinars / hybrid / in-person, status OPEN,
    // start time still ahead. Hosted by a company on the platform.
    db.event.findMany({
      where: {
        status: "OPEN",
        startsAt: { gte: new Date() },
      },
      orderBy: { startsAt: "asc" },
      take: 3,
      select: {
        id: true, slug: true, title: true, eventType: true, startsAt: true,
        company: { select: { name: true, logoUrl: true } },
      },
    }),
  ]);

  const fullName = `${me.firstName} ${me.lastName ?? ""}`.trim();
  const totalEngagement7d = weeklyReactions + weeklyComments;
  const posts = feedResult.posts;
  // subscribedCount is -1 for the Following tab (we don't compute it
  // there) and 0+ for For-You. We only use it for the empty-state
  // "you haven't followed any topics yet" CTA.
  const subscribedTopicCount = feedResult.subscribedCount;
  const viewerPollVotes = await getViewerPollVotes(posts, session.user.id);

  return (
    <>
      <SiteHeader />
      <div className="container max-w-6xl py-4 md:py-6">
        <div className="grid gap-4 lg:grid-cols-12">
        {/* ─── Left rail — profile card + stats + shortcuts ─── */}
        <aside className="hidden space-y-3 lg:col-span-3 lg:block">
          {/* Profile mini-card — LinkedIn-density: 56px banner, 72px
              avatar overlapping by 50%, 12px padding, no breathing room
              wasted under the headline. */}
          <Card className="overflow-hidden p-0">
            <div className="emce-hero-gradient h-14" />
            <div className="-mt-8 px-3 pb-3 text-center">
              <Avatar
                src={me.profilePhotoUrl}
                name={fullName}
                size="lg"
                className="mx-auto h-[72px] w-[72px] ring-4 ring-white"
              />
              <Link
                href={`/${me.slug}`}
                className="mt-1.5 block text-sm font-semibold text-emce-text hover:underline"
              >
                {fullName}
              </Link>
              {me.headline && (
                <p className="mt-0.5 line-clamp-2 text-xs text-emce-text-sec">{me.headline}</p>
              )}
            </div>
            {/* Inline stats — link-coloured, LinkedIn-style */}
            <div className="border-t border-emce-border bg-emce-light-soft/40 px-2 py-1 text-xs">
              <Link
                href="/me/network"
                className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-white"
              >
                <span className="text-emce-text-sec">Connections</span>
                <span className="font-bold text-emce-dark">{me.connectionsCount}</span>
              </Link>
              <Link
                href={`/${me.slug}`}
                className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-white"
              >
                <span className="text-emce-text-sec">Followers</span>
                <span className="font-bold text-emce-dark">{me.followersCount}</span>
              </Link>
            </div>
          </Card>

          {/* Weekly stats — LinkedIn's "Profile viewers / Post impressions" analogue */}
          <Card className="p-0">
            <div className="px-3 py-2.5 text-xs">
              <Link
                href="/me/views"
                className="flex items-center justify-between rounded-md px-1 py-1 hover:bg-emce-light-soft"
                title={
                  profileViewStats.anonymous > 0
                    ? `${profileViewStats.identified} identified · ${profileViewStats.anonymous} anonymous`
                    : undefined
                }
              >
                <span className="flex items-center gap-1.5 text-emce-text-sec">
                  <Eye className="h-3.5 w-3.5" /> Profile views (7d)
                </span>
                <span className="font-bold text-emce-dark">{profileViewStats.total}</span>
              </Link>
              <Link
                href={`/${me.slug}?tab=activity`}
                className="flex items-center justify-between rounded-md px-1 py-1 hover:bg-emce-light-soft"
              >
                <span className="flex items-center gap-1.5 text-emce-text-sec">
                  <TrendingUp className="h-3.5 w-3.5" /> Engagement this week
                </span>
                <span className="font-bold text-emce-dark">{totalEngagement7d}</span>
              </Link>
              <Link
                href={`/${me.slug}?tab=activity`}
                className="flex items-center justify-between rounded-md px-1 py-1 hover:bg-emce-light-soft"
              >
                <span className="text-emce-text-sec">Posts (last 7 days)</span>
                <span className="font-bold text-emce-dark">{weeklyPosts}</span>
              </Link>
            </div>
          </Card>

          {/* Pages you manage — only when applicable */}
          {teamCompanies.length > 0 && (
            <Card className="p-0">
              <div className="border-b border-emce-border px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-emce-text-sec">
                Pages you manage
              </div>
              <ul className="py-1">
                {teamCompanies.map((tc) => (
                  <li key={tc.company.id}>
                    <Link
                      href={`/companies/${tc.company.slug}`}
                      className="flex items-center gap-2 px-4 py-2 hover:bg-emce-light-soft"
                    >
                      <Avatar src={tc.company.logoUrl} name={tc.company.name} size="sm" />
                      <span className="truncate text-sm font-semibold text-emce-text">{tc.company.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Quick shortcuts — LinkedIn's saved/groups/events block */}
          <Card className="p-0">
            <ul className="py-1 text-sm">
              <ShortcutRow href="/me/saved" icon={<Bookmark className="h-3.5 w-3.5" />} label="Saved jobs" />
              <ShortcutRow href="/me/applications" icon={<Briefcase className="h-3.5 w-3.5" />} label="My applications" />
              <ShortcutRow href="/me/sessions" icon={<GraduationCap className="h-3.5 w-3.5" />} label="Mentor sessions" />
              <ShortcutRow href="/me/competitions" icon={<Trophy className="h-3.5 w-3.5" />} label="My competitions" />
              <ShortcutRow href="/people" icon={<Users className="h-3.5 w-3.5" />} label="Discover people" />
            </ul>
          </Card>

          {/* Discover pillar links — same list as the header
              "Discover" megamenu, mirrored here for one-click reach
              while a candidate is scrolling the feed. Single source
              of truth lives in `components/layout/discover-items.ts`
              so both surfaces stay in sync automatically. */}
          <Card className="p-0">
            <div className="flex items-center gap-2 border-b border-emce-border px-4 py-2.5">
              <Compass className="h-3.5 w-3.5 text-emce-text-sec" />
              <p className="text-xs font-bold uppercase tracking-wide text-emce-text-sec">
                Discover
              </p>
            </div>
            <ul className="py-1 text-sm">
              {DISCOVER_ITEMS.map((it) => {
                const Icon = it.icon;
                return (
                  <ShortcutRow
                    key={it.href}
                    href={it.href}
                    icon={<Icon className="h-3.5 w-3.5" />}
                    label={it.label}
                  />
                );
              })}
            </ul>
          </Card>
        </aside>

        {/* ─── Center column — composer + feed ─── */}
        <main className="lg:col-span-6">
          {/* Visually-hidden h1 — Bing flagged /feed as "missing
              h1" in the SEO audit. We don't want a chunky page title
              competing with the composer for the recruiter's eye
              (LinkedIn does the same — no visible "Feed" header on
              the feed page), so the h1 is sr-only. Crawlers still
              see it; layout stays unchanged. */}
          <h1 className="sr-only">EV-industry social feed</h1>
          <RichPostComposer
            user={{
              name: fullName,
              profilePhotoUrl: me.profilePhotoUrl,
              headline: me.headline,
              slug: me.slug,
            }}
            companies={teamCompanies.map((t) => t.company)}
          />

          {/* Tab strip — Following (graph) vs For you (topics).
              Tabs are URL-driven so back/forward and direct links to
              ?tab=for-you work; no client-side state needed. */}
          <div className="mt-3 flex items-center justify-between border-b border-emce-border">
            <div className="flex gap-1" role="tablist" aria-label="Feed view">
              <Link
                href="/feed"
                role="tab"
                aria-selected={activeTab === "following"}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
                  activeTab === "following"
                    ? "border-emce-dark text-emce-text"
                    : "border-transparent text-emce-text-sec hover:text-emce-text"
                }`}
              >
                Following
              </Link>
              <Link
                href="/feed?tab=for-you"
                role="tab"
                aria-selected={activeTab === "for-you"}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
                  activeTab === "for-you"
                    ? "border-emce-dark text-emce-text"
                    : "border-transparent text-emce-text-sec hover:text-emce-text"
                }`}
              >
                For you
              </Link>
            </div>
            <div className="hidden items-center pr-1 text-xs text-emce-text-sec sm:flex">
              <span className="hidden sm:inline">Sort by:</span>
              <button
                type="button"
                className="ml-1 inline-flex items-center gap-0.5 font-semibold text-emce-text hover:text-emce-dark"
              >
                Top <span aria-hidden>▾</span>
              </button>
            </div>
          </div>

          <div className="emce-stagger mt-2 space-y-2">
            {posts.length === 0 ? (
              activeTab === "for-you" ? (
                <EmptyState
                  icon="🏷️"
                  title={subscribedTopicCount === 0 ? "Pick a few topics to fill this feed" : "Nothing recent on your topics"}
                  body={
                    subscribedTopicCount === 0
                      ? "Follow #battery-engineering, #charging, or any tag that catches your eye. We'll surface posts from across the platform that mention them."
                      : "Your topics are quiet right now. Try following more, or check back later."
                  }
                  action={
                    <div className="flex gap-2">
                      <Button asChild size="sm"><Link href="/topics">Browse topics →</Link></Button>
                      {subscribedTopicCount > 0 && (
                        <Button asChild size="sm" variant="outline"><Link href="/me/topics">Manage</Link></Button>
                      )}
                    </div>
                  }
                />
              ) : (
                <EmptyState
                  icon="👋"
                  title="Your feed is quiet"
                  body="Connect with people in the EV industry, follow companies, or tap a hashtag to see updates."
                  action={
                    <div className="flex gap-2">
                      <Button asChild size="sm"><Link href="/people">Find people →</Link></Button>
                      <Button asChild size="sm" variant="outline"><Link href="/companies">Browse companies</Link></Button>
                    </div>
                  }
                />
              )
            ) : (
              posts.map((p) => {
                const votes = p.poll ? viewerPollVotes[p.poll.id] ?? [] : [];
                return (
                  <PostCard
                    key={p.id}
                    post={{ ...(p as unknown as FeedPostShape), viewerPollVotes: votes }}
                    viewerId={session.user.id}
                  />
                );
              })
            )}
          </div>
        </main>

        {/* ─── Right rail — news, suggestions, competitions ─── */}
        <aside className="hidden space-y-3 lg:col-span-3 lg:block">
          {/* "What's happening in EV" — top of rail because it's the
              most universally relevant. Cached for 15min via
              unstable_cache so the upstream fetch doesn't tax the
              feed render. Auto-hides on upstream errors / empty
              results so we don't surface a broken card. */}
          <EvNewsCard />

          {upcomingMentorshipSession && (
            <Card>
              <div className="flex items-start gap-2">
                <Calendar className="mt-0.5 h-4 w-4 text-emce-darkest" />
                <div>
                  <p className="text-section text-emce-text">Coming up</p>
                  <p className="mt-1 text-sm text-emce-text">
                    Mentor session with{" "}
                    <strong>{upcomingMentorshipSession.mentor.user.candidateProfile?.firstName ?? "your mentor"}</strong>
                  </p>
                  <p className="mt-0.5 text-hint text-emce-text-sec">
                    {upcomingMentorshipSession.scheduledAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
              </div>
              <Button asChild className="mt-3 w-full" size="sm" variant="outline">
                <Link href="/me/sessions">Open dashboard →</Link>
              </Button>
            </Card>
          )}

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-section text-emce-text">People you may know</h2>
              <Link href="/people" className="text-xs font-bold text-emce-dark hover:underline">See all</Link>
            </div>
            <p className="mt-1 text-hint text-emce-text-sec">Same EV domain as you</p>
            {suggestions.length === 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-hint text-emce-text-sec">
                  No matches yet — try one of these to fill your feed:
                </p>
                <div className="flex flex-col gap-1.5">
                  <Link href="/people" className="rounded-full border border-emce-border px-3 py-1.5 text-xs font-semibold text-emce-text hover:border-emce-mid hover:bg-emce-light-soft">
                    🔍 Browse people
                  </Link>
                  <Link href="/companies" className="rounded-full border border-emce-border px-3 py-1.5 text-xs font-semibold text-emce-text hover:border-emce-mid hover:bg-emce-light-soft">
                    🏢 Follow companies
                  </Link>
                  <Link href="/mentors" className="rounded-full border border-emce-border px-3 py-1.5 text-xs font-semibold text-emce-text hover:border-emce-mid hover:bg-emce-light-soft">
                    🎓 Find a mentor
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="mt-3 space-y-3">
                {await Promise.all(
                  suggestions.map(async (s) => {
                    const status = await getConnectionStatus(session.user.id, s.user.id);
                    const sname = `${s.firstName} ${s.lastName ?? ""}`.trim();
                    return (
                      <li key={s.id} className="flex items-start gap-2">
                        <Link href={`/${s.slug}`}>
                          <Avatar src={s.profilePhotoUrl} name={sname} size="sm" openToWork={s.openToWork && !s.hiringNow} hiring={s.hiringNow} />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/${s.slug}`}
                            className="block truncate text-sm font-semibold text-emce-text hover:underline"
                          >
                            {sname}
                          </Link>
                          {s.headline && (
                            <p className="line-clamp-2 text-hint text-emce-text-sec">{s.headline}</p>
                          )}
                          {/* EV-domain badges intentionally suppressed
                              here — they doubled up visual weight on a
                              card that's primarily about the person +
                              the Connect CTA. The matching context
                              ("Same EV domain as you") already lives
                              in the card subtitle above the list. */}
                          <div className="mt-2">
                            <ConnectButton
                              targetUserId={s.user.id}
                              initialStatus={status.status === "ACCEPTED"
                                ? "ACCEPTED"
                                : status.status === "PENDING_OUT" ? "PENDING_OUT"
                                : status.status === "PENDING_IN" ? "PENDING_IN"
                                : "NONE"}
                              connectionId={status.connectionId}
                              size="xs"
                            />
                          </div>
                        </div>
                      </li>
                    );
                  }),
                )}
              </ul>
            )}
          </Card>

          {/* Live competitions — LinkedIn's "Today's puzzles" analogue */}
          {liveCompetitions.length > 0 && (
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="text-section text-emce-text">Live competitions</h2>
                <Link href="/competitions" className="text-xs font-bold text-emce-dark hover:underline">All</Link>
              </div>
              <ul className="mt-3 space-y-2">
                {liveCompetitions.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/competitions/${c.slug}`}
                      className="flex items-start gap-2 rounded-md p-2 hover:bg-emce-light-soft"
                    >
                      <Avatar src={c.hostCompany.logoUrl} name={c.hostCompany.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-bold text-emce-text">{c.title}</p>
                        <p className="text-hint text-emce-text-sec">
                          {c.hostCompany.name} · ends {relativeTime(c.endsAt)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Latest jobs — LinkedIn analogue: "Jobs based on your activity".
              Pulls newest OPEN postings, ordered by publishedAt. */}
          {latestJobs.length > 0 && (
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="text-section text-emce-text">Latest EV jobs</h2>
                <Link href="/jobs" className="text-xs font-bold text-emce-dark hover:underline">All jobs</Link>
              </div>
              <ul className="mt-3 space-y-2">
                {latestJobs.map((j) => (
                  <li key={j.id}>
                    <Link
                      href={`/job/${j.slug}`}
                      className="flex items-start gap-2 rounded-md p-2 hover:bg-emce-light-soft"
                    >
                      <Avatar src={j.company.logoUrl} name={j.company.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-bold text-emce-text">{j.title}</p>
                        <p className="text-hint text-emce-text-sec">
                          {j.company.name} · {j.locations[0] ?? "Remote"} · {j.workMode.toLowerCase()}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/jobs" className="mt-3 block text-center text-xs font-bold text-emce-dark hover:underline">
                Show more →
              </Link>
            </Card>
          )}

          {/* Upcoming job fairs — mirrors profile-page sidebar. Hidden
              when nothing is upcoming so the rail doesn't get cluttered
              with empty placeholder cards. */}
          {upcomingFairs.length > 0 && (
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="text-section text-emce-text">Upcoming job fairs</h2>
                <Link href="/fairs" className="text-xs font-bold text-emce-dark hover:underline">All</Link>
              </div>
              <ul className="mt-3 space-y-2">
                {upcomingFairs.map((f) => {
                  const when = new Date(f.startsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                  const place = [f.city, f.state].filter(Boolean).join(", ");
                  return (
                    <li key={f.id}>
                      <Link
                        href={`/fairs/${f.slug}`}
                        className="flex items-start gap-2 rounded-md p-2 hover:bg-emce-light-soft"
                      >
                        <span className="text-base leading-none">📅</span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-bold text-emce-text">{f.title}</p>
                          <p className="text-hint text-emce-text-sec">{when} · {place}</p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link href="/fairs" className="mt-3 block text-center text-xs font-bold text-emce-dark hover:underline">
                Browse all fairs →
              </Link>
            </Card>
          )}

          {/* Upcoming events — webinars / meetups / demo days hosted
              by companies on the platform. Distinct from competitions
              (Live competitions card above already covers those) and
              from job fairs (multi-company hiring events). */}
          {upcomingEvents.length > 0 && (
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="text-section text-emce-text">Upcoming events</h2>
                <Link href="/events" className="text-xs font-bold text-emce-dark hover:underline">All</Link>
              </div>
              <ul className="mt-3 space-y-2">
                {upcomingEvents.map((e) => {
                  const when = new Date(e.startsAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
                  const kindEmoji =
                    e.eventType === "WEBINAR" ? "💻"
                    : e.eventType === "HYBRID" ? "🔀"
                    : "📍"; // IN_PERSON
                  return (
                    <li key={e.id}>
                      <Link
                        href={`/events/${e.slug}`}
                        className="flex items-start gap-2 rounded-md p-2 hover:bg-emce-light-soft"
                      >
                        <span className="text-base leading-none">{kindEmoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-bold text-emce-text">{e.title}</p>
                          <p className="text-hint text-emce-text-sec">{e.company.name} · {when}</p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link href="/events" className="mt-3 block text-center text-xs font-bold text-emce-dark hover:underline">
                Browse all events →
              </Link>
            </Card>
          )}

          {/* AI tools rail — static curated subset of /ai-tools. Same
              six picks as the profile-page sidebar (keep both in sync
              if a tool URL changes). Always renders — discovery surface
              that should be visible to every feed viewer. */}
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-section text-emce-text">AI tools</h2>
              <Link href="/ai-tools" className="text-xs font-bold text-emce-dark hover:underline">All</Link>
            </div>
            <p className="mt-1 text-hint text-emce-text-sec">Free EV-industry AI tools</p>
            <ul className="mt-3 space-y-1">
              {[
                { href: "/career-explorer", emoji: "🧭", label: "EV Career Explorer" },
                { href: "/ai-tools/mock-interview", emoji: "🎤", label: "Mock Interview" },
                { href: "/ai-tools/interview-simulator", emoji: "🏭", label: "Company Interview Simulator" },
                { href: "/ai-tools/cv-evaluation", emoji: "📊", label: "Resume Score" },
                { href: "/ai-tools/cover-letter", emoji: "✉️", label: "Cover Letter Writer" },
                { href: "/ai-tools/skills-analyzer", emoji: "🧪", label: "Skills Gap Analyzer" },
              ].map((t) => (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-emce-light-soft"
                  >
                    <span className="text-base leading-none">{t.emoji}</span>
                    <span className="font-bold text-emce-text">{t.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/ai-tools" className="mt-3 block text-center text-xs font-bold text-emce-dark hover:underline">
              Explore all tools →
            </Link>
          </Card>

          {/* Footer mini — LinkedIn's bottom-right About / Help block */}
          <div className="px-2 text-center text-[10px] text-emce-text-sec">
            <Link href="/about" className="hover:underline">About</Link> ·{" "}
            <Link href="/jobs" className="hover:underline">Jobs</Link> ·{" "}
            <Link href="/companies" className="hover:underline">Companies</Link> ·{" "}
            <Link href="/diyguru" className="hover:underline">DIYguru</Link>
          </div>
        </aside>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}

function ShortcutRow({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2 px-4 py-2 font-semibold text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
      >
        {icon}
        <span>{label}</span>
      </Link>
    </li>
  );
}
