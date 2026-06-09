"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { reportConnectionIssue } from "@/server/recruitment-drives/registrations";

/**
 * Candidate-facing SOS button on the fair pass for ONLINE / HYBRID
 * candidates. Click → small inline panel with a free-text "what's
 * wrong" textarea (optional) + Send / Cancel. Server action files a
 * `FairConnectionIssue` row in OPEN state + pages the fair admin.
 *
 * Renders in three states: idle (just the button), composing (panel
 * open with text input), and reported (success confirmation). The
 * "reported" state stays put — we don't auto-close because the
 * candidate needs to SEE that the report went through (network
 * uncertainty is exactly what they're reporting).
 */
type State =
  | { kind: "idle" }
  | { kind: "composing" }
  | { kind: "reported" };

export function ConnectionIssueButton({
  driveSlug,
  slotId,
}: {
  driveSlug: string;
  slotId?: string;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await reportConnectionIssue({
        driveSlug,
        slotId,
        message: message.trim() || undefined,
      });
      if (res.ok) {
        setState({ kind: "reported" });
        setMessage("");
      } else {
        setError(res.error ?? "Couldn't file the report — try once more.");
      }
    });
  }

  if (state.kind === "reported") {
    return (
      <div className="rounded-md border border-emce-mid/40 bg-emce-light-soft/40 p-3">
        <p className="text-sm font-bold text-emce-text">
          ✓ Reported — we&apos;re on it
        </p>
        <p className="mt-1 text-hint text-emce-text-sec">
          The fair admin has been pinged on WhatsApp + in-app. They
          may call you on your registered phone within a few minutes.
          If it&apos;s urgent and you don&apos;t hear back, message
          them directly from the fair page.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setState({ kind: "idle" })}
          className="mt-2"
        >
          File another →
        </Button>
      </div>
    );
  }

  if (state.kind === "composing") {
    return (
      <div className="rounded-md border-2 border-emce-red bg-emce-red-light/40 p-3">
        <p className="text-sm font-bold text-emce-text">
          ⚠ Report a connection issue
        </p>
        <p className="mt-1 text-hint text-emce-text-sec">
          One line about what&apos;s wrong (optional but helpful).
          We&apos;ll page the fair admin so they can call you back.
        </p>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder='e.g. "Video frozen, they can&apos;t hear me"'
          className="mt-2"
          disabled={pending}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button onClick={submit} disabled={pending} size="sm">
            {pending ? "Sending…" : "Send report →"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setState({ kind: "idle" });
              setError(null);
              setMessage("");
            }}
            disabled={pending}
          >
            Cancel
          </Button>
          {error && (
            <p className="text-hint text-emce-red-deep" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setState({ kind: "composing" })}
      className="border-emce-red text-emce-red-deep hover:bg-emce-red-light"
    >
      ⚠ Report a connection issue
    </Button>
  );
}
