"use client";

/**
 * Recruitathon TPO (Training & Placement Officer) inline-signup form.
 *
 * Lighter than the candidate / employer forms — TPO registration is
 * always admin-reviewed before activation, so we capture only what
 * the placement-team needs to triage the application:
 *
 *   • Identity + auth (name / email / password / phone / designation)
 *   • Institution (free-text — admin matches / dedupes later)
 *   • Cohort size (helps admin gauge scale)
 *   • Notes (free-text justification)
 *
 * After submission the TPO lands on the welcome screen with a
 * "Pending review" notice. Once an admin approves the application at
 * /admin/colleges, the TPO gets:
 *   • User.isPlacementOfficer = true → /tpo console unlocked
 *   • A persistent inviteToken → shareable student-invite URL
 *
 * OAuth fast-path is intentionally omitted — TPOs frequently use a
 * college-domain email (no SSO) and the form is short enough that
 * Google / LinkedIn pre-fill doesn't move the needle.
 */

import { useActionState, useState } from "react";
import Link from "next/link";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/ui/field-error";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { registerTpoInline } from "@/server/recruitathon/register-actions";
import { searchInstitutions, type InstitutionMatch } from "@/server/entities/actions";
import { EntityAutocomplete } from "@/components/recruitathon/EntityAutocomplete";
import { emptyFormState } from "@/lib/form-state";

