"use client";

import { useActionState, useEffect, useState } from "react";
import type { CandidateProfile } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";
import { saveHeader } from "@/server/candidates/actions";
import { emptyFormState, type FormState } from "@/lib/form-state";
import { COUNTRIES } from "@/lib/countries";

/**
 * Profile header editor. Migrated to the `useActionState` pattern so
 * Save changes surfaces success / failure inline instead of silently
 * no-op'ing on validation rejection. The action returns:
 *
 *   • `{ ok: true, message: "Saved." }` — top-of-card success alert
 *     auto-dismisses after a few seconds.
 *   • `{ ok: false, message, fieldErrors }` — top-of-card error +
 *     per-field error messages via <FieldError>. Inputs render
 *     `aria-invalid` so screen readers + the input-error ring fire.
 *
 * `prevValues` is round-tripped so a validation failure doesn't wipe
 * the recruiter's typing — they fix one field, the other 11 are
 * still there.
 */
export function HeaderEditor({ profile }: { profile: CandidateProfile }) {
  const [state, formAction] = useActionState<FormState, FormData>(saveHeader, emptyFormState);
  const e = state.fieldErrors ?? {};
  const v = state.prevValues ?? {};

  // Auto-dismiss the success alert so the form doesn't feel sticky
  // after a save. Failures stay until the user resubmits.
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
      <h2 className="text-section text-emce-text">Headline &amp; about</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        This is the first thing employers see on your public profile.
      </p>

      {state.ok && showOk && state.message && (
        <Alert variant="success" className="mb-3">
          ✓ {state.message}
        </Alert>
      )}
      {!state.ok && state.message && (
        <Alert variant="danger" className="mb-3">
          {state.message}
        </Alert>
      )}

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
        <div>
          <Label htmlFor="firstName" required>First name</Label>
          <Input
            id="firstName"
            name="firstName"
            required
            defaultValue={v.firstName ?? profile.firstName}
            aria-invalid={!!e.firstName}
          />
          <FieldError error={e.firstName} />
        </div>
        <div>
          <Label htmlFor="lastName" optional>Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={v.lastName ?? profile.lastName ?? ""}
            aria-invalid={!!e.lastName}
          />
          <FieldError error={e.lastName} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="headline" optional>Headline</Label>
          <Input
            id="headline"
            name="headline"
            defaultValue={v.headline ?? profile.headline ?? ""}
            placeholder="e.g. Battery Pack Engineer | Cell chemistry, BMS"
            maxLength={160}
            aria-invalid={!!e.headline}
          />
          <FieldError error={e.headline} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="summary" optional>About you</Label>
          <Textarea
            id="summary"
            name="summary"
            defaultValue={v.summary ?? profile.summary ?? ""}
            placeholder="2–4 sentences on what you build and what you're looking for."
            maxLength={2000}
            rows={4}
            aria-invalid={!!e.summary}
          />
          <FieldError error={e.summary} />
        </div>
        <div>
          <Label htmlFor="country" optional>Country</Label>
          <NativeSelect
            id="country"
            name="country"
            defaultValue={v.country ?? profile.country ?? ""}
            aria-invalid={!!e.country}
          >
            <option value="">— Select —</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </NativeSelect>
          <FieldError error={e.country} />
        </div>
        <div>
          <Label htmlFor="city" optional>City</Label>
          <Input
            id="city"
            name="city"
            defaultValue={v.city ?? profile.city ?? ""}
            placeholder="e.g. Bengaluru"
            aria-invalid={!!e.city}
          />
          <FieldError error={e.city} />
        </div>
        {/* Free-text "location" remains as a third field for legacy
            compatibility — search filters still index it. Most users
            will leave this blank and let it auto-derive from
            country+city on save. */}
        <div className="sm:col-span-2">
          <Label htmlFor="location" optional>Display location (optional override)</Label>
          <Input
            id="location"
            name="location"
            defaultValue={v.location ?? profile.location ?? ""}
            placeholder="Auto-derived from city + country if left blank"
            aria-invalid={!!e.location}
          />
          <FieldError error={e.location} />
        </div>
        <div>
          <Label htmlFor="phone" optional>Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={v.phone ?? profile.phone ?? ""}
            aria-invalid={!!e.phone}
          />
          <p className="mt-1 text-hint text-emce-text-muted">
            Recruiters can reach you on WhatsApp via this number — visibility is controlled in <strong>Privacy</strong> below.
          </p>
          <FieldError error={e.phone} />
        </div>
        <div>
          <Label htmlFor="linkedinUrl" optional>LinkedIn URL</Label>
          <Input
            id="linkedinUrl"
            name="linkedinUrl"
            type="url"
            defaultValue={v.linkedinUrl ?? profile.linkedinUrl ?? ""}
            placeholder="linkedin.com/in/your-handle (https:// auto-added)"
            aria-invalid={!!e.linkedinUrl}
          />
          <FieldError error={e.linkedinUrl} />
        </div>
        <div>
          <Label htmlFor="githubUrl" optional>GitHub URL</Label>
          <Input
            id="githubUrl"
            name="githubUrl"
            type="url"
            defaultValue={v.githubUrl ?? profile.githubUrl ?? ""}
            placeholder="github.com/your-handle (https:// auto-added)"
            aria-invalid={!!e.githubUrl}
          />
          <FieldError error={e.githubUrl} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="portfolioUrl" optional>Portfolio / website</Label>
          <Input
            id="portfolioUrl"
            name="portfolioUrl"
            type="url"
            defaultValue={v.portfolioUrl ?? profile.portfolioUrl ?? ""}
            placeholder="yoursite.com (https:// auto-added)"
            aria-invalid={!!e.portfolioUrl}
          />
          <FieldError error={e.portfolioUrl} />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit">Save changes</Button>
        </div>
      </form>
    </Card>
  );
}
