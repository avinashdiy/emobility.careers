"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  MAX_QUESTIONS_PER_JOB,
  MAX_PROMPT_LENGTH,
  type ApplicationQuestion,
} from "@/server/jobs/application-questions";

/**
 * #2 Structured application narrative — recruiter editor.
 *
 * Drops into the new/edit job form. Maintains a local array of
 * questions; serialises to JSON in a hidden `<input
 * name="applicationQuestionsJson">` so the existing form-action
 * pipeline sees it as a normal field with no special handling
 * needed server-side beyond a JSON.parse + normalise (already wired
 * in server/employer/actions.ts).
 *
 * UX choices that came out of the design-thinking discussion:
 *   • 3-question cap — past that, candidates skim; recruiters spend
 *     more time reading than triaging.
 *   • Short prompts (≤220 chars) — long prompts read as bureaucracy.
 *   • Required toggle per question — usually optional, but the role-
 *     critical "what stack do you know" question deserves to gate.
 *   • Empty state with example prompts — most recruiters don't know
 *     what good questions look like; we seed them.
 */
export function ApplicationQuestionsEditor({
  defaultValue = [],
}: {
  defaultValue?: ApplicationQuestion[];
}) {
  const [questions, setQuestions] = useState<ApplicationQuestion[]>(defaultValue);
  const inputId = useId();

  function addQuestion() {
    if (questions.length >= MAX_QUESTIONS_PER_JOB) return;
    setQuestions((prev) => [
      ...prev,
      { id: `q-${mintHex()}`, prompt: "", required: false },
    ]);
  }

  function updateQuestion(idx: number, patch: Partial<ApplicationQuestion>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    );
  }

  function removeQuestion(idx: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  }

  // Drop empty-prompt questions before serialising — they'd fail the
  // server-side normalisation anyway and the recruiter shouldn't be
  // forced to fill rows they didn't intend to add.
  const serialisable = questions.filter((q) => q.prompt.trim().length >= 8);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor={inputId}>Application questions (optional)</Label>
          <p className="mt-1 text-hint text-emce-text-sec">
            Ask up to 3 short, role-specific prompts at apply time
            instead of a generic cover letter. Recruiters scan
            answers side-by-side in the ATS — much better signal than
            free-form prose. Examples:{" "}
            <em className="text-emce-text-muted">
              &ldquo;Describe a project where you implemented OCPP 1.6 in
              2-3 lines.&rdquo;
            </em>
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addQuestion}
          disabled={questions.length >= MAX_QUESTIONS_PER_JOB}
          className="shrink-0"
        >
          + Add question
        </Button>
      </div>

      {questions.length === 0 && (
        <div className="rounded-md border border-dashed border-emce-border bg-emce-light-soft/30 p-4 text-hint text-emce-text-sec">
          No application questions. The candidate sees only the
          standard cover-letter field. Click <strong>+ Add
          question</strong> to drop in your first prompt.
        </div>
      )}

      {questions.map((q, idx) => (
        <div
          key={q.id}
          className="rounded-md border border-emce-border bg-white p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            {/* Label wired to the textarea below so screen readers
                announce "Question N" when focus enters the field.
                Pre-fix this was a bare `<p>` — SR users got an
                un-labelled textarea + a disconnected paragraph and
                had to infer the relationship from reading order. */}
            <Label
              htmlFor={`${inputId}-prompt-${idx}`}
              className="text-hint font-bold uppercase tracking-wider text-emce-text-muted"
            >
              Question {idx + 1}
            </Label>
            <button
              type="button"
              onClick={() => removeQuestion(idx)}
              className="text-hint text-emce-red-deep hover:underline"
            >
              Remove
            </button>
          </div>
          <Textarea
            value={q.prompt}
            onChange={(e) => updateQuestion(idx, { prompt: e.target.value })}
            placeholder="e.g. Describe a battery-pack project you led, including chemistry + capacity"
            maxLength={MAX_PROMPT_LENGTH}
            rows={2}
            id={`${inputId}-prompt-${idx}`}
          />
          <div className="flex items-center justify-between text-hint">
            <label className="inline-flex items-center gap-1.5 text-emce-text-sec cursor-pointer">
              <input
                type="checkbox"
                checked={!!q.required}
                onChange={(e) => updateQuestion(idx, { required: e.target.checked })}
                className="h-3.5 w-3.5 accent-emce-mid"
              />
              Required to apply
            </label>
            <span className="text-emce-text-muted tabular-nums">
              {q.prompt.length}/{MAX_PROMPT_LENGTH}
            </span>
          </div>
        </div>
      ))}

      {/* Hidden field — what the server action actually reads.
          Re-serialised on every keystroke so a form submission picks
          up the current state without any onSubmit gymnastics. */}
      <input
        type="hidden"
        name="applicationQuestionsJson"
        value={serialisable.length > 0 ? JSON.stringify(serialisable) : ""}
      />
    </div>
  );
}

function mintHex(): string {
  // 8 hex chars — collision negligible across the 3-question cap.
  let s = "";
  for (let i = 0; i < 8; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}
