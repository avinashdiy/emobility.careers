"use client";

import { useActionState, useEffect, useState } from "react";
import type { Education, Institution } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";
import { InstitutionPicker } from "@/components/profile/InstitutionPicker";
import { saveEducation, deleteEducation } from "@/server/candidates/actions";
import { emptyFormState, type FormState } from "@/lib/form-state";
import { Trash2 } from "lucide-react";

type EducationWithInstitution = Education & {
  institutionRef?: Pick<Institution, "id" | "name" | "logoUrl"> | null;
};

function EducationForm() {
  const [state, formAction] = useActionState<FormState, FormData>(saveEducation, emptyFormState);
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

  return (
    <>
      {state.ok && showOk && state.message && (
        <Alert variant="success" className="mb-3">✓ {state.message}</Alert>
      )}
      {!state.ok && state.message && (
        <Alert variant="danger" className="mb-3">{state.message}</Alert>
      )}
      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          {/* InstitutionPicker — search-or-create autocomplete. The text
              is always required; the institutionId is optional (links the
              entry to a structured Institution row when present). */}
          <InstitutionPicker />
          <FieldError error={e.institution} />
        </div>
        <div>
          <Label htmlFor="degree" optional>Degree</Label>
          <Input
            id="degree"
            name="degree"
            defaultValue={v.degree ?? ""}
            placeholder="e.g. B.Tech, ITI, Diploma"
            aria-invalid={!!e.degree}
          />
          <FieldError error={e.degree} />
        </div>
        <div>
          <Label htmlFor="field" optional>Field of study</Label>
          <Input
            id="field"
            name="field"
            defaultValue={v.field ?? ""}
            placeholder="e.g. Electrical, Mechanical"
            aria-invalid={!!e.field}
          />
          <FieldError error={e.field} />
        </div>
        <div>
          <Label htmlFor="startYear" optional>Start year</Label>
          <Input
            id="startYear"
            name="startYear"
            type="number"
            min="1950"
            max="2100"
            defaultValue={v.startYear ?? ""}
            aria-invalid={!!e.startYear}
          />
          <FieldError error={e.startYear} />
        </div>
        <div>
          <Label htmlFor="endYear" optional>End year</Label>
          <Input
            id="endYear"
            name="endYear"
            type="number"
            min="1950"
            max="2100"
            defaultValue={v.endYear ?? ""}
            aria-invalid={!!e.endYear}
          />
          <FieldError error={e.endYear} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="grade" optional>Grade / CGPA</Label>
          <Input
            id="grade"
            name="grade"
            defaultValue={v.grade ?? ""}
            aria-invalid={!!e.grade}
          />
          <FieldError error={e.grade} />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm">Add</Button>
        </div>
      </form>
    </>
  );
}

export function EducationEditor({ education }: { education: EducationWithInstitution[] }) {
  return (
    <Card className="p-6">
      <h2 className="text-section text-emce-text">Education</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        Degrees, diplomas, ITI courses, and DIYguru certifications.
      </p>

      {education.length === 0 ? (
        <p className="mb-4 rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
          No education entries yet.
        </p>
      ) : (
        <ul className="mb-6 space-y-3">
          {education.map((edu) => (
            <li
              key={edu.id}
              className="flex items-start justify-between rounded-md border border-emce-border p-3"
            >
              <div>
                <div className="font-bold text-emce-text">
                  {edu.institution}
                  {edu.institutionRef && (
                    <span className="ml-1 text-xs font-normal text-emce-mid-muted">✓ linked</span>
                  )}
                </div>
                <div className="text-hint text-emce-text-muted">
                  {[edu.degree, edu.field].filter(Boolean).join(" · ")} ·{" "}
                  {edu.startYear ?? "?"}–{edu.endYear ?? "?"}
                </div>
              </div>
              <form action={deleteEducation}>
                <input type="hidden" name="id" value={edu.id} />
                <ConfirmSubmit
                  confirm={`Remove ${edu.institution} from your education?`}
                  variant="ghost"
                  size="icon"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-md border border-dashed border-emce-border p-4">
        <summary className="cursor-pointer text-sm font-bold text-emce-dark">
          + Add education
        </summary>
        <div className="mt-4">
          <EducationForm />
        </div>
      </details>
    </Card>
  );
}
