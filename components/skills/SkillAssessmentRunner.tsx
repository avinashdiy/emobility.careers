"use client";

import { useEffect, useMemo, useState } from "react";
import { submitSkillAssessment } from "@/server/skills/actions";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import type { SkillAssessmentQuestion } from "@/server/skills/parse";

/**
 * #28 — MCQ runner. Renders one question at a time with prev/next +
 * a side rail of question numbers (clickable on desktop). Selections
 * persist to localStorage keyed by attemptId so a tab close + reopen
 * within the cooldown picks up exactly where the candidate was.
 *
 * On submit, the answers object is JSON-stringified into a hidden
 * input and posted to the server action which grades + awards the
 * badge.
 */
export function SkillAssessmentRunner({
  attemptId,
  slug,
  questions,
}: {
  attemptId: string;
  slug: string;
  questions: SkillAssessmentQuestion[];
}) {
  const storageKey = useMemo(() => `skill-attempt:${attemptId}`, [attemptId]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [idx, setIdx] = useState(0);

  // Restore prior selections on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object") {
          setAnswers(parsed as Record<string, number>);
        }
      }
    } catch {
      // ignore — fresh start is fine
    }
  }, [storageKey]);

  // Persist on every change.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(answers));
    } catch {
      // localStorage full / blocked — degrade silently
    }
  }, [storageKey, answers]);

  const q = questions[idx];
  const answeredCount = Object.keys(answers).length;
  const completion = Math.round((answeredCount / questions.length) * 100);
  const allAnswered = answeredCount === questions.length;
  const selected = q ? answers[q.id] : undefined;

  function pick(option: number) {
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [q.id]: option }));
  }

  return (
    <div>
      {/* Progress strip */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-hint font-bold uppercase tracking-wider text-emce-text-muted">
          Question {idx + 1} of {questions.length}
        </p>
        <p className="text-hint text-emce-text-sec tabular-nums">
          {answeredCount}/{questions.length} answered ({completion}%)
        </p>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-emce-light-soft">
        <div
          className="h-full bg-gradient-to-r from-emce-mid to-emce-light transition-all"
          style={{ width: `${completion}%` }}
        />
      </div>

      {/* Question card */}
      {q && (
        <div key={q.id} className="mt-6 animate-fade-up">
          <p className="text-section text-emce-text">{q.text}</p>
          <ul className="mt-4 space-y-2">
            {q.options.map((opt, i) => {
              const isPicked = selected === i;
              return (
                <li key={i}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition ${
                      isPicked
                        ? "border-emce-mid bg-emce-light-soft"
                        : "border-emce-border hover:border-emce-mid-muted hover:bg-emce-light-soft/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={isPicked}
                      onChange={() => pick(i)}
                      className="mt-0.5 h-4 w-4 accent-emce-mid"
                    />
                    <span className="flex-1 text-emce-text">{opt}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={idx === 0}
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
        >
          ← Previous
        </Button>

        <div className="flex flex-wrap gap-1">
          {questions.map((qq, i) => {
            const isCurrent = i === idx;
            const isDone = answers[qq.id] !== undefined;
            return (
              <button
                key={qq.id}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Question ${i + 1}${isDone ? " (answered)" : ""}`}
                className={`h-7 w-7 rounded-md text-[11px] font-bold tabular-nums transition ${
                  isCurrent
                    ? "bg-emce-dark text-emce-light"
                    : isDone
                      ? "bg-emce-mid/40 text-emce-darkest hover:bg-emce-mid"
                      : "bg-emce-light-soft text-emce-text-sec hover:bg-emce-mid/30"
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={idx === questions.length - 1}
          onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}
        >
          Next →
        </Button>
      </div>

      {/* Submit form — separate <form> so the runner state doesn't
          interfere with the server action. We serialize answers into
          a hidden input at submit time. */}
      <form
        action={submitSkillAssessment}
        className="mt-8 flex flex-col items-center gap-2"
        onSubmit={() => {
          // Clear local storage on the way to the server — once
          // submitted, the answers shouldn't persist client-side.
          try {
            localStorage.removeItem(storageKey);
          } catch {
            /* ignore */
          }
        }}
      >
        <input type="hidden" name="attemptId" value={attemptId} />
        <input type="hidden" name="answersJson" value={JSON.stringify(answers)} />
        <SubmitButton
          variant="glow"
          size="lg"
          disabled={!allAnswered}
          className="min-w-[16rem]"
          pendingLabel="Grading…"
        >
          {allAnswered ? "✨ Submit & grade" : `Answer all ${questions.length} questions first`}
        </SubmitButton>
        <p className="text-hint text-emce-text-muted">
          You&apos;ll see your score + badge on the next screen.
        </p>
        {/* `slug` is referenced here only to suppress an "unused prop"
            warning for callers that don't pass it through; the slug
            is round-tripped via the server action's existing
            assessment lookup. */}
        <input type="hidden" name="_slug" value={slug} />
      </form>
    </div>
  );
}
