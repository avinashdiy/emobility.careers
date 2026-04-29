"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { submitScore } from "@/server/competitions/actions";
import { emptyFormState } from "@/lib/form-state";

interface Submission {
  id: string;
  title: string;
  summary: string | null;
  body: string | null;
  externalUrl: string | null;
  attachmentUrls: string[];
  registration: { teamName: string | null; leader: { candidateProfile: { firstName: string; lastName: string | null } | null } };
  stage: { name: string };
  scores: { scoresByCriteria: unknown; total: number; feedback: string | null }[];
}

interface Criterion {
  name: string;
  weight?: number;
  description?: string;
}

export function JudgeForm({ submission, criteria }: { submission: Submission; criteria: Criterion[] }) {
  const [state, formAction] = useActionState(submitScore, emptyFormState);
  const existing = submission.scores[0] as
    | { scoresByCriteria: Record<string, number>; total: number; feedback: string | null }
    | undefined;
  const teamName = submission.registration.teamName
    ?? `${submission.registration.leader.candidateProfile?.firstName ?? ""} ${submission.registration.leader.candidateProfile?.lastName ?? ""}`.trim();
  const fallbackCriteria: Criterion[] = criteria.length > 0 ? criteria : [
    { name: "Innovation", weight: 25 },
    { name: "Technical merit", weight: 25 },
    { name: "Feasibility", weight: 25 },
    { name: "Presentation", weight: 25 },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-emce-text">{submission.title}</h3>
          <p className="text-hint text-emce-text-sec">Team: {teamName} · Stage: {submission.stage.name}</p>
        </div>
        {existing && <span className="text-xs font-bold text-emce-mid">You scored: {existing.total}</span>}
      </div>
      {submission.summary && <p className="mt-2 text-sm text-emce-text">{submission.summary}</p>}
      {submission.body && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-bold text-emce-text-sec">Full write-up</summary>
          <p className="mt-2 whitespace-pre-line text-sm text-emce-text">{submission.body}</p>
        </details>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {submission.externalUrl && (
          <a href={submission.externalUrl} target="_blank" rel="noreferrer" className="font-bold text-emce-dark hover:underline">
            External link →
          </a>
        )}
        {submission.attachmentUrls.map((u, i) => (
          <a key={i} href={u} target="_blank" rel="noreferrer" className="font-bold text-emce-dark hover:underline">
            Attachment {i + 1} →
          </a>
        ))}
      </div>

      <form action={formAction} className="mt-4 space-y-3 border-t border-emce-border pt-3">
        <input type="hidden" name="submissionId" value={submission.id} />
        {state.message && (
          <div role="alert" className={`rounded-md p-2 text-sm ${state.ok ? "bg-emce-light-soft" : "bg-emce-red-light text-emce-red"}`}>
            {state.message}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {fallbackCriteria.map((cr) => (
            <div key={cr.name}>
              <Label htmlFor={`s-${submission.id}-${cr.name}`}>
                {cr.name}{cr.weight ? ` (${cr.weight}%)` : ""} <span className="text-emce-text-sec">/10</span>
              </Label>
              <Input
                id={`s-${submission.id}-${cr.name}`}
                name={`score:${cr.name}`}
                type="number"
                min={0}
                max={10}
                step={0.5}
                defaultValue={existing?.scoresByCriteria[cr.name] ?? ""}
                required
              />
              {cr.description && <p className="text-hint text-emce-text-sec">{cr.description}</p>}
            </div>
          ))}
        </div>
        <div>
          <Label htmlFor={`fb-${submission.id}`}>Feedback</Label>
          <Textarea id={`fb-${submission.id}`} name="feedback" rows={2} maxLength={4000} defaultValue={existing?.feedback ?? ""} />
        </div>
        <SubmitButton size="sm" variant="accent" pendingLabel="Saving…">Save score</SubmitButton>
      </form>
    </Card>
  );
}
