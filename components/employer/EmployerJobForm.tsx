"use client";

import { useActionState } from "react";
import type { Country } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { FieldError } from "@/components/ui/field-error";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { JDAssistant } from "@/components/jobs/JDAssistant";
import { ApplicationQuestionsEditor } from "@/components/employer/ApplicationQuestionsEditor";
import type { ApplicationQuestion } from "@/server/jobs/application-questions";
import { SUPPORTED_COUNTRY_LIST } from "@/lib/countries";
import {
  createJob,
  updateJob,
  type CreateJobFormState,
} from "@/server/employer/actions";

const INITIAL: CreateJobFormState = { ok: false };

interface DomainOption {
  id: string;
  slug: string;
  name: string;
}

/// Existing values for the edit flow. All optional — the new-job
/// surface still mounts this form with no `initial` prop and the
/// form falls back to the regular blank defaults.
export interface EmployerJobInitial {
  title?: string | null;
  description?: string | null;
  responsibilities?: string | null;
  requirements?: string | null;
  benefits?: string | null;
  profileMode?: string | null;
  seniorityLevel?: string | null;
  employmentType?: string | null;
  workMode?: string | null;
  audience?: string | null;
  locations?: string[] | null;
  /// Country this role is based in (Prisma enum value). Pre-fills
  /// the country dropdown — on edit mode from the saved row, on
  /// create mode from `defaultCountry` below (= company's hqCountry).
  country?: Country | string | null;
  /// "🌍 Open to relocation" — whether the recruiter wants
  /// candidates from outside `country` to surface this role.
  openToRelocation?: boolean | null;
  experienceMin?: number | null;
  experienceMax?: number | null;
  salaryMin?: number | string | null;
  salaryMax?: number | string | null;
  salaryPeriod?: string | null;
  salaryHidden?: boolean | null;
  evDomainSlugs?: string[] | null;
  skillNames?: string[] | null;
  status?: string | null;
  /// #2 Structured application narrative — initial questions from
  /// the saved job (edit mode). null/empty in create mode.
  applicationQuestions?: ApplicationQuestion[] | null;
}

interface Props {
  evDomains: DomainOption[];
  /// Present → edit mode (dispatches updateJob); absent → create mode.
  jobId?: string;
  initial?: EmployerJobInitial;
  /**
   * The country to pre-select in the country dropdown when no
   * `initial.country` is present. Passed by the page wrapper from
   * `Company.hqCountry` (the company's HQ market) — so a recruiter
   * at an India-HQ company sees India pre-filled, a Bee'ah
   * recruiter sees UAE pre-filled, etc. The recruiter can override
   * per job (multi-country employers posting cross-market roles).
   * Defaults to "IN" if the caller doesn't pass it.
   */
  defaultCountry?: Country;
}

/**
 * Recruiter-facing "Post a job" / "Edit job" form. Same useActionState
 * shape on both surfaces so a validation failure preserves the
 * recruiter's typing and surfaces per-field errors instead of silently
 * round-tripping through `?error=...`.
 *
 * The form sits inside an EmployerShell + Card on the page.
 */
