"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import {
  adminBulkReclassifyCompanies,
  type BulkCompanyCountryResult,
} from "@/server/admin/actions";

/**
 * Client form for /admin/companies/bulk. Two-step flow:
 *
 *   1. Admin picks a CSV file. We read the text client-side
 *      (no S3 round-trip) and shove it into a hidden `csv` input.
 *   2. Submit → `adminBulkReclassifyCompanies` parses, validates,
 *      applies in a single transaction, returns a per-row result
 *      array.
 *   3. We render the results as a table — color-coded rows so
 *      the admin can spot the few "failed" entries against a
 *      sea of "ok" rows.
 *
 * Why client-side CSV reading (not multipart upload):
 *   • Avoids the multipart form action complexity. The CSVs are
 *     typically ≤ 1000 rows × 3 columns = ~30KB — well under the
 *     1MB form-body cap.
 *   • The pasted-text fallback (we expose a textarea too) covers
 *     the "I edited the CSV in a terminal and just want to paste
 *     it" workflow without a temp-file step.
 *
 * The result table doesn't auto-clear on a second submit — the
 * admin can re-run with a fixed CSV and compare results side-by-
 * side (the table replaces, then re-renders on the next call).
 */

const INITIAL: BulkCompanyCountryResult = { ok: false };

export function BulkReclassifyForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [state, formAction] = useActionState(
    adminBulkReclassifyCompanies,
    INITIAL,
  );

  async function handleFile(file: File) {
    setPreviewName(file.name);
    const text = await file.text();
    if (textareaRef.current) {
      textareaRef.current.value = text;
    }
  }

  return (
    <>
      <Card className="p-5">
        <h2 className="text-section text-emce-text">Upload CSV</h2>
        <p className="mt-1 text-hint text-emce-text-sec">
          Header row required. Columns:{" "}
          <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[11px]">slug</code>
          ,{" "}
          <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[11px]">hqCountry</code>
          {" "}
          (ISO 3166-1 alpha-2),{" "}
          <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[11px]">operatesIn</code>
          {" "}
          (optional, pipe-separated). Cap: 1000 rows / upload.
        </p>

        {/* Worked example so admins don't need to read the docs */}
        <pre className="mt-3 overflow-x-auto rounded-md bg-emce-light-soft p-2 text-[11px] text-emce-text-sec">
{`slug,hqCountry,operatesIn
jaguar-land-rover,GB,IN
tesla,US,GB|AU
bee-ah,AE,
mahindra-electric,IN,US`}
        </pre>

        <form
          ref={formRef}
          action={formAction}
          className="mt-4 space-y-3"
        >
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm file:mr-2 file:rounded-md file:border-0 file:bg-emce-light-soft file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-emce-dark hover:file:bg-emce-light-soft/80"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          {previewName && (
            <p className="text-hint text-emce-text-muted">
              ✓ {previewName} loaded — review below + submit.
            </p>
          )}

          <div>
            <label
              htmlFor="csv-textarea"
              className="block text-[10px] font-bold uppercase tracking-wider text-emce-text-muted"
            >
              Or paste CSV text
            </label>
            <textarea
              ref={textareaRef}
              id="csv-textarea"
              name="csv"
              rows={8}
              className="mt-1 w-full rounded-md border border-emce-border bg-white p-2 font-mono text-xs"
              placeholder="slug,hqCountry,operatesIn"
            />
          </div>

          <SubmitButton pendingLabel="Importing…">
            Apply reclassification →
          </SubmitButton>
        </form>
      </Card>

      {/* Result surface — only renders after a submission. */}
      {state.message && (
        <div className="mt-4">
          <Alert variant={state.ok ? "success" : "danger"}>
            {state.ok ? "✓ " : ""}
            {state.message}
          </Alert>
        </div>
      )}

      {state.rows && state.rows.length > 0 && (
        <Card className="mt-4 overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-emce-light-soft text-left text-xs font-bold uppercase text-emce-text-sec">
              <tr>
                <th className="w-14 p-3">Row</th>
                <th className="p-3">Slug</th>
                <th className="p-3">Status</th>
                <th className="p-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emce-border">
              {state.rows.map((r) => (
                <tr
                  key={r.rowNum}
                  className={
                    r.status === "failed"
                      ? "bg-emce-red-light/40"
                      : r.status === "skipped"
                        ? "bg-emce-light-soft/30"
                        : ""
                  }
                >
                  <td className="p-3 font-mono text-emce-text-muted">{r.rowNum}</td>
                  <td className="p-3 font-mono text-xs">{r.slug}</td>
                  <td className="p-3">
                    <Badge
                      variant={
                        r.status === "ok"
                          ? "success"
                          : r.status === "skipped"
                            ? "outline"
                            : "danger"
                      }
                      size="sm"
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-emce-text-sec">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
