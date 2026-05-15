"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { sendClaimEmailsToAll, sendClaimEmailToOne } from "@/server/admin/import-actions";
import { emptyFormState } from "@/lib/form-state";

export function SendAllClaimEmailsForm({ pendingCount }: { pendingCount: number }) {
  const [state, formAction] = useActionState(sendClaimEmailsToAll, emptyFormState);
  const disabled = pendingCount === 0;
  return (
    <form action={formAction}>
      {state.message && (
        <div role="alert" className={`mb-3 rounded-md p-3 text-sm ${state.ok ? "bg-emce-light-soft text-emce-darkest" : "bg-emce-red-light text-emce-red-deep"}`}>
          {state.message}
        </div>
      )}
      <Button
        type="submit"
        variant={disabled ? "outline" : "accent"}
        disabled={disabled}
        onClick={(e) => {
          if (!confirm(`Send a sign-in link to ${pendingCount} imported user${pendingCount === 1 ? "" : "s"}? This is irreversible — emails go out immediately.`)) {
            e.preventDefault();
          }
        }}
      >
        {disabled ? "All claimed" : `Send ${pendingCount} claim email${pendingCount === 1 ? "" : "s"}`}
      </Button>
    </form>
  );
}

export function ResendClaimForm({ userId, email }: { userId: string; email: string }) {
  const [state, formAction] = useActionState(sendClaimEmailToOne, emptyFormState);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" size="sm" variant="ghost">Resend link</Button>
      {state.message && (
        <span className={`text-xs ${state.ok ? "text-emce-mid" : "text-emce-red-deep"}`}>{state.message}</span>
      )}
      <span className="sr-only">to {email}</span>
    </form>
  );
}
