"use client";

import { useActionState, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";
import { saveCustomCta } from "@/server/candidates/actions";
import { emptyFormState, type FormState } from "@/lib/form-state";

/**
 * Free-text "custom CTA" chip — LinkedIn-style "#Mentor",
 * "Available for freelance", "Open to relocate", "Fundraising", etc.
 * Renders as a small chip next to the candidate's name on their
 * public profile. Empty value clears it.
 *
 * Migrated to useActionState so Save chip surfaces success / error
 * inline instead of silently no-op'ing.
 */
export function CustomCtaEditor({ value }: { value: string | null }) {
  const [state, formAction] = useActionState<FormState, FormData>(saveCustomCta, emptyFormState);
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
    <Card className="p-6">
      <h2 className="text-section text-emce-text">Custom profile chip</h2>
      <p className="mb-3 text-hint text-emce-text-sec">
        A 1–3 word callout shown next to your name on your public
        profile. Use it for things the standard fields don&apos;t cover —
        examples: &quot;Available for freelance&quot;, &quot;Open to relocate&quot;,
        &quot;Fundraising&quot;, &quot;Speaking at events&quot;.
      </p>

      {state.ok && showOk && state.message && (
        <Alert variant="success" className="mb-3">✓ {state.message}</Alert>
      )}
      {!state.ok && state.message && (
        <Alert variant="danger" className="mb-3">{state.message}</Alert>
      )}

      <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
        <div className="flex-1">
          <Label htmlFor="customCta" optional>Custom CTA</Label>
          <Input
            id="customCta"
            name="customCta"
            defaultValue={v.customCta ?? value ?? ""}
            maxLength={160}
            placeholder="Available for freelance"
            aria-invalid={!!e.customCta}
          />
          <FieldError error={e.customCta} />
        </div>
        <Button type="submit" className="shrink-0 sm:mb-0">
          Save chip
        </Button>
      </form>
    </Card>
  );
}
