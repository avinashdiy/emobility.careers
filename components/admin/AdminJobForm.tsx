"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { FieldError } from "@/components/ui/field-error";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { CompanyPicker, type CompanyOption } from "@/components/admin/CompanyPicker";
import {
  adminCreateJob,
  adminUpdateJob,
  type AdminJobFormState,
} from "@/server/admin/recruiting-actions";

const INITIAL: AdminJobFormState = { ok: false };

// Re-export so callers of this form can import CompanyOption from
// the same module — preserves the existing public surface.
export type { CompanyOption };

interface DomainOption {
  id: string;
  slug: string;
  name: string;
}

interface ExistingJob {
  id: string;
  companyId: string;
  title: string;
  description: string;
  responsibilities: string | null;
  requirements: string | null;
  benefits: string | null;
  profileMode: string;
  employmentType: string;
  workMode: string;
  seniorityLevel: string;
  locations: string[];
  audience: string;
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: string | null; // Decimal serialised
  salaryMax: string | null;
  salaryPeriod: string;
  salaryHidden: boolean;
  applicationUrl: string | null;
  applicationEmail: string | null;
  evDomainSlugs: string[];
  skillNames: string[];
}

interface Props {
  companies: CompanyOption[];
  evDomains: DomainOption[];
  /// When present, the form is in EDIT mode — uses `adminUpdateJob`
  /// instead of `adminCreateJob` and prefills every field from the
  /// existing record. The companyId field is hidden + locked in
  /// this mode (changing the parent company of an existing job is
  /// out of scope).
  existingJob?: ExistingJob;
}

/**
 * Admin "Post a job" form. Client-rendered so it can use
 * `useActionState` and survive validation failures with the
 * admin's typing intact + per-field error messages.
 *
 * Every input takes its `defaultValue` from `state.prevValues?.<name>`,
 * which is the round-trip of FormData entries from the previous
 * submit attempt. Field errors are rendered inline next to each
 * input via `<FieldError>`.
 *
 * Edit mode (existingJob set):
 *   - Action switches to adminUpdateJob; hidden jobId carries id
 *   - prevValues fall back to the existing record's values, so
 *     first render shows the saved state
 *   - Submit buttons change from "Publish now / Save as draft" to
 *     "Save changes" (publish state is controlled separately
 *     via the moderation list's Pause / Close buttons)
 */
