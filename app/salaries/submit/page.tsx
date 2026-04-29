import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { submitSalary } from "@/server/salaries/actions";

export const metadata: Metadata = {
  title: "Submit your EV salary anonymously",
};

/**
 * Public salary-submission form. Anonymous by default. Submitting once
 * unlocks the full database for 30 days via cookie. Admin moderation
 * gates whether the submission ever shows publicly.
 */
export default async function SalarySubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const evDomains = await db.eVDomain.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true, slug: true },
  });

  return (
    <>
      <SiteHeader />
      <main className="container max-w-2xl space-y-6 py-10">
        <div>
          <Link href="/salaries" className="text-hint font-bold text-emce-dark hover:underline">
            ← Back to Salary Compass
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold text-emce-text md:text-[28px]">
            Submit your EV salary
          </h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            Anonymous by default. Takes 60 seconds. Submitting unlocks the full database for 30 days. Admin-moderated before going live.
          </p>
        </div>

        {sp.error && (
          <div className="rounded-md border border-emce-red bg-emce-red-light p-3 text-sm text-emce-red">
            ⚠️ {sp.error}
          </div>
        )}

        <Card>
          <form action={submitSalary} className="space-y-4">
            {/* Honeypot */}
            <div aria-hidden className="sr-only" style={{ position: "absolute", left: "-10000px" }}>
              <label>
                Website (leave blank)
                <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
              </label>
            </div>

            <div>
              <Label htmlFor="companyName">Company *</Label>
              <Input id="companyName" name="companyName" required minLength={2} maxLength={120} placeholder="e.g. Ola Electric" />
              <p className="mt-1 text-hint text-emce-text-muted">
                Spell it like you'd write it on LinkedIn — we group identical names automatically.
              </p>
            </div>
            <div>
              <Label htmlFor="jobTitle">Job title *</Label>
              <Input id="jobTitle" name="jobTitle" required maxLength={120} placeholder="e.g. Senior Battery Engineer" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="profileMode">Career stage</Label>
                <NativeSelect id="profileMode" name="profileMode" defaultValue="EXPERIENCED">
                  <option value="FRESHER">Fresher (0-1 yrs)</option>
                  <option value="EXPERIENCED">Experienced</option>
                  <option value="LEADERSHIP">Leadership</option>
                  <option value="TECHNICIAN">Technician</option>
                </NativeSelect>
              </div>
              <div>
                <Label htmlFor="yearsExp">Years of experience *</Label>
                <Input id="yearsExp" name="yearsExp" type="number" min="0" max="40" required />
              </div>
            </div>

            <div>
              <Label htmlFor="evDomainId">EV domain</Label>
              <NativeSelect id="evDomainId" name="evDomainId" defaultValue="">
                <option value="">— pick one —</option>
                {evDomains.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <Label htmlFor="location">Location</Label>
              <Input id="location" name="location" maxLength={80} placeholder="e.g. Bengaluru" />
            </div>

            <div>
              <Label htmlFor="ctcLakhs">Total CTC per year (in ₹ lakhs) *</Label>
              <Input
                id="ctcLakhs"
                name="ctcLakhs"
                type="number"
                step="0.5"
                min="1"
                max="2000"
                required
                placeholder="e.g. 18.5"
              />
              <p className="mt-1 text-hint text-emce-text-muted">
                Total compensation across base, bonus, and ESOP value. Per-component split below is optional.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="baseLakhs">Base (₹L)</Label>
                <Input id="baseLakhs" name="baseLakhs" type="number" step="0.5" min="0" />
              </div>
              <div>
                <Label htmlFor="bonusLakhs">Bonus (₹L)</Label>
                <Input id="bonusLakhs" name="bonusLakhs" type="number" step="0.5" min="0" />
              </div>
              <div>
                <Label htmlFor="esopLakhs">ESOP (₹L)</Label>
                <Input id="esopLakhs" name="esopLakhs" type="number" step="0.5" min="0" />
              </div>
            </div>

            {session?.user && (
              <label className="flex items-start gap-2 rounded-md bg-emce-light-soft p-3 text-sm">
                <input
                  type="checkbox"
                  name="attributeToProfile"
                  value="true"
                  className="mt-0.5 h-4 w-4 accent-emce-mid"
                />
                <span>
                  <strong className="text-emce-text">Tag this to my profile (optional)</strong>
                  <span className="block text-hint text-emce-text-sec">
                    Default is fully anonymous. Tagging helps you remember what you submitted; only admins ever see the link.
                  </span>
                </span>
              </label>
            )}

            <Button type="submit" size="lg" className="w-full">
              Submit anonymously & unlock →
            </Button>
            <p className="text-center text-hint text-emce-text-muted">
              We never see your name, email, or employer unless you opt in. One submission per browser per day.
            </p>
          </form>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
