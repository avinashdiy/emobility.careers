import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { createCompany } from "@/server/employer/actions";

export const metadata = { title: "Set up your company" };

export default async function EmployerOnboarding({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/employer/onboarding");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const existing = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (existing) redirect("/employer");

  const sp = await searchParams;

  return (
    <div className="min-h-screen bg-emce-light-bg">
      <main className="container max-w-2xl py-12">
        <Card className="p-8">
          <h1 className="text-2xl font-extrabold text-emce-text">Set up your company</h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            Tell us about your EV business. Your company will be reviewed before your first job goes live.
          </p>

          {sp.error && (
            <div className="mt-4 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">{sp.error}</div>
          )}

          <form action={createCompany} className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="name">Company name</Label>
              <Input id="name" name="name" required minLength={2} />
            </div>
            <div>
              <Label htmlFor="companyType">Company type</Label>
              <NativeSelect id="companyType" name="companyType" required>
                <option value="OEM">OEM</option>
                <option value="STARTUP">Startup</option>
                <option value="TIER1">Tier-1 supplier</option>
                <option value="TIER2">Tier-2 supplier</option>
                <option value="BATTERY">Battery manufacturer</option>
                <option value="CHARGING">Charging infrastructure</option>
                <option value="FLEET">Fleet operator</option>
                <option value="CONSULTING">Consulting / services</option>
                <option value="OTHER">Other</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="teamSize">Team size</Label>
              <NativeSelect id="teamSize" name="teamSize">
                <option value="1-10">1–10</option>
                <option value="11-50">11–50</option>
                <option value="51-200">51–200</option>
                <option value="201-500">201–500</option>
                <option value="501-1000">501–1000</option>
                <option value="1000+">1000+</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="hqLocation">Headquarters</Label>
              <Input id="hqLocation" name="hqLocation" placeholder="e.g. Bengaluru, KA" />
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" type="url" placeholder="https://" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="description">Tagline (1 line, shown on cards)</Label>
              <Input id="description" name="description" maxLength={280} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="about">About your company</Label>
              <Textarea id="about" name="about" rows={4} maxLength={4000} />
            </div>
            <div className="sm:col-span-2 border-t pt-3">
              <Label htmlFor="designation">Your role at the company</Label>
              <Input id="designation" name="designation" required placeholder="e.g. Talent Acquisition Lead" />
            </div>

            <div className="sm:col-span-2 flex justify-end pt-2">
              <Button type="submit" size="lg">Create company →</Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
