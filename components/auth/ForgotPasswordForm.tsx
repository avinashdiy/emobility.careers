"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { FieldError } from "@/components/ui/field-error";
import { requestPasswordReset } from "@/server/auth/actions";
import { emptyFormState } from "@/lib/form-state";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, emptyFormState);

  if (state.ok) {
    return (
      <div className="space-y-3">
        <div className="rounded-md bg-emce-light-soft p-3 text-sm text-emce-dark">
          {state.message}
        </div>
        <p className="text-hint text-emce-text-sec">
          The link is good for 1 hour.{" "}
          <Link href="/signin" className="font-bold text-emce-dark hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {state.message && !state.fieldErrors && (
        <div role="alert" className="rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
          {state.message}
        </div>
      )}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          aria-invalid={!!state.fieldErrors?.email}
        />
        <FieldError error={state.fieldErrors?.email} />
      </div>
      <SubmitButton className="w-full" size="lg" pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
      <p className="text-center text-sm text-emce-text-sec">
        Remembered it?{" "}
        <Link href="/signin" className="font-bold text-emce-dark hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
