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
import { Badge } from "@/components/ui/badge";
import { EmployerShell } from "@/components/layout/employer-shell";
import { updateCompany, uploadCompanyLogo, uploadCompanyBanner } from "@/server/employer/actions";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata = { title: "Manage company" };

export default async function CompanySettings() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    include: { company: true },
  });
  if (!employer) redirect("/employer/onboarding");

  const c = employer.company;

  return (
    <EmployerShell>
      <div className="container max-w-3xl py-10">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-dashboard text-emce-text">Company settings</h1>
          <Button asChild variant="outline" size="sm">
            <Link href={`/company/${c.slug}`}>View public →</Link>
          </Button>
        </div>

        <Card className="mb-4 p-4">
          <div className="flex items-center gap-2">
            <Badge variant={c.verificationStatus === "VERIFIED" ? "success" : "warning"}>
              {c.verificationStatus} verification
            </Badge>
            {c.verificationStatus !== "VERIFIED" && (
              <span className="text-hint text-emce-text-sec">
                Your jobs are visible internally but not on the public feed until verified.
              </span>
            )}
          </div>
        </Card>

        <Card className="mb-4">
          <h2 className="text-section text-emce-text">Brand</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Logo shows on every job card; banner appears at the top of your public company page.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Logo (square, ≤ 4MB)</Label>
              <div className="mt-1 flex items-center gap-3">
                <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-md bg-emce-light-soft text-base font-extrabold text-emce-dark">
                  {c.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.logoUrl} alt="Logo" className="h-full w-full object-cover" />
                  ) : (
                    c.name[0]?.toUpperCase()
                  )}
                </div>
                <form action={uploadCompanyLogo} encType="multipart/form-data" className="flex-1">
                  <Input name="logo" type="file" accept="image/jpeg,image/png,image/webp" required className="text-sm" />
                  <SubmitButton size="sm" variant="outline" className="mt-2" pendingLabel="Uploading…">
                    Upload logo
                  </SubmitButton>
                </form>
              </div>
            </div>
            <div>
              <Label>Banner (wide, ≤ 8MB)</Label>
              <div className="mt-1">
                {c.bannerUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.bannerUrl} alt="Banner" className="mb-2 h-20 w-full rounded-md object-cover" />
                )}
                <form action={uploadCompanyBanner} encType="multipart/form-data">
                  <Input name="banner" type="file" accept="image/jpeg,image/png,image/webp" required className="text-sm" />
                  <SubmitButton size="sm" variant="outline" className="mt-2" pendingLabel="Uploading…">
                    Upload banner
                  </SubmitButton>
                </form>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <form action={updateCompany} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="name">Company name</Label>
              <Input id="name" name="name" required defaultValue={c.name} />
            </div>
            <div>
              <Label htmlFor="companyType">Type</Label>
              <NativeSelect id="companyType" name="companyType" defaultValue={c.companyType}>
                <option value="OEM">OEM</option>
                <option value="STARTUP">Startup</option>
                <option value="TIER1">Tier-1</option>
                <option value="TIER2">Tier-2</option>
                <option value="BATTERY">Battery</option>
                <option value="CHARGING">Charging</option>
                <option value="FLEET">Fleet</option>
                <option value="CONSULTING">Consulting</option>
                <option value="OTHER">Other</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="teamSize">Team size</Label>
              <NativeSelect id="teamSize" name="teamSize" defaultValue={c.teamSize ?? ""}>
                <option value="">—</option>
                <option value="1-10">1–10</option>
                <option value="11-50">11–50</option>
                <option value="51-200">51–200</option>
                <option value="201-500">201–500</option>
                <option value="501-1000">501–1000</option>
                <option value="1000+">1000+</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="hqLocation">HQ location</Label>
              <Input id="hqLocation" name="hqLocation" defaultValue={c.hqLocation ?? ""} />
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" type="url" defaultValue={c.website ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="description">Tagline</Label>
              <Input id="description" name="description" maxLength={280} defaultValue={c.description ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="about">About</Label>
              <Textarea id="about" name="about" rows={5} defaultValue={c.about ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="techStack">Tech / domain (comma-separated)</Label>
              <Input id="techStack" name="techStack" defaultValue={c.techStack.join(", ")} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="benefits">Benefits (comma-separated)</Label>
              <Input id="benefits" name="benefits" defaultValue={c.benefits.join(", ")} />
            </div>
            <div>
              <Label htmlFor="linkedinUrl">LinkedIn</Label>
              <Input id="linkedinUrl" name="linkedinUrl" type="url" defaultValue={c.linkedinUrl ?? ""} />
            </div>
            <div>
              <Label htmlFor="twitterUrl">Twitter / X</Label>
              <Input id="twitterUrl" name="twitterUrl" type="url" defaultValue={c.twitterUrl ?? ""} />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </Card>
      </div>
    </EmployerShell>
  );
}