export function AdminJobForm({ companies, evDomains, existingJob }: Props) {
  const isEdit = !!existingJob;
  const action = isEdit ? adminUpdateJob : adminCreateJob;
  const [state, formAction] = useActionState(action, INITIAL);
  // Combined fallback order: prevValues (from a failed submit) →
  // existingJob (edit mode) → defaults. Keeps the form-recovery
  // path correct even on edit pages.
  const fromJob = existingJob ? jobToFormMap(existingJob) : {};
  const v: Record<string, string> = { ...fromJob, ...(state.prevValues ?? {}) };
  const e = state.fieldErrors ?? {};

  return (
    <>
      {state.message && !state.ok && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-emce-red/40 bg-emce-red-light p-3 text-sm text-emce-red-deep"
        >
          {state.message}
        </div>
      )}

      <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isEdit && existingJob && (
          <input type="hidden" name="jobId" value={existingJob.id} />
        )}
        {/* ── Company picker ──────────────────────────── */}
        <div className="sm:col-span-2">
          <Label htmlFor="companyId">Company {isEdit ? "(locked — re-parenting not supported)" : "(existing)"}</Label>
          {isEdit ? (
            <>
              {/* Edit mode: show the company as read-only context but
                  send its id via a hidden input. Changing the parent
                  company of a posted job invalidates audit history +
                  every existing application's company reference, so
                  it's out of scope here. */}
              <input type="hidden" name="companyId" value={v.companyId ?? ""} />
              <div className="rounded-md border border-emce-border bg-emce-light-soft px-3 py-2 text-sm font-bold text-emce-text">
                {companies.find((c) => c.id === v.companyId)?.name ?? "(unknown)"}
              </div>
            </>
          ) : (
            <>
              {/* Typeahead picker — NativeSelect was unusable at
                  ~1k+ companies (had to scroll through every option).
                  CompanyPicker filters client-side over the same
                  preloaded list, capping suggestions at 20. The
                  hidden field this renders is still `name="companyId"`
                  so the server action contract is unchanged. */}
              <CompanyPicker
                companies={companies}
                defaultValue={v.companyId ?? undefined}
                fieldName="companyId"
                ariaInvalid={!!e.companyId}
              />
              <FieldError error={e.companyId} />
            </>
          )}
        </div>

        {/* ── Inline new-company ────────────────────────
            Only rendered on the create page. In edit mode it makes
            no sense (you can't create a new company AND link to it
            via the same edit submission), and worse, leaving the
            collapsed <NativeSelect name="newCompanyType"> in the
            DOM would silently submit empty-string values that the
            schema has to ignore. Skipping the whole block keeps
            the FormData minimal. */}
        {!isEdit && (
          <details
            className="sm:col-span-2 rounded-md border border-emce-border bg-emce-bg p-4"
            open={!!(e.newCompanyName || e.newCompanyType || v.newCompanyName)}
          >
            <summary className="cursor-pointer text-sm font-bold text-emce-text">
              Or create a new company inline
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="newCompanyName">Company name</Label>
                <Input
                  id="newCompanyName"
                  name="newCompanyName"
                  defaultValue={v.newCompanyName ?? ""}
                  maxLength={120}
                  aria-invalid={!!e.newCompanyName}
                />
                <FieldError error={e.newCompanyName} />
              </div>
              <div>
                <Label htmlFor="newCompanyType">Company type</Label>
                <NativeSelect
                  id="newCompanyType"
                  name="newCompanyType"
                  defaultValue={v.newCompanyType ?? ""}
                  aria-invalid={!!e.newCompanyType}
                >
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
                <FieldError error={e.newCompanyType} />
              </div>
              <div>
                <Label htmlFor="newCompanyWebsite">Website</Label>
                <Input
                  id="newCompanyWebsite"
                  name="newCompanyWebsite"
                  defaultValue={v.newCompanyWebsite ?? ""}
                  placeholder="https://... (auto-prefixed if you type just company.com)"
                  aria-invalid={!!e.newCompanyWebsite}
                />
                <FieldError error={e.newCompanyWebsite} />
              </div>
              <div>
                <Label htmlFor="newCompanyHqLocation">HQ Location</Label>
                <Input
                  id="newCompanyHqLocation"
                  name="newCompanyHqLocation"
                  defaultValue={v.newCompanyHqLocation ?? ""}
                  placeholder="e.g. Bengaluru"
                />
              </div>
            </div>
          </details>
        )}

        {/* ── Job basics ──────────────────────────────── */}
        <div className="sm:col-span-2">
          <Label htmlFor="title">Job title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={v.title ?? ""}
            required
            minLength={3}
            maxLength={140}
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
            <option value="TECHNICIAN">Technician (blue-collar)</option>
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
            <option value="ONSITE">Onsite</option>
            <option value="HYBRID">Hybrid</option>
            <option value="REMOTE">Remote</option>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="locations">Locations (comma-separated)</Label>
          <Input
            id="locations"
            name="locations"
            defaultValue={v.locations ?? ""}
            placeholder="Bengaluru, Pune"
          />
        </div>
        <div>
          <Label htmlFor="audience">Audience</Label>
          <NativeSelect
            id="audience"
            name="audience"
            required
            defaultValue={v.audience ?? "PUBLIC"}
          >
            <option value="PUBLIC">Public</option>
            <option value="DIYGURU_ONLY">DIYguru-only (verified students)</option>
            <option value="INVITE_ONLY">Invite-only (no listing)</option>
          </NativeSelect>
        </div>

        <div>
          <Label htmlFor="experienceMin">Min years</Label>
          <Input
            id="experienceMin"
            name="experienceMin"
            type="number"
            inputMode="numeric"
            min={0}
            max={40}
            defaultValue={v.experienceMin ?? ""}
            aria-invalid={!!e.experienceMin}
          />
          <FieldError error={e.experienceMin} />
        </div>
        <div>
          <Label htmlFor="experienceMax">Max years</Label>
          <Input
            id="experienceMax"
            name="experienceMax"
            type="number"
            inputMode="numeric"
            min={0}
            max={40}
            defaultValue={v.experienceMax ?? ""}
            aria-invalid={!!e.experienceMax}
          />
          <FieldError error={e.experienceMax} />
        </div>
        <div>
          <Label htmlFor="salaryMin">Salary min (INR)</Label>
          <Input
            id="salaryMin"
            name="salaryMin"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="e.g. 1500000"
            defaultValue={v.salaryMin ?? ""}
            aria-invalid={!!e.salaryMin}
          />
          <FieldError error={e.salaryMin} />
        </div>
        <div>
          <Label htmlFor="salaryMax">Salary max (INR)</Label>
          <Input
            id="salaryMax"
            name="salaryMax"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="e.g. 2500000"
            defaultValue={v.salaryMax ?? ""}
            aria-invalid={!!e.salaryMax}
          />
          <FieldError error={e.salaryMax} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="salaryPeriod">Salary period</Label>
          <NativeSelect
            id="salaryPeriod"
            name="salaryPeriod"
            defaultValue={v.salaryPeriod ?? "YEARLY"}
          >
            <option value="YEARLY">Per year (full-time roles)</option>
            <option value="MONTHLY">Per month (internships / stipends)</option>
          </NativeSelect>
        </div>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm text-emce-text-sec">
          <input
            type="checkbox"
            name="salaryHidden"
            value="true"
            defaultChecked={v.salaryHidden === "true"}
          />
          Hide salary band on the public listing (PUBLIC jobs only — DIYguru jobs always show)
        </label>

        {/* ── External apply URL ─────────────────────── */}
        <div className="sm:col-span-2">
          <Label htmlFor="applicationUrl">Apply URL (external)</Label>
          <Input
            id="applicationUrl"
            name="applicationUrl"
            defaultValue={v.applicationUrl ?? ""}
            placeholder="https://company.com/careers/job-id"
            aria-invalid={!!e.applicationUrl}
          />
          <p className="mt-1 text-hint text-emce-text-sec">
            When set, the public job page sends candidates straight to this URL.
            Leave empty to apply <em>through</em> this platform. Pasting <code>company.com</code> is fine
            — we&apos;ll auto-add <code>https://</code>.
          </p>
          <FieldError error={e.applicationUrl} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="applicationEmail">Apply email (fallback)</Label>
          <Input
            id="applicationEmail"
            name="applicationEmail"
            type="email"
            defaultValue={v.applicationEmail ?? ""}
            placeholder="hr@company.com"
            aria-invalid={!!e.applicationEmail}
          />
          <FieldError error={e.applicationEmail} />
        </div>

        {/* ── JD content (rich text — bold, italic, lists, links, copy-paste) ── */}
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
            placeholder="• Own end-to-end design of …&#10;• Collaborate with …"
            minHeight={150}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="requirements">Requirements</Label>
          <RichTextEditor
            id="requirements"
            name="requirements"
            defaultValue={v.requirements ?? ""}
            placeholder="• 3+ years in …&#10;• Hands-on with …"
            minHeight={150}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="benefits">Benefits</Label>
          <RichTextEditor
            id="benefits"
            name="benefits"
            defaultValue={v.benefits ?? ""}
            placeholder="ESOPs, learning budget, hybrid …"
            minHeight={100}
          />
        </div>

        {/* ── Tags ────────────────────────────────────── */}
        <div className="sm:col-span-2">
          <Label htmlFor="evDomainSlugs">EV domains (comma-separated slugs)</Label>
          <Input
            id="evDomainSlugs"
            name="evDomainSlugs"
            defaultValue={v.evDomainSlugs ?? ""}
            placeholder={evDomains.map((d) => d.slug).slice(0, 3).join(", ")}
          />
          <p className="mt-1 text-hint text-emce-text-sec">
            Available: {evDomains.map((d) => d.slug).join(", ")}
          </p>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="skillNames">Skills (comma-separated)</Label>
          <Input
            id="skillNames"
            name="skillNames"
            defaultValue={v.skillNames ?? ""}
            placeholder="BMS, ARM Cortex, CAN Bus"
          />
        </div>

        {/* ── Submit ──────────────────────────────────── */}
        <div className="sm:col-span-2 mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {isEdit ? (
            <Button type="submit" size="lg" className="w-full sm:w-auto">
              Save changes
            </Button>
          ) : (
            <>
              <Button type="submit" name="publishNow" value="true" size="lg" className="w-full sm:w-auto">
                Publish now
              </Button>
              <Button type="submit" variant="outline" size="lg" className="w-full sm:w-auto">
                Save as draft
              </Button>
            </>
          )}
        </div>
      </form>
    </>
  );
}

