"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  uploadDriveBanner,
  uploadDriveHero,
} from "@/server/recruitment-drives/actions";

/**
 * Combined uploader for the two fair images. Two distinct slots:
 *
 *   • Banner — 3:1 thumbnail used in /fairs cards. Auto-cropped
 *     to 1500×500 server-side.
 *   • Hero — 16:9 full-bleed background on the fair landing.
 *     Auto-cropped to 1920×1080 server-side.
 *
 * Both reuse the same client pattern: native form submit, server
 * action handles validation + sharp resize + S3 PUT, returns the
 * new URL which we pop into the local preview with a cachebuster
 * query so the live preview reflects the upload immediately.
 *
 * Intentionally minimal — admin uploads happen rarely (once per
 * fair) and the auto-crop handles the framing automatically. A
 * proper crop UI is overkill until we run the first fair and learn
 * what admins actually want to control.
 */
export function FairImageUploader({
  driveId,
  bannerUrl,
  heroUrl,
}: {
  driveId: string;
  bannerUrl: string | null;
  heroUrl: string | null;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <UploadSlot
        driveId={driveId}
        currentUrl={bannerUrl}
        action={uploadDriveBanner}
        label="Banner image"
        helper="3:1 thumbnail used on the /fairs list. Auto-cropped centre to 1500×500."
        previewClass="aspect-[3/1]"
      />
      <UploadSlot
        driveId={driveId}
        currentUrl={heroUrl}
        action={uploadDriveHero}
        label="Hero image"
        helper="16:9 full-bleed background on the fair landing. Auto-cropped to 1920×1080."
        previewClass="aspect-[16/9]"
      />
    </div>
  );
}

function UploadSlot({
  driveId,
  currentUrl,
  action,
  label,
  helper,
  previewClass,
}: {
  driveId: string;
  currentUrl: string | null;
  action: (formData: FormData) => Promise<{ ok: boolean; message?: string; url?: string }>;
  label: string;
  helper: string;
  previewClass: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentUrl);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
        {label}
      </p>
      <div
        className={`mt-1 ${previewClass} w-full overflow-hidden rounded-md border border-emce-border bg-emce-light-soft`}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-hint text-emce-text-muted">
            No image — upload to render
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
              setPreviewUrl(`${r.url}?t=${Date.now()}`);
            } else {
              setError(r.message ?? "Couldn't upload that image.");
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
        {/* Previous version wrapped the <Button> inside a <label>
            with a sibling hidden file input. That pattern is broken:
            the <Button> renders as a real <button> element, and
            clicks on a <button> inside a <label> do NOT propagate
            to a sibling file input (browsers intentionally suppress
            the proxy to avoid double-firing). The file picker never
            opened.

            The fix is to skip the <label>-proxy trick and call
            `fileRef.current?.click()` directly from the button's
            onClick. Same behaviour, works in every browser. */}
        <input
          ref={fileRef}
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          disabled={busy}
          onChange={() => formRef.current?.requestSubmit()}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Uploading…" : currentUrl ? "Replace" : "Upload"}
        </Button>
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
