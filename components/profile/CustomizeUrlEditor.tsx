"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import {
  checkUsernameAvailability,
  updateCandidateUsername,
} from "@/server/candidates/actions";
import { normalizeSlug } from "@/lib/reserved-slugs";

interface Props {
  currentSlug: string;
  domain: string; // e.g. "emobility.careers"
}

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok"; current: boolean }
  | { kind: "error"; message: string };

const REASON_TEXT: Record<string, string> = {
  "too-short": "At least 3 characters.",
  "too-long": "40 characters or fewer.",
  "format": "Lowercase letters, numbers, and hyphens only. Must start/end with a letter or number.",
  "reserved": "Sorry, that name is reserved.",
  "taken": "Already taken — try another.",
};

export function CustomizeUrlEditor({ currentSlug, domain }: Props) {
  const [value, setValue] = useState(currentSlug);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const normalized = normalizeSlug(value);

  useEffect(() => {
    if (!normalized) {
      setStatus({ kind: "idle" });
      return;
    }
    if (normalized === currentSlug) {
      setStatus({ kind: "ok", current: true });
      return;
    }
    setStatus({ kind: "checking" });
    const handle = setTimeout(async () => {
      try {
        const r = await checkUsernameAvailability(normalized);
        if (r.ok) {
          setStatus({ kind: "ok", current: r.current ?? false });
        } else {
          setStatus({
            kind: "error",
            message: REASON_TEXT[r.reason ?? "format"] ?? "Not available.",
          });
        }
      } catch {
        setStatus({ kind: "error", message: "Couldn't check availability." });
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [normalized, currentSlug]);

  const showNormalized = normalized && normalized !== value.toLowerCase();
  const okToSave =
    status.kind === "ok" && !status.current && normalized.length >= 3;

  return (
    <Card>
      <h2 className="text-section text-emce-text">Customize your URL</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        Your public profile lives at a vanity URL like LinkedIn. Pick something
        memorable — you can change it later, but the old URL will stop working.
      </p>

      <div className="mb-3 rounded-md bg-emce-light-soft p-3 text-sm">
        <span className="text-emce-text-sec">Current:</span>{" "}
        <strong className="break-all text-emce-text">
          {domain}/{currentSlug}
        </strong>
      </div>

      <form action={updateCandidateUsername} className="space-y-2" noValidate>
        <Label htmlFor="username">New username</Label>
        <div className="flex flex-wrap items-stretch gap-2">
          <span className="inline-flex items-center rounded-md bg-emce-light-soft px-3 text-hint font-bold text-emce-text-sec">
            {domain}/
          </span>
          <Input
            id="username"
            name="username"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            minLength={3}
            maxLength={40}
            pattern="[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?"
            autoComplete="off"
            required
            className="flex-1"
          />
          <SubmitButton size="default" disabled={!okToSave} pendingLabel="Saving…">
            Save URL
          </SubmitButton>
        </div>

        <div className="text-hint" role="status" aria-live="polite">
          {showNormalized && (
            <p className="text-emce-text-muted">
              Will be saved as <code>{normalized}</code>.
            </p>
          )}
          {status.kind === "checking" && <p className="text-emce-text-muted">Checking…</p>}
          {status.kind === "ok" && status.current && (
            <p className="text-emce-text-muted">This is your current URL.</p>
          )}
          {status.kind === "ok" && !status.current && (
            <p className="font-bold text-[#1e5a32]">
              ✓ <code>{domain}/{normalized}</code> is available
            </p>
          )}
          {status.kind === "error" && (
            <p className="font-bold text-emce-red-deep">⚠ {status.message}</p>
          )}
        </div>

        <p className="pt-2 text-hint text-emce-text-muted">
          Tip: a URL like <code>{domain}/firstname-lastname</code> is the easiest
          for recruiters to remember.
        </p>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant="default">3–40 characters</Badge>
        <Badge variant="default">a–z, 0–9, hyphens</Badge>
        <Badge variant="default">no reserved words</Badge>
      </div>
    </Card>
  );
}
