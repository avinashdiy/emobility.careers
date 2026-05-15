"use client";

import { useActionState, useEffect, useState } from "react";
import { createCadence } from "@/server/outreach/actions";
import { emptyFormState, type FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";

/**
 * #21 Cadence builder — recruiter writes a 1-7 step sequence inline.
 * The "Add another step" button appends a row; "Remove" deletes one.
 * On submit we JSON-encode the steps into a hidden field that the
 * createCadence action validates server-side.
 */

interface JobOption {
  id: string;
  title: string;
  status: string;
}

interface StepDraft {
  id: string;
  delayDays: number;
  subject: string;
  body: string;
  channels: string;
}

const DEFAULT_STEPS: StepDraft[] = [
  {
    id: "s0",
    delayDays: 0,
    subject: "First touch",
    body:
      "Hi {{candidateFirstName}}, I came across your profile while shortlisting for the {{jobTitle}} role at {{companyName}}. Would you be open to a 15-minute chat next week?",
    channels: "IN_APP,EMAIL",
  },
  {
    id: "s1",
    delayDays: 4,
    subject: "Following up",
    body:
      "Hi {{candidateFirstName}}, just bumping this up — let me know if a quick call this week works. Happy to share more about the team + the work.",
    channels: "IN_APP,EMAIL",
  },
  {
    id: "s2",
    delayDays: 10,
    subject: "Last ping",
    body:
      "Hi {{candidateFirstName}}, final note from my side — if the timing's wrong, totally understood. Hit reply if anything changes.",
    channels: "IN_APP,EMAIL",
  },
];

export function CadenceBuilder({ jobs }: { jobs: JobOption[] }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    createCadence,
    emptyFormState,
  );
  const [steps, setSteps] = useState<StepDraft[]>(DEFAULT_STEPS);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (state.ok && state.message) {
      setShowSaved(true);
      const t = setTimeout(() => setShowSaved(false), 4000);
      return () => clearTimeout(t);
    }
  }, [state]);

  function updateStep(i: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addStep() {
    if (steps.length >= 7) return;
    const lastDelay = steps[steps.length - 1]?.delayDays ?? 0;
    setSteps((prev) => [
      ...prev,
      {
        id: `s${Date.now()}`,
        delayDays: lastDelay + 4,
        subject: "",
        body: "",
        channels: "IN_APP,EMAIL",
      },
    ]);
  }

  // Steps JSON for the hidden input — re-computed on every render
  // so the form submit always carries the latest editor state.
  const stepsJson = JSON.stringify(
    steps.map((s) => ({
      delayDays: Number(s.delayDays) || 0,
      subject: s.subject || undefined,
      body: s.body,
      channels: s.channels,
    })),
  );

  return (
    <>
      {state.ok && showSaved && state.message && (
        <Alert variant="success" className="mb-3">
          ✓ {state.message}
        </Alert>
      )}
      {!state.ok && state.message && (
        <Alert variant="danger" className="mb-3">
          {state.message}
        </Alert>
      )}
      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="stepsJson" value={stepsJson} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="label" required>
              Cadence name
            </Label>
            <Input
              id="label"
              name="label"
              required
              maxLength={120}
              placeholder="3-touch senior engineer cadence"
            />
          </div>
          <div>
            <Label htmlFor="jobId" optional>
              Scope
            </Label>
            <NativeSelect id="jobId" name="jobId" defaultValue="">
              <option value="">Company-wide (all jobs)</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} · {j.status}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <fieldset className="rounded-md border border-emce-border p-4">
          <legend className="px-2 text-hint font-bold uppercase tracking-wide text-emce-mid-muted">
            Sequence
          </legend>

          <ul className="space-y-4">
            {steps.map((s, i) => (
              <li key={s.id} className="rounded-md border border-emce-border bg-emce-light-soft/40 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-section text-emce-text">Step {i + 1}</p>
                  {steps.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeStep(i)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor={`delay-${i}`}>Days from enrollment</Label>
                    <Input
                      id={`delay-${i}`}
                      type="number"
                      min={0}
                      max={60}
                      value={s.delayDays}
                      onChange={(e) => updateStep(i, { delayDays: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor={`subject-${i}`}>Subject (optional)</Label>
                    <Input
                      id={`subject-${i}`}
                      maxLength={220}
                      value={s.subject}
                      onChange={(e) => updateStep(i, { subject: e.target.value })}
                      placeholder="Following up · About the {{jobTitle}} role · etc."
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Label htmlFor={`body-${i}`} required>
                      Body
                    </Label>
                    <Textarea
                      id={`body-${i}`}
                      rows={4}
                      required
                      minLength={20}
                      maxLength={2000}
                      value={s.body}
                      onChange={(e) => updateStep(i, { body: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Label htmlFor={`channels-${i}`}>Channels (comma)</Label>
                    <Input
                      id={`channels-${i}`}
                      maxLength={120}
                      value={s.channels}
                      onChange={(e) => updateStep(i, { channels: e.target.value })}
                      placeholder="IN_APP,EMAIL"
                    />
                    <p className="mt-1 text-hint text-emce-text-muted">
                      Valid: IN_APP, EMAIL, SMS, WHATSAPP, PUSH. Unknown values silently dropped.
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {steps.length < 7 && (
            <div className="mt-3">
              <Button type="button" variant="outline" size="sm" onClick={addStep}>
                + Add another step
              </Button>
            </div>
          )}
        </fieldset>

        <div className="flex justify-end">
          <SubmitButton variant="glow" pendingLabel="Saving…">
            ⚡ Create cadence
          </SubmitButton>
        </div>
      </form>
    </>
  );
}
