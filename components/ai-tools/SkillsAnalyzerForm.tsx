"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  runSkillsAnalysis,
  type SkillsAnalyzerState,
} from "@/server/ai-tools/skills-analyzer-actions";
import type { SkillsCoverage, SkillItem } from "@/lib/ai/skills-analyzer";

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

const COVERAGE_LABELS: Record<keyof SkillsCoverage, { label: string; emoji: string }> = {
  battery: { label: "Battery", emoji: "🔋" },
  charging: { label: "Charging", emoji: "🔌" },
  motorsAndPower: { label: "Motors & power", emoji: "⚙️" },
  software: { label: "Software & embedded", emoji: "💾" },
  industryContext: { label: "Industry context", emoji: "🏭" },
};

const SEVERITY_TONE: Record<SkillItem["severity"], string> = {
  high: "border-emce-red bg-emce-red-light text-emce-red-deep",
  medium: "border-emce-orange bg-emce-orange-light text-emce-orange-deep",
  low: "border-emce-border bg-emce-light-soft text-emce-text-sec",
};

const SEVERITY_LABEL: Record<SkillItem["severity"], string> = {
  high: "Top priority",
  medium: "Worth fixing",
  low: "Nice to have",
};

export function SkillsAnalyzerForm({ evDomains }: Props) {
  const [state, formAction] = useActionState<SkillsAnalyzerState, FormData>(
    runSkillsAnalysis,
    { ok: false },
  );
  const v = state.prevValues ?? {};

  return (
    <>
      <Card className="p-6">
        <h2 className="text-section text-emce-text">Tell us what you know</h2>
        <p className="mt-1 text-hint text-emce-text-sec">
          Paste skills the way you&apos;d list them on a resume — comma- or
          newline-separated. The model treats your phrasing as ground truth,
          so be specific (&ldquo;CAN bus with ISO-TP&rdquo; beats &ldquo;automotive
          networks&rdquo;).
        </p>

        {state.message && !state.ok && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-emce-red/40 bg-emce-red-light p-3 text-sm text-emce-red-deep"
          >
            {state.message}
          </div>
        )}

        <form action={formAction} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="rawSkills" required>
              Your skills
            </Label>
            <Textarea
              id="rawSkills"
              name="rawSkills"
              rows={5}
              required
              minLength={2}
              maxLength={4000}
              defaultValue={v.rawSkills ?? ""}
              placeholder={`e.g.\nLi-ion cell chemistry, BMS firmware (STM32), thermal management\nCAN bus, AUTOSAR, MATLAB Simulink\nOCPP, charging station commissioning\nMotor control (FOC), inverter design`}
            />
          </div>

          <div>
            <Label htmlFor="evDomainSlug" optional>
              Target EV domain
            </Label>
            <NativeSelect id="evDomainSlug" name="evDomainSlug" defaultValue={v.evDomainSlug ?? ""}>
              <option value="">— score evenly across pillars —</option>
              {evDomains.map((d) => (
                <option key={d.slug} value={d.slug}>{d.name}</option>
              ))}
            </NativeSelect>
          </div>

          <div>
            <Label htmlFor="seniorityLevel" optional>
              Seniority
            </Label>
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

          <div className="sm:col-span-2">
            <Label htmlFor="careerGoal" optional>
              Career goal (1-2 lines)
            </Label>
            <Input
              id="careerGoal"
              name="careerGoal"
              maxLength={500}
              defaultValue={v.careerGoal ?? ""}
              placeholder='e.g. "Want to move from automotive electronics into BMS firmware at an Indian OEM"'
            />
            <p className="mt-1 text-hint text-emce-text-muted">
              Helps the AI tune its &ldquo;what to learn next&rdquo; advice to
              where you actually want to go.
            </p>
          </div>

          <div className="sm:col-span-2 flex justify-end border-t border-emce-border pt-4">
            <SubmitButton size="lg" pendingLabel="Analysing…">
              {state.result ? "Re-analyse" : "Analyse my skills →"}
            </SubmitButton>
          </div>
        </form>
      </Card>

      {state.ok && state.result && (
        <SkillsResult result={state.result} />
      )}
    </>
  );
}

function SkillsResult({ result }: { result: NonNullable<SkillsAnalyzerState["result"]> }) {
  const tier =
    result.overall >= 85
      ? { label: "Specialist-ready", tone: "bg-emce-mid text-emce-darkest" }
      : result.overall >= 70
      ? { label: "Strong baseline", tone: "bg-emce-light text-emce-darkest" }
      : result.overall >= 55
      ? { label: "Promising", tone: "bg-emce-orange-light text-emce-orange-deep" }
      : result.overall >= 40
      ? { label: "Foundations only", tone: "bg-emce-orange text-white" }
      : { label: "Early days", tone: "bg-emce-red text-white" };

  return (
    <div className="mt-6 space-y-4">
      <Card className="emce-hero-gradient text-white">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <p className="text-hint font-bold uppercase tracking-wide text-emce-mid">
              Your EV-skills score
            </p>
            <p className="mt-1 text-5xl font-extrabold leading-none text-white">
              {result.overall}
              <span className="ml-1 text-2xl text-white/60">/100</span>
            </p>
            <Badge className={`mt-3 ${tier.tone}`}>{tier.label}</Badge>
          </div>
          {result.summary && (
            <p className="basis-full text-white/90 sm:basis-1/2">{result.summary}</p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-section text-emce-text">Pillar coverage</h2>
        <ul className="mt-3 space-y-2">
          {(Object.keys(COVERAGE_LABELS) as (keyof SkillsCoverage)[]).map((key) => {
            const value = result.coverage[key];
            const dim = COVERAGE_LABELS[key];
            return (
              <li key={key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emce-text">
                    {dim.emoji} {dim.label}
                  </span>
                  <span className="font-bold text-emce-text">{value}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-emce-light-soft">
                  <div
                    className="h-full rounded-full bg-emce-mid"
                    style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {result.gaps.length > 0 && (
        <Card>
          <h2 className="text-section text-emce-text">What to learn next</h2>
          <ul className="mt-3 space-y-3">
            {result.gaps.map((g, i) => (
              <li
                key={i}
                className={`rounded-md border-l-4 p-3 ${SEVERITY_TONE[g.severity]}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="text-sm">{g.title}</strong>
                  <span className="text-hint font-bold uppercase tracking-wide">
                    {SEVERITY_LABEL[g.severity]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-emce-text">{g.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {result.strengths.length > 0 && (
        <Card>
          <h2 className="text-section text-emce-text">What you&apos;ve already got</h2>
          <ul className="mt-3 space-y-3">
            {result.strengths.map((s, i) => (
              <li key={i} className="rounded-md border-l-4 border-emce-mid bg-emce-light-soft p-3">
                <strong className="text-sm text-emce-darkest">{s.title}</strong>
                <p className="mt-1 text-sm text-emce-text">{s.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
