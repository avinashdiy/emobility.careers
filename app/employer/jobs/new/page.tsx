import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { EmployerShell } from "@/components/layout/employer-shell";
import { createJob } from "@/server/employer/actions";
import { JDAssistant } from "@/components/jobs/JDAssistant";

export const metadata = { title: "Post a job" };

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const evDomains = await db.eVDomain.findMany({ orderBy: { order: "asc" } });
  const sp = await searchParams;

  return (
    <EmployerShell>
      <div className="container max-w-3xl py-10">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-dashboard text-emce-text">Post a new job</h1>
            <p className="mt-1 text-sm text-emce-text-sec">
              Fill in the basics — or paste rough notes and let AI structure them into a polished JD.
            </p>
          </div>
          <JDAssistant
            fields={{
              title: "title",
              description: "description",
              responsibilities: "responsibilities",
              requirements: "requirements",
              skillNames: "skillNames",
              evDomainSlugs: "evDomainSlugs",
              seniorityLevel: "seniorityLevel",
              benefits: "benefits",
            }}
          />
        </div>

        {sp.error && (
          <div className="mt-4 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">{sp.error}</div>
        )}

        <Card className="mt-6 p-6">
          <form action={createJob} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="title">Job title</Label>
              <Input id="title" name="title" required minLength={3} maxLength={140} placeholder="e.g. Senior Battery Pack Engineer" />
            </div>

            <div>
              <Label htmlFor="profileMode">Profile mode</Label>
              <NativeSelect id="profileMode" name="profileMode" required>
                <option value="EXPERIENCED">Experienced</option>
                <option value="FRESHER">Fresher</option>
                <option value="TECHNICIAN">Technician</option>
                <option value="LEADERSHIP">Leadership</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="seniorityLevel">Seniority</Label>
              <NativeSelect id="seniorityLevel" name="seniorityLevel" required>
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
              <NativeSelect id="employmentType" name="employmentType" required>
                <option value="FULL_TIME">Full-time</option>
                <option value="PART_TIME">Part-time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERNSHIP">Internship</option>
                <option value="TEMPORARY">Temporary</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="workMode">Work mode</Label>
              <NativeSelect id="workMode" name="workMode" required>
                <option value="ONSITE">On-site</option>
                <option value="HYBRID">Hybrid</option>
                <option value="REMOTE">Remote</option>
              </NativeSelect>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="locations">Locations (comma-separated)</Label>
              <Input id="locations" name="locations" placeholder="e.g. Bengaluru, Pune, Chennai" />
            </div>

            <div>
              <Label htmlFor="experienceMin">Experience min (years)</Label>
              <Input id="experienceMin" name="experienceMin" type="number" min="0" max="40" />
            </div>
            <div>
              <Label htmlFor="experienceMax">Experience max (years)</Label>
              <Input id="experienceMax" name="experienceMax" type="number" min="0" max="40" />
            </div>

            <div>
              <Label htmlFor="salaryMin">Salary min (₹/yr)</Label>
              <Input id="salaryMin" name="salaryMin" type="number" min="0" />
            </div>
            <div>
              <Label htmlFor="salaryMax">Salary max (₹/yr)</Label>
              <Input id="salaryMax" name="salaryMax" type="number" min="0" />
            </div>

            <label className="sm:col-span-2 flex items-center gap-2 rounded-md bg-emce-light-soft p-2.5 text-sm font-bold text-emce-text">
              <input type="checkbox" name="salaryHidden" value="true" className="h-4 w-4 accent-emce-mid" />
              Hide salary publicly (still used for matching)
            </label>

            {/* Audience selector. DIYGURU_ONLY routes the role to verified
                students only AND forces salary disclosure (the
                checkbox above is server-overridden for that audience).
                The on-page hint reminds the recruiter so the salary
                fields are filled before submitting. */}
            <div className="sm:col-span-2">
              <Label htmlFor="audience">Who can apply?</Label>
              <NativeSelect id="audience" name="audience" defaultValue="PUBLIC">
                <option value="PUBLIC">Public — any candidate (default)</option>
                <option value="DIYGURU_ONLY">DIYguru students only — exclusive listing</option>
                <option value="INVITE_ONLY">Invite-only — recruiters reach out directly</option>
              </NativeSelect>
              <p className="mt-1 text-hint text-emce-text-muted">
                <strong>DIYguru-only</strong> jobs go to verified students. <strong>Salary disclosure is mandatory</strong> on these — the "Hide salary" toggle above is overridden so students don't apply blind.
              </p>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={6} required minLength={20} placeholder="Describe the role, your team, and what success looks like." />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="responsibilities">Responsibilities</Label>
              <Textarea id="responsibilities" name="responsibilities" rows={4} placeholder="• ..." />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="requirements">Requirements</Label>
              <Textarea id="requirements" name="requirements" rows={4} placeholder="• ..." />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="benefits">Benefits</Label>
              <Textarea id="benefits" name="benefits" rows={3} />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="evDomainSlugs">EV domains (comma-separated slugs)</Label>
              <Input
                id="evDomainSlugs"
                name="evDomainSlugs"
                placeholder="e.g. battery-tech, motor-control"
              />
              <p className="mt-1 text-hint text-emce-text-muted">
                Available: {evDomains.map((d) => d.slug).join(", ")}
              </p>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="skillNames">Required skills (comma-separated)</Label>
              <Input id="skillNames" name="skillNames" placeholder="e.g. BMS, Cell Chemistry, Battery Testing" />
            </div>

            <input type="hidden" name="salaryCurrency" value="INR" />

            <div className="sm:col-span-2 flex justify-end gap-2 border-t pt-4">
              <Button type="submit" name="publishNow" value="" variant="outline">Save as draft</Button>
              <Button type="submit" name="publishNow" value="true">Publish job</Button>
            </div>
          </form>
        </Card>
      </div>
    </EmployerShell>
  );
}
