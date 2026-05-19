"use client";

/**
 * Recruitathon candidate inline-signup form.
 *
 * One screen, three sections (Auth → Recruitathon-essential →
 * optional). On submit the server action creates the User + the
 * CandidateProfile + the RecruitmentDriveRegistration atomically and
 * auto-signs the user in. Anti-spam (honeypot + Turnstile + timing)
 * mirrors the regular signup form so this is no easier to abuse.
 *
 * OAuth buttons route through googleSignInWithNext / linkedinSignInWithNext
 * with a `next` of /fairs/[slug]/register so a returning user comes
 * back to the same form post-auth — they then only need to fill the
 * Recruitathon-essential fields (the auth ones are already done).
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
import { registerCandidateInline } from "@/server/recruitathon/register-actions";
import { emptyFormState } from "@/lib/form-state";

export function CandidateRegisterForm({
  driveSlug,
  turnstileSiteKey,
  tpoToken,
  signedInUser,
}: {
  driveSlug: string;
  turnstileSiteKey: string | null;
  /**
   * Optional TPO invite-link token. Forwarded as a hidden field on
   * the form so the server action tags the resulting registration
   * with the TPO's CollegePlacementCell. Null when the visitor
   * arrived without a TPO link (most candidate self-registrations).
   */
  tpoToken: string | null;
  /**
   * When set, the form hides the auth fieldset + OAuth buttons + ToS
   * gate. The server action sees the session and creates only the
   * fair-specific records (no User / no re-signin). Fixes the OAuth
   * dead-end where a signed-in user couldn't complete inline-signup
   * because the action short-circuited on "email already exists".
   */
  signedInUser: { name: string | null; email: string } | null;
}) {
  const [state, formAction] = useActionState(registerCandidateInline, emptyFormState);
  const [startedAt] = useState(() => Date.now());
  // OAuth `next` must preserve the TPO referral across the auth hop
  // so a candidate who clicks "Continue with LinkedIn" still gets
  // credited to the TPO who shared the link.
  const oauthNext = `/fairs/${driveSlug}/register?as=candidate${tpoToken ? `&tpo=${encodeURIComponent(tpoToken)}` : ""}`;

  return (
    <>
      {state.message && !state.fieldErrors && (
        <div role="alert" className="mb-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
          {state.message}
        </div>
      )}

      {signedInUser ? (
        // Signed-in viewer — show identity banner instead of auth
        // fieldset. Sticky email + name avoid the user wondering "wait,
        // am I creating a new account?". The form action sees their
        // session server-side and creates only the fair registration.
        <div className="mb-5 rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm text-emce-text">
          <strong>Signed in as {signedInUser.name ?? signedInUser.email}.</strong>{" "}
          We&apos;ll register your existing account for this fair — no new
          account needed.{" "}
          <Link href="/api/auth/signout" className="font-bold text-emce-dark hover:underline">
            Not you?
          </Link>
        </div>
      ) : (
        <>
          {/* ─── OAuth fast path ─────────────────────────────────
              Pre-empts the long form for users with a LinkedIn /
              Google account. Post-auth they land back here and just
              fill the Recruitathon-essential fields (auth section is
              skippable). */}
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
        {/* Honeypot + timing — same shape as SignUpForm. */}
        <div aria-hidden="true" className="sr-only" style={{ position: "absolute", left: "-10000px" }}>
          <label>
            Website (leave blank)
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
        <input type="hidden" name="startedAt" value={startedAt} />
        <input type="hidden" name="driveSlug" value={driveSlug} />
        {tpoToken && <input type="hidden" name="tpoToken" value={tpoToken} />}

        {/* ─── Section A: Auth (signed-out only) ─────────── */}
        {!signedInUser && (
          <fieldset className="space-y-3 rounded-lg border border-emce-border p-4">
            <legend className="px-2 text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
              1 · Create your account
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="cand-name">Full name *</Label>
                <Input id="cand-name" name="name" required minLength={2} autoComplete="name" aria-invalid={!!state.fieldErrors?.name} autoFocus />
                <FieldError error={state.fieldErrors?.name} />
              </div>
              <div>
                <Label htmlFor="cand-email">Email *</Label>
                <Input id="cand-email" name="email" type="email" required autoComplete="email" aria-invalid={!!state.fieldErrors?.email} />
                <FieldError error={state.fieldErrors?.email} />
              </div>
            </div>
            <div>
              <Label htmlFor="cand-password">Password *</Label>
              <Input id="cand-password" name="password" type="password" required minLength={8} autoComplete="new-password" aria-invalid={!!state.fieldErrors?.password} />
              {state.fieldErrors?.password ? (
                <FieldError error={state.fieldErrors.password} />
              ) : (
                <p className="mt-1 text-hint text-emce-text-muted">Minimum 8 characters.</p>
              )}
            </div>
          </fieldset>
        )}

        {/* ─── Section B: Recruitathon-essential ──────────── */}
        <fieldset className="space-y-3 rounded-lg border border-emce-border p-4">
          <legend className="px-2 text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
            2 · Recruitathon details
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cand-phone">Contact number *</Label>
              <Input id="cand-phone" name="phone" type="tel" required autoComplete="tel" aria-invalid={!!state.fieldErrors?.phone} />
              <FieldError error={state.fieldErrors?.phone} />
            </div>
            <div>
              <Label htmlFor="cand-college">College / institute *</Label>
              <Input id="cand-college" name="college" required aria-invalid={!!state.fieldErrors?.college} />
              <FieldError error={state.fieldErrors?.college} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cand-course">Course + specialization *</Label>
              <Input id="cand-course" name="course" required placeholder="B.Tech ECE, M.Tech Power Electronics, …" aria-invalid={!!state.fieldErrors?.course} />
              <FieldError error={state.fieldErrors?.course} />
            </div>
            <div>
              <Label htmlFor="cand-year">Year of study *</Label>
              <NativeSelect id="cand-year" name="yearOfStudy" required defaultValue="" aria-invalid={!!state.fieldErrors?.yearOfStudy}>
                <option value="" disabled>Select…</option>
                <option value="1">1st year</option>
                <option value="2">2nd year</option>
                <option value="3">3rd year</option>
                <option value="4">4th year (final)</option>
                <option value="5">5th year / postgrad</option>
                <option value="FRESHER">Graduated — fresher</option>
                <option value="EXPERIENCED">Working professional</option>
              </NativeSelect>
              <FieldError error={state.fieldErrors?.yearOfStudy} />
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-bold text-emce-text">Are you a fresher or experienced? *</p>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="experienceLevel" value="FRESHER" defaultChecked className="h-4 w-4 accent-emce-dark" />
                Fresher
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="experienceLevel" value="EXPERIENCED" className="h-4 w-4 accent-emce-dark" />
                Experienced
              </label>
            </div>
            <FieldError error={state.fieldErrors?.experienceLevel} />
          </div>
          <div>
            <Label htmlFor="cand-roles">Roles you&apos;re interested in *</Label>
            <Input id="cand-roles" name="intendedRoles" required placeholder="Battery Engineer, BMS Firmware, Vehicle Integration" aria-invalid={!!state.fieldErrors?.intendedRoles} />
            <FieldError error={state.fieldErrors?.intendedRoles} />
          </div>
          <div>
            <Label htmlFor="cand-locations">Cities you&apos;re willing to work in *</Label>
            <Input id="cand-locations" name="willingLocations" required placeholder="Bengaluru, Pune, Chennai, Remote" aria-invalid={!!state.fieldErrors?.willingLocations} />
            <FieldError error={state.fieldErrors?.willingLocations} />
          </div>
          <div>
            <Label htmlFor="cand-skills">Technical skills *</Label>
            <Input id="cand-skills" name="technicalSkills" required placeholder="Python, MATLAB, Embedded C, CAN bus, ANSYS, …" aria-invalid={!!state.fieldErrors?.technicalSkills} />
            <p className="mt-1 text-hint text-emce-text-muted">Comma-separated. We&apos;ll seed your profile with these.</p>
            <FieldError error={state.fieldErrors?.technicalSkills} />
          </div>
          <div>
            <Label htmlFor="cand-internships">Internships / projects (optional)</Label>
            <Textarea id="cand-internships" name="internshipSummary" rows={3} placeholder="e.g. Built a BLDC motor controller; 3-month internship at Ola Electric, …" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-bold text-emce-text">EV / automotive experience?</p>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="hasEvExperience" value="yes" className="h-4 w-4 accent-emce-dark" />
                  Yes
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="hasEvExperience" value="no" defaultChecked className="h-4 w-4 accent-emce-dark" />
                  No
                </label>
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm font-bold text-emce-text">DIYguru student? *</p>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="isDIYguruStudent" value="yes" className="h-4 w-4 accent-emce-dark" />
                  Yes
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="isDIYguruStudent" value="no" defaultChecked className="h-4 w-4 accent-emce-dark" />
                  No
                </label>
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="cand-fair-mode">Fair mode availability *</Label>
            <NativeSelect id="cand-fair-mode" name="fairMode" required defaultValue="" aria-invalid={!!state.fieldErrors?.fairMode}>
              <option value="" disabled>Select…</option>
              <option value="OFFLINE">Offline (in-person at venue)</option>
              <option value="ONLINE">Online (virtual fair)</option>
              <option value="HYBRID">Hybrid (either works)</option>
            </NativeSelect>
            <FieldError error={state.fieldErrors?.fairMode} />
          </div>
          <div>
            <Label htmlFor="cand-linkedin">LinkedIn profile (optional)</Label>
            <Input id="cand-linkedin" name="linkedinUrl" type="url" placeholder="https://www.linkedin.com/in/your-handle" aria-invalid={!!state.fieldErrors?.linkedinUrl} />
            <FieldError error={state.fieldErrors?.linkedinUrl} />
          </div>
        </fieldset>

        {/* ─── Section C: Optional uploads (deferred) ──────
            Resume upload happens on the welcome screen — it
            needs a presigned MinIO URL which requires the user to
            be signed in, and we don't have a session here yet.
            The welcome screen prompts immediately after this form
            submits, so the timing is the same to the user. */}
        <p className="rounded-md border border-dashed border-emce-border bg-emce-light-soft p-3 text-hint text-emce-text-sec">
          📄 We&apos;ll prompt you to upload your résumé in the next step (after you create your account).
        </p>

        {/* ToS + Turnstile — signed-out only. Signed-in users have
            already accepted ToS at their original signup; re-prompting
            here would be friction with no value. */}
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

        <SubmitButton className="w-full" size="lg" pendingLabel={signedInUser ? "Registering you for the fair…" : "Creating your account…"}>
          {signedInUser ? "Register me for Recruitathon" : "Register for Recruitathon"}
        </SubmitButton>

        {!signedInUser && (
          <p className="text-center text-sm text-emce-text-sec">
            Already have an emobility.careers account?{" "}
            <Link href={`/signin?next=${encodeURIComponent(`/fairs/${driveSlug}/register?as=candidate${tpoToken ? `&tpo=${encodeURIComponent(tpoToken)}` : ""}`)}`} className="font-bold text-emce-dark hover:underline">
              Sign in
            </Link>
          </p>
        )}
      </form>
    </>
  );
}
