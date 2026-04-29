"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { signinAction, googleSignInWithNext, linkedinSignInWithNext } from "@/server/auth/actions";
import { emptyFormState } from "@/lib/form-state";

interface Labels {
  email: string;
  password: string;
  forgot: string;
  button: string;
  pending: string;
  continueWith: string;
  newHere: string;
  createAccount: string;
}

const DEFAULT_LABELS: Labels = {
  email: "Email",
  password: "Password",
  forgot: "Forgot?",
  button: "Sign in",
  pending: "Signing in…",
  continueWith: "or continue with",
  newHere: "New here?",
  createAccount: "Create an account",
};

export function SignInForm({ next, labels }: { next?: string; labels?: Labels }) {
  const L = labels ?? DEFAULT_LABELS;
  const [state, formAction] = useActionState(signinAction, emptyFormState);

  return (
    <>
      {state.message && !state.fieldErrors && (
        <div role="alert" className="mb-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
          {state.message}
        </div>
      )}

      <form action={formAction} className="space-y-3" noValidate>
        <input type="hidden" name="next" value={next ?? "/me"} />
        <div>
          <Label htmlFor="email">{L.email}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            aria-invalid={!!state.fieldErrors?.email}
            aria-describedby={state.fieldErrors?.email ? "email-err" : undefined}
            autoFocus
          />
          <FieldError id="email-err" error={state.fieldErrors?.email} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{L.password}</Label>
            <Link
              href="/forgot-password"
              className="mb-1 text-hint font-bold text-emce-dark hover:underline"
            >
              {L.forgot}
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            aria-invalid={!!state.fieldErrors?.password}
            aria-describedby={state.fieldErrors?.password ? "password-err" : undefined}
          />
          <FieldError id="password-err" error={state.fieldErrors?.password} />
        </div>
        <SubmitButton className="w-full" size="lg" pendingLabel={L.pending}>
          {L.button}
        </SubmitButton>
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-emce-border" />
        <span className="text-xs text-emce-text-muted">{L.continueWith}</span>
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
        {L.newHere}{" "}
        <Link href="/signup" className="font-bold text-emce-dark hover:underline">
          {L.createAccount}
        </Link>
      </p>
    </>
  );
}
