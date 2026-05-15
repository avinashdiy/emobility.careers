"use client";

import { useActionState, useEffect, useState } from "react";
import type { Experience, Company } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";
import { CompanyPicker } from "@/components/profile/CompanyPicker";
import { saveExperience, deleteExperience } from "@/server/candidates/actions";
import { requestExperienceEmailVerify } from "@/server/experience-verify/actions";
import { emptyFormState, type FormState } from "@/lib/form-state";
import { formatMonthYear } from "@/lib/utils";
import { Trash2 } from "lucide-react";

type ExperienceWithCompany = Experience & {
  companyRef?: Pick<Company, "id" | "name" | "logoUrl" | "emailDomains"> | null;
};

function isoMonth(d?: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 7);
}

/**
 * One Experience row's edit form. Wrapped in useActionState so a
 * validation failure surfaces inline ("Title is required.") instead
 * of silently no-op'ing on click. On success the alert auto-
 * dismisses; on failure the action's `prevValues` echo back so the
 * user's typing is preserved.
 *
 * Each instance has its own action state — we deliberately don't
 * lift it to the parent so the "Add" form's state and the "Edit"
 * forms don't trip over each other.
 */
function ExperienceForm({ experience }: { experience?: ExperienceWithCompany }) {
  const [state, formAction] = useActionState<FormState, FormData>(saveExperience, emptyFormState);
  const e = state.fieldErrors ?? {};
  const v = state.prevValues ?? {};

  const [showOk, setShowOk] = useState(false);
  useEffect(() => {
    if (state.ok && state.message) {
      setShowOk(true);
      const t = setTimeout(() => setShowOk(false), 4000);
      return () => clearTimeout(t);
    }
  }, [state]);

  const idTag = experience?.id ?? "new";
  return (
    <>
      {state.ok && showOk && state.message && (
        <Alert variant="success" className="mb-3">✓ {state.message}</Alert>
      )}
      {!state.ok && state.message && (
        <Alert variant="danger" className="mb-3">{state.message}</Alert>
      )}

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
        {experience && <input type="hidden" name="id" value={experience.id} />}
        <div>
          <Label htmlFor={`title-${idTag}`} required>Title</Label>
          <Input
            id={`title-${idTag}`}
            name="title"
            required
            defaultValue={v.title ?? experience?.title ?? ""}
            aria-invalid={!!e.title}
          />
          <FieldError error={e.title} />
        </div>
        <div>
          {/* CompanyPicker handles search-or-create; posts both `company`
              (text) and `companyId` (FK) to the action. */}
          <CompanyPicker
            initialId={experience?.companyId ?? null}
            initialText={experience?.company ?? ""}
            initialEntity={
              experience?.companyRef
                ? { id: experience.companyRef.id, name: experience.companyRef.name, logoUrl: experience.companyRef.logoUrl }
                : null
            }
          />
          <FieldError error={e.company} />
        </div>
        <div>
          <Label htmlFor={`location-${idTag}`} optional>Location</Label>
          <Input
            id={`location-${idTag}`}
            name="location"
            defaultValue={v.location ?? experience?.location ?? ""}
            aria-invalid={!!e.location}
          />
          <FieldError error={e.location} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`startDate-${idTag}`} required>Start</Label>
            <Input
              id={`startDate-${idTag}`}
              name="startDate"
              type="month"
              required
              defaultValue={v.startDate ?? isoMonth(experience?.startDate)}
              aria-invalid={!!e.startDate}
            />
            <FieldError error={e.startDate} />
          </div>
          <div>
            <Label htmlFor={`endDate-${idTag}`} optional>End</Label>
            <Input
              id={`endDate-${idTag}`}
              name="endDate"
              type="month"
              defaultValue={v.endDate ?? isoMonth(experience?.endDate)}
              aria-invalid={!!e.endDate}
            />
            <FieldError error={e.endDate} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-emce-text-sec sm:col-span-2">
          <input
            type="checkbox"
            name="current"
            value="true"
            defaultChecked={v.current === "true" || (v.current == null && (experience?.current ?? false))}
            className="h-4 w-4 accent-emce-mid"
          />
          I currently work here
        </label>
        <div className="sm:col-span-2">
          <Label htmlFor={`description-${idTag}`} optional>What you did</Label>
          <Textarea
            id={`description-${idTag}`}
            name="description"
            defaultValue={v.description ?? experience?.description ?? ""}
            rows={3}
            placeholder="2–4 bullet points on impact, scale, technologies."
            aria-invalid={!!e.description}
          />
          <FieldError error={e.description} />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm">
            {experience ? "Update" : "Add experience"}
          </Button>
        </div>
      </form>
    </>
  );
}

