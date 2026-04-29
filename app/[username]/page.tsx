import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { SiteHeader } from "@/components/layout/site-header";
// Profile pages render no footer at all — keeps the LinkedIn-style focus
// on the profile content with no visual interruption at the bottom.
import { saveCandidate } from "@/server/employer/actions";
import { ShareButton } from "@/components/profile/ShareButton";
import { ConnectButton } from "@/components/social/ConnectButton";
import { WhatsAppButton } from "@/components/whatsapp/WhatsAppButton";
import { FollowUserButton } from "@/components/social/FollowButton";
import { PostCard, type FeedPostShape } from "@/components/social/PostCard";
import { getConnectionStatus, isFollowingUser } from "@/server/social/queries";
import { breadcrumbJsonLd } from "@/lib/seo/schemas";
import { getViewerContext, canSeeContact, canSeeResume } from "@/lib/profile-visibility";
import { env } from "@/lib/env";
import { formatMonthYear } from "@/lib/utils";
import { RESERVED_SLUGS } from "@/lib/reserved-slugs";
import {
  MapPin,
  Linkedin,
  Github,
  Globe,
  Award,
  GraduationCap,
  Briefcase,
} from "lucide-react";

const TABS = ["activity", "about", "experience", "education", "skills"] as const;
type Tab = (typeof TABS)[number];

