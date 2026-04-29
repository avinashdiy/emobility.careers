"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { signupAction, googleSignInWithNext, linkedinSignInWithNext } from "@/server/auth/actions";
import { emptyFormState } from "@/lib/form-state";

export function SignUpForm({
  defaultRole,
  next,
  turnstileSiteKey,
}: {
  defaultRole: "CANDIDATE" | "EMPLOYER";
  next?: string;
  turnstileSiteKey: string | null;
}) {
  const [state, formAction] = useActionState(signupAction, emptyFormState);
  // `startedAt` captures the moment the form is rendered. The server
  // rejects submissions where (Date.now() - startedAt) < 1.2s — a humane
  // floor that bots routinely undershoot. Using useState (not useMemo)
  // means it stays stable across re-renders.
  const [startedAt] = useState(() => Date.now());

  return (
    <>
      {state.message && !state.fieldErrors && (
        <div role="alert" className="mb-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
          {state.message}
        </div>
      )}

      <form action={formAction} className="space-y-3" noValidate>
        {/* Honeypot — invisible to humans (sr-only + tabIndex=-1 + autoComplete off).
            Bots that auto-fill every input set this; the server silently rejects. */}
        <div aria-hidden="true" className="sr-only" style={{ position: "absolute", left: "-10000px" }}>
          <label>
            Website (leave blank)
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
        <input type="hidden" name="startedAt" value={startedAt} />

        <div className="grid grid-cols-2 gap-2 rounded-md bg-emce-light-soft p-1">
          <label className="cursor-pointer">
            <input
              type="radio"
              name="role"
              value="CANDIDATE"
              defaultChecked={defaultRole === "CANDIDATE"}
              className="peer sr-only"
            />
            <div className="rounded p-2 text-center text-sm font-bold text-emce-text-sec peer-checked:bg-emce-dark peer-checked:text-emce-light">
              I&apos;m a candidate
            </div>
          </label>
          <label className="cursor-pointer">
            <input
              type="radio"
              name="role"
              value="EMPLOYER"
              defaultChecked={defaultRole === "EMPLOYER"}
              className="peer sr-only"
            />
            <div className="rounded p-2 text-center text-sm font-bold text-emce-text-sec peer-checked:bg-emce-dark peer-checked:text-emce-light">
              I&apos;m hiring
            </div>
          </label>
        </div>
        <FieldError error={state.fieldErrors?.role} />

        <div>
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            name="name"
            required
            minLength={2}
            autoComplete="name"
            aria-invalid={!!state.fieldErrors?.name}
            aria-describedby={state.fieldErrors?.name ? "name-err" : undefined}
            autoFocus
          />
          <FieldError id="name-err" error={state.fieldErrors?.name} />
        </div>
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            aria-invalid={!!state.fieldErrors?.email}
            aria-describedby={state.fieldErrors?.email ? "email-err" : undefined}
          />
          <FieldError id="email-err" error={state.fieldErrors?.email} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            aria-invalid={!!state.fieldErrors?.password}
            aria-describedby={state.fieldErrors?.password ? "password-err" : "password-hint"}
          />
          {state.fieldErrors?.password ? (
            <FieldError id="password-err" error={state.fieldErrors.password} />
          ) : (
            <p id="password-hint" className="mt-1 text-hint text-emce-text-muted">Minimum 8 characters.</p>
          )}
        </div>

        {/* ToS — required server-side. Submitting unchecked rejects with
            field error from the schema. Wording references the same Terms
            link footers use. */}
        <div className="rounded-md bg-emce-light-soft/60 p-3 text-sm">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="acceptTerms"
              required
              className="mt-0.5 h-4 w-4 accent-emce-dark"
            />
            <span className="text-emce-text-sec">
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="font-bold text-emce-dark hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="font-bold text-emce-dark hover:underline">
                Privacy Policy
              </Link>.
            </span>
          </label>
          <FieldError error={state.fieldErrors?.acceptTerms} />
        </div>

        {turnstileSiteKey && <TurnstileWidget siteKey={turnstileSiteKey} />}

        <SubmitButton className="w-full" size="lg" pendingLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-emce-border" />
        <span className="text-xs text-emce-text-muted">or continue with</span>
        <span className="h-px flex-1 bg-emce-border" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <form action={googleSignInWithNext}>
          <input type="hidden" name="next" value={next ?? "/me"} />
          <Button type="submit" variant="outline" className="w-full">Google</Button>
        </form>
        <form action={linkedinSignInWithNext}>
          <input type="hidden" name="next" value={next ?? "/me"} />
          <Button type="submit" variant="outline" className="w-full">LinkedIn</Button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-emce-text-sec">
        Already have an account?{" "}
        <Link href="/signin" className="font-bold text-emce-dark hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
