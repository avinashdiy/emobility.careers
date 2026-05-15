import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { ProfileModeForm } from "@/components/onboarding/ProfileModeForm";

export const metadata = { title: "Welcome — Pick your profile mode" };

const MODES = [
  {
    value: "FRESHER",
    title: "Fresher",
    description: "Recently graduated or under 1 year of experience",
    emoji: "🎓",
  },
  {
    value: "EXPERIENCED",
    title: "Experienced",
    description: "1+ years of full-time work experience",
    emoji: "💼",
  },
  {
    value: "TECHNICIAN",
    title: "Technician",
    description: "Hands-on shop floor / service centre / lab roles",
    emoji: "🔧",
  },
  {
    value: "LEADERSHIP",
    title: "Leadership",
    description: "Team / function lead, manager, or director",
    emoji: "🎯",
  },
] as const;

export default async function OnboardingHome() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/onboarding");

  let profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  // Lazy-create the profile if it's missing. Normally `events.createUser`
  // in lib/auth.ts seeds one for OAuth signups, but this is a safety net:
  // if that hook ever misses (legacy account, transient DB error during
  // sign-in), we'd otherwise loop between /me → /onboarding → /me forever.
  if (!profile) {
    if (session.user.role === "EMPLOYER") redirect("/employer/onboarding");
    if (session.user.role !== "CANDIDATE") redirect("/me");

    const dbUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true },
    });
    const fullName = (dbUser?.name ?? "").trim();
    const [firstName, ...rest] = fullName.split(/\s+/).filter(Boolean);
    const slugSeed = fullName || dbUser?.email?.split("@")[0] || "member";

    const { withUniqueSlug } = await import("@/lib/slug");
    profile = await withUniqueSlug(slugSeed, (slug) =>
      db.candidateProfile.create({
        data: {
          userId: session.user!.id,
          slug,
          firstName: firstName || "Member",
          lastName: rest.join(" ") || null,
          email: dbUser?.email ?? null,
        },
      }),
    );
  }

  return (
    <Card className="p-8">
      <h1 className="text-2xl font-extrabold text-emce-text">
        Welcome to eMobility Careers
      </h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        Let&apos;s set up your profile in 4 quick steps. First — what kind of role are you in today?
      </p>

      <ProfileModeForm modes={MODES} defaultValue={profile.profileMode} />
    </Card>
  );
}