const PERSON_TYPE_LABEL: Record<string, string> = {
  PROFESSIONAL: "Industry Professional",
  STUDENT: "Student",
  TRAINER: "Trainer",
  FACULTY: "Faculty",
  TPO: "Placement Officer",
  EXPERT: "Industry Expert",
  COMPANY_REP: "Company Leadership",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  if (RESERVED_SLUGS.has(username.toLowerCase())) {
    return { title: "Page not found", robots: { index: false, follow: false } };
  }
  const profile = await db.candidateProfile.findUnique({
    where: { slug: username },
    select: { firstName: true, lastName: true, headline: true, cvVisibility: true },
  });
  if (!profile) {
    return { title: "Profile not found", robots: { index: false, follow: false } };
  }
  if (profile.cvVisibility !== "EVERYONE") {
    return { title: "Profile not available", robots: { index: false, follow: false } };
  }
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  return {
    title: name,
    description: profile.headline ?? `${name} on eMobility Careers`,
    alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/${username}` },
  };
}

export default async function PublicCandidateProfile({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { username } = await params;
  if (RESERVED_SLUGS.has(username.toLowerCase())) notFound();

  const sp = await searchParams;
  const activeTab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as Tab)
    : "activity";

  const session = await auth();

  const profile = await db.candidateProfile.findUnique({
    where: { slug: username },
    include: {
      user: { select: { id: true, role: true } },
      experiences: { orderBy: { startDate: "desc" } },
      education: { orderBy: { startYear: "desc" } },
      skills: { include: { skill: true } },
      certifications: { orderBy: { issueDate: "desc" } },
      projects: { orderBy: { createdAt: "desc" } },
      awards: { orderBy: { date: "desc" } },
      evDomains: { include: { evDomain: true } },
      representsCompany: { select: { id: true, slug: true, name: true, logoUrl: true } },
    },
  });
  if (!profile) notFound();

  // Visibility gates (private and employers-only)
  if (profile.cvVisibility === "PRIVATE") {
    return (
      <>
        <SiteHeader />
        <main className="container max-w-2xl py-20 text-center">
          <div className="mb-3 text-5xl">🔒</div>
          <h1 className="text-2xl font-extrabold text-emce-text">This profile is private</h1>
          <p className="mt-2 text-emce-text-sec">
            They&apos;ll appear in employer searches once they apply to a job.
          </p>
        </main>
      </>
    );
  }
  if (
    profile.cvVisibility === "EMPLOYERS_ONLY" &&
    session?.user?.role !== "EMPLOYER" &&
    session?.user?.role !== "ADMIN"
  ) {
    return (
      <>
        <SiteHeader />
        <main className="container max-w-2xl py-20 text-center">
          <div className="mb-3 text-5xl">👀</div>
          <h1 className="text-2xl font-extrabold text-emce-text">Recruiters only</h1>
          <p className="mt-2 text-emce-text-sec">
            Visible only to verified employers.{" "}
            <Link href="/signup?role=EMPLOYER" className="font-bold text-emce-dark underline">
              Sign up as a recruiter →
            </Link>
          </p>
        </main>
      </>
    );
  }

  const fullName = `${profile.firstName} ${profile.lastName ?? ""}`.trim();
  const isOwner = session?.user?.id === profile.userId;
  const isEmployer = session?.user?.role === "EMPLOYER" || session?.user?.role === "ADMIN";
  const totalYears = (profile.totalExperienceMonths / 12).toFixed(1);

  // Privacy gates — central helpers so every surface follows the same rules.
  // ContactVisibility hides email/phone by default; ResumeVisibility hides
  // the download CTA by default. Both can be loosened from /me/profile.
  const viewerCtx = await getViewerContext(
    session?.user?.id ?? null,
    profile.userId,
    (session?.user?.role as "ADMIN" | "EMPLOYER" | "CANDIDATE" | undefined) ?? null,
  );
  const showContact = canSeeContact(profile.contactVisibility, viewerCtx);
  const showResume = canSeeResume(profile.resumeVisibility, viewerCtx) && Boolean(profile.resumeUrl || profile.aiResumeUrl);
  const activeResumeUrl = profile.useAiResume && profile.aiResumeUrl ? profile.aiResumeUrl : profile.resumeUrl;

  const [connectionStatus, isFollowing, postsCount, recentPosts, mentorProfile, competitionWins, matchingJobs] = await Promise.all([
    session?.user
      ? getConnectionStatus(session.user.id, profile.user.id)
      : Promise.resolve({ status: "NONE" as const, connectionId: undefined as string | undefined }),
    session?.user
      ? isFollowingUser(session.user.id, profile.user.id)
      : Promise.resolve(false),
    db.post.count({ where: { authorId: profile.user.id, visibility: "PUBLIC" } }),
    db.post.findMany({
      where: {
        authorId: profile.user.id,
        visibility: profile.userId === session?.user?.id ? undefined : "PUBLIC",
      },
      orderBy: { createdAt: "desc" },
      take: activeTab === "activity" ? 10 : 0,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            candidateProfile: {
              select: {
                slug: true,
                firstName: true,
                lastName: true,
                headline: true,
                profilePhotoUrl: true,
                isDIYguruVerified: true,
                personType: true,
              },
            },
          },
        },
        asCompany: { select: { id: true, slug: true, name: true, logoUrl: true } },
        attachedJob: {
          select: {
            id: true, title: true, locations: true, workMode: true, profileMode: true,
            company: { select: { name: true, slug: true, logoUrl: true } },
          },
        },
        repostOf: {
          include: {
            author: {
              select: {
                id: true, name: true,
                candidateProfile: { select: { slug: true, firstName: true, lastName: true, profilePhotoUrl: true } },
              },
            },
          },
        },
        reactions: { select: { type: true, userId: true }, take: 5 },
      },
    }),
    db.mentorProfile.findUnique({
      where: { userId: profile.userId },
      select: {
        id: true, headline: true, isPublished: true, kycStatus: true,
        avgRating: true, totalRatings: true, totalSessions: true,
        pricePerSessionMinor: true, currency: true, acceptingFree: true, acceptingPaid: true,
      },
    }),
    db.competitionRegistration.findMany({
      where: {
        leaderUserId: profile.userId,
        status: { in: ["WINNER", "RUNNER_UP", "FINALIST"] },
      },
      orderBy: { competition: { resultsAt: "desc" } },
      take: 6,
      include: {
        competition: { select: { id: true, slug: true, title: true, type: true, hostCompany: { select: { name: true } } } },
      },
    }),
    // Matching jobs — overlap candidate's EV domains with the JD's domain
    // tags. v1 ranking is recency; the AI-driven score lives in the
    // /employer/jobs/[id]/matches page and uses pgvector. This is a quick
    // overlap query — Prisma can do it via the relation join. Falls back to
    // the latest open jobs if the candidate hasn't tagged any domain yet.
    db.jobPosting.findMany({
      where: {
        status: "OPEN",
        publishedAt: { not: null },
        ...(profile.evDomains.length > 0
          ? { evDomains: { some: { evDomainId: { in: profile.evDomains.map((d) => d.evDomainId) } } } }
          : {}),
      },
      orderBy: { publishedAt: "desc" },
      take: 4,
      select: {
        id: true, slug: true, title: true, locations: true, workMode: true, publishedAt: true,
        company: { select: { name: true, logoUrl: true, slug: true } },
      },
    }),
  ]);

  // Person JSON-LD for richer snippets when public.
  const personJsonLd =
    profile.cvVisibility === "EVERYONE"
      ? {
          "@context": "https://schema.org",
          "@type": "Person",
          name: fullName,
          description: profile.headline ?? undefined,
          image: profile.profilePhotoUrl ?? undefined,
          url: `${env.NEXT_PUBLIC_APP_URL}/${profile.slug}`,
          jobTitle: profile.headline ?? undefined,
          address: profile.location ? { "@type": "PostalAddress", addressLocality: profile.location } : undefined,
          sameAs: [profile.linkedinUrl, profile.githubUrl, profile.portfolioUrl].filter(Boolean),
        }
      : null;

  const ctaStatus =
    !session?.user ? "ANON" :
    isOwner ? "SELF" :
    connectionStatus.status === "ACCEPTED" ? "ACCEPTED" :
    connectionStatus.status === "PENDING_OUT" ? "PENDING_OUT" :
    connectionStatus.status === "PENDING_IN" ? "PENDING_IN" :
    "NONE";

  const breadcrumbLd = profile.cvVisibility === "EVERYONE"
    ? breadcrumbJsonLd([
        { name: "Home", href: "/" },
        { name: "People", href: "/people" },
        { name: fullName, href: `/${profile.slug}` },
      ])
    : null;

  return (
    <>
      {personJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />
      )}
      {breadcrumbLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
        />
      )}
      <SiteHeader />

      {/* LinkedIn-style banner + profile header */}
      <div className="container max-w-5xl py-4 sm:py-6">
        <Card className="overflow-hidden p-0 shadow-sm">
          {/* Banner — taller, sharp bottom edge */}
          <div className="emce-hero-gradient h-36 sm:h-52" />

          <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
            {/* Avatar — overlaps banner ~50%, on its own row so no buttons collide */}
            <div className="absolute left-4 top-0 -translate-y-1/2 sm:left-6">
              <Avatar
                src={profile.profilePhotoUrl}
                name={fullName}
                size="xl"
                openToWork={profile.openToWork}
                className="h-28 w-28 ring-4 ring-white sm:h-36 sm:w-36 [&>span]:text-3xl"
              />
            </div>

            {/* Spacer to clear the floating avatar */}
            <div className="h-16 sm:h-20" />

            {/* Identity block: name, headline, location row, stats row, badges */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h1 className="text-2xl font-bold leading-tight tracking-tight text-emce-text sm:text-[28px]">
                  {fullName}
                </h1>
                {profile.pronouns && (
                  <span className="text-sm text-emce-text-muted">({profile.pronouns})</span>
                )}
                {profile.isDIYguruVerified && (
                  <Badge variant="verified" className="ml-1 text-[10px]">⭐ DIYguru</Badge>
                )}
              </div>

              {profile.headline && (
                <p className="text-[15px] text-emce-text">{profile.headline}</p>
              )}

              {/* Location · institution · experience — single tight row */}
              {(profile.location || profile.institution || profile.totalExperienceMonths > 0) && (
                <p className="text-sm text-emce-text-sec">
                  {[
                    profile.location,
                    profile.institution,
                    profile.totalExperienceMonths > 0 ? `${totalYears} yrs experience` : null,
                  ].filter(Boolean).join(" · ")}
                  {!isOwner && session?.user && (
                    <>
                      {" · "}
                      <span className="text-emce-dark">Contact info</span>
                    </>
                  )}
                </p>
              )}

              {/* Connections / followers / posts — inline, link-coloured */}
              <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
                <Link
                  href={isOwner ? "/me/network" : "#"}
                  className="font-bold text-emce-dark hover:underline"
                >
                  {profile.connectionsCount.toLocaleString()} connection{profile.connectionsCount === 1 ? "" : "s"}
                </Link>
                <span className="text-emce-text-sec">·</span>
                <span className="font-bold text-emce-dark">
                  {profile.followersCount.toLocaleString()} <span className="font-normal text-emce-text-sec">followers</span>
                </span>
                <span className="text-emce-text-sec">·</span>
                <span className="font-bold text-emce-dark">
                  {postsCount.toLocaleString()} <span className="font-normal text-emce-text-sec">posts</span>
                </span>
              </div>

              {/* Person type + open-to-work pill — small row */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <Badge variant="default" className="text-[10px]">
                  {PERSON_TYPE_LABEL[profile.personType] ?? "Professional"}
                </Badge>
                {/* Open-to-Work cue lives on the avatar (#OpenToWork chip +
                    green ring) — same place LinkedIn puts it. The
                    redundant text badge here was removed when we adopted
                    the avatar treatment. */}
                {profile.evDomains.slice(0, 4).map((d) => (
                  <Badge key={d.evDomain.slug} variant="outline" className="text-[10px]">
                    {d.evDomain.name}
                  </Badge>
                ))}
                {profile.evDomains.length > 4 && (
                  <span className="text-[10px] text-emce-text-sec">+{profile.evDomains.length - 4} more</span>
                )}
              </div>
            </div>

            {/* Action buttons — dedicated row at the bottom, primary is filled */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {isOwner ? (
                <>
                  <Button asChild size="sm">
                    <Link href="/me/profile">Edit profile</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/me">Open dashboard</Link>
                  </Button>
                  {/* Compass CTA — owner-visible. Public visitors see
                      the same link via the right rail of the profile.
                      It's also linked from the Pulse page. */}
                  <Button asChild size="sm" variant="outline" className="border-emce-mid text-emce-darkest hover:bg-emce-light-soft">
                    <Link href={`/${profile.slug}/compass`}>⚡ My Compass</Link>
                  </Button>
                </>
              ) : (
                <>
                  <ConnectButton
                    targetUserId={profile.user.id}
                    initialStatus={ctaStatus}
                    connectionId={connectionStatus.connectionId}
                  />
                  {session?.user && (
                    <FollowUserButton
                      userId={profile.user.id}
                      initialFollowing={isFollowing}
                      signedIn={true}
                    />
                  )}
                  <Button asChild size="sm" variant="outline" className="border-emce-mid text-emce-darkest hover:bg-emce-light-soft">
                    <Link href={`/${profile.slug}/compass`}>⚡ View Compass</Link>
                  </Button>
                  {isEmployer && (
                    <form action={saveCandidate}>
                      <input type="hidden" name="candidateId" value={profile.id} />
                      <Button type="submit" variant="outline" size="sm">☆ Save</Button>
                    </form>
                  )}
                </>
              )}
              <ShareButton url={`${env.NEXT_PUBLIC_APP_URL}/${profile.slug}`} />
              {showResume && activeResumeUrl && (
                <Button asChild variant="outline" size="sm">
                  <a href={activeResumeUrl} target="_blank" rel="noopener noreferrer">
                    📄 Download résumé
                  </a>
                </Button>
              )}
            </div>

            {/* Contact info — gated. Renders only when ContactVisibility allows
                the viewer; default PRIVATE means visitors see nothing. The
                owner always sees their own + a small "private" hint so they
                can flip the toggle in /me/profile if they want it public. */}
            {(showContact || isOwner) && (profile.email || profile.phone) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-emce-border pt-3 text-xs">
                {showContact ? (
                  <>
                    {profile.email && (
                      <a href={`mailto:${profile.email}`} className="inline-flex items-center gap-1 font-semibold text-emce-dark hover:underline">
                        ✉️ {profile.email}
                      </a>
                    )}
                    {profile.phone && (
                      <a href={`tel:${profile.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 font-semibold text-emce-dark hover:underline">
                        📞 {profile.phone}
                      </a>
                    )}
                    {/* WhatsApp deep-link CTA — opens the recruiter's
                        WhatsApp app on mobile, web.whatsapp.com on
                        desktop, with a polite intro pre-filled. Hidden
                        when no phone is on file (component returns null). */}
                    {profile.phone && (
                      <WhatsAppButton
                        phone={profile.phone}
                        candidateName={fullName}
                        size="sm"
                        className="ml-1"
                      />
                    )}
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emce-text-sec">
                    🔒 Contact info is {profile.contactVisibility.toLowerCase().replace("_", " ")}.
                    {isOwner && (
                      <Link href="/me/profile?tab=privacy" className="font-bold text-emce-dark hover:underline">
                        Change visibility →
                      </Link>
                    )}
                  </span>
                )}
              </div>
            )}

            {/* External links — small icon row, only when present */}
            {(profile.linkedinUrl || profile.githubUrl || profile.portfolioUrl) && (
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-emce-border pt-3 text-xs text-emce-text-sec">
                {profile.linkedinUrl && (
                  <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-emce-dark">
                    <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                  </a>
                )}
                {profile.githubUrl && (
                  <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-emce-dark">
                    <Github className="h-3.5 w-3.5" /> GitHub
                  </a>
                )}
                {profile.portfolioUrl && (
                  <a href={profile.portfolioUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-emce-dark">
                    <Globe className="h-3.5 w-3.5" /> Portfolio
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Tabs — LinkedIn-style thin underline, semibold (not bold) */}
          <nav className="border-t border-emce-border" aria-label="Profile sections">
            <ul className="flex overflow-x-auto px-2 sm:px-4">
              {TABS.map((t) => (
                <li key={t}>
                  <Link
                    href={`/${profile.slug}?tab=${t}`}
                    className={`block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold capitalize transition-colors ${
                      activeTab === t
                        ? "border-emce-dark text-emce-text"
                        : "border-transparent text-emce-text-sec hover:border-emce-border hover:text-emce-text"
                    }`}
                  >
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </Card>

        {/* Tab content */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {activeTab === "activity" && (
              <>
                {/* Activity header bar — LinkedIn renders this as a slim
                    counter line above the post list, not a separate card. */}
                <div className="flex items-center justify-between rounded-lg border border-emce-border bg-white px-5 py-3 shadow-sm">
                  <div>
                    <h2 className="text-base font-bold text-emce-text">Activity</h2>
                    <p className="text-xs text-emce-text-sec">
                      {profile.followersCount} follower{profile.followersCount === 1 ? "" : "s"} · {postsCount} post{postsCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  {!isOwner && session?.user && (
                    <FollowUserButton
                      userId={profile.user.id}
                      initialFollowing={isFollowing}
                      signedIn={true}
                    />
                  )}
                </div>
                {recentPosts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-emce-border bg-white p-10 text-center">
                    <p className="text-sm font-bold text-emce-text">
                      {isOwner ? "You haven't posted yet" : `${profile.firstName} hasn't posted yet`}
                    </p>
                    <p className="mt-1 text-hint text-emce-text-sec">
                      {isOwner ? "Share an update from your /feed to start showing activity here." : "Follow to get notified when they post."}
                    </p>
                  </div>
                ) : (
                  recentPosts.map((p) => (
                    <PostCard key={p.id} post={p as unknown as FeedPostShape} viewerId={session?.user?.id ?? null} />
                  ))
                )}
              </>
            )}

            {activeTab === "about" && (
              <Card>
                <h2 className="text-section text-emce-text">About</h2>
                {profile.summary ? (
                  <p className="mt-3 whitespace-pre-line text-body text-emce-text-sec">{profile.summary}</p>
                ) : (
                  <p className="mt-3 text-hint text-emce-text-muted">No bio yet.</p>
                )}
                {profile.representsCompany && (
                  <div className="mt-4 rounded-md bg-emce-light-soft p-3 text-sm">
                    Represents{" "}
                    <Link href={`/company/${profile.representsCompany.slug}`} className="font-bold text-emce-dark hover:underline">
                      {profile.representsCompany.name}
                    </Link>
                  </div>
                )}
              </Card>
            )}

            {activeTab === "experience" && (
              <Card>
                <h2 className="text-section text-emce-text flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-emce-mid" /> Experience
                </h2>
                {profile.experiences.length === 0 ? (
                  <p className="mt-3 text-hint text-emce-text-muted">No experience listed.</p>
                ) : (
                  <ul className="mt-4 space-y-5">
                    {profile.experiences.map((e) => (
                      <li key={e.id} className="border-l-2 border-emce-mid pl-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-emce-text">{e.title}</span>
                          {/* Verified-Company badge — green chip when stamped.
                              The most visible cue that this candidate's
                              employment claim has been corroborated. */}
                          {e.verifiedAt && (
                            <Badge variant="success" className="text-[10px]">
                              ✓ Verified{e.verifiedMethod === "EMAIL_DOMAIN" ? " · email" : e.verifiedMethod === "RECRUITER_APPROVAL" ? " · recruiter" : ""}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-emce-text-sec">{e.company}</div>
                        <div className="text-hint text-emce-text-muted">
                          {formatMonthYear(e.startDate)} – {e.current ? "Present" : formatMonthYear(e.endDate)}
                          {e.location ? ` · ${e.location}` : ""}
                        </div>
                        {e.description && (
                          <p className="mt-2 whitespace-pre-line text-body text-emce-text-sec">{e.description}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {activeTab === "education" && (
              <Card>
                <h2 className="text-section text-emce-text flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-emce-mid" /> Education
                </h2>
                {profile.education.length === 0 ? (
                  <p className="mt-3 text-hint text-emce-text-muted">No education listed.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {profile.education.map((e) => (
                      <li key={e.id}>
                        <div className="font-bold text-emce-text">{e.institution}</div>
                        <div className="text-sm text-emce-text-sec">
                          {[e.degree, e.field].filter(Boolean).join(" · ")}
                        </div>
                        <div className="text-hint text-emce-text-muted">
                          {e.startYear ?? "?"}–{e.endYear ?? "?"}
                          {e.grade ? ` · ${e.grade}` : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {activeTab === "skills" && (
              <>
                <Card>
                  <h2 className="text-section text-emce-text">Skills</h2>
                  {profile.skills.length === 0 ? (
                    <p className="mt-3 text-hint text-emce-text-muted">No skills listed yet.</p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {profile.skills.map((s) => (
                        <Badge key={s.skill.name} variant="default">{s.skill.name}</Badge>
                      ))}
                    </div>
                  )}
                </Card>

                {profile.projects.length > 0 && (
                  <Card>
                    <h2 className="text-section text-emce-text">Projects</h2>
                    <ul className="mt-4 space-y-4">
                      {profile.projects.map((p) => (
                        <li key={p.id} className="rounded-md border border-emce-border p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-bold text-emce-text">{p.title}</div>
                            {p.url && (
                              <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-hint font-bold text-emce-dark hover:underline">
                                View →
                              </a>
                            )}
                          </div>
                          {p.description && (
                            <p className="mt-1 text-body text-emce-text-sec">{p.description}</p>
                          )}
                          {p.techStack.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {p.techStack.map((t) => (
                                <Badge key={t} variant="outline">{t}</Badge>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {profile.certifications.length > 0 && (
                  <Card>
                    <h2 className="text-section text-emce-text flex items-center gap-2">
                      <Award className="h-4 w-4 text-emce-mid" /> Certifications
                    </h2>
                    <ul className="mt-3 space-y-3">
                      {profile.certifications.map((c) => (
                        <li key={c.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-emce-text">{c.name}</span>
                            {c.diyguruVerified && <Badge variant="verified">⭐</Badge>}
                          </div>
                          {c.issuer && (
                            <div className="text-hint text-emce-text-sec">{c.issuer}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {profile.awards.length > 0 && (
                  <Card>
                    <h2 className="text-section text-emce-text">Awards</h2>
                    <ul className="mt-3 space-y-2">
                      {profile.awards.map((a) => (
                        <li key={a.id}>
                          <div className="font-bold text-emce-text">{a.title}</div>
                          <div className="text-hint text-emce-text-sec">
                            {[a.issuer, a.date ? formatMonthYear(a.date) : null].filter(Boolean).join(" · ")}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </>
            )}
          </div>

          {/* Right rail */}
          <aside className="space-y-4">
            {mentorProfile && mentorProfile.isPublished && mentorProfile.kycStatus === "APPROVED" && (
              <Card className="border-emce-mid">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-emce-darkest" />
                  <h2 className="text-section text-emce-text">Open for mentorship</h2>
                </div>
                <p className="mt-1 text-sm text-emce-text-sec">{mentorProfile.headline}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emce-text-sec">
                  {mentorProfile.totalRatings > 0 && (
                    <span>★ {mentorProfile.avgRating.toFixed(1)} ({mentorProfile.totalRatings})</span>
                  )}
                  {mentorProfile.totalSessions > 0 && <span>{mentorProfile.totalSessions} sessions</span>}
                </div>
                <div className="mt-2 text-sm">
                  {mentorProfile.acceptingFree && !mentorProfile.acceptingPaid && (
                    <span className="font-bold text-emce-mid">Free sessions</span>
                  )}
                  {mentorProfile.acceptingPaid && (
                    <span className="font-bold text-emce-text">
                      {new Intl.NumberFormat("en-IN", { style: "currency", currency: mentorProfile.currency, maximumFractionDigits: 0 }).format(mentorProfile.pricePerSessionMinor / 100)}
                      <span className="ml-1 text-xs font-normal text-emce-text-sec">/ session</span>
                    </span>
                  )}
                  {mentorProfile.acceptingFree && mentorProfile.acceptingPaid && (
                    <span className="ml-1 text-xs text-emce-text-sec">or free</span>
                  )}
                </div>
                {!isOwner && (
                  <Button asChild variant="accent" className="mt-3 w-full">
                    <Link href={`/mentors/${profile.slug}`}>Book a session →</Link>
                  </Button>
                )}
                {isOwner && (
                  <Button asChild variant="outline" className="mt-3 w-full">
                    <Link href="/me/mentor/sessions">Mentor inbox →</Link>
                  </Button>
                )}
              </Card>
            )}

            {/* Matching jobs — overlaps candidate's EV-domain tags with
                open postings. LinkedIn shows a similar "Jobs you might be
                interested in" card on profiles. */}
            {matchingJobs.length > 0 && (
              <Card>
                <div className="flex items-center justify-between">
                  <h2 className="text-section text-emce-text">
                    {profile.evDomains.length > 0 ? "Matching jobs" : "Latest jobs"}
                  </h2>
                  <Link href="/jobs" className="text-xs font-bold text-emce-dark hover:underline">All</Link>
                </div>
                {profile.evDomains.length > 0 && (
                  <p className="mt-1 text-hint text-emce-text-sec">
                    Open roles in {profile.evDomains.slice(0, 2).map((d) => d.evDomain.name).join(", ")}
                    {profile.evDomains.length > 2 && ` · +${profile.evDomains.length - 2}`}
                  </p>
                )}
                <ul className="mt-3 space-y-2">
                  {matchingJobs.map((j) => (
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

            {competitionWins.length > 0 && (
              <Card>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏆</span>
                  <h2 className="text-section text-emce-text">Competition wins</h2>
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {competitionWins.map((r) => (
                    <li key={r.id}>
                      <Link href={`/competitions/${r.competition.slug}`} className="font-bold text-emce-text hover:underline">
                        {r.competition.title}
                      </Link>
                      <p className="text-hint text-emce-text-sec">
                        {r.status === "WINNER" ? "🥇 Winner" : r.status === "RUNNER_UP" ? "🥈 Runner-up" : "🏅 Finalist"}
                        {r.competition.hostCompany?.name ? ` · ${r.competition.hostCompany.name}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {profile.languagesSpoken.length > 0 && (
              <Card>
                <h2 className="text-section text-emce-text">Languages</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.languagesSpoken.map((l) => (
                    <Badge key={l} variant="outline">{l}</Badge>
                  ))}
                </div>
              </Card>
            )}

            {profile.labExposureTags.length > 0 && (
              <Card>
                <h2 className="text-section text-emce-text">Lab exposure</h2>
                <p className="text-hint text-emce-text-sec">From DIYguru curriculum &amp; resume.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {profile.labExposureTags.map((t) => (
                    <Badge key={t} variant="default" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </Card>
            )}

            <Card className="bg-emce-light-soft">
              <h2 className="text-section text-emce-text">Profile URL</h2>
              <p className="mt-2 break-all text-hint text-emce-text-sec">
                {env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, "")}/{profile.slug}
              </p>
              {isOwner && (
                <Button asChild variant="ghost" size="sm" className="mt-2">
                  <Link href="/me/profile">Customize URL</Link>
                </Button>
              )}
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
