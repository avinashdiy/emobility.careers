"use client";

import { useFormStatus } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Loosely-typed view of the stored resume parse draft. */
export interface ReviewDraft {
  firstName?: string | null;
  lastName?: string | null;
  headline?: string | null;
  location?: string | null;
  phone?: string | null;
  summary?: string | null;
  skills?: string[];
  experiences?: Array<{ title?: string | null; company?: string | null; startDate?: string | null; endDate?: string | null; current?: boolean }>;
  education?: Array<{ institution?: string | null; degree?: string | null; field?: string | null; startYear?: number | null; endYear?: number | null }>;
  certifications?: Array<{ name?: string | null; issuer?: string | null }>;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  // Wrapping the control inside <label> gives an implicit programmatic
  // association (no id/htmlFor plumbing needed).
  return (
    <label className="block">
      <span className="text-hint font-bold text-emce-text-sec">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "mt-1 w-full rounded-md border border-emce-border p-2.5 text-sm";

export function CvReviewForm({
  draft,
  next,
  action,
  heading = "Check your details",
  subheading = "We pulled these from your CV. Fix anything that looks off, then continue — you can refine your full profile later.",
  submitLabel = "Looks good — continue to roles →",
}: {
  draft: ReviewDraft;
  next: string | null;
  action: (formData: FormData) => void | Promise<void>;
  heading?: string;
  subheading?: string;
  submitLabel?: string;
}) {
  const exp = draft.experiences ?? [];
  const edu = draft.education ?? [];
  const certs = draft.certifications ?? [];

  return (
    <form action={action} className="mt-4 space-y-4 pb-8">
      {next && <input type="hidden" name="next" value={next} />}

      <Card className="p-5">
        <p className="text-section text-emce-text">{heading}</p>
        <p className="mt-1 text-sm text-emce-text-sec">{subheading}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Labeled label="First name">
            <input name="firstName" defaultValue={draft.firstName ?? ""} maxLength={80} className={inputCls} />
          </Labeled>
          <Labeled label="Last name">
            <input name="lastName" defaultValue={draft.lastName ?? ""} maxLength={80} className={inputCls} />
          </Labeled>
        </div>

        <div className="mt-3">
          <Labeled label="Headline">
            <input name="headline" defaultValue={draft.headline ?? ""} maxLength={140} placeholder="e.g. EV Battery Engineer · B.Tech Mechanical · Pune" className={inputCls} />
          </Labeled>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Labeled label="Current city">
            <input name="location" defaultValue={draft.location ?? ""} maxLength={120} placeholder="e.g. Pune, Maharashtra" className={inputCls} />
          </Labeled>
          <Labeled label="Phone">
            <input name="phone" defaultValue={draft.phone ?? ""} maxLength={40} className={inputCls} />
          </Labeled>
        </div>

        <div className="mt-3">
          <Labeled label="Summary">
            <textarea name="summary" defaultValue={draft.summary ?? ""} maxLength={2000} rows={3} className={inputCls} />
          </Labeled>
        </div>

        <div className="mt-3">
          <Labeled label="Skills (comma-separated — these drive your role matches)">
            <textarea name="skills" defaultValue={(draft.skills ?? []).join(", ")} maxLength={2000} rows={2} placeholder="e.g. Battery Management, CAN, Embedded C, Diagnostics" className={inputCls} />
          </Labeled>
        </div>
      </Card>

      {(exp.length > 0 || edu.length > 0 || certs.length > 0) && (
        <Card className="p-5">
          <p className="text-section text-emce-text">Also captured from your CV</p>
          <p className="mt-1 text-hint text-emce-text-sec">
            These are saved as-is. You can edit them in detail from your profile after the test.
          </p>

          {exp.length > 0 && (
            <div className="mt-3">
              <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">Experience</p>
              <ul className="mt-1.5 space-y-1.5">
                {exp.slice(0, 8).map((e, i) => (
                  <li key={i} className="text-sm text-emce-text">
                    <span className="font-semibold">{e.title || "Role"}</span>
                    {e.company ? <span className="text-emce-text-sec"> · {e.company}</span> : null}
                    {(e.startDate || e.endDate || e.current) && (
                      <span className="text-emce-text-muted"> ({e.startDate ?? "?"} – {e.current ? "present" : e.endDate ?? "?"})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {edu.length > 0 && (
            <div className="mt-3">
              <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">Education</p>
              <ul className="mt-1.5 space-y-1.5">
                {edu.slice(0, 6).map((e, i) => (
                  <li key={i} className="text-sm text-emce-text">
                    <span className="font-semibold">{[e.degree, e.field].filter(Boolean).join(", ") || "Programme"}</span>
                    {e.institution ? <span className="text-emce-text-sec"> · {e.institution}</span> : null}
                    {(e.startYear || e.endYear) && <span className="text-emce-text-muted"> ({e.startYear ?? "?"}–{e.endYear ?? "?"})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {certs.length > 0 && (
            <div className="mt-3">
              <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">Certifications</p>
              <ul className="mt-1.5 space-y-1">
                {certs.slice(0, 6).map((c, i) => (
                  <li key={i} className="text-sm text-emce-text">
                    <span className="font-semibold">{c.name || "Certificate"}</span>
                    {c.issuer ? <span className="text-emce-text-sec"> · {c.issuer}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} />
        <span className="text-hint text-emce-text-muted">Nothing is shared until you continue.</span>
      </div>
    </form>
  );
}