export function EmployerJobForm({
  evDomains,
  jobId,
  initial,
  defaultCountry = "IN",
}: Props) {
  const isEdit = Boolean(jobId);
  const [state, formAction] = useActionState(
    isEdit ? updateJob : createJob,
    INITIAL,
  );
  // On a validation-failure round-trip we re-fill from prevValues (the
  // user's last typing). On a fresh edit-page mount we re-fill from
  // the saved job (`initial`). Create-mode with no prevValues falls
  // through to "".
  const v = state.prevValues ?? buildInitialPrev(initial);
  const e = state.fieldErrors ?? {};
  // Country precedence: user's last typing (after a validation
  // round-trip) → saved job's country (edit mode) → company's HQ
  // country (create mode default). Always lands on a real Country
  // value so the <select>'s `defaultValue` resolves a matching
  // option rather than rendering blank.
  const countryValue =
    (v.country as string | undefined) ??
    (initial?.country as string | undefined) ??
    defaultCountry;
  // Same pattern for the relocation toggle — the FormData round-trip
  // captures "on" / "true" / undefined; we coerce to a boolean once
  // here so the checkbox's `defaultChecked` is unambiguous.
  const relocationValue =
    v.openToRelocation === "on" ||
    v.openToRelocation === "true" ||
    (initial?.openToRelocation === true && v.openToRelocation === undefined);

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
        {jobId && <input type="hidden" name="jobId" value={jobId} />}
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

        {/* Country — required dropdown. Pre-filled from the
            company's hqCountry (set during employer onboarding,
            which itself defaults from the recruiter's User.country
            captured at signup). Recruiter overrides per job when
            posting cross-market (Tata HQ-India recruiter posting
            a UK role, etc.). Drives the per-country sitemap shard
            the job appears in, the country filter on /jobs, the
            JSON-LD `applicantLocationRequirements` Google for
            Jobs reads, and the hreflang alternate target for
            /uk/jobs etc. */}
        <div>
          <Label htmlFor="country">Country</Label>
          <NativeSelect
            id="country"
            name="country"
            required
            defaultValue={countryValue}
            aria-invalid={!!e.country}
          >
            {SUPPORTED_COUNTRY_LIST.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </NativeSelect>
          <FieldError error={e.country} />
        </div>

        {/* Cities — free text. We keep this loose (not a structured
            address picker) because recruiters routinely type things
            like "Bengaluru / Pune (hybrid)" or "Multiple Indian
            cities" that no dropdown will cover cleanly. Country
            above is the SEO-grade signal; this is recruiter prose. */}
        <div>
          <Label htmlFor="locations">Cities (comma-separated)</Label>
          <Input
            id="locations"
            name="locations"
            defaultValue={v.locations ?? ""}
            placeholder="e.g. Bengaluru, Pune, Chennai"
          />
        </div>

        {/* Open-to-relocation — opt-in cross-border discovery. When
            checked, the job ALSO appears in OTHER countries' feeds
            with a "🌍 Open to relocation" badge. Primary `country`
            above stays the home market for hreflang + sitemap
            purposes; this is just the secondary visibility signal.
            Bottom-section because it's an advanced toggle, not a
            required field. */}
        <div className="sm:col-span-2">
          <label className="flex items-start gap-2 rounded-md border border-emce-border bg-emce-light-soft/30 p-3 text-sm">
            <input
              type="checkbox"
              name="openToRelocation"
              defaultChecked={relocationValue}
              className="mt-0.5 h-4 w-4 accent-emce-dark"
            />
            <span>
              <span className="block font-bold text-emce-text">
                🌍 Open to candidates from other countries
              </span>
              <span className="mt-0.5 block text-hint text-emce-text-sec">
                Visa-sponsored / relocation roles only. The job will
                surface in other countries&apos; feeds with a
                relocation badge alongside its primary listing in your
                home country.
              </span>
            </span>
          </label>
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

        <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label htmlFor="salaryMin">Salary min</Label>
            <Input
              id="salaryMin"
              name="salaryMin"
              type="number"
              min="0"
              defaultValue={v.salaryMin ?? ""}
              aria-invalid={!!e.salaryMin}
              placeholder="e.g. 10000"
            />
            <FieldError error={e.salaryMin} />
          </div>
          <div>
            <Label htmlFor="salaryMax">Salary max</Label>
            <Input
              id="salaryMax"
              name="salaryMax"
              type="number"
              min="0"
              defaultValue={v.salaryMax ?? ""}
              aria-invalid={!!e.salaryMax}
              placeholder="e.g. 25000"
            />
            <FieldError error={e.salaryMax} />
          </div>
          <div>
            <Label htmlFor="salaryPeriod">Period</Label>
            <NativeSelect
              id="salaryPeriod"
              name="salaryPeriod"
              defaultValue={v.salaryPeriod ?? "YEARLY"}
            >
              <option value="YEARLY">Per year</option>
              <option value="MONTHLY">Per month</option>
            </NativeSelect>
            <p className="mt-1 text-hint text-emce-text-muted">
              Stipends are usually <strong>monthly</strong>; full-time roles{" "}
              <strong>yearly</strong>.
            </p>
          </div>
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

        {/* #2 Structured application narrative — JSON-serialised
            into a hidden `applicationQuestionsJson` field that the
            createJob/updateJob server actions parse + normalise. */}
        <div className="sm:col-span-2 border-t border-emce-border pt-4">
          <ApplicationQuestionsEditor
            defaultValue={initial?.applicationQuestions ?? []}
          />
        </div>

        <input type="hidden" name="salaryCurrency" value="INR" />

        <div className="sm:col-span-2 flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button type="submit" name="publishNow" value="" variant="outline">
            {isEdit ? "Save as draft" : "Save as draft"}
          </Button>
          <Button type="submit" name="publishNow" value="true">
            {isEdit
              ? initial?.status === "OPEN"
                ? "Save changes"
                : "Publish job"
              : "Publish job"}
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

/**
 * Convert a job record (from Prisma → page → form props) into the
 * flat string-keyed prevValues shape the form's input `defaultValue`
 * expressions read from. Matches the FormData keys the create / update
 * actions read on submit.
 */
function buildInitialPrev(
  initial: EmployerJobInitial | undefined,
): Record<string, string> {
  if (!initial) return {};
  const out: Record<string, string> = {};
  if (initial.title) out.title = initial.title;
  if (initial.description) out.description = initial.description;
  if (initial.responsibilities) out.responsibilities = initial.responsibilities;
  if (initial.requirements) out.requirements = initial.requirements;
  if (initial.benefits) out.benefits = initial.benefits;
  if (initial.profileMode) out.profileMode = initial.profileMode;
  if (initial.seniorityLevel) out.seniorityLevel = initial.seniorityLevel;
  if (initial.employmentType) out.employmentType = initial.employmentType;
  if (initial.workMode) out.workMode = initial.workMode;
  if (initial.audience) out.audience = initial.audience;
  if (initial.locations && initial.locations.length > 0) {
    out.locations = initial.locations.join(", ");
  }
  if (initial.experienceMin !== null && initial.experienceMin !== undefined) {
    out.experienceMin = String(initial.experienceMin);
  }
  if (initial.experienceMax !== null && initial.experienceMax !== undefined) {
    out.experienceMax = String(initial.experienceMax);
  }
  if (initial.salaryMin !== null && initial.salaryMin !== undefined) {
    out.salaryMin = String(initial.salaryMin);
  }
  if (initial.salaryMax !== null && initial.salaryMax !== undefined) {
    out.salaryMax = String(initial.salaryMax);
  }
  if (initial.salaryPeriod) out.salaryPeriod = initial.salaryPeriod;
  if (initial.salaryHidden) out.salaryHidden = "true";
  if (initial.evDomainSlugs && initial.evDomainSlugs.length > 0) {
    out.evDomainSlugs = initial.evDomainSlugs.join(", ");
  }
  if (initial.skillNames && initial.skillNames.length > 0) {
    out.skillNames = initial.skillNames.join(", ");
  }
  return out;
}