/**
 * Project an existing JobPosting record onto the FormData-shaped
 * string map that `prevValues` uses. Drives initial render of the
 * edit page. The shape mirrors the field names on the form
 * exactly so a single `v.<name>` lookup works for both create-mode
 * (state.prevValues) and edit-mode (this map).
 */
function jobToFormMap(job: ExistingJob): Record<string, string> {
  return {
    companyId: job.companyId,
    title: job.title,
    description: job.description ?? "",
    responsibilities: job.responsibilities ?? "",
    requirements: job.requirements ?? "",
    benefits: job.benefits ?? "",
    profileMode: job.profileMode,
    employmentType: job.employmentType,
    workMode: job.workMode,
    seniorityLevel: job.seniorityLevel,
    locations: job.locations.join(", "),
    audience: job.audience,
    experienceMin: job.experienceMin?.toString() ?? "",
    experienceMax: job.experienceMax?.toString() ?? "",
    salaryMin: job.salaryMin ?? "",
    salaryMax: job.salaryMax ?? "",
    salaryPeriod: job.salaryPeriod ?? "YEARLY",
    salaryHidden: job.salaryHidden ? "true" : "",
    applicationUrl: job.applicationUrl ?? "",
    applicationEmail: job.applicationEmail ?? "",
    evDomainSlugs: job.evDomainSlugs.join(", "),
    skillNames: job.skillNames.join(", "),
  };
}
