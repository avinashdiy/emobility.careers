"use client";

import { useActionState, useEffect, useState } from "react";
import type { Certification } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";
import { saveCertification, deleteCertification } from "@/server/candidates/actions";
import { emptyFormState, type FormState } from "@/lib/form-state";
import { formatMonthYear } from "@/lib/utils";
import { Trash2 } from "lucide-react";

function CertificationForm() {
  const [state, formAction] = useActionState<FormState, FormData>(saveCertification, emptyFormState);
  const e = state.fieldErrors ?? {};
  const v = state.prevValues ?? {};

  const [showOk, setShowOk] = useState(false);
  useEffect(() => {
    if (state.ok && state.message) {
      setShowOk(true);
      const t = setTimeout(() => setShowOk(false), 4000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <>
      {state.ok && showOk && state.message && (
        <Alert variant="success" className="mb-3">✓ {state.message}</Alert>
      )}
      {!state.ok && state.message && (
        <Alert variant="danger" className="mb-3">{state.message}</Alert>
      )}
      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <Label htmlFor="cert-name" required>Name</Label>
          <Input
            id="cert-name"
            name="name"
            required
            maxLength={140}
            defaultValue={v.name ?? ""}
            placeholder="e.g. AIS-156 Battery Safety"
            aria-invalid={!!e.name}
          />
          <FieldError error={e.name} />
        </div>
        <div>
          <Label htmlFor="cert-issuer" optional>Issuer</Label>
          <Input
            id="cert-issuer"
            name="issuer"
            maxLength={120}
            defaultValue={v.issuer ?? ""}
            placeholder="e.g. ARAI"
            aria-invalid={!!e.issuer}
          />
          <FieldError error={e.issuer} />
        </div>
        <div>
          <Label htmlFor="cert-date" optional>Issued</Label>
          <Input
            id="cert-date"
            name="issueDate"
            type="month"
            defaultValue={v.issueDate ?? ""}
            aria-invalid={!!e.issueDate}
          />
          <FieldError error={e.issueDate} />
        </div>
        <div>
          <Label htmlFor="cert-id" optional>Credential ID</Label>
          <Input
            id="cert-id"
            name="credentialId"
            maxLength={120}
            defaultValue={v.credentialId ?? ""}
            aria-invalid={!!e.credentialId}
          />
          <FieldError error={e.credentialId} />
        </div>
        <div>
          <Label htmlFor="cert-url" optional>Credential URL</Label>
          <Input
            id="cert-url"
            name="credentialUrl"
            type="url"
            defaultValue={v.credentialUrl ?? ""}
            placeholder="example.com/credential (https:// auto-added)"
            aria-invalid={!!e.credentialUrl}
          />
          <FieldError error={e.credentialUrl} />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm">Add</Button>
        </div>
      </form>
    </>
  );
}

export function CertificationsEditor({ certifications }: { certifications: Certification[] }) {
  return (
    <Card>
      <h2 className="text-section text-emce-text">Certifications</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        Industry certifications, course completion certificates, professional licences. DIYguru certs are auto-flagged when imported by an admin.
      </p>

      {certifications.length === 0 ? (
        <p className="mb-4 rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
          No certifications yet.
        </p>
      ) : (
        <ul className="mb-6 space-y-3">
          {certifications.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 rounded-md border border-emce-border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-emce-text">{c.name}</span>
                  {c.diyguruVerified && <Badge variant="verified">⭐ Verified</Badge>}
                  {c.isDIYguru && !c.diyguruVerified && <Badge variant="default">DIYguru (pending)</Badge>}
                </div>
                <div className="text-hint text-emce-text-sec">
                  {[c.issuer, c.issueDate ? `Issued ${formatMonthYear(c.issueDate)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {c.credentialUrl && (
                  <a
                    href={c.credentialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-hint font-bold text-emce-dark hover:underline"
                  >
                    Credential →
                  </a>
                )}
              </div>
              <form action={deleteCertification}>
                <input type="hidden" name="id" value={c.id} />
                <ConfirmSubmit
                  confirm={`Delete certification "${c.name}"?`}
                  variant="ghost"
                  size="icon"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-md border border-dashed border-emce-border p-4">
        <summary className="cursor-pointer text-sm font-bold text-emce-dark">
          + Add certification
        </summary>
        <div className="mt-4">
          <CertificationForm />
        </div>
      </details>
    </Card>
  );
}
