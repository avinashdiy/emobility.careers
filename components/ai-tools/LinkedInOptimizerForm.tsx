"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  runLinkedInOptimizer,
  type LinkedInOptimizerState,
} from "@/server/ai-tools/linkedin-optimizer-actions";
import type { LinkedInGap } from "@/lib/ai/linkedin-optimizer";

interface DomainOption {
  slug: string;
  name: string;
}

interface Props {
  evDomains: DomainOption[];
}

const SEVERITY_TONE: Record<LinkedInGap["severity"], string> = {
  high: "border-emce-red bg-emce-red-light text-emce-red-deep",
  medium: "border-emce-orange bg-emce-orange-light text-emce-orange-deep",
  low: "border-emce-border bg-emce-light-soft text-emce-text-sec",
};

const SEVERITY_LABEL: Record<LinkedInGap["severity"], string> = {
  high: "Top priority",
  medium: "Worth fixing",
  low: "Nice to have",
};

export function LinkedInOptimizerForm({ evDomains }: Props) {
  const [state, formAction] = useActionState<LinkedInOptimizerState, FormData>(
    runLinkedInOptimizer,
    { ok: false },
  );
  const v = state.prevValues ?? {};
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // Non-secure contexts can't write to clipboard — silently let
      // the user copy by hand instead of throwing a noisy error.
    }
  }

  return (
    <>
      <Card className="p-6">
        <h2 className="text-section text-emce-text">Paste your current profile</h2>

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
            <Label htmlFor="currentHeadline" required>
              Current LinkedIn headline
            </Label>
            <Input
              id="currentHeadline"
              name="currentHeadline"
              required
              minLength={2}
              maxLength={400}
              defaultValue={v.currentHeadline ?? ""}
              placeholder="e.g. Battery Engineer at Tata Motors | EV powertrain | M.Tech IIT-B"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="currentAbout" optional>
              Current About section
            </Label>
            <Textarea
              id="currentAbout"
              name="currentAbout"
              rows={5}
              maxLength={3000}
              defaultValue={v.currentAbout ?? ""}
              placeholder="Paste your current About text. Leave blank if you don&apos;t have one yet — the AI will write one from scratch."
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="experienceSummary" required>
              Your experience in your own words
            </Label>
            <Textarea
              id="experienceSummary"
              name="experienceSummary"
              rows={5}
              required
              minLength={20}
              maxLength={3000}
              defaultValue={v.experienceSummary ?? ""}
              placeholder={`The rewrites lean on this directly. Be specific.\n\ne.g. — 3 yrs at Bosch on motor controllers, FOC + dyno testing\n— Led BMS firmware on Formula Student EV at IIT-B, ISO-26262 awareness\n— Comfortable with CAN bus, AUTOSAR basics, AIS-156 spec`}
            />
          </div>

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
              placeholder="e.g. Senior BMS Firmware Engineer"
            />
          </div>
          <div>
            <Label htmlFor="evDomainSlug" optional>
              EV domain
            </Label>
            <NativeSelect
              id="evDomainSlug"
              name="evDomainSlug"
              defaultValue={v.evDomainSlug ?? ""}
            >
              <option value="">— general EV positioning —</option>
              {evDomains.map((d) => (
                <option key={d.slug} value={d.slug}>{d.name}</option>
              ))}
            </NativeSelect>
          </div>

          <div className="sm:col-span-2 flex justify-end border-t border-emce-border pt-4">
            <SubmitButton size="lg" pendingLabel="Optimising…">
              {state.result ? "Re-optimise" : "Optimise my profile →"}
            </SubmitButton>
          </div>
        </form>
      </Card>

      {state.ok && state.result && (
        <div className="mt-6 space-y-4">
          <Card className="emce-hero-gradient text-white">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1">
                <p className="text-hint font-bold uppercase tracking-wide text-emce-mid">
                  Current profile score
                </p>
                <p className="mt-1 text-5xl font-extrabold leading-none text-white">
                  {state.result.overallScore}
                  <span className="ml-1 text-2xl text-white/60">/100</span>
                </p>
              </div>
              {state.result.summary && (
                <p className="basis-full text-white/90 sm:basis-1/2">{state.result.summary}</p>
              )}
            </div>
          </Card>

          {state.result.headlines.length > 0 && (
            <Card>
              <h2 className="text-section text-emce-text">Try one of these headlines</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                Each one approaches your story from a different angle. Pick
                whichever feels most like you and paste it into your LinkedIn
                profile.
              </p>
              <ul className="mt-3 space-y-3">
                {state.result.headlines.map((h, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-emce-border bg-emce-light-soft p-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-body font-bold text-emce-text">{h.text}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copy(`headline-${i}`, h.text)}
                      >
                        {copiedKey === `headline-${i}` ? "✓ Copied" : "Copy"}
                      </Button>
                    </div>
                    {h.reasoning && (
                      <p className="mt-1 text-hint text-emce-text-sec">
                        <strong>Why:</strong> {h.reasoning}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {state.result.aboutRewrite && (
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-section text-emce-text">Rewritten About section</h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copy("about", state.result!.aboutRewrite)}
                >
                  {copiedKey === "about" ? "✓ Copied" : "Copy to clipboard"}
                </Button>
              </div>
              <pre className="mt-3 whitespace-pre-wrap rounded-md border border-emce-border bg-emce-light-soft p-4 text-body text-emce-text">
                {state.result.aboutRewrite}
              </pre>
              <p className="mt-2 text-hint text-emce-text-muted">
                Edit before posting — the AI won&apos;t know your tone perfectly.
                Strip anything that doesn&apos;t sound like you.
              </p>
            </Card>
          )}

          {state.result.missingKeywords.length > 0 && (
            <Card>
              <h2 className="text-section text-emce-text">Keywords recruiters search for</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                Sprinkle these into your headline / About / Skills section
                wherever they genuinely apply. Don&apos;t keyword-stuff.
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {state.result.missingKeywords.map((k, i) => (
                  <li key={i}>
                    <Badge variant="default">{k}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {state.result.gaps.length > 0 && (
            <Card>
              <h2 className="text-section text-emce-text">Section gaps to fix</h2>
              <ul className="mt-3 space-y-3">
                {state.result.gaps.map((g, i) => (
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
        </div>
      )}
    </>
  );
}
