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
import { SiteFooter } from "@/components/layout/site-footer";
import { saveCandidate } from "@/server/employer/actions";
import { ShareButton } from "@/components/profile/ShareButton";
import { ConnectButton } from "@/components/social/ConnectButton";
import { FollowUserButton } from "@/components/social/FollowButton";
import { PostCard, type FeedPostShape } from "@/components/social/PostCard";
import { getConnectionStatus, isFollowingUser } from "@/server/social/queries";
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
        <SiteFooter />
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
        <SiteFooter />
      </>
    );
  }

  const fullName = `${profile.firstName} ${profile.lastName ?? ""}`.trim();
  const isOwner = session?.user?.id === profile.userId;
  const isEmployer = session?.user?.role === "EMPLOYER" || session?.user?.role === "ADMIN";
  const totalYears = (profile.totalExperienceMonths / 12).toFixed(1);

  const [connectionStatus, isFollowing, postsCount, recentPosts, mentorProfile, competitionWins] = await Promise.all([
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

  return (
    <>
      {personJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />
      )}
      <SiteHeader />

      {/* LinkedIn-style banner + profile header */}
      <div className="container max-w-5xl py-4 sm:py-6">
        <Card className="overflow-hidden p-0">
          <div className="emce-hero-gradient h-32 sm:h-44" />
          <div className="px-4 pb-4 pt-0 sm:px-8 sm:pb-6">
            <div className="-mt-12 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <Avatar
                  src={profile.profilePhotoUrl}
                  name={fullName}
                  size="xl"
                  className="ring-4 ring-white"
                />
                {profile.openToWork && (
                  <Badge variant="success" className="mb-2 hidden sm:inline-flex">Open to work</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <ShareButton url={`${env.NEXT_PUBLIC_APP_URL}/${profile.slug}`} />
                {!isOwner && session?.user && (
                  <FollowUserButton
                    userId={profile.user.id}
                    initialFollowing={isFollowing}
                    signedIn={true}
                  />
                )}
                {!isOwner && isEmployer && (
                  <form action={saveCandidate}>
                    <input type="hidden" name="candidateId" value={profile.id} />
                    <Button type="submit" variant="ghost" size="default">☆ Save</Button>
                  </form>
                )}
                <ConnectButton
                  targetUserId={profile.user.id}
                  initialStatus={ctaStatus}
                  connectionId={connectionStatus.connectionId}
                />
                {isOwner && (
                  <Button asChild variant="outline">
                    <Link href="/me/profile">Edit profile</Link>
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold text-emce-text md:text-3xl">{fullName}</h1>
                {profile.pronouns && (
                  <span className="text-hint text-emce-text-muted">({profile.pronouns})</span>
                )}
                {profile.isDIYguruVerified && <Badge variant="verified">⭐ DIYguru Verified</Badge>}
                <Badge variant="default">{PERSON_TYPE_LABEL[profile.personType] ?? "Professional"}</Badge>
                {profile.openToWork && (
                  <Badge variant="success" className="sm:hidden">Open to work</Badge>
                )}
              </div>
              {profile.headline && (
                <p className="mt-2 text-base text-emce-text-sec">{profile.headline}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-emce-text-sec">
                {profile.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {profile.location}
                  </span>
                )}
                {profile.institution && (
                  <span className="inline-flex items-center gap-1">
                    <GraduationCap className="h-4 w-4" /> {profile.institution}
                  </span>
                )}
                {profile.totalExperienceMonths > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Briefcase className="h-4 w-4" /> {totalYears} yrs
                  </span>
                )}
                {profile.linkedinUrl && (
                  <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-emce-dark">
                    <Linkedin className="h-4 w-4" /> LinkedIn
                  </a>
                )}
                {profile.githubUrl && (
                  <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-emce-dark">
                    <Github className="h-4 w-4" /> GitHub
                  </a>
                )}
                {profile.portfolioUrl && (
                  <a href={profile.portfolioUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-emce-dark">
                    <Globe className="h-4 w-4" /> Portfolio
                  </a>
                )}
              </div>

              {/* Counters row */}
              <div className="mt-3 flex flex-wrap gap-4 border-t border-emce-border pt-3 text-hint">
                <Link href={isOwner ? "/me/network" : "#"} className="hover:underline">
                  <strong className="text-emce-text">{profile.connectionsCount}</strong>
                  <span className="ml-1 text-emce-text-sec">connections</span>
                </Link>
                <span>
                  <strong className="text-emce-text">{profile.followersCount}</strong>
                  <span className="ml-1 text-emce-text-sec">followers</span>
                </span>
                <span>
                  <strong className="text-emce-text">{postsCount}</strong>
                  <span className="ml-1 text-emce-text-sec">posts</span>
                </span>
              </div>

              {profile.evDomains.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {profile.evDomains.map((d) => (
                    <Badge key={d.evDomain.slug} variant="success">{d.evDomain.name}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <nav className="border-t border-emce-border" aria-label="Profile sections">
            <ul className="flex gap-1 overflow-x-auto px-2 sm:px-6">
              {TABS.map((t) => (
                <li key={t}>
                  <Link
                    href={`/${profile.slug}?tab=${t}`}
                    className={`block whitespace-nowrap border-b-2 px-3 py-3 text-sm font-bold capitalize transition-colors ${
                      activeTab === t
                        ? "border-emce-dark text-emce-dark"
                        : "border-transparent text-emce-text-sec hover:text-emce-text"
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
                <Card>
                  <h2 className="text-section text-emce-text">Recent activity</h2>
                  <p className="text-hint text-emce-text-sec">{postsCount} post{postsCount === 1 ? "" : "s"}</p>
                </Card>
                {recentPosts.length === 0 ? (
                  <Card className="p-6 text-center">
                    <p className="text-hint text-emce-text-sec">
                      {fullName} hasn&apos;t posted yet.
                    </p>
                  </Card>
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
                        <div className="font-bold text-emce-text">{e.title}</div>
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

      <SiteFooter />
    </>
  );
}
