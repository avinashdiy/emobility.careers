"use client";

import { useActionState, useEffect, useState } from "react";
import { submitCompanyReview } from "@/server/reviews/actions";
import { emptyFormState, type FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";

const RATINGS_AXES: { key: string; label: string }[] = [
  { key: "overallRating", label: "Overall (would you recommend this company?)" },
  { key: "cultureRating", label: "Culture" },
  { key: "compensationRating", label: "Compensation & benefits" },
  { key: "managementRating", label: "Management" },
  { key: "growthRating", label: "Career growth" },
  { key: "workLifeRating", label: "Work-life balance" },
];

export function CompanyReviewForm({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    submitCompanyReview,
    emptyFormState,
  );
  const e = state.fieldErrors ?? {};
  const v = state.prevValues ?? {};

  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (state.ok && state.message) {
      setShowSaved(true);
      const t = setTimeout(() => setShowSaved(false), 6000);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (state.ok && showSaved) {
    return (
      <Alert variant="success">
        ✓ Thanks for reviewing {companyName}. {state.message}
      </Alert>
    );
  }

  return (
    <>
      {!state.ok && state.message && (
        <Alert variant="danger" className="mb-3">
          {state.message}
        </Alert>
      )}

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="companyId" value={companyId} />

        <div>
          <Label htmlFor="relationship" required>
            Your relationship
          </Label>
          <NativeSelect
            id="relationship"
            name="relationship"
            defaultValue={v.relationship ?? "CURRENT_EMPLOYEE"}
            required
          >
            <option value="CURRENT_EMPLOYEE">Current employee</option>
            <option value="FORMER_EMPLOYEE">Former employee</option>
            <option value="INTERN">Intern</option>
            <option value="CONTRACTOR">Contractor</option>
            <option value="INTERVIEWED">Interviewed but didn&apos;t join</option>
          </NativeSelect>
        </div>

        <fieldset className="rounded-md border border-emce-border p-4">
          <legend className="px-2 text-hint font-bold uppercase tracking-wide text-emce-mid-muted">
            Ratings (1-5 each)
          </legend>
          <div className="space-y-3">
            {RATINGS_AXES.map((a) => (
              <RatingRow key={a.key} name={a.key} label={a.label} defaultValue={v[a.key]} error={e[a.key]} />
            ))}
          </div>
        </fieldset>

        <div>
          <Label htmlFor="headline" required>
            Headline (one-line summary)
          </Label>
          <Input
            id="headline"
            name="headline"
            required
            maxLength={220}
            defaultValue={v.headline ?? ""}
            placeholder="e.g. Solid engineering culture, slow review cycles"
            aria-invalid={!!e.headline}
          />
          <FieldError error={e.headline} />
        </div>

        <div>
          <Label htmlFor="pros" required>
            Pros (what works well)
          </Label>
          <Textarea
            id="pros"
            name="pros"
            required
            rows={4}
            maxLength={2000}
            defaultValue={v.pros ?? ""}
            placeholder="Free hand on technical decisions, real EV problems, exposure to BMS + pack-design end-to-end…"
            aria-invalid={!!e.pros}
          />
          <FieldError error={e.pros} />
        </div>

        <div>
          <Label htmlFor="cons" required>
            Cons (what doesn&apos;t work)
          </Label>
          <Textarea
            id="cons"
            name="cons"
            required
            rows={4}
            maxLength={2000}
            defaultValue={v.cons ?? ""}
            placeholder="Compensation lags peer Tier-1 by ~20%, promotions are slow, weekend on-call rota is common…"
            aria-invalid={!!e.cons}
          />
          <FieldError error={e.cons} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="reviewerJobTitle" optional>
              Your job title (visible on review)
            </Label>
            <Input
              id="reviewerJobTitle"
              name="reviewerJobTitle"
              maxLength={120}
              defaultValue={v.reviewerJobTitle ?? ""}
              placeholder="Battery Engineer"
            />
          </div>
          <div>
            <Label htmlFor="reviewerLocation" optional>
              Office location
            </Label>
            <Input
              id="reviewerLocation"
              name="reviewerLocation"
              maxLength={120}
              defaultValue={v.reviewerLocation ?? ""}
              placeholder="Bengaluru"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <SubmitButton variant="glow" pendingLabel="Submitting…">
            Submit review
          </SubmitButton>
        </div>
      </form>
    </>
  );
}

function RatingRow({
  name,
  label,
  defaultValue,
  error,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  error?: string;
}) {
  return (
    <div>
      <Label className="text-sm">{label}</Label>
      <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="cursor-pointer rounded-md border border-emce-border bg-white px-3 py-1.5 text-sm font-bold text-emce-text-sec transition has-[:checked]:border-emce-mid has-[:checked]:bg-emce-light-soft has-[:checked]:text-emce-darkest"
          >
            <input
              type="radio"
              name={name}
              value={String(n)}
              required
              defaultChecked={defaultValue === String(n)}
              className="sr-only"
            />
            {"★".repeat(n)}
            <span className="sr-only">{n}</span>
          </label>
        ))}
      </div>
      <FieldError error={error} />
    </div>
  );
}
