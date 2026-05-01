"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import {
  submitCompanyClaim,
  type SubmitClaimResult,
} from "@/server/companies/claim-actions";
import { emptyFormState } from "@/lib/form-state";

const initial: SubmitClaimResult = emptyFormState;

/**
 * Public-facing form a user fills to claim membership at a company
 * already in our database. Mirrors the LinkedIn "I work here" flow
 * but with admin review (no auto-approve).
 *
 * Three pieces of proof requested:
 *   • Work email (optional, strongly encouraged) — when its domain
 *     matches the company's registered emailDomains, admin sees a
 *     green check on the review queue + can fast-path approve.
 *   • LinkedIn URL (optional) — admin reads it to corroborate role
 *     + tenure.
 *   • Free-text proof (required, 20–2000 chars) — "I'm Senior
 *     Battery Engineer reporting to Anita, my LinkedIn shows 3 years
 *     here." Admin reads this first.
 *
 * The form re-submits cleanly: an existing PENDING claim updates in
 * place, an existing REJECTED claim flips back to PENDING with a
 * fresh proof. The existing-state notice (if any) is rendered by
 * the parent page and passed in as `existingStatus`.
 */
export function CompanyClaimForm({
  companyId,
  companySlug,
  companyName,
  existingStatus,
  existingProofText,
  existingDesignation,
  existingDesiredRole,
  existingWorkEmail,
  existingLinkedinUrl,
  reviewerNote,
}: {
  companyId: string;
  companySlug: string;
  companyName: string;
  existingStatus?: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN" | null;
  existingProofText?: string;
  existingDesignation?: string | null;
  existingDesiredRole?: string | null;
  existingWorkEmail?: string | null;
  existingLinkedinUrl?: string | null;
  reviewerNote?: string | null;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    async (prev: SubmitClaimResult, fd: FormData) => {
      const r = await submitCompanyClaim(prev, fd);
      // Stay on this page on success — the success card replaces the
      // form. router.refresh re-fetches the server-side existingStatus
      // so a re-submit cycle works without a hard reload.
      if (r.ok) router.refresh();
      return r;
    },
    initial,
  );

  // Once the submit succeeds (or there's an existing PENDING / APPROVED),
  // show the status card instead of the form.
  if (state.ok || existingStatus === "PENDING" || existingStatus === "APPROVED") {
    return <ClaimStatusCard companyName={companyName} status={state.ok ? "PENDING" : existingStatus!} companySlug={companySlug} />;
  }

  return (
    <Card className="p-6">
      <h2 className="text-section text-emce-text">Claim {companyName}</h2>
      <p className="mt-1 text-hint text-emce-text-sec">
        Fill this in if you actually work at {companyName}. An admin
        reviews each claim within 1–3 business days. Admin grants you
        recruiter access on approval — until then you can&apos;t post
        jobs as the company.
      </p>

      {existingStatus === "REJECTED" && reviewerNote && (
        <Alert variant="warning" className="mt-4" title="Previous claim was rejected">
          <p>Admin&apos;s note: {reviewerNote}</p>
          <p className="mt-1 text-hint">
            Update the proof below and re-submit — re-submissions go
            back into the queue with a fresh review.
          </p>
        </Alert>
      )}
      {existingStatus === "WITHDRAWN" && (
        <Alert variant="info" className="mt-4">
          You withdrew an earlier claim. Re-submit any time below.
        </Alert>
      )}

      {!state.ok && state.message && (
        <Alert variant="danger" className="mt-4">
          {state.message}
        </Alert>
      )}

      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="companyId" value={companyId} />

        <div>
          <Label htmlFor="workEmail" optional>
            Your work email at {companyName}
          </Label>
          <Input
            id="workEmail"
            name="workEmail"
            type="email"
            defaultValue={existingWorkEmail ?? ""}
            placeholder={`you@${companyName.toLowerCase().replace(/\s+/g, "")}.com`}
            autoComplete="email"
          />
          <p className="mt-1 text-hint text-emce-text-muted">
            When your domain matches the one on file, admin can fast-path
            your approval. Optional — the proof field below is what
            admins read first.
          </p>
        </div>

        <div>
          <Label htmlFor="linkedinUrl" optional>
            Your LinkedIn profile
          </Label>
          <Input
            id="linkedinUrl"
            name="linkedinUrl"
            type="url"
            defaultValue={existingLinkedinUrl ?? ""}
            placeholder="https://www.linkedin.com/in/your-handle"
          />
        </div>

        <div>
          <Label htmlFor="designation" optional>
            Your job title at {companyName}
          </Label>
          <Input
            id="designation"
            name="designation"
            defaultValue={existingDesignation ?? ""}
            maxLength={120}
            placeholder="Senior Battery Engineer"
          />
        </div>

        <div>
          <Label htmlFor="desiredRole">
            What level of access are you asking for?
          </Label>
          <NativeSelect
            id="desiredRole"
            name="desiredRole"
            defaultValue={existingDesiredRole ?? "RECRUITER"}
          >
            <option value="VIEWER">View-only — see ATS, no edits</option>
            <option value="RECRUITER">Recruiter — post jobs, manage applicants</option>
            <option value="ADMIN">Admin — invite teammates + everything above</option>
          </NativeSelect>
          <p className="mt-1 text-hint text-emce-text-muted">
            Admins are sparing with the Admin role — you&apos;ll usually
            be approved as Recruiter regardless of what you pick. The
            existing company admin can promote you later.
          </p>
        </div>

        <div>
          <Label htmlFor="proofText" required>
            Tell us how to verify you
          </Label>
          <Textarea
            id="proofText"
            name="proofText"
            rows={5}
            required
            minLength={20}
            maxLength={2000}
            defaultValue={existingProofText ?? ""}
            placeholder={`I'm Senior Battery Engineer at ${companyName}, reporting to Anita Sharma. I joined in March 2024. My LinkedIn shows the role + my work email is on the company domain.`}
          />
          <p className="mt-1 text-hint text-emce-text-muted">
            20–2000 characters. The richer the detail (manager, tenure,
            team, project) the faster admin can decide.
          </p>
        </div>

        <SubmitButton pendingLabel="Submitting…">
          Submit claim for review
        </SubmitButton>
      </form>
    </Card>
  );
}

function ClaimStatusCard({
  companyName,
  status,
  companySlug,
}: {
  companyName: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  companySlug: string;
}) {
  if (status === "APPROVED") {
    return (
      <Card className="p-6">
        <h2 className="text-section text-emce-text">
          ✓ You&apos;re on the {companyName} team
        </h2>
        <p className="mt-1 text-hint text-emce-text-sec">
          Your claim was approved. Visit{" "}
          <a href="/employer" className="font-bold text-emce-dark hover:underline">
            /employer
          </a>{" "}
          to manage jobs and team members.
        </p>
      </Card>
    );
  }
  return (
    <Card className="p-6">
      <h2 className="text-section text-emce-text">
        Claim under review · {companyName}
      </h2>
      <p className="mt-2 text-hint text-emce-text-sec">
        Admin reviews claims within 1–3 business days. We&apos;ll email
        you the moment it&apos;s decided. You can withdraw the claim
        from <a href="/me/account" className="font-bold text-emce-dark hover:underline">/me/account</a>{" "}
        if your situation changes.
      </p>
      <p className="mt-3 text-hint text-emce-text-muted">
        Meanwhile, browse the company page →{" "}
        <a href={`/company/${companySlug}`} className="font-bold text-emce-dark hover:underline">
          /company/{companySlug}
        </a>
      </p>
    </Card>
  );
}
