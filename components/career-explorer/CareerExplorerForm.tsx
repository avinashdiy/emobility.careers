"use client";

import Link from "next/link";
import { useActionState, useState, useEffect } from "react";
import { exploreCareer } from "@/server/career-explorer/actions";
import { emptyFormState, type FormState } from "@/lib/form-state";
import type { CareerExploreResult, CareerSuggestion } from "@/server/career-explorer/actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";
import { Sparkle } from "@/components/ui/sparkle";

type ExploreState = FormState & { result?: CareerExploreResult };

/**
 * #14 Career Explorer client form. Runs through `useActionState` so
 * the same component handles input → result → share-link without a
 * page hop. The `initialResult` prop pre-fills the result section
 * when the user lands on a `?r=<cacheKey>` share URL.
 */
export function CareerExplorerForm({
  initialResult,
}: {
  initialResult: CareerExploreResult | null;
}) {
  const [state, formAction] = useActionState<ExploreState, FormData>(
    exploreCareer,
    initialResult ? { ok: true, result: initialResult } : (emptyFormState as ExploreState),
  );
  const e = state.fieldErrors ?? {};
  const v = state.prevValues ?? {};
  const result = state.result ?? initialResult ?? null;

  const [showError, setShowError] = useState(false);
  useEffect(() => {
    if (!state.ok && state.message) {
      setShowError(true);
      const t = setTimeout(() => setShowError(false), 6000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <>
      {!state.ok && state.message && showError && (
        <Alert variant="danger">{state.message}</Alert>
      )}

      <Card animate>
        <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2">
            <Label htmlFor="fromRole" required>
              Your current role
            </Label>
            <Input
              id="fromRole"
              name="fromRole"
              required
              maxLength={80}
              defaultValue={v.fromRole ?? result?.fromRole ?? ""}
              placeholder="e.g. Battery Cell Engineer, Charging Network Ops, EV Service Technician"
              aria-invalid={!!e.fromRole}
            />
            <FieldError error={e.fromRole} />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="skillsCsv" optional>
              Your skills (comma-separated)
            </Label>
            <Textarea
              id="skillsCsv"
              name="skillsCsv"
              rows={2}
              maxLength={2000}
              defaultValue={v.skillsCsv ?? ""}
              placeholder="e.g. Li-ion chemistry, BMS, CAN, ANSYS, MATLAB, AUTOSAR, OCPP"
              aria-invalid={!!e.skillsCsv}
            />
            <FieldError error={e.skillsCsv} />
            <p className="mt-1 text-hint text-emce-text-muted">
              The more specific you are, the sharper the suggestions get. 8-12 skills is the sweet spot.
            </p>
          </div>

          <div>
            <Label htmlFor="evDomainSlug" optional>
              Primary EV domain
            </Label>
            <select
              id="evDomainSlug"
              name="evDomainSlug"
              className="block h-10 w-full rounded-md border border-emce-border bg-white px-3 text-sm text-emce-text shadow-emce focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emce-mid"
              defaultValue={v.evDomainSlug ?? result?.evDomainSlug ?? ""}
            >
              <option value="">Any / not sure</option>
              <option value="battery-tech">Battery</option>
              <option value="charging-infra">Charging infrastructure</option>
              <option value="powertrain">Powertrain</option>
              <option value="motor-control">Motor & power electronics</option>
              <option value="vehicle-engineering">Vehicle engineering</option>
              <option value="fleet-mobility">Fleet & mobility</option>
              <option value="manufacturing">Manufacturing</option>
              <option value="software-iot">Software & IoT</option>
              <option value="after-sales">After-sales / service</option>
              <option value="policy-research">Policy & research</option>
            </select>
          </div>

          <div className="flex items-end">
            <SubmitButton size="lg" variant="glow" className="w-full" pendingLabel="Mapping your next moves…">
              ✨ Show me my next moves
            </SubmitButton>
          </div>
        </form>
      </Card>

      {result && <ResultSection result={result} />}
    </>
  );
}

function ResultSection({ result }: { result: CareerExploreResult }) {
  const shareUrl = typeof window === "undefined"
    ? ""
    : `${window.location.origin}/career-explorer?r=${result.cacheKey}`;

  return (
    <div className="space-y-4">
      {/* Headline summary */}
      <Card variant="glow" className="relative">
        <Sparkle className="absolute -right-1 -top-1" size={16} />
        <div className="flex items-baseline justify-between gap-3">
          <Badge variant="glow">For {result.fromRole}</Badge>
          {result.cacheAgeHours > 0 && (
            <span className="text-hint text-emce-text-muted">
              Cached {result.cacheAgeHours}h ago
            </span>
          )}
        </div>
        {result.summary && (
          <p className="mt-3 text-body text-emce-text">{result.summary}</p>
        )}
        {shareUrl && (
          <p className="mt-3 text-hint text-emce-text-sec">
            Share this read:{" "}
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(shareUrl)}
              className="font-bold text-emce-dark hover:underline"
            >
              Copy share link
            </button>
          </p>
        )}
      </Card>

      <h2 className="mt-2 text-section text-emce-text">
        {result.suggestions.length} adjacent EV roles, ranked by fit
      </h2>

      <ul className="emce-stagger grid gap-3 sm:grid-cols-2">
        {result.suggestions.map((s, i) => (
          <li key={`${s.toRole}-${i}`}>
            <SuggestionCard suggestion={s} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: CareerSuggestion }) {
  const tone =
    suggestion.score >= 75 ? "verified"
    : suggestion.score >= 55 ? "success"
    : "default";
  return (
    <Card variant="interactive" className="h-full">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-section text-emce-text">{suggestion.toRole}</h3>
        <Badge variant={tone}>{suggestion.score}% fit</Badge>
      </div>
      <p className="mt-2 text-hint text-emce-text-sec">{suggestion.reason}</p>

      {suggestion.salaryBandLpa && (
        <p className="mt-2 text-hint">
          <span className="font-bold text-emce-text">
            ₹{suggestion.salaryBandLpa.min}–{suggestion.salaryBandLpa.max} LPA
          </span>{" "}
          <span className="text-emce-text-muted">in India</span>
        </p>
      )}

      {suggestion.skillGap.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emce-text-muted">
            Skill gap to bridge
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {suggestion.skillGap.slice(0, 6).map((s) => (
              <span
                key={s}
                className="rounded-full bg-emce-light-soft px-2 py-0.5 text-[10px] font-bold text-emce-dark"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {suggestion.prepLinks.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emce-text-muted">
            Where to start
          </p>
          <ul className="mt-1 space-y-1">
            {suggestion.prepLinks.slice(0, 3).map((l) => (
              <li key={l.url}>
                <Link
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-hint font-bold text-emce-dark hover:underline"
                >
                  → {l.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
