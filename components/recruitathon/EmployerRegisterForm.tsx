"use client";

/**
 * Recruitathon employer inline-signup form. Mirror of
 * CandidateRegisterForm with employer-specific fields.
 *
 * On submit creates User (role EMPLOYER) + Company shell (or
 * attaches to existing match by website / name) + EmployerProfile +
 * RecruitmentDriveCompany row. The user becomes company-admin only
 * when the company is freshly created — pre-existing companies route
 * through the admin claim queue for safety.
 */

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import {
  googleSignInWithNext,
  linkedinSignInWithNext,
} from "@/server/auth/actions";
import { registerEmployerInline } from "@/server/recruitathon/register-actions";
import { searchCompanies, type CompanyMatch } from "@/server/entities/actions";
import { EntityAutocomplete } from "@/components/recruitathon/EntityAutocomplete";
import { emptyFormState } from "@/lib/form-state";

export function EmployerRegisterForm({
  driveSlug,
  turnstileSiteKey,
  signedInUser,
}: {
  driveSlug: string;
  turnstileSiteKey: string | null;
  /**
   * When set, the auth fieldset + OAuth + ToS are hidden and the
   * server action attaches the registration to the existing user.
   * If the signed-in user already has an EmployerProfile, the
   * action uses that company; otherwise it find-or-creates a
   * Company + EmployerProfile from the form fields.
   */
  signedInUser: { name: string | null; email: string } | null;
}) {
  const [state, formAction] = useActionState(registerEmployerInline, emptyFormState);
  const [startedAt] = useState(() => Date.now());
  // Phase: typeahead-driven autofill. When the user picks an existing
  // company from the dropdown we auto-populate the website field from
  // the matched row. Storing in state (instead of resetting the input
  // imperatively) keeps React in control of the input's value — needed
  // because `Input` is uncontrolled by default and we'd otherwise have
  // to reach for refs. Empty default = "let the input behave as
  // uncontrolled" so we don't break the normal typing experience.
  const [websiteValue, setWebsiteValue] = useState<string | undefined>(undefined);
  const oauthNext = `/fairs/${driveSlug}/register?as=employer`;

  return (
    <>
      {state.message && !state.fieldErrors && (
        <div role="alert" className="mb-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
          {state.message}
        </div>
      )}

      {signedInUser ? (
        <div className="mb-5 rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm text-emce-text">
          <strong>Signed in as {signedInUser.name ?? signedInUser.email}.</strong>{" "}
          We&apos;ll attach this fair registration to your existing employer
          account (or create one for the company you list below).{" "}
          <Link href="/signout" className="font-bold text-emce-dark hover:underline">
            Not you?
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <form action={googleSignInWithNext}>
              <input type="hidden" name="next" value={oauthNext} />
              <Button type="submit" variant="outline" className="w-full">Continue with Google</Button>
            </form>
            <form action={linkedinSignInWithNext}>
              <input type="hidden" name="next" value={oauthNext} />
              <Button type="submit" variant="outline" className="w-full">Continue with LinkedIn</Button>
            </form>
          </div>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-emce-border" />
            <span className="text-xs text-emce-text-muted">or fill the form below</span>
            <span className="h-px flex-1 bg-emce-border" />
          </div>
        </>
      )}

      <form action={formAction} className="space-y-5" noValidate>
        <div aria-hidden="true" className="sr-only" style={{ position: "absolute", left: "-10000px" }}>
          <label>
            Website (leave blank)
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
        <input type="hidden" name="startedAt" value={startedAt} />
        <input type="hidden" name="driveSlug" value={driveSlug} />

        {/* ─── Section A: POC + auth ───────────────────────
            For signed-in users we drop name/email/password (taken
            from session) but KEEP designation + pocPhone since they
            are per-fair context, not account credentials. */}
        <fieldset className="space-y-3 rounded-lg border border-emce-border p-4">
          <legend className="px-2 text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
            1 · Point of contact{signedInUser ? "" : " + account"}
          </legend>
          {!signedInUser && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="emp-name">POC name *</Label>
                  <Input id="emp-name" name="name" required autoComplete="name" aria-invalid={!!state.fieldErrors?.name} autoFocus />
                  <FieldError error={state.fieldErrors?.name} />
                </div>
                <div>
                  <Label htmlFor="emp-email">Official email *</Label>
                  <Input id="emp-email" name="email" type="email" required autoComplete="email" aria-invalid={!!state.fieldErrors?.email} />
                  <FieldError error={state.fieldErrors?.email} />
                </div>
              </div>
            </>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="emp-designation">POC designation *</Label>
              <Input id="emp-designation" name="pocDesignation" required placeholder="Talent Acquisition Lead" aria-invalid={!!state.fieldErrors?.pocDesignation} autoFocus={!!signedInUser} />
              <FieldError error={state.fieldErrors?.pocDesignation} />
            </div>
            <div>
              <Label htmlFor="emp-phone">POC phone *</Label>
              <Input id="emp-phone" name="pocPhone" type="tel" required autoComplete="tel" aria-invalid={!!state.fieldErrors?.pocPhone} />
              <FieldError error={state.fieldErrors?.pocPhone} />
            </div>
          </div>
          {!signedInUser && (
            <div>
              <Label htmlFor="emp-password">Password *</Label>
              <Input id="emp-password" name="password" type="password" required minLength={8} autoComplete="new-password" aria-invalid={!!state.fieldErrors?.password} />
              {state.fieldErrors?.password ? (
                <FieldError error={state.fieldErrors.password} />
              ) : (
                <p className="mt-1 text-hint text-emce-text-muted">Minimum 8 characters.</p>
              )}
            </div>
          )}
        </fieldset>

        {/* ─── Section B: Company + hiring intent ────────── */}
        <fieldset className="space-y-3 rounded-lg border border-emce-border p-4">
          <legend className="px-2 text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
            2 · Company + hiring details
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="emp-company">Company name *</Label>
              {/* Typeahead — searches the Company directory. If the user
                  picks an existing row, the website field auto-fills
                  AND a hidden `companyId` posts so the server action
                  attaches to that specific row instead of dedupe-by-name.
                  If no match exists, the user keeps typing and the
                  server creates a fresh Company on submit. */}
              <EntityAutocomplete<CompanyMatch>
                nameField="companyName"
                idField="companyId"
                placeholder="Type your company name…"
                required
                ariaInvalid={!!state.fieldErrors?.companyName}
                onSearch={searchCompanies}
                onPick={(m) => {
                  // Auto-fill website. Empty string lands as "user clears
                  // it" rather than "no autofill" — equivalent in form-
                  // submission terms.
                  setWebsiteValue(m.website ?? "");
                }}
                onUnpick={() => {
                  // Returning to free-text mode — release the input
                  // back to uncontrolled so the user can edit naturally.
                  setWebsiteValue(undefined);
                }}
              />
              <FieldError error={state.fieldErrors?.companyName} />
            </div>
            <div>
              <Label htmlFor="emp-website">Company website</Label>
              {/* Controlled when a company was picked (so we can autofill);
                  uncontrolled otherwise so manual typing works normally.
                  React requires a value-and-onChange pair when controlled. */}
              {websiteValue !== undefined ? (
                <Input
                  id="emp-website"
                  name="companyWebsite"
                  type="url"
                  placeholder="https://example.com"
                  value={websiteValue}
                  onChange={(e) => setWebsiteValue(e.target.value)}
                  aria-invalid={!!state.fieldErrors?.companyWebsite}
                />
              ) : (
                <Input
                  id="emp-website"
                  name="companyWebsite"
                  type="url"
                  placeholder="https://example.com"
                  aria-invalid={!!state.fieldErrors?.companyWebsite}
                />
              )}
              <FieldError error={state.fieldErrors?.companyWebsite} />
            </div>
          </div>
          <div>
            <Label htmlFor="emp-industry">Industry / domain *</Label>
            <Input id="emp-industry" name="industry" required placeholder="EV OEM · Battery cells · Charging infra · …" aria-invalid={!!state.fieldErrors?.industry} />
            <FieldError error={state.fieldErrors?.industry} />
          </div>
          <div>
            <Label htmlFor="emp-products">Products / services *</Label>
            <Textarea id="emp-products" name="productsServices" rows={2} required placeholder="What do you build or sell?" aria-invalid={!!state.fieldErrors?.productsServices} />
            <FieldError error={state.fieldErrors?.productsServices} />
          </div>
          <div>
            <Label htmlFor="emp-locations">Hiring locations *</Label>
            <Input id="emp-locations" name="hiringLocations" required placeholder="Bengaluru, Pune, Chennai" aria-invalid={!!state.fieldErrors?.hiringLocations} />
            <FieldError error={state.fieldErrors?.hiringLocations} />
          </div>
          <div>
            <Label htmlFor="emp-roles">Open roles + number of openings *</Label>
            <Textarea id="emp-roles" name="openRoles" rows={3} required placeholder="e.g. Battery Cell Engineer × 5, BMS Firmware × 3, …" aria-invalid={!!state.fieldErrors?.openRoles} />
            <FieldError error={state.fieldErrors?.openRoles} />
          </div>
          <div>
            <Label htmlFor="emp-skills">Skills you&apos;re looking for *</Label>
            <Input id="emp-skills" name="desiredSkills" required placeholder="Embedded C, MATLAB, CAN bus, Li-ion chemistry, …" aria-invalid={!!state.fieldErrors?.desiredSkills} />
            <FieldError error={state.fieldErrors?.desiredSkills} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-bold text-emce-text">Do you hire freshers? *</p>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="hiresFreshers" value="yes" defaultChecked className="h-4 w-4 accent-emce-dark" />
                  Yes
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="hiresFreshers" value="no" className="h-4 w-4 accent-emce-dark" />
                  No
                </label>
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm font-bold text-emce-text">Provide training / onboarding? *</p>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="providesTraining" value="yes" defaultChecked className="h-4 w-4 accent-emce-dark" />
                  Yes
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="providesTraining" value="no" className="h-4 w-4 accent-emce-dark" />
                  No
                </label>
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="emp-growth">Growth opportunities for employees (optional)</Label>
            <Textarea id="emp-growth" name="growthOpportunities" rows={2} placeholder="e.g. Fast-track to Tech Lead in 2 yrs, international rotation, ESOP, …" />
          </div>
          <div>
            <Label htmlFor="emp-fair-mode">Fair mode participation *</Label>
            <NativeSelect id="emp-fair-mode" name="fairMode" required defaultValue="" aria-invalid={!!state.fieldErrors?.fairMode}>
              <option value="" disabled>Select…</option>
              <option value="OFFLINE">Offline (booth at venue)</option>
              <option value="ONLINE">Online (virtual booth)</option>
              <option value="HYBRID">Hybrid (both)</option>
            </NativeSelect>
            <FieldError error={state.fieldErrors?.fairMode} />
          </div>
        </fieldset>

        {/* ─── Section C: JD upload — deferred ──────────── */}
        <p className="rounded-md border border-dashed border-emce-border bg-emce-light-soft p-3 text-hint text-emce-text-sec">
          📎 You can upload detailed JDs + your hiring procedure from the company dashboard after this step.
        </p>

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

        <SubmitButton className="w-full" size="lg" pendingLabel={signedInUser ? "Registering your company for the fair…" : "Creating your company account…"}>
          {signedInUser ? "Register company for Recruitathon" : "Register your company for Recruitathon"}
        </SubmitButton>

        {!signedInUser && (
          <p className="text-center text-sm text-emce-text-sec">
            Already have an account?{" "}
            <Link href={`/signin?next=${encodeURIComponent(`/fairs/${driveSlug}/register?as=employer`)}`} className="font-bold text-emce-dark hover:underline">
              Sign in
            </Link>
          </p>
        )}
      </form>
    </>
  );
}
