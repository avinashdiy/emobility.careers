import { redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PreferencesForm } from "@/components/onboarding/PreferencesForm";
import { COUNTRIES } from "@/lib/countries";

export const metadata = { title: "Preferences" };

export default async function PreferencesStep() {
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");

  return (
    <Card className="p-8">
      <Badge variant="default" className="mb-2">Step 4 of 5</Badge>
      <h1 className="text-2xl font-extrabold text-emce-text">Job preferences</h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        Help us match you with the right roles. You can change these anytime.
      </p>

      <PreferencesForm
        countries={COUNTRIES}
        initial={{
          country: profile.country,
          city: profile.city,
          preferredCities: profile.preferredCities,
          relocationPref: profile.relocationPref,
          availabilityStatus: profile.availabilityStatus,
          noticePeriodDays: profile.noticePeriodDays,
          cvVisibility: profile.cvVisibility,
          expectedCtcMin: profile.expectedCtcMin ? Number(profile.expectedCtcMin) : null,
          expectedCtcMax: profile.expectedCtcMax ? Number(profile.expectedCtcMax) : null,
          openToWork: profile.openToWork,
          learningSkills: profile.learningSkills,
        }}
      />
    </Card>
  );
}
