"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { FieldError } from "@/components/ui/field-error";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { magicLinkSignIn } from "@/server/auth/actions";
import { emptyFormState } from "@/lib/form-state";

interface Props {
  next?: string;
  emailLabel: string;
  buttonLabel: string;
  pendingLabel: string;
  turnstileSiteKey?: string | null;
}

export function MagicLinkForm({ next, emailLabel, buttonLabel, pendingLabel, turnstileSiteKey }: Props) {
  const [state, formAction] = useActionState(magicLinkSignIn, emptyFormState);

  // The server action always returns ok=true for both "sent" and "rate-
  // limited" cases — that prevents email-enumeration. Show the success
  // message either way.
  if (state.ok && state.message) {
    return (
      <div className="rounded-md bg-emce-light-soft p-4 text-sm text-emce-darkest">
        <p className="font-bold">📬 {state.message}</p>
        <p className="mt-1 text-emce-text-sec">The link expires in 24 hours and works only once.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3" noValidate>
      <input type="hidden" name="next" value={next ?? "/me"} />
      {/* Honeypot — see SignUpForm for rationale. */}
      <div aria-hidden="true" className="sr-only" style={{ position: "absolute", left: "-10000px" }}>
        <label>
          Website (leave blank)
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <div>
        <Label htmlFor="magic-email">{emailLabel}</Label>
        <Input
          id="magic-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={!!state.fieldErrors?.email}
          aria-describedby={state.fieldErrors?.email ? "magic-email-err" : undefined}
        />
        <FieldError id="magic-email-err" error={state.fieldErrors?.email} />
      </div>
      {state.message && !state.ok && (
        <div role="alert" className="rounded-md bg-emce-red-light p-2 text-sm text-emce-red-deep">
          {state.message}
        </div>
      )}
      {turnstileSiteKey && <TurnstileWidget siteKey={turnstileSiteKey} />}
      <SubmitButton variant="outline" className="w-full" pendingLabel={pendingLabel}>
        {buttonLabel}
      </SubmitButton>
    </form>
  );
}
