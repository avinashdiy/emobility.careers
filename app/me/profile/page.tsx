import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/brand/Logo";
import { AvatarUploader } from "@/components/profile/AvatarUploader";
import { BannerUploader } from "@/components/profile/BannerUploader";
import { CustomizeUrlEditor } from "@/components/profile/CustomizeUrlEditor";
import { HeaderEditor } from "@/components/profile/sections/HeaderEditor";
import { ExperienceEditor } from "@/components/profile/sections/ExperienceEditor";
import { EducationEditor } from "@/components/profile/sections/EducationEditor";
import { SkillsEditor } from "@/components/profile/sections/SkillsEditor";
import { CertificationsEditor } from "@/components/profile/sections/CertificationsEditor";
import { ProjectsEditor } from "@/components/profile/sections/ProjectsEditor";
import { AwardsEditor } from "@/components/profile/sections/AwardsEditor";
import { LanguagesEditor } from "@/components/profile/sections/LanguagesEditor";
import { PrivacyEditor } from "@/components/profile/sections/PrivacyEditor";
import { AvailabilityEditor } from "@/components/profile/sections/AvailabilityEditor";
import { CustomCtaEditor } from "@/components/profile/sections/CustomCtaEditor";
import { VolunteerExperienceEditor } from "@/components/profile/sections/VolunteerExperienceEditor";
import { FeaturedPostsEditor } from "@/components/profile/sections/FeaturedPostsEditor";
import { RecommendationsInbox } from "@/components/profile/sections/RecommendationsInbox";
import { ProfileCompletenessCard } from "@/components/profile/ProfileCompletenessCard";
import { evaluateProfile, COMPLETENESS_THRESHOLDS } from "@/lib/profile-completeness";
import { env } from "@/lib/env";

export const metadata = { title: "Edit my profile" };

