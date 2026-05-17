"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { importDriveRoster } from "@/server/recruitment-drives/registrations";

/**
 * Admin-side roster CSV uploader. Client-rendered so the user can
 * either drop a .csv file (we read it into the textarea client-
 * side) OR paste CSV text directly. Either way the server action
 * receives `csvText` as a plain string — we keep the upload path
 * stateless (no S3 round-trip) since rosters are typically <2MB.
 *
 * Preview row count + first-3-rows preview lands inline so the
 * admin can sanity-check the column names before committing the
 * import. We deliberately don't parse strictly here — the server
 * action's papaparse + Zod validation is the source of truth; the
 * client preview is a confidence builder.
 */
export function RosterUploadForm({ driveId }: { driveId: string }) {
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      alert("CSV must be under 2MB. Split larger rosters into batches.");
      return;
    }
    file.text().then((text) => {
      setCsvText(text);
      setFileName(file.name);
    });
  }

  // Quick preview: row count (header excluded) + first 3 data rows.
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headerLine = lines[0] ?? "";
  const dataRows = lines.slice(1);
  const previewRows = dataRows.slice(0, 3);

  return (
    <Card className="p-5">
      <form action={importDriveRoster} className="space-y-3">
        <input type="hidden" name="driveId" value={driveId} />
        <div>
          <Label htmlFor="roster-file">Upload roster CSV</Label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              id="roster-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-emce-light-soft file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-emce-dark hover:file:bg-emce-mid/40"
            />
            {fileName && (
              <span className="text-hint text-emce-text-sec">
                {fileName} · {dataRows.length} rows
              </span>
            )}
          </div>
          <p className="mt-1 text-hint text-emce-text-muted">
            Required column: <code>email</code>. Optional:{" "}
            <code>fullName</code> / <code>name</code>. Headers are case-
            insensitive.
          </p>
        </div>

        <div>
          <Label htmlFor="roster-text">…or paste CSV text directly</Label>
          <Textarea
            id="roster-text"
            name="csvText"
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setFileName(null);
            }}
            rows={6}
            maxLength={2 * 1024 * 1024}
            placeholder={`email,fullName\nanita@iit-roorkee.ac.in,Anita Verma\nrohit@vit.ac.in,Rohit Kumar`}
            className="font-mono text-xs"
          />
        </div>

        {previewRows.length > 0 && (
          <details className="rounded-md border border-emce-border bg-emce-light-soft/30 p-3">
            <summary className="cursor-pointer text-hint font-bold text-emce-text-sec">
              Preview — header + first {previewRows.length} rows
            </summary>
            <pre className="mt-2 overflow-x-auto text-[11px] text-emce-text-sec">
{headerLine}
{previewRows.join("\n")}
            </pre>
          </details>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emce-border pt-3">
          <p className="text-hint text-emce-text-muted">
            Existing-account rows register instantly. Rows with no
            account land in the error report — invite those candidates
            to sign up, then re-import.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCsvText("");
                setFileName(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              Clear
            </Button>
            <SubmitButton size="sm" pendingLabel="Importing…" disabled={dataRows.length === 0}>
              Import {dataRows.length} row{dataRows.length === 1 ? "" : "s"}
            </SubmitButton>
          </div>
        </div>
      </form>
    </Card>
  );
}
