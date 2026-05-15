"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  runInterviewPrep,
  type InterviewPrepState,
} from "@/server/ai-tools/interview-prep-actions";
import type { PrepTopic } from "@/lib/ai/interview-prep";

interface DomainOption {
  slug: string;
  name: string;
}

interface Props {
  evDomains: DomainOption[];
}

const SENIORITIES: { value: string; label: string }[] = [
  { value: "ENTRY", label: "Entry / fresher" },
  { value: "JUNIOR", label: "Junior (0-2 yrs)" },
  { value: "MID", label: "Mid (2-5 yrs)" },
  { value: "SENIOR", label: "Senior (5-10 yrs)" },
  { value: "LEAD", label: "Lead / Staff" },
  { value: "PRINCIPAL", label: "Principal / Director" },
];

export function InterviewPrepForm({ evDomains }: Props) {
  const [state, formAction] = useActionState<InterviewPrepState, FormData>(
    runInterviewPrep,
    { ok: false },
  );
  const v = state.prevValues ?? {};

  return (
    <>
      <Card className="p-6">
        <h2 className="text-section text-emce-text">Set up your study plan</h2>

        {state.message && !state.ok && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-emce-red/40 bg-emce-red-light p-3 text-sm text-emce-red-deep"
          >
            {state.message}
          </div>
        )}

        <form action={formAction} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="targetRole" required>
              Target role
            </Label>
            <Input
              id="targetRole"
              name="targetRole"
              required
              minLength={2}
              maxLength={120}
              defaultValue={v.targetRole ?? ""}
              placeholder="e.g. Battery Pack Engineer"
            />
          </div>
          <div>
            <Label htmlFor="targetCompany" optional>
              Target company
            </Label>
            <Input
              id="targetCompany"
              name="targetCompany"
              maxLength={120}
              defaultValue={v.targetCompany ?? ""}
              placeholder="e.g. Ola Electric, Tata Motors"
            />
          </div>

          <div>
            <Label htmlFor="seniorityLevel">Seniority</Label>
            <NativeSelect
              id="seniorityLevel"
              name="seniorityLevel"
              defaultValue={v.seniorityLevel ?? "MID"}
            >
              {SENIORITIES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </NativeSelect>
          </div>

          <div>
            <Label htmlFor="evDomainSlug" optional>
              EV domain focus
            </Label>
            <NativeSelect
              id="evDomainSlug"
              name="evDomainSlug"
              defaultValue={v.evDomainSlug ?? ""}
            >
              <option value="">— full EV-engineering breadth —</option>
              {evDomains.map((d) => (
                <option key={d.slug} value={d.slug}>{d.name}</option>
              ))}
            </NativeSelect>
          </div>

          <div>
            <Label htmlFor="daysUntil">Days until the interview</Label>
            <Input
              id="daysUntil"
              name="daysUntil"
              type="number"
              min={0}
              max={60}
              defaultValue={v.daysUntil ?? "7"}
              required
            />
            <p className="mt-1 text-hint text-emce-text-muted">
              Tunes the cram-note tone. 0 = today, 7+ = a study-week plan.
            </p>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="focus" optional>
              Anything specific the round will cover?
            </Label>
            <Textarea
              id="focus"
              name="focus"
              rows={2}
              maxLength={500}
              defaultValue={v.focus ?? ""}
              placeholder='e.g. "Recruiter said it&apos;ll focus on BMS thermal behaviour + on-call experience"'
            />
          </div>

          <div className="sm:col-span-2 flex justify-end border-t border-emce-border pt-4">
            <SubmitButton size="lg" pendingLabel="Generating…">
              {state.result ? "Regenerate plan" : "Generate study plan →"}
            </SubmitButton>
          </div>
        </form>
      </Card>

      {state.ok && state.result && (
        <div className="mt-6 space-y-4">
          {state.result.cramNote && (
            <Card className="emce-hero-gradient text-white">
              <p className="text-hint font-bold uppercase tracking-wide text-emce-mid">
                Cram note
              </p>
              <p className="mt-2 text-white/90">{state.result.cramNote}</p>
              <p className="mt-3 text-hint text-white/70">
                Want to rehearse against the same role?{" "}
                <Link
                  href="/ai-tools/mock-interview"
                  className="font-bold text-emce-mid hover:underline"
                >
                  Run a mock interview →
                </Link>
              </p>
            </Card>
          )}

          <ol className="space-y-3">
            {state.result.topics.map((t, i) => (
              <TopicCard key={i} topic={t} priority={i + 1} />
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

function TopicCard({ topic, priority }: { topic: PrepTopic; priority: number }) {
  return (
    <li>
      <Card>
        <div className="flex items-baseline gap-3">
          <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-emce-mid text-xs font-extrabold text-emce-darkest">
            {priority}
          </span>
          <h3 className="text-section text-emce-text">{topic.title}</h3>
        </div>
        {topic.whyItMatters && (
          <p className="mt-2 text-sm text-emce-text-sec">
            <strong className="text-emce-text">Why it matters:</strong>{" "}
            {topic.whyItMatters}
          </p>
        )}
        {topic.sampleQuestions.length > 0 && (
          <div className="mt-3">
            <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
              Sample questions
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-emce-text">
              {topic.sampleQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
        {topic.answerOutline && (
          <div className="mt-3 rounded-md border border-emce-border bg-emce-light-soft p-3">
            <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
              How a strong candidate would answer
            </p>
            <p className="mt-1 text-sm text-emce-text">{topic.answerOutline}</p>
          </div>
        )}
        {topic.deepenWith.length > 0 && (
          <div className="mt-3">
            <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
              Deepen with
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-emce-text-sec">
              {topic.deepenWith.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </li>
  );
}
