"use client";

import { useActionState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { toast } from "sonner";
import {
  addCompetitionStage,
  deleteCompetitionStage,
  addCompetitionPrize,
  deleteCompetitionPrize,
  attachJobPerk,
  submitForReview,
  inviteJudge,
} from "@/server/competitions/actions";
import { emptyFormState } from "@/lib/form-state";
import { formatMinor } from "@/components/mentorship/PriceLabel";

interface Stage {
  id: string;
  order: number;
  name: string;
  kind: string;
  startsAt: Date;
  endsAt: Date;
}

interface Prize {
  id: string;
  rank: number;
  title: string;
  cashAmountMinor: number;
  currency: string;
  inKind: string | null;
}

interface Perk {
  id: string;
  job: { id: string; title: string };
  forRanks: number[];
  ataStage: string;
}

interface Props {
  competitionId: string;
  status: string;
  stages: Stage[];
  prizes: Prize[];
  perks: Perk[];
  jobs: { id: string; title: string }[];
}

export function StagePrizeManager(props: Props) {
  const [stageState, stageAction] = useActionState(addCompetitionStage, emptyFormState);
  const [prizeState, prizeAction] = useActionState(addCompetitionPrize, emptyFormState);
  const [perkState, perkAction] = useActionState(attachJobPerk, emptyFormState);
  const [judgeState, judgeAction] = useActionState(inviteJudge, emptyFormState);
  const [pending, startTransition] = useTransition();

  const editable = props.status === "DRAFT" || props.status === "CHANGES_REQUESTED";

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-section text-emce-text">Stages</h2>
        {editable && (
          <form action={stageAction} className="mt-3 grid gap-2 sm:grid-cols-12 border-b border-emce-border pb-4">
            <input type="hidden" name="competitionId" value={props.competitionId} />
            <Input name="name" required placeholder="Stage name (Round 1)" className="sm:col-span-3" />
            <NativeSelect name="kind" defaultValue="SUBMISSION" className="sm:col-span-2">
              <option value="REGISTRATION">Registration</option>
              <option value="QUIZ">Quiz</option>
              <option value="SUBMISSION">Submission</option>
              <option value="INTERVIEW">Interview</option>
              <option value="PRESENTATION">Presentation</option>
            </NativeSelect>
            <Input name="startsAt" type="datetime-local" required className="sm:col-span-3" />
            <Input name="endsAt" type="datetime-local" required className="sm:col-span-3" />
            <SubmitButton className="sm:col-span-1">Add</SubmitButton>
            {stageState.message && <p className="sm:col-span-12 text-xs text-emce-red">{stageState.message}</p>}
          </form>
        )}
        <ul className="mt-3 divide-y divide-emce-border">
          {props.stages.length === 0 && <li className="py-3 text-sm text-emce-text-sec">No stages yet.</li>}
          {props.stages.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span><strong>#{s.order} {s.name}</strong> · {s.kind} · {s.startsAt.toLocaleString("en-IN")} → {s.endsAt.toLocaleString("en-IN")}</span>
              {editable && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => startTransition(async () => {
                    const r = await deleteCompetitionStage(s.id);
                    r.ok ? toast.success("Removed.") : toast.error(r.message ?? "Failed.");
                  })}
                >Remove</Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-section text-emce-text">Prizes</h2>
        {editable && (
          <form action={prizeAction} className="mt-3 grid gap-2 sm:grid-cols-12 border-b border-emce-border pb-4">
            <input type="hidden" name="competitionId" value={props.competitionId} />
            <Input name="rank" type="number" min={0} required placeholder="Rank" className="sm:col-span-1" />
            <Input name="title" required placeholder="Title (Winner)" className="sm:col-span-3" />
            <Input name="cashAmountMinor" type="number" min={0} placeholder="Cash (paise)" className="sm:col-span-2" />
            <Input name="inKind" placeholder="In-kind reward" className="sm:col-span-3" />
            <Input name="sponsor" placeholder="Sponsor (optional)" className="sm:col-span-2" />
            <SubmitButton className="sm:col-span-1">Add</SubmitButton>
            {prizeState.message && <p className="sm:col-span-12 text-xs text-emce-red">{prizeState.message}</p>}
          </form>
        )}
        <ul className="mt-3 divide-y divide-emce-border">
          {props.prizes.length === 0 && <li className="py-3 text-sm text-emce-text-sec">No prizes yet (this is OK — competitions can be recognition-only).</li>}
          {props.prizes.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <strong>#{p.rank} {p.title}</strong>
                {p.cashAmountMinor > 0 && ` · ${formatMinor(p.cashAmountMinor, p.currency)}`}
                {p.inKind && ` · ${p.inKind}`}
              </span>
              {editable && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => startTransition(async () => {
                    const r = await deleteCompetitionPrize(p.id);
                    r.ok ? toast.success("Removed.") : toast.error(r.message ?? "Failed.");
                  })}
                >Remove</Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-section text-emce-text">Recruitment perks (optional)</h2>
        <p className="text-hint text-emce-text-sec">
          Tie a job to ranks — winners get auto-enrolled into your ATS at the selected stage. Skip this if the competition isn't a hiring play.
        </p>
        {editable && (
          <form action={perkAction} className="mt-3 grid gap-2 sm:grid-cols-12 border-b border-emce-border pb-4">
            <input type="hidden" name="competitionId" value={props.competitionId} />
            <NativeSelect name="jobId" required className="sm:col-span-4">
              <option value="">Select a job…</option>
              {props.jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </NativeSelect>
            <Input name="forRanks" placeholder="Ranks (1,2,3)" required className="sm:col-span-3"
              onChange={(e) => {/* multiple inputs would be nicer but this stays compact */}}
              onBlur={(e) => {
                // Convert single field "1,2,3" into multiple form values
                const parts = e.target.value.split(/[, ]+/).filter(Boolean);
                e.target.removeAttribute("name");
                // Append hidden inputs in form
                const form = e.target.closest("form");
                if (!form) return;
                form.querySelectorAll<HTMLInputElement>("input.__rank_for_form").forEach((n) => n.remove());
                for (const p of parts) {
                  const inp = document.createElement("input");
                  inp.type = "hidden";
                  inp.name = "forRanks";
                  inp.value = p;
                  inp.className = "__rank_for_form";
                  form.appendChild(inp);
                }
              }}
            />
            <NativeSelect name="ataStage" defaultValue="SHORTLISTED" className="sm:col-span-2">
              <option value="APPLIED">Applied</option>
              <option value="SCREENED">Screened</option>
              <option value="SHORTLISTED">Shortlisted</option>
              <option value="ASSESSMENT">Assessment</option>
              <option value="INTERVIEW">Interview</option>
            </NativeSelect>
            <Input name="notes" placeholder="Notes (optional)" className="sm:col-span-2" />
            <SubmitButton className="sm:col-span-1">Add</SubmitButton>
            {perkState.message && <p className="sm:col-span-12 text-xs text-emce-red">{perkState.message}</p>}
          </form>
        )}
        <ul className="mt-3 divide-y divide-emce-border">
          {props.perks.length === 0 && <li className="py-3 text-sm text-emce-text-sec">No perks attached.</li>}
          {props.perks.map((p) => (
            <li key={p.id} className="py-2 text-sm">
              <strong>{p.job.title}</strong> · ranks {p.forRanks.join(", ")} → {p.ataStage}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-section text-emce-text">Invite a judge</h2>
        <form action={judgeAction} className="mt-3 grid gap-2 sm:grid-cols-12">
          <input type="hidden" name="competitionId" value={props.competitionId} />
          <Input name="email" type="email" required placeholder="judge@example.com" className="sm:col-span-9" />
          <SubmitButton className="sm:col-span-3">Invite</SubmitButton>
          {judgeState.message && <p className="sm:col-span-12 text-xs text-emce-red">{judgeState.message}</p>}
        </form>
      </Card>

      {(props.status === "DRAFT" || props.status === "CHANGES_REQUESTED") && (
        <Card>
          <h2 className="text-section text-emce-text">Submit for review</h2>
          <p className="text-sm text-emce-text-sec">Once you submit, the eMobility Careers team will review the listing and either approve or request changes.</p>
          <Button
            variant="accent"
            className="mt-3"
            disabled={pending || props.stages.length === 0}
            onClick={() => startTransition(async () => {
              const r = await submitForReview(props.competitionId);
              r.ok ? toast.success(r.message ?? "Submitted.") : toast.error(r.message ?? "Failed.");
            })}
          >Submit for review</Button>
        </Card>
      )}
    </div>
  );
}
