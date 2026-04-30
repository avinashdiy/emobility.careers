import Link from "next/link";
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
import { CompanySearchOnboarding } from "@/components/employer/CompanySearchOnboarding";

export const metadata = { title: "Set up your company" };

/**
 * Employer onboarding — two-step flow.
 *
 *   /employer/onboarding              → search-or-create chooser
 *   /employer/onboarding?create=1     → create-new-company form
 *   /employer/onboarding?create=1&name=X → same form, name pre-filled
 *
 * The search step lives in <CompanySearchOnboarding> (client). When a
 * match is picked + designation supplied, it posts to
 * `joinExistingCompany` and links the recruiter to the existing
 * Company. When the user can't find their company, we route to
 * ?create=1 which renders the existing create form (this page) with
 * an optional pre-filled name.
 */
export default async function EmployerOnboarding({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; create?: string; name?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/employer/onboarding");
  // Both EMPLOYERs and CANDIDATEs can land here — candidates clicking
  // "Hire on eMobility" from their dropdown end up on this page to opt
  // into the second persona. Only block ADMINs from accidental misuse
  // (they don't get an EmployerProfile through this route).
  if (
    session.user.role !== "EMPLOYER" &&
    session.user.role !== "CANDIDATE" &&
    session.user.role !== "ADMIN"
  ) {
    redirect("/403");
  }
  const existing = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (existing) redirect("/employer");

  const sp = await searchParams;
  const wantsCreate = sp.create === "1";

  return (
    <div className="min-h-screen bg-emce-light-bg">
      <main className="container max-w-2xl py-12">
        <header className="mb-6">
          <h1 className="text-2xl font-extrabold text-emce-text md:text-3xl">
            Set up your hiring presence
          </h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            {wantsCreate
              ? "Create your company page. It will be reviewed before your first job goes live."
              : "Find your company on eMobility Careers. If it's not here yet, you can create the page in the next step."}
          </p>
        </header>

        {sp.error && (
          <div className="mb-4 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
            {sp.error}
          </div>
        )}

        {wantsCreate ? (
          <Card className="p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-emce-text">Create company page</h2>
              <Link
                href="/employer/onboarding"
                className="text-xs font-bold text-emce-dark hover:underline"
              >
                ← Back to search
              </Link>
            </div>

            <form action={createCompany} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="name">Company name</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  minLength={2}
                  defaultValue={sp.name ?? ""}
                />
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
                <Input
                  id="designation"
                  name="designation"
                  required
                  placeholder="e.g. Talent Acquisition Lead"
                />
              </div>

              <div className="sm:col-span-2 flex justify-end pt-2">
                <Button type="submit" size="lg">Create company →</Button>
              </div>
            </form>
          </Card>
        ) : (
          <CompanySearchOnboarding />
        )}
      </main>
    </div>
  );
}
