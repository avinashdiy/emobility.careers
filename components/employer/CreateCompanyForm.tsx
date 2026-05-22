"use client";

import { useActionState } from "react";
import type { Country } from "@prisma/client";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { FieldError } from "@/components/ui/field-error";
import { SUPPORTED_COUNTRY_LIST } from "@/lib/countries";
import {
  createCompany,
  type CreateCompanyFormState,
} from "@/server/employer/actions";

const INITIAL: CreateCompanyFormState = { ok: false };

interface Props {
  /// Pre-fill the company name when the admin arrived via
  /// /employer/onboarding?create=1&name=X. Falls through to
  /// state.prevValues if a validation failure round-trips.
  initialName?: string;
  /**
   * Pre-fill the country dropdown — passed by the onboarding page
   * from the signed-in user's `User.country` (captured at signup).
   * Recruiter can override (they may be setting up a UAE entity
   * while their personal account country is India). The chosen
   * value lands on `Company.hqCountry` and becomes the default for
   * every job this company subsequently posts.
   */
  defaultCountry?: Country;
}

/**
 * Employer-onboarding create-company form. Wraps the existing
 * server action in a useActionState boundary so a validation
 * failure no longer wipes every field — the user keeps their
 * typing AND sees the exact field that broke.
 */
export function CreateCompanyForm({
  initialName = "",
  defaultCountry = "IN",
}: Props) {
  const [state, formAction] = useActionState(createCompany, INITIAL);
  const v = state.prevValues ?? {};
  const e = state.fieldErrors ?? {};
  // Country precedence: user's last typing → caller-supplied default
  // (= signed-in user's country). Always resolves to a real value
  // so the <select> renders a selected option from the start.
  const countryValue =
    (v.hqCountry as string | undefined) ?? defaultCountry;

  return (
    <>
      {state.message && !state.ok && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-emce-red/40 bg-emce-red-light p-3 text-sm text-emce-red-deep"
        >
          {state.message}
        </div>
      )}

      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Company name</Label>
          <Input
            id="name"
            name="name"
            required
            minLength={2}
            maxLength={120}
            defaultValue={v.name ?? initialName}
            aria-invalid={!!e.name}
          />
          <FieldError error={e.name} />
        </div>
        <div>
          <Label htmlFor="companyType">Company type</Label>
          <NativeSelect
            id="companyType"
            name="companyType"
            required
            defaultValue={v.companyType ?? ""}
            aria-invalid={!!e.companyType}
          >
            <option value="">— Pick one —</option>
            <option value="OEM">OEM</option>
            <option value="STARTUP">Startup</option>
            <option value="TIER1">Tier-1 supplier</option>
            <option value="TIER2">Tier-2 supplier</option>
            <option value="BATTERY">Battery manufacturer</option>
            <option value="CHARGING">Charging infrastructure</option>
            <option value="FLEET">Fleet operator</option>
            <option value="CONSULTING">Consulting / services</option>
            <option value="OTHER">Other</option>
          </NativeSelect>
          <FieldError error={e.companyType} />
        </div>
        <div>
          <Label htmlFor="teamSize">Team size</Label>
          <NativeSelect
            id="teamSize"
            name="teamSize"
            defaultValue={v.teamSize ?? "11-50"}
          >
            <option value="1-10">1–10</option>
            <option value="11-50">11–50</option>
            <option value="51-200">51–200</option>
            <option value="201-500">201–500</option>
            <option value="501-1000">501–1000</option>
            <option value="1000+">1000+</option>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="hqLocation">Headquarters</Label>
          <Input
            id="hqLocation"
            name="hqLocation"
            defaultValue={v.hqLocation ?? ""}
            placeholder="e.g. Bengaluru, KA"
          />
        </div>
        {/* HQ country — required. Becomes Company.hqCountry, which
            drives the default country dropdown on every subsequent
            job post + the company's country attribution in the
            employer directory. Pre-filled from the recruiter's
            User.country (signup). They can override here if the
            company is incorporated in a different market than they
            personally signed up from. */}
        <div>
          <Label htmlFor="hqCountry">HQ country</Label>
          <NativeSelect
            id="hqCountry"
            name="hqCountry"
            required
            defaultValue={countryValue}
            aria-invalid={!!e.hqCountry}
          >
            {SUPPORTED_COUNTRY_LIST.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </NativeSelect>
          <FieldError error={e.hqCountry} />
        </div>
        <div>
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            name="website"
            defaultValue={v.website ?? ""}
            placeholder="https://… (auto-prefixed if you type company.com)"
            aria-invalid={!!e.website}
          />
          <FieldError error={e.website} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="description">Tagline (1 line, shown on cards)</Label>
          <Input
            id="description"
            name="description"
            maxLength={280}
            defaultValue={v.description ?? ""}
            aria-invalid={!!e.description}
          />
          <FieldError error={e.description} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="about">About your company</Label>
          <Textarea
            id="about"
            name="about"
            rows={4}
            maxLength={4000}
            defaultValue={v.about ?? ""}
            aria-invalid={!!e.about}
          />
          <FieldError error={e.about} />
        </div>
        <div className="sm:col-span-2 border-t pt-3">
          <Label htmlFor="designation">Your role at the company</Label>
          <Input
            id="designation"
            name="designation"
            required
            defaultValue={v.designation ?? ""}
            placeholder="e.g. Talent Acquisition Lead"
            aria-invalid={!!e.designation}
          />
          <FieldError error={e.designation} />
        </div>

        <div className="sm:col-span-2 flex justify-end pt-2">
          <SubmitButton size="lg" pendingLabel="Creating…">
            Create company →
          </SubmitButton>
        </div>
      </form>
    </>
  );
}