export default async function MyProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ incomplete?: string; pct?: string; jobId?: string; from?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/profile");
  const sp = await searchParams;

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      experiences: {
        orderBy: { startDate: "desc" },
        include: { companyRef: { select: { id: true, name: true, logoUrl: true, emailDomains: true } } },
      },
      education: {
        orderBy: { startYear: "desc" },
        include: { institutionRef: { select: { id: true, name: true, logoUrl: true } } },
      },
      skills: { include: { skill: true } },
      certifications: { orderBy: { issueDate: "desc" } },
      projects: { orderBy: { createdAt: "desc" } },
      awards: { orderBy: { date: "desc" } },
      evDomains: { include: { evDomain: true } },
      volunteerExperiences: { orderBy: { startDate: "desc" } },
      user: { select: { phoneVerifiedAt: true, emailVerifiedAt: true } },
    },
  });
  if (!profile) redirect("/onboarding");

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  const completeness = evaluateProfile(profile, {
    phoneVerified: !!profile.user.phoneVerifiedAt,
    emailVerified: !!profile.user.emailVerifiedAt,
  });

  // Side queries for the new sections — fetched in parallel so we
  // don't add a serial round-trip on top of the main profile load.
  const [ownPosts, receivedRecs] = await Promise.all([
    db.post.findMany({
      where: { authorId: session.user.id },
      orderBy: [{ featured: "desc" }, { featuredAt: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: {
        id: true, body: true, featured: true, featuredAt: true,
        createdAt: true, reactionsCount: true, commentsCount: true,
        kind: true, articleTitle: true,
      },
    }),
    db.recommendation.findMany({
      where: { toUserId: session.user.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 50,
      include: {
        fromUser: {
          select: {
            candidateProfile: {
              select: {
                slug: true, firstName: true, lastName: true,
                headline: true, profilePhotoUrl: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return (
    <div className="min-h-screen bg-emce-light-bg">
      {/* Top nav */}
      <header className="border-b border-emce-border bg-white">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" aria-label="Home" className="flex items-center">
            <Logo size="md" />
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/${profile.slug}`}>Preview public profile →</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/me">My dashboard</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-4xl py-10">
        {/* Gate-redirect notice — shown when the user arrived here because
            the apply gate (90%) blocked them. The pct + jobId carry the
            context so the message is specific to what they were trying to
            do. Hidden once the profile crosses the threshold. */}
        {sp.incomplete === "apply" && completeness.pct < COMPLETENESS_THRESHOLDS.APPLY && (
          <div className="mb-6 rounded-md border border-emce-orange bg-emce-orange-light p-4 text-sm">
            <p className="font-bold text-emce-orange">
              📝 You need a {COMPLETENESS_THRESHOLDS.APPLY}% complete profile to apply for jobs.
            </p>
            <p className="mt-1 text-emce-text">
              Yours is currently <strong>{sp.pct ?? completeness.pct}%</strong>. Add the items below
              and you'll be able to apply{sp.jobId ? <> to <Link href={`/jobs/${sp.jobId}`} className="font-bold text-emce-dark underline">that job</Link></> : null}.
            </p>
          </div>
        )}

        {/* Completeness gauge — same component used on /me dashboard. */}
        <div className="mb-6">
          <ProfileCompletenessCard result={completeness} />
        </div>

        {/* Profile summary card — LinkedIn-style header with cover
            photo on top + avatar overlapping the bottom edge. The
            BannerUploader pins to the top-right of the cover; the
            AvatarUploader sits below the avatar. */}
        <Card className="mb-6 overflow-hidden p-0">
          {/* Cover photo */}
          <div className="relative">
            {profile.bannerUrl ? (
              <div
                className="h-32 bg-cover bg-center sm:h-48"
                style={{ backgroundImage: `url(${profile.bannerUrl})` }}
                role="img"
                aria-label="Your cover photo"
              />
            ) : (
              <div className="emce-hero-gradient h-32 sm:h-48" />
            )}
            <BannerUploader hasBanner={!!profile.bannerUrl} />
          </div>

          {/* Header body — avatar overlaps the cover */}
          <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
            <div className="absolute -top-12 left-4 flex flex-col items-center sm:-top-16 sm:left-6">
              <Avatar
                src={profile.profilePhotoUrl}
                name={fullName}
                size="xl"
                openToWork={profile.openToWork && !profile.hiringNow}
                hiring={profile.hiringNow}
                className="h-24 w-24 ring-4 ring-white sm:h-32 sm:w-32"
              />
              <AvatarUploader />
            </div>

            {/* Spacer so the body clears the floating avatar */}
            <div className="h-14 sm:h-20" />

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h1 className="text-2xl font-extrabold leading-tight text-emce-text">{fullName}</h1>
              {profile.isDIYguruVerified && <Badge variant="verified">⭐ DIYguru Verified</Badge>}
            </div>
            {profile.headline && (
              <p className="mt-1 text-emce-text-sec">{profile.headline}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="default">{profile.profileMode}</Badge>
              {profile.hiringNow ? (
                <Badge variant="verified">🎯 Hiring now</Badge>
              ) : profile.openToWork ? (
                <Badge variant="success">Open to work</Badge>
              ) : (
                <Badge variant="outline">Not actively looking</Badge>
              )}
              <Badge variant="outline">
                {profile.cvVisibility === "EVERYONE" ? "Public" : profile.cvVisibility.replace("_", " ").toLowerCase()}
              </Badge>
            </div>

            {!profile.onboardingCompletedAt && (
              <div className="mt-4 rounded-md bg-emce-orange-light p-3 text-sm">
                <strong>Finish onboarding</strong> to set your job preferences.{" "}
                <Link href="/onboarding/preferences" className="font-bold text-emce-dark underline">
                  Continue →
                </Link>
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <CustomizeUrlEditor
            currentSlug={profile.slug}
            domain={env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, "")}
          />
          <HeaderEditor profile={profile} />
          <AvailabilityEditor
            openToWork={profile.openToWork}
            hiringNow={profile.hiringNow}
          />
          <CustomCtaEditor value={profile.customCta} />
          <FeaturedPostsEditor
            posts={ownPosts.map((p) => ({
              ...p,
              kind: p.kind as string,
            }))}
          />
          <ExperienceEditor experiences={profile.experiences} />
          <EducationEditor education={profile.education} />
          <VolunteerExperienceEditor entries={profile.volunteerExperiences} />
          <SkillsEditor
            initialSkills={profile.skills.map((s) => ({
              skillId: s.skillId,
              name: s.skill.name,
              proficiency: s.proficiency,
            }))}
            evDomains={profile.evDomains.map((d) => ({ slug: d.evDomain.slug, name: d.evDomain.name }))}
          />
          <CertificationsEditor certifications={profile.certifications} />
          <ProjectsEditor projects={profile.projects} />
          <AwardsEditor awards={profile.awards} />
          <LanguagesEditor languages={profile.languagesSpoken} />
          <RecommendationsInbox recs={receivedRecs} />
          <PrivacyEditor
            contactVisibility={profile.contactVisibility}
            resumeVisibility={profile.resumeVisibility}
            useAiResume={profile.useAiResume}
            hasManualResume={Boolean(profile.resumeUrl)}
            hasAiResume={Boolean(profile.aiResumeUrl)}
            aiResumeGeneratedAt={profile.aiResumeGeneratedAt}
          />
        </div>
      </main>
    </div>
  );
}
