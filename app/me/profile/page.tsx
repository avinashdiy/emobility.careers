import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
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
import { env } from "@/lib/env";

export const metadata = { title: "Edit my profile" };

export default async function MyProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/profile");

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      experiences: { orderBy: { startDate: "desc" } },
      education: { orderBy: { startYear: "desc" } },
      skills: { include: { skill: true } },
      certifications: { orderBy: { issueDate: "desc" } },
      projects: { orderBy: { createdAt: "desc" } },
      awards: { orderBy: { date: "desc" } },
      evDomains: { include: { evDomain: true } },
    },
  });
  if (!profile) redirect("/onboarding");

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");

  return (
    <div className="min-h-screen bg-emce-light-bg">
      {/* Top nav */}
      <header className="border-b border-emce-border bg-white">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-extrabold text-emce-text">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-emce-mid text-emce-darkest">eM</span>
            <span>eMobility Careers</span>
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
        </div>
      </main>
    </div>
  );
}
