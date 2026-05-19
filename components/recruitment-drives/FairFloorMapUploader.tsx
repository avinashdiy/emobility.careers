"use client";

/**
 * Single-image uploader for the venue floor map. Same UX pattern as
 * the existing FairImageUploader but in a one-slot card (not the
 * two-image grid) because the floor map gets its own admin section
 * + its own public-page placement.
 *
 * Server side: uploadDriveFloorMap runs the file through the shared
 * sharp pipeline → centre-crops to 1600×1200. Admins should pre-crop
 * their venue PDF / image to a roughly 4:3 frame before upload so
 * the labels aren't cut off by the cover-crop.
 */

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { uploadDriveFloorMap, removeDriveFloorMap } from "@/server/recruitment-drives/actions";

export function FairFloorMapUploader({
  driveId,
  floorMapUrl,
}: {
  driveId: string;
  floorMapUrl: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(floorMapUrl);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemove, startRemove] = useTransition();

  return (
    <div>
      <div className="aspect-[4/3] w-full overflow-hidden rounded-md border border-emce-border bg-emce-light-soft">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Venue floor map" className="h-full w-full object-contain" />
        ) : (
          <div className="grid h-full w-full place-items-center text-hint text-emce-text-muted">
            No floor map uploaded yet
          </div>
        )}
      </div>

      <form
        ref={formRef}
        action={async (fd) => {
          setBusy(true);
          setError(null);
          try {
            const r = await uploadDriveFloorMap(fd);
            if (r.ok && r.url) {
              setPreviewUrl(`${r.url}?t=${Date.now()}`);
            } else {
              setError(r.message ?? "Couldn't upload that floor map.");
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed.");
          } finally {
            setBusy(false);
          }
        }}
        encType="multipart/form-data"
        className="mt-3"
      >
        <input type="hidden" name="driveId" value={driveId} />
        <input
          ref={fileRef}
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
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
            {busy ? "Uploading…" : previewUrl ? "Replace floor map" : "Upload floor map"}
          </Button>
          {previewUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || pendingRemove}
              className="text-emce-orange-deep"
              onClick={() => {
                if (!confirm("Remove this floor map? The public page will hide the floor-map section.")) return;
                setError(null);
                startRemove(async () => {
                  const fd = new FormData();
                  fd.append("driveId", driveId);
                  const r = await removeDriveFloorMap(fd);
                  if (r.ok) {
                    setPreviewUrl(null);
                  } else {
                    setError(r.message ?? "Couldn't remove floor map.");
                  }
                });
              }}
            >
              {pendingRemove ? "Removing…" : "Remove"}
            </Button>
          )}
        </div>
      </form>
      <p className="mt-2 text-hint text-emce-text-muted">
        Pre-crop to 4:3 so the labels stay legible. JPEG / PNG / WebP, max 10 MB.
      </p>
      {error && (
        <p role="alert" className="mt-1 text-hint text-emce-red-deep">
          {error}
        </p>
      )}
    </div>
  );
}
