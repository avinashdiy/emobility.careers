"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  runCoverLetter,
  type CoverLetterState,
} from "@/server/ai-tools/cover-letter-actions";

const TONES: { value: string; label: string }[] = [
  { value: "warm", label: "Warm · human, real-person voice" },
  { value: "confident", label: "Confident · leads with strengths, no hedging" },
  { value: "enthusiastic", label: "Enthusiastic · genuine excitement" },
  { value: "concise", label: "Concise · direct, short paragraphs" },
  { value: "formal", label: "Formal · traditional, professional register" },
];

export function CoverLetterForm() {
  const [state, formAction] = useActionState<CoverLetterState, FormData>(
    runCoverLetter,
    { ok: false },
  );
  const v = state.prevValues ?? {};
  const [copied, setCopied] = useState(false);

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can fail in non-secure contexts — fail silently;
      // the user can still select + copy manually.
    }
  }

  return (
    <>
      <Card className="p-6">
        <h2 className="text-section text-emce-text">Tell us about the role + you</h2>

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
            <Label htmlFor="targetRole" required>Target role</Label>
            <Input
              id="targetRole"
              name="targetRole"
              required
              minLength={2}
              maxLength={120}
              defaultValue={v.targetRole ?? ""}
              placeholder="e.g. Battery Cell Engineer"
            />
          </div>
          <div>
            <Label htmlFor="targetCompany" required>Target company</Label>
            <Input
              id="targetCompany"
              name="targetCompany"
              required
              minLength={1}
              maxLength={120}
              defaultValue={v.targetCompany ?? ""}
              placeholder="e.g. Ola Electric, Tata Motors"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="background" required>
              Your background (paste key projects, skills, metrics)
            </Label>
            <Textarea
              id="background"
              name="background"
              rows={6}
              required
              minLength={20}
              maxLength={4000}
              defaultValue={v.background ?? ""}
              placeholder={`The more specific you paste, the sharper the letter.\n\ne.g. — Led BMS firmware for Formula Student EV at IIT Bombay (STM32, ISO-26262 awareness, reduced cell-imbalance alerts by 40%)\n— 2 years at Bosch on motor controllers — FOC, dyno testing\n— Comfortable with CAN bus, AUTOSAR basics, AIS-156 spec`}
            />
            <p className="mt-1 text-hint text-emce-text-muted">
              Vague input = generic letter. Numbers and named tools travel further.
            </p>
          </div>

          <div>
            <Label htmlFor="tone">Tone</Label>
            <NativeSelect id="tone" name="tone" defaultValue={v.tone ?? "warm"}>
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="managerName" optional>Hiring manager name</Label>
            <Input
              id="managerName"
              name="managerName"
              maxLength={60}
              defaultValue={v.managerName ?? ""}
              placeholder="Optional — used in the salutation"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="hook" optional>Specific angle to open with</Label>
            <Input
              id="hook"
              name="hook"
              maxLength={300}
              defaultValue={v.hook ?? ""}
              placeholder='e.g. "My Formula Student BMS project lines up with their cell-monitoring stack"'
            />
          </div>

          <div className="sm:col-span-2 flex justify-end border-t border-emce-border pt-4">
            <SubmitButton size="lg" pendingLabel="Writing…">
              {state.result ? "Regenerate" : "Generate cover letter →"}
            </SubmitButton>
          </div>
        </form>
      </Card>

      {state.ok && state.result && (
        <div className="mt-6 space-y-4">
          {state.result.confidence === "low" && (
            <div className="rounded-md border-l-4 border-emce-orange bg-emce-orange-light/40 p-3 text-sm text-emce-orange-deep">
              <strong>Heads up — the letter reads generic.</strong> The
              background you pasted didn&apos;t have enough specifics for the
              AI to do its best work. Add 1-2 quantified projects (numbers,
              named tools, named standards like AIS-156 / ISO-26262) and
              regenerate for a much sharper letter.
            </div>
          )}

          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-section text-emce-text">Your cover letter</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(state.result!.body)}
              >
                {copied ? "✓ Copied" : "Copy to clipboard"}
              </Button>
            </div>
            <pre className="mt-3 whitespace-pre-wrap rounded-md border border-emce-border bg-emce-light-soft p-4 text-body text-emce-text">
              {state.result.body}
            </pre>
            <p className="mt-2 text-hint text-emce-text-muted">
              Edit before you send — add your name at the bottom and read it
              aloud once. Anywhere it doesn&apos;t sound like you, rewrite that
              line in your own words.
            </p>
          </Card>

          {state.result.customizationTips.length > 0 && (
            <Card>
              <h2 className="text-section text-emce-text">Tighten it further</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-emce-text">
                {state.result.customizationTips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
