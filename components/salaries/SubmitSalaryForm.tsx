"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { FieldError } from "@/components/ui/field-error";
import { submitSalary } from "@/server/salaries/actions";
import { emptyFormState } from "@/lib/form-state";

interface DomainOption {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  evDomains: DomainOption[];
  /// Whether the viewer is signed in. Controls visibility of the
  /// "tag to my profile" opt-in row.
  isSignedIn: boolean;
}

/**
 * Public Salary-Compass submission form. Wraps the `submitSalary`
 * server action in a useActionState boundary so a rate-limit hit,
 * cookie-quota trip, or schema rejection no longer wipes the
 * user's typing — they see the exact field that broke and keep
 * everything else they filled in.
 */
export function SubmitSalaryForm({ evDomains, isSignedIn }: Props) {
  const [state, formAction] = useActionState(submitSalary, emptyFormState);
  const v = state.prevValues ?? {};
  const e = state.fieldErrors ?? {};

  return (
    <>
      {state.message && !state.ok && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-emce-red bg-emce-red-light p-3 text-sm text-emce-red-deep"
        >
          ⚠️ {state.message}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {/* Honeypot — bots fill, humans don't. submitSalary silently
            success-redirects on a trigger so bots don't get a useful
            signal back. */}
        <div aria-hidden className="sr-only" style={{ position: "absolute", left: "-10000px" }}>
          <label>
            Website (leave blank)
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        <div>
          <Label htmlFor="companyName">Company *</Label>
          <Input
            id="companyName"
            name="companyName"
            required
            minLength={2}
            maxLength={120}
            defaultValue={v.companyName ?? ""}
            placeholder="e.g. Ola Electric"
            aria-invalid={!!e.companyName}
          />
          <FieldError error={e.companyName} />
          <p className="mt-1 text-hint text-emce-text-muted">
            Spell it like you&apos;d write it on LinkedIn — we group identical names automatically.
          </p>
        </div>
        <div>
          <Label htmlFor="jobTitle">Job title *</Label>
          <Input
            id="jobTitle"
            name="jobTitle"
            required
            maxLength={120}
            defaultValue={v.jobTitle ?? ""}
            placeholder="e.g. Senior Battery Engineer"
            aria-invalid={!!e.jobTitle}
          />
          <FieldError error={e.jobTitle} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="profileMode">Career stage</Label>
            <NativeSelect
              id="profileMode"
              name="profileMode"
              defaultValue={v.profileMode ?? "EXPERIENCED"}
            >
              <option value="FRESHER">Fresher (0-1 yrs)</option>
              <option value="EXPERIENCED">Experienced</option>
              <option value="LEADERSHIP">Leadership</option>
              <option value="TECHNICIAN">Technician</option>
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="yearsExp">Years of experience *</Label>
            <Input
              id="yearsExp"
              name="yearsExp"
              type="number"
              min="0"
              max="40"
              required
              defaultValue={v.yearsExp ?? ""}
              aria-invalid={!!e.yearsExp}
            />
            <FieldError error={e.yearsExp} />
          </div>
        </div>

        <div>
          <Label htmlFor="evDomainId">EV domain</Label>
          <NativeSelect
            id="evDomainId"
            name="evDomainId"
            defaultValue={v.evDomainId ?? ""}
          >
            <option value="">— pick one —</option>
            {evDomains.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </NativeSelect>
        </div>

        <div>
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            name="location"
            maxLength={80}
            defaultValue={v.location ?? ""}
            placeholder="e.g. Bengaluru"
          />
        </div>

        <div>
          <Label htmlFor="ctcLakhs">Total CTC per year (in ₹ lakhs) *</Label>
          <Input
            id="ctcLakhs"
            name="ctcLakhs"
            type="number"
            step="0.5"
            min="1"
            max="2000"
            required
            defaultValue={v.ctcLakhs ?? ""}
            placeholder="e.g. 18.5"
            aria-invalid={!!e.ctcLakhs}
          />
          <FieldError error={e.ctcLakhs} />
          <p className="mt-1 text-hint text-emce-text-muted">
            Total compensation across base, bonus, and ESOP value. Per-component split below is optional.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="baseLakhs">Base (₹L)</Label>
            <Input
              id="baseLakhs"
              name="baseLakhs"
              type="number"
              step="0.5"
              min="0"
              defaultValue={v.baseLakhs ?? ""}
              aria-invalid={!!e.baseLakhs}
            />
            <FieldError error={e.baseLakhs} />
          </div>
          <div>
            <Label htmlFor="bonusLakhs">Bonus (₹L)</Label>
            <Input
              id="bonusLakhs"
              name="bonusLakhs"
              type="number"
              step="0.5"
              min="0"
              defaultValue={v.bonusLakhs ?? ""}
              aria-invalid={!!e.bonusLakhs}
            />
            <FieldError error={e.bonusLakhs} />
          </div>
          <div>
            <Label htmlFor="esopLakhs">ESOP (₹L)</Label>
            <Input
              id="esopLakhs"
              name="esopLakhs"
              type="number"
              step="0.5"
              min="0"
              defaultValue={v.esopLakhs ?? ""}
              aria-invalid={!!e.esopLakhs}
            />
            <FieldError error={e.esopLakhs} />
          </div>
        </div>

        {isSignedIn && (
          <label className="flex items-start gap-2 rounded-md bg-emce-light-soft p-3 text-sm">
            <input
              type="checkbox"
              name="attributeToProfile"
              value="true"
              defaultChecked={v.attributeToProfile === "true"}
              className="mt-0.5 h-4 w-4 accent-emce-mid"
            />
            <span>
              <strong className="text-emce-text">Tag this to my profile (optional)</strong>
              <span className="block text-hint text-emce-text-sec">
                Default is fully anonymous. Tagging helps you remember what you submitted; only admins ever see the link.
              </span>
            </span>
          </label>
        )}

        <Button type="submit" size="lg" className="w-full">
          Submit anonymously & unlock →
        </Button>
        <p className="text-center text-hint text-emce-text-muted">
          We never see your name, email, or employer unless you opt in. One submission per browser per day.
        </p>
      </form>
    </>
  );
}
