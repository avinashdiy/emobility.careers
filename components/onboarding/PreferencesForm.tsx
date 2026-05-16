"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { savePreferences } from "@/server/candidates/actions";
import { emptyFormState, type FormState } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";

type Country = { code: string; name: string; flag: string };

export function PreferencesForm({
  countries,
  initial,
}: {
  countries: readonly Country[];
  initial: {
    country: string | null;
    city: string | null;
    preferredCities: string[];
    relocationPref: string;
    availabilityStatus: string;
    noticePeriodDays: number | null;
    cvVisibility: string;
    expectedCtcMin: number | null;
    expectedCtcMax: number | null;
    openToWork: boolean;
    /// #5 Skill-trade pairing — optional list of skills the candidate
    /// is actively trying to learn. Empty array on existing accounts
    /// before they set anything.
    learningSkills?: string[];
  };
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    savePreferences,
    emptyFormState,
  );
  const e = state.fieldErrors ?? {};
  const v = state.prevValues ?? {};

  const [showErr, setShowErr] = useState(false);
  useEffect(() => {
    if (!state.ok && state.message) {
      setShowErr(true);
      const t = setTimeout(() => setShowErr(false), 6000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <form action={formAction} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      {!state.ok && state.message && showErr && (
        <Alert variant="danger" className="sm:col-span-2">
          {state.message}
        </Alert>
      )}

      <div>
        <Label htmlFor="country">Country</Label>
        <NativeSelect
          id="country"
          name="country"
          defaultValue={v.country ?? initial.country ?? "IN"}
          required
          aria-invalid={!!e.country}
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name}
            </option>
          ))}
        </NativeSelect>
        <FieldError error={e.country} />
      </div>
      <div>
        <Label htmlFor="city">City</Label>
        <Input
          id="city"
          name="city"
          defaultValue={v.city ?? initial.city ?? ""}
          placeholder="e.g. Bengaluru"
          required
          aria-invalid={!!e.city}
        />
        <FieldError error={e.city} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="preferredCities">
          Preferred cities to work in (comma-separated)
        </Label>
        <Input
          id="preferredCities"
          name="preferredCities"
          defaultValue={v.preferredCities ?? initial.preferredCities.join(", ")}
          placeholder="e.g. Bengaluru, Pune, Hyderabad"
        />
      </div>

      {/* #5 Skill-trade pairing — what the candidate is actively
          trying to LEARN (distinct from their validated skills on
          CandidateSkill). Powers the /me/skill-swap matching engine
          that pairs candidates with complementary teach/learn axes.
          Stored as a string array (free-form, not joined to the
          canonical Skill table) because what people want to learn
          is often vaguer than what their resume claims. */}
      <div className="sm:col-span-2">
        <Label htmlFor="learningSkills">
          Skills you&apos;re actively learning (comma-separated, optional)
        </Label>
        <Input
          id="learningSkills"
          name="learningSkills"
          defaultValue={v.learningSkills ?? (initial.learningSkills ?? []).join(", ")}
          placeholder="e.g. BMS architecture, OCPP, motor control"
        />
        <p className="mt-1 text-hint text-emce-text-muted">
          We&apos;ll pair you with candidates who know what you&apos;re learning, and want to learn what you know — peer skill-swap, not formal mentorship. See your matches at{" "}
          <Link href="/me/skill-swap" className="font-bold text-emce-dark hover:underline">/me/skill-swap</Link>.
        </p>
      </div>

      <div>
        <Label htmlFor="relocationPref">Open to relocation</Label>
        <NativeSelect
          id="relocationPref"
          name="relocationPref"
          defaultValue={v.relocationPref ?? initial.relocationPref}
        >
          <option value="ANYWHERE">Anywhere in India</option>
          <option value="WITHIN_STATE">Within home state only</option>
          <option value="HOMETOWN_ONLY">Hometown only</option>
        </NativeSelect>
      </div>
      <div>
        <Label htmlFor="availabilityStatus">Availability</Label>
        <NativeSelect
          id="availabilityStatus"
          name="availabilityStatus"
          defaultValue={v.availabilityStatus ?? initial.availabilityStatus}
        >
          <option value="IMMEDIATE">Immediately</option>
          <option value="DAYS_15">In 15 days</option>
          <option value="DAYS_30">In 30 days</option>
          <option value="DAYS_60">In 60 days</option>
          <option value="NOT_LOOKING">Not looking</option>
        </NativeSelect>
      </div>
      <div>
        <Label htmlFor="noticePeriodDays">Notice period (days)</Label>
        <Input
          id="noticePeriodDays"
          name="noticePeriodDays"
          type="number"
          defaultValue={v.noticePeriodDays ?? initial.noticePeriodDays ?? 0}
          min="0"
          max="365"
          aria-invalid={!!e.noticePeriodDays}
        />
        <FieldError error={e.noticePeriodDays} />
      </div>
      <div>
        <Label htmlFor="cvVisibility">Profile visibility</Label>
        <NativeSelect
          id="cvVisibility"
          name="cvVisibility"
          defaultValue={v.cvVisibility ?? initial.cvVisibility}
        >
          <option value="EVERYONE">Visible to everyone</option>
          <option value="EMPLOYERS_ONLY">Only verified employers</option>
          <option value="PRIVATE">Private (only when you apply)</option>
        </NativeSelect>
      </div>

      <div>
        <Label htmlFor="expectedCtcMin">Expected CTC min (₹/yr)</Label>
        <Input
          id="expectedCtcMin"
          name="expectedCtcMin"
          type="number"
          min="0"
          defaultValue={
            v.expectedCtcMin ??
            (initial.expectedCtcMin ? String(initial.expectedCtcMin) : "")
          }
          placeholder="e.g. 600000"
          aria-invalid={!!e.expectedCtcMin}
        />
        <FieldError error={e.expectedCtcMin} />
      </div>
      <div>
        <Label htmlFor="expectedCtcMax">Expected CTC max (₹/yr)</Label>
        <Input
          id="expectedCtcMax"
          name="expectedCtcMax"
          type="number"
          min="0"
          defaultValue={
            v.expectedCtcMax ??
            (initial.expectedCtcMax ? String(initial.expectedCtcMax) : "")
          }
          placeholder="e.g. 900000"
          aria-invalid={!!e.expectedCtcMax}
        />
        <FieldError error={e.expectedCtcMax} />
      </div>

      <label className="sm:col-span-2 flex items-center gap-3 rounded-md bg-emce-light-soft p-3">
        <input
          type="checkbox"
          name="openToWork"
          value="true"
          defaultChecked={
            v.openToWork !== undefined ? v.openToWork === "true" : initial.openToWork
          }
          className="h-4 w-4 accent-emce-mid"
        />
        <span className="text-sm font-bold text-emce-text">
          I&apos;m actively open to new opportunities
        </span>
      </label>

      <div className="sm:col-span-2 flex justify-between pt-2">
        <Button asChild variant="outline">
          <Link href="/onboarding/confirm">← Back</Link>
        </Button>
        <Button type="submit" size="lg">
          Finish &amp; go to my profile →
        </Button>
      </div>
    </form>
  );
}
