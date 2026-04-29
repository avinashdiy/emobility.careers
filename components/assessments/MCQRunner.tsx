"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { submitAssessment } from "@/server/assessments/actions";
import type { MCQQuestion } from "@/server/assessments/actions";

export function MCQRunner({
  attemptId,
  title,
  durationMins,
  questions,
}: {
  attemptId: string;
  title: string;
  durationMins: number | null;
  questions: MCQQuestion[];
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);

  function pick(qi: number, oi: number) {
    setAnswers((prev) => ({ ...prev, [qi]: oi }));
  }

  const answered = Object.keys(answers).length;
  const allAnswered = answered === questions.length;

  return (
    <div className="container max-w-2xl py-10">
      <Card className="mb-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-section text-emce-text">{title}</h1>
            <p className="text-hint text-emce-text-sec">
              Answered {answered} / {questions.length}
              {durationMins && ` · ${durationMins} min`}
            </p>
          </div>
          <Badge variant="default">MCQ</Badge>
        </div>
      </Card>

      <ol className="space-y-4">
        {questions.map((q, qi) => (
          <li key={qi}>
            <Card className="p-5">
              <div className="mb-3 flex items-start gap-2">
                <span className="font-bold text-emce-dark">Q{qi + 1}.</span>
                <p className="font-bold text-emce-text">{q.q}</p>
              </div>
              <div className="grid gap-2">
                {q.options.map((opt, oi) => {
                  const selected = answers[qi] === oi;
                  return (
                    <label
                      key={oi}
                      className={`cursor-pointer rounded-md border-2 p-3 text-sm transition ${
                        selected ? "border-emce-dark bg-emce-light-soft" : "border-emce-border bg-white hover:border-emce-mid"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${qi}`}
                        className="sr-only"
                        checked={selected}
                        onChange={() => pick(qi, oi)}
                      />
                      <span className="mr-2 font-bold text-emce-dark">{String.fromCharCode(65 + oi)}.</span>
                      {opt}
                    </label>
                  );
                })}
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <form
        action={async (fd) => {
          setSubmitting(true);
          fd.append("attemptId", attemptId);
          fd.append("answersJson", JSON.stringify(answers));
          await submitAssessment(fd);
        }}
      >
        <div className="mt-6 flex items-center justify-between">
          <p className="text-hint text-emce-text-sec">
            {allAnswered ? "All questions answered" : `${questions.length - answered} unanswered`}
          </p>
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit assessment"}
          </Button>
        </div>
      </form>
    </div>
  );
}