export function ExperienceEditor({ experiences }: { experiences: ExperienceWithCompany[] }) {
  return (
    <Card className="p-6">
      <h2 className="text-section text-emce-text">Experience</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        Most-recent first. Add roles, internships, or relevant lab/project work.
      </p>

      {experiences.length === 0 ? (
        <p className="mb-4 rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
          No experience yet. Add your first below.
        </p>
      ) : (
        <ul className="mb-6 space-y-3">
          {experiences.map((exp) => {
            const eligibleForEmailVerify =
              !exp.verifiedAt &&
              !!exp.companyRef &&
              (exp.companyRef.emailDomains?.length ?? 0) > 0;
            return (
              <li
                key={exp.id}
                className="rounded-md border border-emce-border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-emce-text">{exp.title}</span>
                      <span className="text-emce-text-sec">— {exp.company}</span>
                      {/* Verified-Company badge — green chip when stamped.
                          The method tag clarifies which path earned it. */}
                      {exp.verifiedAt && (
                        <Badge variant="success" className="text-[10px]">
                          ✓ Verified
                          {exp.verifiedMethod === "EMAIL_DOMAIN" && " · email"}
                          {exp.verifiedMethod === "RECRUITER_APPROVAL" && " · recruiter"}
                        </Badge>
                      )}
                    </div>
                    <div className="text-hint text-emce-text-muted">
                      {formatMonthYear(exp.startDate)} – {exp.current ? "Present" : formatMonthYear(exp.endDate)}
                      {exp.location ? ` · ${exp.location}` : ""}
                    </div>
                  </div>
                  <form action={deleteExperience}>
                    <input type="hidden" name="id" value={exp.id} />
                    <ConfirmSubmit
                      confirm={`Delete the "${exp.title}" role at ${exp.company}?`}
                      variant="ghost"
                      size="icon"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </ConfirmSubmit>
                  </form>
                </div>

                {/* Verify-by-work-email row — only renders when (a) the
                    company is linked AND (b) the company has at least one
                    email-domain on its allowlist. Recruiters-on-team
                    approval is the alternate path for everyone else. */}
                {!exp.verifiedAt && (
                  <div className="mt-2 border-t border-emce-border pt-2">
                    {eligibleForEmailVerify ? (
                      <form
                        action={requestExperienceEmailVerify}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center"
                      >
                        <input type="hidden" name="experienceId" value={exp.id} />
                        <Input
                          name="email"
                          type="email"
                          required
                          placeholder={`name@${exp.companyRef!.emailDomains[0]}`}
                          className="sm:max-w-xs"
                        />
                        <Button type="submit" size="sm">
                          ✓ Verify with work email
                        </Button>
                        <p className="text-hint text-emce-text-muted">
                          Or ask a recruiter on the team to approve from{" "}
                          <code className="rounded bg-emce-light-soft px-1 text-[11px]">
                            /employer/verifications
                          </code>
                        </p>
                      </form>
                    ) : !exp.companyId ? (
                      <p className="text-hint text-emce-text-sec">
                        Link this entry to a company (using the picker when editing) to enable verification.
                      </p>
                    ) : (
                      <p className="text-hint text-emce-text-sec">
                        Email-domain verification isn&apos;t available for this company yet — ask a recruiter on their team to approve from /employer/verifications.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details className="rounded-md border border-dashed border-emce-border p-4">
        <summary className="cursor-pointer text-sm font-bold text-emce-dark">
          + Add experience
        </summary>
        <div className="mt-4">
          <ExperienceForm />
        </div>
      </details>
    </Card>
  );
}
