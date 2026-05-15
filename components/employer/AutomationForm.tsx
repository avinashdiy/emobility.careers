"use client";

import { useActionState, useEffect, useState } from "react";
import { createAutomation } from "@/server/automations/actions";
import { emptyFormState, type FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";

/**
 * #23 Automation Rules — create form. Renders the trigger/condition/
 * action shape inline. Conditional UI: the action's payload fields
 * appear only when the matching action is selected.
 */
export function AutomationForm({
  jobs,
}: {
  jobs: { id: string; title: string; status: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    createAutomation,
    emptyFormState,
  );
  const e = state.fieldErrors ?? {};
  const v = state.prevValues ?? {};

  const [action, setAction] = useState<string>(v.action ?? "AUTO_MOVE_STAGE");
  const [trigger, setTrigger] = useState<string>(v.trigger ?? "APPLICATION_RECEIVED");

  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (state.ok && state.message) {
      setShowSaved(true);
      const t = setTimeout(() => setShowSaved(false), 4000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <>
      {state.ok && showSaved && (
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
        <div>
          <Label htmlFor="label" required>
            Rule name (just for you)
          </Label>
          <Input
            id="label"
            name="label"
            required
            maxLength={160}
            defaultValue={v.label ?? ""}
            placeholder='e.g. "Auto-shortlist DIYguru + 80%+ match"'
            aria-invalid={!!e.label}
          />
          <FieldError error={e.label} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="jobId" optional>
              Scope
            </Label>
            <NativeSelect id="jobId" name="jobId" defaultValue={v.jobId ?? ""}>
              <option value="">All jobs at this company</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} · {j.status}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="trigger" required>
              Trigger
            </Label>
            <NativeSelect
              id="trigger"
              name="trigger"
              defaultValue={trigger}
              onChange={(e) => setTrigger(e.target.value)}
            >
              <option value="APPLICATION_RECEIVED">On new application</option>
              <option value="STAGE_CHANGED">On stage change</option>
            </NativeSelect>
          </div>
        </div>

        <fieldset className="rounded-md border border-emce-border p-4">
          <legend className="px-2 text-hint font-bold uppercase tracking-wide text-emce-mid-muted">
            When all of these are true
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="matchScoreMin" optional>
                AI match score ≥ (%)
              </Label>
              <Input
                id="matchScoreMin"
                name="matchScoreMin"
                type="number"
                min="0"
                max="100"
                defaultValue={v.matchScoreMin ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="experienceMin" optional>
                Experience ≥ (months)
              </Label>
              <Input
                id="experienceMin"
                name="experienceMin"
                type="number"
                min="0"
                defaultValue={v.experienceMin ?? ""}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="mustHaveBadgesCsv" optional>
                Verified skill badges (comma slugs)
              </Label>
              <Input
                id="mustHaveBadgesCsv"
                name="mustHaveBadgesCsv"
                defaultValue={v.mustHaveBadgesCsv ?? ""}
                placeholder="bms-architecture, battery-fundamentals"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="mustHaveCredentialsCsv" optional>
                Credentials held (comma slugs)
              </Label>
              <Input
                id="mustHaveCredentialsCsv"
                name="mustHaveCredentialsCsv"
                defaultValue={v.mustHaveCredentialsCsv ?? ""}
                placeholder="arai, asdc-l3, fame-ii"
              />
            </div>
            <div>
              <Label htmlFor="locationsCsv" optional>
                Cities (any of)
              </Label>
              <Input
                id="locationsCsv"
                name="locationsCsv"
                defaultValue={v.locationsCsv ?? ""}
                placeholder="Bengaluru, Pune, Hyderabad"
              />
            </div>
            <div>
              <Label htmlFor="evDomainsCsv" optional>
                EV domains (any of)
              </Label>
              <Input
                id="evDomainsCsv"
                name="evDomainsCsv"
                defaultValue={v.evDomainsCsv ?? ""}
                placeholder="battery-tech, charging-infra"
              />
            </div>
            <label className="sm:col-span-2 flex items-center gap-2 rounded-md bg-emce-light-soft p-2 text-hint font-bold text-emce-text">
              <input
                type="checkbox"
                name="mustBeDIYguruVerified"
                value="true"
                defaultChecked={v.mustBeDIYguruVerified === "true"}
                className="h-4 w-4 accent-emce-mid"
              />
              DIYguru-verified only
            </label>
            {trigger === "STAGE_CHANGED" && (
              <>
                <div>
                  <Label htmlFor="fromStage" optional>
                    From stage
                  </Label>
                  <NativeSelect id="fromStage" name="fromStage" defaultValue={v.fromStage ?? ""}>
                    <option value="">Any</option>
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div>
                  <Label htmlFor="toStage" optional>
                    To stage
                  </Label>
                  <NativeSelect id="toStage" name="toStage" defaultValue={v.toStage ?? ""}>
                    <option value="">Any</option>
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </>
            )}
          </div>
        </fieldset>

        <fieldset className="rounded-md border border-emce-border p-4">
          <legend className="px-2 text-hint font-bold uppercase tracking-wide text-emce-mid-muted">
            Then do this
          </legend>
          <div>
            <Label htmlFor="action" required>
              Action
            </Label>
            <NativeSelect
              id="action"
              name="action"
              defaultValue={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="AUTO_MOVE_STAGE">Move to stage</option>
              <option value="NOTIFY_TEAM">Notify recruiter team</option>
              <option value="SEND_TEMPLATE">Send candidate a message</option>
              <option value="REJECT_WITH_REASON">Auto-reject with reason</option>
            </NativeSelect>
          </div>

          {action === "AUTO_MOVE_STAGE" && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="actionToStage" required>
                  Target stage
                </Label>
                <NativeSelect id="actionToStage" name="actionToStage" defaultValue={v.actionToStage ?? "SCREENED"}>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <Label htmlFor="actionReason" optional>
                  Stage-change reason (internal)
                </Label>
                <Input
                  id="actionReason"
                  name="actionReason"
                  maxLength={1000}
                  defaultValue={v.actionReason ?? ""}
                  placeholder="Auto-shortlisted by rule"
                />
              </div>
            </div>
          )}

          {action === "REJECT_WITH_REASON" && (
            <div className="mt-3">
              <Label htmlFor="actionReason" required>
                Reason (sent to candidate)
              </Label>
              <Textarea
                id="actionReason"
                name="actionReason"
                rows={3}
                maxLength={1000}
                defaultValue={v.actionReason ?? ""}
                placeholder="Thanks for applying — for this role we're looking for 5+ years on automotive BMS. Keep an eye on our other postings."
              />
            </div>
          )}

          {action === "NOTIFY_TEAM" && (
            <div className="mt-3">
              <Label htmlFor="actionMessage" required>
                Internal message
              </Label>
              <Input
                id="actionMessage"
                name="actionMessage"
                maxLength={2000}
                defaultValue={v.actionMessage ?? ""}
                placeholder="High-fit DIYguru candidate — review today"
              />
            </div>
          )}

          {action === "SEND_TEMPLATE" && (
            <div className="mt-3 space-y-3">
              <div>
                <Label htmlFor="actionSubject" optional>
                  Subject
                </Label>
                <Input
                  id="actionSubject"
                  name="actionSubject"
                  maxLength={200}
                  defaultValue={v.actionSubject ?? ""}
                  placeholder="Next steps for your application"
                />
              </div>
              <div>
                <Label htmlFor="actionMessage" required>
                  Message body
                </Label>
                <Textarea
                  id="actionMessage"
                  name="actionMessage"
                  rows={4}
                  maxLength={2000}
                  defaultValue={v.actionMessage ?? ""}
                  placeholder="Thanks for applying! Could you take 30 minutes to complete our take-home assessment at the link below?"
                />
              </div>
            </div>
          )}
        </fieldset>

        <div className="flex justify-end">
          <SubmitButton variant="glow" pendingLabel="Saving…">
            ⚡ Create automation
          </SubmitButton>
        </div>
      </form>
    </>
  );
}

const STAGES = [
  "APPLIED",
  "SCREENED",
  "ASSESSMENT",
  "SHORTLISTED",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
];
