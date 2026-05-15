"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { FieldError } from "@/components/ui/field-error";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { JDAssistant } from "@/components/jobs/JDAssistant";
import {
  createJob,
  type CreateJobFormState,
} from "@/server/employer/actions";

const INITIAL: CreateJobFormState = { ok: false };

interface DomainOption {
  id: string;
  slug: string;
  name: string;
}

interface Props {
  evDomains: DomainOption[];
}

/**
 * Recruiter-facing "Post a job" form. Same useActionState shape as
 * the admin form so a validation failure preserves the recruiter's
 * typing and surfaces per-field errors instead of silently
 * round-tripping through `?error=...`.
 *
 * The form sits inside an EmployerShell + Card on the page.
 */
export function EmployerJobForm({ evDomains }: Props) {
  const [state, formAction] = useActionState(createJob, INITIAL);
  const v = state.prevValues ?? {};
  const e = state.fieldErrors ?? {};

  return (
    <>
      <div className="mb-4 flex justify-end">
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

      {state.message && !state.ok && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-emce-red/40 bg-emce-red-light p-3 text-sm text-emce-red-deep"
        >
          {state.message}
        </div>
      )}

      <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="title">Job title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={v.title ?? ""}
            required
            minLength={3}
            maxLength={140}
            placeholder="e.g. Senior Battery Pack Engineer"
            aria-invalid={!!e.title}
          />
          <FieldError error={e.title} />
        </div>

        <div>
          <Label htmlFor="profileMode">Profile mode</Label>
          <NativeSelect
            id="profileMode"
            name="profileMode"
            required
            defaultValue={v.profileMode ?? "EXPERIENCED"}
          >
            <option value="EXPERIENCED">Experienced</option>
            <option value="FRESHER">Fresher</option>
            <option value="TECHNICIAN">Technician</option>
            <option value="LEADERSHIP">Leadership</option>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="seniorityLevel">Seniority</Label>
          <NativeSelect
            id="seniorityLevel"
            name="seniorityLevel"
            required
            defaultValue={v.seniorityLevel ?? "MID"}
          >
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
          <NativeSelect
            id="employmentType"
            name="employmentType"
            required
            defaultValue={v.employmentType ?? "FULL_TIME"}
          >
            <option value="FULL_TIME">Full-time</option>
            <option value="PART_TIME">Part-time</option>
            <option value="CONTRACT">Contract</option>
            <option value="INTERNSHIP">Internship</option>
            <option value="TEMPORARY">Temporary</option>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="workMode">Work mode</Label>
          <NativeSelect
            id="workMode"
            name="workMode"
            required
            defaultValue={v.workMode ?? "ONSITE"}
          >
            <option value="ONSITE">On-site</option>
            <option value="HYBRID">Hybrid</option>
            <option value="REMOTE">Remote</option>
          </NativeSelect>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="locations">Locations (comma-separated)</Label>
          <Input
            id="locations"
            name="locations"
            defaultValue={v.locations ?? ""}
            placeholder="e.g. Bengaluru, Pune, Chennai"
          />
        </div>

        <div>
          <Label htmlFor="experienceMin">Experience min (years)</Label>
          <Input
            id="experienceMin"
            name="experienceMin"
            type="number"
            min="0"
            max="40"
            defaultValue={v.experienceMin ?? ""}
            aria-invalid={!!e.experienceMin}
          />
          <FieldError error={e.experienceMin} />
        </div>
        <div>
          <Label htmlFor="experienceMax">Experience max (years)</Label>
          <Input
            id="experienceMax"
            name="experienceMax"
            type="number"
            min="0"
            max="40"
            defaultValue={v.experienceMax ?? ""}
            aria-invalid={!!e.experienceMax}
          />
          <FieldError error={e.experienceMax} />
        </div>

        <div>
          <Label htmlFor="salaryMin">Salary min (₹/yr)</Label>
          <Input
            id="salaryMin"
            name="salaryMin"
            type="number"
            min="0"
            defaultValue={v.salaryMin ?? ""}
            aria-invalid={!!e.salaryMin}
          />
          <FieldError error={e.salaryMin} />
        </div>
        <div>
          <Label htmlFor="salaryMax">Salary max (₹/yr)</Label>
          <Input
            id="salaryMax"
            name="salaryMax"
            type="number"
            min="0"
            defaultValue={v.salaryMax ?? ""}
            aria-invalid={!!e.salaryMax}
          />
          <FieldError error={e.salaryMax} />
        </div>

        <label className="sm:col-span-2 flex items-center gap-2 rounded-md bg-emce-light-soft p-2.5 text-sm font-bold text-emce-text">
          <input
            type="checkbox"
            name="salaryHidden"
            value="true"
            defaultChecked={v.salaryHidden === "true"}
            className="h-4 w-4 accent-emce-mid"
          />
          Hide salary publicly (still used for matching)
        </label>

        <div className="sm:col-span-2">
          <Label htmlFor="audience">Who can apply?</Label>
          <NativeSelect
            id="audience"
            name="audience"
            defaultValue={v.audience ?? "PUBLIC"}
          >
            <option value="PUBLIC">Public — any candidate (default)</option>
            <option value="DIYGURU_ONLY">DIYguru students only — exclusive listing</option>
            <option value="INVITE_ONLY">Invite-only — recruiters reach out directly</option>
          </NativeSelect>
          <p className="mt-1 text-hint text-emce-text-muted">
            <strong>DIYguru-only</strong> jobs go to verified students.{" "}
            <strong>Salary disclosure is mandatory</strong> on these — the &ldquo;Hide salary&rdquo;
            toggle above is overridden so students don&apos;t apply blind.
          </p>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="description">
            Description{" "}
            <span className="text-hint font-normal text-emce-text-sec">
              (min 20 chars — required; bold / italic / lists supported)
            </span>
          </Label>
          <RichTextEditor
            id="description"
            name="description"
            defaultValue={v.description ?? ""}
            placeholder="Describe the role, your team, and what success looks like."
            minHeight={180}
            required
            ariaInvalid={!!e.description}
          />
          <FieldError error={e.description} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="responsibilities">Responsibilities</Label>
          <RichTextEditor
            id="responsibilities"
            name="responsibilities"
            defaultValue={v.responsibilities ?? ""}
            placeholder="• ..."
            minHeight={140}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="requirements">Requirements</Label>
          <RichTextEditor
            id="requirements"
            name="requirements"
            defaultValue={v.requirements ?? ""}
            placeholder="• ..."
            minHeight={140}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="benefits">Benefits</Label>
          <RichTextEditor
            id="benefits"
            name="benefits"
            defaultValue={v.benefits ?? ""}
            minHeight={100}
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="evDomainSlugs">EV domains (comma-separated slugs)</Label>
          <Input
            id="evDomainSlugs"
            name="evDomainSlugs"
            defaultValue={v.evDomainSlugs ?? ""}
            placeholder="e.g. battery-tech, motor-control"
          />
          <p className="mt-1 text-hint text-emce-text-muted">
            Available: {evDomains.map((d) => d.slug).join(", ")}
          </p>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="skillNames">Required skills (comma-separated)</Label>
          <Input
            id="skillNames"
            name="skillNames"
            defaultValue={v.skillNames ?? ""}
            placeholder="e.g. BMS, Cell Chemistry, Battery Testing"
          />
        </div>

        <input type="hidden" name="salaryCurrency" value="INR" />

        <div className="sm:col-span-2 flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button type="submit" name="publishNow" value="" variant="outline">
            Save as draft
          </Button>
          <Button type="submit" name="publishNow" value="true">
            Publish job
          </Button>
          <p className="basis-full text-right text-hint text-emce-text-sec">
            <em>Save as draft</em> stores the job but it stays hidden from candidates until
            you click <strong>Publish job</strong>.
          </p>
        </div>
      </form>
    </>
  );
}