export function TpoRegisterForm({
  driveSlug,
  turnstileSiteKey,
  signedInUser,
}: {
  driveSlug: string;
  turnstileSiteKey: string | null;
  /**
   * When set, auth fieldset + ToS are hidden and the action creates
   * only the CollegePlacementCell (PENDING) + institution shell —
   * no User / CandidateProfile creation.
   */
  signedInUser: { name: string | null; email: string } | null;
}) {
  const [state, formAction] = useActionState(registerTpoInline, emptyFormState);
  const [startedAt] = useState(() => Date.now());
  // Phase: typeahead autofill — picking an existing institution
  // populates the city field from the matched row so the TPO doesn't
  // re-type their college's city. Same controlled-on-pick /
  // uncontrolled-otherwise pattern as the Employer form.
  const [cityValue, setCityValue] = useState<string | undefined>(undefined);

  return (
    <>
      {state.message && !state.fieldErrors && (
        <div role="alert" className="mb-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
          {state.message}
        </div>
      )}

      {signedInUser && (
        <div className="mb-3 rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm text-emce-text">
          <strong>Signed in as {signedInUser.name ?? signedInUser.email}.</strong>{" "}
          We&apos;ll attach your placement-cell application to this account.{" "}
          <Link href="/api/auth/signout" className="font-bold text-emce-dark hover:underline">
            Not you?
          </Link>
        </div>
      )}

      {/* Heads-up — TPO accounts gate on admin review. Setting this
          expectation up front prevents the "I filled the form, where's
          my dashboard?" follow-up email. */}
      <div className="mb-5 rounded-md border border-emce-amber bg-emce-amber-soft p-3 text-sm text-emce-amber-deep">
        <strong>One review step:</strong> after submission, our placement team
        verifies your college affiliation within 2 business days. Your invite
        link + TPO dashboard unlock on approval — you&apos;ll get an email the
        moment it&apos;s live.
      </div>

      <form action={formAction} className="space-y-5" noValidate>
        <div aria-hidden="true" className="sr-only" style={{ position: "absolute", left: "-10000px" }}>
          <label>
            Website (leave blank)
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
        <input type="hidden" name="startedAt" value={startedAt} />
        <input type="hidden" name="driveSlug" value={driveSlug} />

        {/* ─── Section A: Identity + auth ──────────────────
            Signed-in users skip name/email/password (taken from
            session) but keep designation + phone (per-fair context). */}
        <fieldset className="space-y-3 rounded-lg border border-emce-border p-4">
          <legend className="px-2 text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
            1 · Your details
          </legend>
          {!signedInUser && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="tpo-name">Full name *</Label>
                <Input id="tpo-name" name="name" required autoComplete="name" aria-invalid={!!state.fieldErrors?.name} autoFocus />
                <FieldError error={state.fieldErrors?.name} />
              </div>
              <div>
                <Label htmlFor="tpo-email">Professional email *</Label>
                <Input id="tpo-email" name="email" type="email" required autoComplete="email" aria-invalid={!!state.fieldErrors?.email} />
                <p className="mt-1 text-hint text-emce-text-muted">College-domain emails (yourname@college.edu) approve fastest.</p>
                <FieldError error={state.fieldErrors?.email} />
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tpo-designation">Designation *</Label>
              <Input id="tpo-designation" name="designation" required placeholder="TPO Coordinator, Director of Placement, …" aria-invalid={!!state.fieldErrors?.designation} autoFocus={!!signedInUser} />
              <FieldError error={state.fieldErrors?.designation} />
            </div>
            <div>
              <Label htmlFor="tpo-phone">Phone *</Label>
              <Input id="tpo-phone" name="contactPhone" type="tel" required autoComplete="tel" aria-invalid={!!state.fieldErrors?.contactPhone} />
              <FieldError error={state.fieldErrors?.contactPhone} />
            </div>
          </div>
          {!signedInUser && (
            <div>
              <Label htmlFor="tpo-password">Password *</Label>
              <Input id="tpo-password" name="password" type="password" required minLength={8} autoComplete="new-password" aria-invalid={!!state.fieldErrors?.password} />
              {state.fieldErrors?.password ? (
                <FieldError error={state.fieldErrors.password} />
              ) : (
                <p className="mt-1 text-hint text-emce-text-muted">Minimum 8 characters.</p>
              )}
            </div>
          )}
        </fieldset>

        {/* ─── Section B: College ─────────────────────────── */}
        <fieldset className="space-y-3 rounded-lg border border-emce-border p-4">
          <legend className="px-2 text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
            2 · Your college / institute
          </legend>
          <div>
            <Label htmlFor="tpo-college">College name *</Label>
            <EntityAutocomplete<InstitutionMatch>
              nameField="collegeName"
              idField="institutionId"
              placeholder="BMS College of Engineering"
              required
              ariaInvalid={!!state.fieldErrors?.collegeName}
              onSearch={searchInstitutions}
              onPick={(m) => {
                // Auto-fill city when present on the picked institution.
                setCityValue(m.city ?? "");
              }}
              onUnpick={() => setCityValue(undefined)}
            />
            <p className="mt-1 text-hint text-emce-text-muted">Type the full name. If we don&apos;t have your college in our database yet, we&apos;ll add it.</p>
            <FieldError error={state.fieldErrors?.collegeName} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tpo-city">City</Label>
              {cityValue !== undefined ? (
                <Input
                  id="tpo-city"
                  name="city"
                  placeholder="Bengaluru"
                  maxLength={80}
                  value={cityValue}
                  onChange={(e) => setCityValue(e.target.value)}
                />
              ) : (
                <Input id="tpo-city" name="city" placeholder="Bengaluru" maxLength={80} />
              )}
            </div>
            <div>
              <Label htmlFor="tpo-state">State</Label>
              <Input id="tpo-state" name="state" placeholder="Karnataka" maxLength={80} />
            </div>
          </div>
          <div>
            <Label htmlFor="tpo-count">Estimated cohort size you&apos;d invite</Label>
            <Input id="tpo-count" name="studentCount" type="number" min={0} max={50000} placeholder="120" />
            <p className="mt-1 text-hint text-emce-text-muted">Rough number of students across final-year + pre-final-year. Helps our team prepare booth capacity.</p>
          </div>
          <div>
            <Label htmlFor="tpo-notes">Notes for the placement team (optional)</Label>
            <Textarea id="tpo-notes" name="notes" rows={3} placeholder="e.g. We have 60 EV / Mechatronics finalists targeting battery + BMS roles. Want to bring them to the Delhi edition." />
          </div>
        </fieldset>

        {!signedInUser && (
          <>
            <div className="rounded-md bg-emce-light-soft/60 p-3 text-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" name="acceptTerms" required className="mt-0.5 h-4 w-4 accent-emce-dark" />
                <span className="text-emce-text-sec">
                  I agree to the{" "}
                  <Link href="/terms" target="_blank" className="font-bold text-emce-dark hover:underline">Terms of Service</Link>
                  {" "}and{" "}
                  <Link href="/privacy" target="_blank" className="font-bold text-emce-dark hover:underline">Privacy Policy</Link>.
                </span>
              </label>
              <FieldError error={state.fieldErrors?.acceptTerms} />
            </div>

            {turnstileSiteKey && <TurnstileWidget siteKey={turnstileSiteKey} />}
          </>
        )}

        <SubmitButton className="w-full" size="lg" pendingLabel="Submitting your application…">
          Apply as Placement Officer
        </SubmitButton>

        {!signedInUser && (
          <p className="text-center text-sm text-emce-text-sec">
            Already have a TPO account?{" "}
            <Link href="/signin?next=/tpo" className="font-bold text-emce-dark hover:underline">
              Sign in
            </Link>
          </p>
        )}
      </form>
    </>
  );
}
