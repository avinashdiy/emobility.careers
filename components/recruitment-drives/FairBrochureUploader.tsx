"use client";

/**
 * Brochure uploader for a fair — two slots (hiring partners +
 * colleges/TPOs). Same pattern as FairImageUploader but for PDFs:
 * native form submit → server action validates + writes to S3 →
 * returns the URL → live preview updates with a cache-buster.
 *
 * No client-side image-style preview here (no thumbnail for PDFs);
 * we show the filename + "Open / Replace / Remove" controls
 * instead.
 */

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  uploadHiringPartnerBrochure,
  uploadCollegeBrochure,
  removeHiringPartnerBrochure,
  removeCollegeBrochure,
} from "@/server/recruitment-drives/actions";

export function FairBrochureUploader({
  driveId,
  hiringPartnerBrochureUrl,
  collegeBrochureUrl,
}: {
  driveId: string;
  hiringPartnerBrochureUrl: string | null;
  collegeBrochureUrl: string | null;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <BrochureSlot
        driveId={driveId}
        currentUrl={hiringPartnerBrochureUrl}
        action={uploadHiringPartnerBrochure}
        removeAction={removeHiringPartnerBrochure}
        label="Hiring-partner brochure"
        icon="🏢"
        helper="PDF · max 25 MB. Linked from the public fair page for employers / sponsors."
      />
      <BrochureSlot
        driveId={driveId}
        currentUrl={collegeBrochureUrl}
        action={uploadCollegeBrochure}
        removeAction={removeCollegeBrochure}
        label="College / TPO brochure"
        icon="🎓"
        helper="PDF · max 25 MB. Linked from the public fair page for placement officers."
      />
    </div>
  );
}

function BrochureSlot({
  driveId,
  currentUrl,
  action,
  removeAction,
  label,
  icon,
  helper,
}: {
  driveId: string;
  currentUrl: string | null;
  action: (formData: FormData) => Promise<{ ok: boolean; message?: string; url?: string }>;
  removeAction: (formData: FormData) => Promise<{ ok: boolean; message?: string }>;
  label: string;
  icon: string;
  helper: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [currentPdf, setCurrentPdf] = useState(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemove, startRemove] = useTransition();

  // Cache-bust the link so a freshly re-uploaded brochure isn't
  // served from a stale CDN cache. The underlying S3 key is stable
  // on overwrite; only the link query param changes.
  const liveUrl = currentPdf ? `${currentPdf}?t=${Date.now()}` : null;

  return (
    <div>
      <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
        {label}
      </p>
      <div className="mt-1 rounded-md border border-emce-border bg-emce-light-soft p-4">
        {liveUrl ? (
          <div className="flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-emce-text">Brochure uploaded ✓</p>
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-xs font-bold text-emce-dark hover:underline"
              >
                Preview / download →
              </a>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-hint text-emce-text-muted">
            <span className="text-2xl opacity-50">{icon}</span>
            <span>No brochure uploaded yet.</span>
          </div>
        )}
      </div>

      <form
        ref={formRef}
        action={async (fd) => {
          setBusy(true);
          setError(null);
          try {
            const r = await action(fd);
            if (r.ok && r.url) {
              setCurrentPdf(r.url);
            } else {
              setError(r.message ?? "Couldn't upload that brochure.");
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed.");
          } finally {
            setBusy(false);
          }
        }}
        encType="multipart/form-data"
        className="mt-2"
      >
        <input type="hidden" name="driveId" value={driveId} />
        <input
          ref={fileRef}
          type="file"
          name="brochure"
          accept="application/pdf"
          className="sr-only"
          disabled={busy}
          onChange={() => formRef.current?.requestSubmit()}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || pendingRemove}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? "Uploading…" : currentPdf ? "Replace PDF" : "Upload PDF"}
          </Button>
          {currentPdf && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || pendingRemove}
              className="text-emce-orange-deep"
              onClick={() => {
                if (!confirm(`Remove this brochure? The download link on the public fair page will disappear until you upload a new one.`)) return;
                setError(null);
                startRemove(async () => {
                  const fd = new FormData();
                  fd.append("driveId", driveId);
                  const r = await removeAction(fd);
                  if (r.ok) {
                    setCurrentPdf(null);
                  } else {
                    setError(r.message ?? "Couldn't remove brochure.");
                  }
                });
              }}
            >
              {pendingRemove ? "Removing…" : "Remove"}
            </Button>
          )}
        </div>
      </form>
      <p className="mt-1 text-hint text-emce-text-muted">{helper}</p>
      {error && (
        <p role="alert" className="mt-1 text-hint text-emce-red-deep">
          {error}
        </p>
      )}
    </div>
  );
}
