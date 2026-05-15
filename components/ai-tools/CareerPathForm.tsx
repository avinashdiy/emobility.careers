"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  runCareerPath,
  type CareerPathState,
} from "@/server/ai-tools/career-path-actions";
import type { CareerMilestone } from "@/lib/ai/career-path";

interface DomainOption {
  slug: string;
  name: string;
}

interface Props {
  evDomains: DomainOption[];
}

export function CareerPathForm({ evDomains }: Props) {
  const [state, formAction] = useActionState<CareerPathState, FormData>(
    runCareerPath,
    { ok: false },
  );
  const v = state.prevValues ?? {};

  return (
    <>
      <Card className="p-6">
        <h2 className="text-section text-emce-text">Where are you now → where do you want to be?</h2>

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
            <Label htmlFor="currentSituation" required>
              Where you are today
            </Label>
            <Textarea
              id="currentSituation"
              name="currentSituation"
              rows={4}
              required
              minLength={10}
              maxLength={2000}
              defaultValue={v.currentSituation ?? ""}
              placeholder={`e.g. 3 years as a powertrain test engineer at Bosch. CAN bus + dyno testing + some FOC algorithm work. ME from VIT.`}
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="targetRole" required>
              Where you want to land
            </Label>
            <Input
              id="targetRole"
              name="targetRole"
              required
              minLength={2}
              maxLength={400}
              defaultValue={v.targetRole ?? ""}
              placeholder={`e.g. Lead the motor controls software team at an Indian EV OEM`}
            />
          </div>

          <div>
            <Label htmlFor="horizonYears">Horizon (years)</Label>
            <NativeSelect
              id="horizonYears"
              name="horizonYears"
              defaultValue={v.horizonYears ?? "3"}
            >
              {[1, 2, 3, 5, 7, 10].map((y) => (
                <option key={y} value={y}>{y} year{y === 1 ? "" : "s"}</option>
              ))}
            </NativeSelect>
          </div>

          <div>
            <Label htmlFor="evDomainSlug" optional>
              EV domain anchor
            </Label>
            <NativeSelect
              id="evDomainSlug"
              name="evDomainSlug"
              defaultValue={v.evDomainSlug ?? ""}
            >
              <option value="">— let the path span domains —</option>
              {evDomains.map((d) => (
                <option key={d.slug} value={d.slug}>{d.name}</option>
              ))}
            </NativeSelect>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="constraints" optional>
              Constraints / preferences
            </Label>
            <Textarea
              id="constraints"
              name="constraints"
              rows={2}
              maxLength={500}
              defaultValue={v.constraints ?? ""}
              placeholder={`e.g. "Need to stay in Pune", "Open to a 1-year pay cut for the right role", "No interest in pure-IT switch"`}
            />
            <p className="mt-1 text-hint text-emce-text-muted">
              The AI will avoid suggesting moves that violate these.
            </p>
          </div>

          <div className="sm:col-span-2 flex justify-end border-t border-emce-border pt-4">
            <SubmitButton size="lg" pendingLabel="Charting…">
              {state.result ? "Re-chart" : "Chart my path →"}
            </SubmitButton>
          </div>
        </form>
      </Card>

      {state.ok && state.result && state.result.milestones.length > 0 && (
        <div className="mt-6 space-y-4">
          <Card className="emce-hero-gradient text-white">
            <p className="text-hint font-bold uppercase tracking-wide text-emce-mid">
              North star
            </p>
            <p className="mt-2 text-white/90">{state.result.northStarSummary}</p>
          </Card>

          <ol className="space-y-3">
            {state.result.milestones.map((m, i) => (
              <MilestoneCard key={i} milestone={m} index={i} />
            ))}
          </ol>

          {state.result.watchOuts.length > 0 && (
            <Card>
              <h2 className="text-section text-emce-text">Watch-outs on this path</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-emce-text-sec">
                {state.result.watchOuts.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="bg-emce-light-soft">
            <h3 className="text-section text-emce-text">Pair this with</h3>
            <p className="mt-2 text-sm text-emce-text">
              <Link href="/ai-tools/skills-analyzer" className="font-bold text-emce-dark underline">
                Analyze Your EV Skills
              </Link>{" "}
              — see where you stack up against the first milestone&apos;s skill
              list. Then{" "}
              <Link href="/ai-tools/interview-prep" className="font-bold text-emce-dark underline">
                Interview Prep
              </Link>{" "}
              when you&apos;re ready to apply.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}

function MilestoneCard({ milestone, index }: { milestone: CareerMilestone; index: number }) {
  const isNow = milestone.yearsFromNow === 0;
  return (
    <li>
      <Card className={isNow ? "border-emce-mid bg-emce-light-soft" : ""}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-3">
            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-emce-mid text-xs font-extrabold text-emce-darkest">
              {index + 1}
            </span>
            <div>
              <h3 className="text-section text-emce-text">{milestone.title}</h3>
              <p className="text-hint text-emce-text-sec">
                {isNow ? "Today" : `+${milestone.yearsFromNow} year${milestone.yearsFromNow === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
          {milestone.salaryRangeLpaMax > 0 && (
            <Badge variant="default">
              ₹{milestone.salaryRangeLpaMin}-{milestone.salaryRangeLpaMax} LPA
            </Badge>
          )}
        </div>

        {milestone.description && (
          <p className="mt-3 text-sm text-emce-text">{milestone.description}</p>
        )}

        {milestone.skillsToAcquire.length > 0 && (
          <div className="mt-3">
            <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
              Acquire before next stage
            </p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {milestone.skillsToAcquire.map((s, i) => (
                <li
                  key={i}
                  className="rounded-full bg-emce-light-soft px-3 py-1 text-hint font-bold text-emce-dark"
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {milestone.promotionSignal && (
          <div className="mt-3 rounded-md border-l-4 border-emce-mid bg-white p-3">
            <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
              Ready-for-next-stage signal
            </p>
            <p className="mt-1 text-sm text-emce-text">{milestone.promotionSignal}</p>
          </div>
        )}
      </Card>
    </li>
  );
}
