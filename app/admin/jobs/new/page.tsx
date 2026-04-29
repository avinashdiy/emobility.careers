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
import { AdminShell } from "@/components/layout/admin-shell";
import { adminCreateJob } from "@/server/admin/recruiting-actions";

export const metadata = { title: "Admin · Post a job" };

/**
 * Admin job-posting form — used by the platform team to seed jobs on
 * behalf of companies that haven't onboarded an HR yet. Two paths:
 *
 *   1. Pick an existing company from the dropdown.
 *   2. Tick "create a new company" to mint a Company row inline and
 *      post the job against it in the same transaction.
 *
 * `applicationUrl` is a first-class field — when set, the public job
 * page short-circuits the internal apply form and links the candidate
 * straight out to the employer's career page. That's the right
 * default for jobs aggregated from third-party sources.
 */
export default async function AdminNewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const [companies, evDomains] = await Promise.all([
    db.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    db.eVDomain.findMany({ orderBy: { order: "asc" } }),
  ]);

  return (
    <AdminShell>
      <div className="container max-w-3xl py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-dashboard text-emce-text">Post a job (admin)</h1>
            <p className="mt-1 text-sm text-emce-text-sec">
              Post on behalf of an existing company, or create one inline. For
              external listings (e.g. aggregated from a career site) set the
              <em> Apply URL</em> so the public CTA links straight out.
            </p>
          </div>
          <Link href="/admin/jobs" className="shrink-0 text-sm font-bold text-emce-dark hover:underline">
            ← Back to job moderation
          </Link>
        </div>

        {sp.error && (
          <div className="mb-4 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
            {sp.error}
          </div>
        )}

        <Card className="p-6">
          <form action={adminCreateJob} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* ── Company picker ──────────────────────────── */}
            <div className="sm:col-span-2">
              <Label htmlFor="companyId">Company (existing)</Label>
              <NativeSelect id="companyId" name="companyId">
                <option value="">— Pick one or fill new-company section below —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              <p className="mt-1 text-hint text-emce-text-sec">
                {companies.length} companies in the directory.
              </p>
            </div>

            {/* ── Inline new-company ──────────────────────── */}
            <details className="sm:col-span-2 rounded-md border border-emce-border bg-emce-bg p-4">
              <summary className="cursor-pointer text-sm font-bold text-emce-text">
                Or create a new company inline
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="newCompanyName">Company name</Label>
                  <Input id="newCompanyName" name="newCompanyName" maxLength={120} />
                </div>
                <div>
                  <Label htmlFor="newCompanyType">Company type</Label>
                  <NativeSelect id="newCompanyType" name="newCompanyType">
                    <option value="">—</option>
                    <option value="OEM">OEM</option>
                    <option value="STARTUP">Startup</option>
                    <option value="TIER1">Tier-1</option>
                    <option value="TIER2">Tier-2</option>
                    <option value="BATTERY">Battery</option>
                    <option value="CHARGING">Charging</option>
                    <option value="FLEET">Fleet / Mobility</option>
                    <option value="CONSULTING">Consulting / Services</option>
                    <option value="OTHER">Other</option>
                  </NativeSelect>
                </div>
                <div>
                  <Label htmlFor="newCompanyWebsite">Website</Label>
                  <Input id="newCompanyWebsite" name="newCompanyWebsite" type="url" placeholder="https://..." />
                </div>
                <div>
                  <Label htmlFor="newCompanyHqLocation">HQ Location</Label>
                  <Input id="newCompanyHqLocation" name="newCompanyHqLocation" placeholder="e.g. Bengaluru" />
                </div>
              </div>
            </details>

            {/* ── Job basics ──────────────────────────────── */}
            <div className="sm:col-span-2">
              <Label htmlFor="title">Job title</Label>
              <Input id="title" name="title" required minLength={3} maxLength={140} />
            </div>

            <div>
              <Label htmlFor="profileMode">Profile mode</Label>
              <NativeSelect id="profileMode" name="profileMode" required defaultValue="EXPERIENCED">
                <option value="EXPERIENCED">Experienced</option>
                <option value="FRESHER">Fresher</option>
                <option value="TECHNICIAN">Technician (blue-collar)</option>
                <option value="LEADERSHIP">Leadership</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="seniorityLevel">Seniority</Label>
              <NativeSelect id="seniorityLevel" name="seniorityLevel" required defaultValue="MID">
                <option value="ENTRY">Entry</option>
                <option value="JUNIOR">Junior</option>
                <option value="MID">Mid</option>
                <option value="SENIOR">Senior</option>
                <option value="LEAD">Lead</option>
                <option value="PRINCIPAL">Principal</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="employmentType">Employment type</Label>
              <NativeSelect id="employmentType" name="employmentType" required defaultValue="FULL_TIME">
                <option value="FULL_TIME">Full-time</option>
                <option value="PART_TIME">Part-time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERNSHIP">Internship</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="workMode">Work mode</Label>
              <NativeSelect id="workMode" name="workMode" required defaultValue="ONSITE">
                <option value="ONSITE">Onsite</option>
                <option value="HYBRID">Hybrid</option>
                <option value="REMOTE">Remote</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="locations">Locations (comma-separated)</Label>
              <Input id="locations" name="locations" placeholder="Bengaluru, Pune" />
            </div>
            <div>
              <Label htmlFor="audience">Audience</Label>
              <NativeSelect id="audience" name="audience" required defaultValue="PUBLIC">
                <option value="PUBLIC">Public</option>
                <option value="DIYGURU_ONLY">DIYguru-only (verified students)</option>
                <option value="INVITE_ONLY">Invite-only (no listing)</option>
              </NativeSelect>
            </div>

            <div>
              <Label htmlFor="experienceMin">Min years</Label>
              <Input id="experienceMin" name="experienceMin" type="number" inputMode="numeric" min={0} max={40} />
            </div>
            <div>
              <Label htmlFor="experienceMax">Max years</Label>
              <Input id="experienceMax" name="experienceMax" type="number" inputMode="numeric" min={0} max={40} />
            </div>
            <div>
              <Label htmlFor="salaryMin">Salary min (INR/yr)</Label>
              <Input id="salaryMin" name="salaryMin" type="number" inputMode="numeric" min={0} placeholder="e.g. 1500000" />
            </div>
            <div>
              <Label htmlFor="salaryMax">Salary max (INR/yr)</Label>
              <Input id="salaryMax" name="salaryMax" type="number" inputMode="numeric" min={0} placeholder="e.g. 2500000" />
            </div>
            <label className="sm:col-span-2 flex items-center gap-2 text-sm text-emce-text-sec">
              <input type="checkbox" name="salaryHidden" value="true" />
              Hide salary band on the public listing (PUBLIC jobs only — DIYguru jobs always show)
            </label>

            {/* ── External apply URL ─────────────────────── */}
            <div className="sm:col-span-2">
              <Label htmlFor="applicationUrl">Apply URL (external)</Label>
              <Input
                id="applicationUrl"
                name="applicationUrl"
                type="url"
                placeholder="https://company.com/careers/job-id"
              />
              <p className="mt-1 text-hint text-emce-text-sec">
                When set, the public job page sends candidates straight to this URL.
                Leave empty for jobs you want candidates to apply to <em>through</em> this platform.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="applicationEmail">Apply email (fallback)</Label>
              <Input id="applicationEmail" name="applicationEmail" type="email" placeholder="hr@company.com" />
            </div>

            {/* ── JD content ──────────────────────────────── */}
            <div className="sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" required minLength={20} rows={6} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="responsibilities">Responsibilities</Label>
              <Textarea id="responsibilities" name="responsibilities" rows={5} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="requirements">Requirements</Label>
              <Textarea id="requirements" name="requirements" rows={5} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="benefits">Benefits</Label>
              <Textarea id="benefits" name="benefits" rows={3} />
            </div>

            {/* ── Tags ────────────────────────────────────── */}
            <div className="sm:col-span-2">
              <Label htmlFor="evDomainSlugs">EV domains (comma-separated slugs)</Label>
              <Input
                id="evDomainSlugs"
                name="evDomainSlugs"
                placeholder={evDomains.map((d) => d.slug).slice(0, 3).join(", ")}
              />
              <p className="mt-1 text-hint text-emce-text-sec">
                Available: {evDomains.map((d) => d.slug).join(", ")}
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="skillNames">Skills (comma-separated)</Label>
              <Input id="skillNames" name="skillNames" placeholder="BMS, ARM Cortex, CAN Bus" />
            </div>

            {/* ── Submit ──────────────────────────────────── */}
            <div className="sm:col-span-2 mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button type="submit" name="publishNow" value="true" size="lg" className="w-full sm:w-auto">
                Publish now
              </Button>
              <Button type="submit" variant="outline" size="lg" className="w-full sm:w-auto">
                Save as draft
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AdminShell>
  );
}
