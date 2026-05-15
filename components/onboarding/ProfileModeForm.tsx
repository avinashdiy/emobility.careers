"use client";

import { useActionState, useEffect, useState } from "react";
import { setProfileMode } from "@/server/candidates/actions";
import { emptyFormState, type FormState } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Mode = {
  value: string;
  title: string;
  description: string;
  emoji: string;
};

export function ProfileModeForm({
  modes,
  defaultValue,
}: {
  modes: readonly Mode[];
  defaultValue: string | null;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    setProfileMode,
    emptyFormState,
  );

  // The form auto-redirects on success, so we only ever see state when
  // something failed. Keep the error visible long enough to read.
  const [showErr, setShowErr] = useState(false);
  useEffect(() => {
    if (!state.ok && state.message) {
      setShowErr(true);
      const t = setTimeout(() => setShowErr(false), 6000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <form action={formAction} className="mt-6 space-y-3">
      {!state.ok && state.message && showErr && (
        <Alert variant="danger">{state.message}</Alert>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {modes.map((m) => (
          <label key={m.value} className="cursor-pointer">
            <input
              type="radio"
              name="profileMode"
              value={m.value}
              defaultChecked={(state.prevValues?.profileMode ?? defaultValue) === m.value}
              className="peer sr-only"
              required
            />
            <div className="flex h-full gap-3 rounded-lg border-2 border-emce-border bg-white p-4 transition peer-checked:border-emce-dark peer-checked:bg-emce-light-sog">
              <div className="text-3xl">{m.emoji}</div>
              <div>
                <div className="font-bold text-emce-text">{m.title}</div>
                <div className="text-hint text-emce-text-sec">{m.description}</div>
              </div>
            </div>
          </label>
        ))}
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" size="lg">
          Continue →
        </Button>
      </div>
    </form>
  );
}
