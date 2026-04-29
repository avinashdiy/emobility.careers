"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { FieldError } from "@/components/ui/field-error";
import { resetPassword } from "@/server/auth/actions";
import { emptyFormState } from "@/lib/form-state";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPassword, emptyFormState);

  return (
    <form action={formAction} className="space-y-3" noValidate>
      <input type="hidden" name="token" value={token} />
      {state.message && !state.fieldErrors && (
        <div role="alert" className="rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
          {state.message}
        </div>
      )}
      <div>
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          autoFocus
          aria-invalid={!!state.fieldErrors?.password}
        />
        <FieldError error={state.fieldErrors?.password} />
        <p className="mt-1 text-hint text-emce-text-muted">Minimum 8 characters.</p>
      </div>
      <SubmitButton className="w-full" size="lg" pendingLabel="Updating…">
        Update password &amp; sign in
      </SubmitButton>
    </form>
  );
}
