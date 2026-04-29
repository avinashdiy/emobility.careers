import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { savePreferences } from "@/server/candidates/actions";

export const metadata = { title: "Preferences" };

export default async function PreferencesStep() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");

  return (
    <Card className="p-8">
      <Badge variant="default" className="mb-2">Step 4 of 4</Badge>
      <h1 className="text-2xl font-extrabold text-emce-text">Job preferences</h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        Help us match you with the right roles. You can change these anytime.
      </p>

      <form action={savePreferences} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="location">Current location</Label>
          <Input id="location" name="location" defaultValue={profile.location ?? ""} placeholder="e.g. Bengaluru, KA" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="preferredCities">Preferred cities (comma-separated)</Label>
          <Input
            id="preferredCities"
            name="preferredCities"
            defaultValue={profile.preferredCities.join(", ")}
            placeholder="e.g. Bengaluru, Pune, Hyderabad"
          />
        </div>

        <div>
          <Label htmlFor="relocationPref">Open to relocation</Label>
          <NativeSelect id="relocationPref" name="relocationPref" defaultValue={profile.relocationPref}>
            <option value="ANYWHERE">Anywhere in India</option>
            <option value="WITHIN_STATE">Within home state only</option>
            <option value="HOMETOWN_ONLY">Hometown only</option>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="availabilityStatus">Availability</Label>
          <NativeSelect id="availabilityStatus" name="availabilityStatus" defaultValue={profile.availabilityStatus}>
            <option value="IMMEDIATE">Immediately</option>
            <option value="DAYS_15">In 15 days</option>
            <option value="DAYS_30">In 30 days</option>
            <option value="DAYS_60">In 60 days</option>
            <option value="NOT_LOOKING">Not looking</option>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="noticePeriodDays">Notice period (days)</Label>
          <Input id="noticePeriodDays" name="noticePeriodDays" type="number" defaultValue={profile.noticePeriodDays ?? 0} min="0" max="365" />
        </div>
        <div>
          <Label htmlFor="cvVisibility">Profile visibility</Label>
          <NativeSelect id="cvVisibility" name="cvVisibility" defaultValue={profile.cvVisibility}>
            <option value="EVERYONE">Visible to everyone</option>
            <option value="EMPLOYERS_ONLY">Only verified employers</option>
            <option value="PRIVATE">Private (only when you apply)</option>
          </NativeSelect>
        </div>

        <div>
          <Label htmlFor="expectedCtcMin">Expected CTC min (₹/yr)</Label>
          <Input id="expectedCtcMin" name="expectedCtcMin" type="number" min="0" defaultValue={profile.expectedCtcMin ? Number(profile.expectedCtcMin) : ""} placeholder="e.g. 600000" />
        </div>
        <div>
          <Label htmlFor="expectedCtcMax">Expected CTC max (₹/yr)</Label>
          <Input id="expectedCtcMax" name="expectedCtcMax" type="number" min="0" defaultValue={profile.expectedCtcMax ? Number(profile.expectedCtcMax) : ""} placeholder="e.g. 900000" />
        </div>

        <label className="sm:col-span-2 flex items-center gap-3 rounded-md bg-emce-light-soft p-3">
          <input
            type="checkbox"
            name="openToWork"
            value="true"
            defaultChecked={profile.openToWork}
            className="h-4 w-4 accent-emce-mid"
          />
          <span className="text-sm font-bold text-emce-text">
            I&apos;m actively open to new opportunities
          </span>
        </label>

        <div className="sm:col-span-2 flex justify-between pt-2">
          <Button asChild variant="outline">
            <Link href="/onboarding/confirm">← Back</Link>
          </Button>
          <Button type="submit" size="lg">Finish &amp; go to my profile →</Button>
        </div>
      </form>
    </Card>
  );
}
