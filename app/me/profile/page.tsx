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
      user: { select: { phoneVerifiedAt: true, emailVerifiedAt: true } },
    },
  });
  if (!profile) redirect("/onboarding");

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  const completeness = evaluateProfile(profile, {
    phoneVerified: !!profile.user.phoneVerifiedAt,
    emailVerified: !!profile.user.emailVerifiedAt,
  });

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

        {/* Profile summary card */}
        <Card className="mb-6 p-6">
          <div className="flex items-start gap-4">
            <div>
              <Avatar src={profile.profilePhotoUrl} name={fullName} size="lg" />
              <AvatarUploader />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-emce-text">{fullName}</h1>
                {profile.isDIYguruVerified && <Badge variant="verified">⭐ DIYguru Verified</Badge>}
              </div>
              {profile.headline && (
                <p className="text-emce-text-sec">{profile.headline}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="default">{profile.profileMode}</Badge>
                <Badge variant={profile.openToWork ? "success" : "outline"}>
                  {profile.openToWork ? "Open to work" : "Not actively looking"}
                </Badge>
                <Badge variant="outline">
                  {profile.cvVisibility === "EVERYONE" ? "Public" : profile.cvVisibility.replace("_", " ").toLowerCase()}
                </Badge>
              </div>
            </div>
          </div>

          {!profile.onboardingCompletedAt && (
            <div className="mt-4 rounded-md bg-emce-orange-light p-3 text-sm">
              <strong>Finish onboarding</strong> to set your job preferences.{" "}
              <Link href="/onboarding/preferences" className="font-bold text-emce-dark underline">
                Continue →
              </Link>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <CustomizeUrlEditor
            currentSlug={profile.slug}
            domain={env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, "")}
          />
          <HeaderEditor profile={profile} />
          <ExperienceEditor experiences={profile.experiences} />
          <EducationEditor education={profile.education} />
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
