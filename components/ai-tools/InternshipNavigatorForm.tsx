"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatSalaryRange } from "@/lib/utils";
import {
  runInternshipNavigator,
  type InternshipNavigatorState,
  type NavigatorJobCard,
} from "@/server/ai-tools/internship-navigator-actions";
import type { NavigatorMatch } from "@/lib/ai/internship-navigator";

interface DomainOption {
  slug: string;
  name: string;
}

interface Props {
  evDomains: DomainOption[];
}

const STRENGTH_TONE: Record<NavigatorMatch["matchStrength"], string> = {
  strong: "bg-emce-mid text-emce-darkest",
  stretch: "bg-emce-orange-light text-emce-orange-deep",
  consider: "bg-emce-light-soft text-emce-text-sec",
};

const STRENGTH_LABEL: Record<NavigatorMatch["matchStrength"], string> = {
  strong: "Strong fit",
  stretch: "Stretch",
  consider: "Worth a look",
};

export function InternshipNavigatorForm({ evDomains }: Props) {
  const [state, formAction] = useActionState<InternshipNavigatorState, FormData>(
    runInternshipNavigator,
    { ok: false },
  );
  const v = state.prevValues ?? {};

  // Index matches by id so we can pair the AI rationale with the
  // hydrated job card the server pre-joined.
  const matchById = new Map(
    (state.result?.matches ?? []).map((m) => [m.jobId, m]),
  );

  return (
    <>
      <Card className="p-6">
        <h2 className="text-section text-emce-text">Tell us about you</h2>
        <p className="mt-1 text-hint text-emce-text-sec">
          We&apos;ll re-rank the open EV internships we have right now against
          your skills and goals, and flag what you should improve before
          applying.
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
              rows={4}
              required
              minLength={2}
              maxLength={2000}
              defaultValue={v.rawSkills ?? ""}
              placeholder="e.g. Li-ion fundamentals, AutoCAD, Python, embedded C, MATLAB Simulink, basic CAN bus"
            />
          </div>

          <div>
            <Label htmlFor="evDomainSlug" optional>
              Target EV domain
            </Label>
            <NativeSelect
              id="evDomainSlug"
              name="evDomainSlug"
              defaultValue={v.evDomainSlug ?? ""}
            >
              <option value="">— open to any EV domain —</option>
              {evDomains.map((d) => (
                <option key={d.slug} value={d.slug}>{d.name}</option>
              ))}
            </NativeSelect>
          </div>

          <div>
            <Label htmlFor="preferredCities" optional>
              Preferred cities (comma-separated)
            </Label>
            <Input
              id="preferredCities"
              name="preferredCities"
              maxLength={400}
              defaultValue={v.preferredCities ?? ""}
              placeholder="e.g. Bengaluru, Pune, Chennai"
            />
            <p className="mt-1 text-hint text-emce-text-muted">
              Leave blank to see everything (remote included).
            </p>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="careerGoal" optional>
              What are you trying to break into?
            </Label>
            <Input
              id="careerGoal"
              name="careerGoal"
              maxLength={500}
              defaultValue={v.careerGoal ?? ""}
              placeholder='e.g. "Battery cell R&D at a serious cell manufacturer"'
            />
          </div>

          <div className="sm:col-span-2 flex justify-end border-t border-emce-border pt-4">
            <SubmitButton size="lg" pendingLabel="Navigating…">
              {state.result ? "Re-navigate" : "Find my internships →"}
            </SubmitButton>
          </div>
        </form>
      </Card>

      {state.ok && state.result && (
        <div className="mt-6 space-y-4">
          {state.result.navigatorNote && (
            <Card className="emce-hero-gradient text-white">
              <p className="text-hint font-bold uppercase tracking-wide text-emce-mid">
                Navigator note
              </p>
              <p className="mt-2 text-white/90">{state.result.navigatorNote}</p>
            </Card>
          )}

          {state.jobCards && state.jobCards.length > 0 ? (
            <Card>
              <h2 className="text-section text-emce-text">
                Top matches ({state.jobCards.length})
              </h2>
              <ul className="mt-3 space-y-3">
                {state.jobCards.map((job) => {
                  const m = matchById.get(job.id);
                  return (
                    <li key={job.id}>
                      <MatchCard job={job} match={m} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : (
            <Card className="border-dashed">
              <h2 className="text-section text-emce-text">No matches yet</h2>
              <p className="mt-2 text-body text-emce-text-sec">
                We don&apos;t have open internships matching those filters
                right now. Widen the EV domain or remove the city filter, or{" "}
                <Link
                  href="/me/alerts"
                  className="font-bold text-emce-dark underline"
                >
                  set up a job alert
                </Link>{" "}
                so you hear the moment one is posted.
              </p>
            </Card>
          )}

          {state.result.gaps.length > 0 && (
            <Card>
              <h2 className="text-section text-emce-text">Close these before applying</h2>
              <ul className="mt-3 space-y-3">
                {state.result.gaps.map((g, i) => (
                  <li
                    key={i}
                    className="rounded-md border-l-4 border-emce-orange bg-emce-orange-light/40 p-3"
                  >
                    <strong className="text-sm text-emce-text">{g.title}</strong>
                    <p className="mt-1 text-sm text-emce-text-sec">{g.body}</p>
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

function MatchCard({
  job,
  match,
}: {
  job: NavigatorJobCard;
  match: NavigatorMatch | undefined;
}) {
  return (
    <Link
      href={`/job/${job.slug}`}
      className="block rounded-md border border-emce-border p-3 transition hover:-translate-y-0.5 hover:border-emce-mid hover:shadow-emce"
    >
      <div className="flex flex-wrap items-start gap-3">
        <Avatar src={job.company.logoUrl} name={job.company.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-extrabold text-emce-text hover:underline">{job.title}</h3>
            {match && (
              <Badge className={`text-[10px] ${STRENGTH_TONE[match.matchStrength]}`}>
                {STRENGTH_LABEL[match.matchStrength]}
              </Badge>
            )}
          </div>
          <p className="text-hint text-emce-text-sec">
            {job.company.name} · {job.workMode}
            {job.locations.length > 0 && ` · ${job.locations.join(", ")}`}
          </p>
          {!job.salaryHidden && (job.salaryMin || job.salaryMax) && (
            <p className="mt-1 text-hint text-emce-dark">
              {formatSalaryRange(
                job.salaryMin ? Number(job.salaryMin) : null,
                job.salaryMax ? Number(job.salaryMax) : null,
                job.salaryCurrency,
                job.salaryPeriod,
              )}
            </p>
          )}
          {match?.whyItFits && (
            <p className="mt-2 text-sm text-emce-text">{match.whyItFits}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
