"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { uploadFairVideoIntro } from "@/server/recruitment-drives/registrations";

/**
 * 2-min video intro uploader for ONLINE candidates. Live preview of
 * the selected file before upload (HTMLVideoElement with the local
 * File blob URL), plus an inline duration check that warns when the
 * clip is >2 min. Server enforces a 50 MB cap + MIME allowlist.
 *
 * UX intentionally simple — file picker, not in-browser MediaRecorder.
 * Recording in-browser needs polish we don't have time for in Phase 3;
 * candidates record on their phone's native camera + upload the file.
 */
function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function VideoIntroUploader({
  driveSlug,
  hasExistingIntro,
}: {
  driveSlug: string;
  hasExistingIntro: boolean;
}) {
  const [selected, setSelected] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDuration, setPreviewDuration] = useState<number | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, startUploading] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setUploaded(false);
    const f = e.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!f) {
      setSelected(null);
      setPreviewUrl(null);
      setPreviewDuration(null);
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError("Over 50 MB. Trim or compress your clip and try again.");
      setSelected(null);
      setPreviewUrl(null);
      return;
    }
    setSelected(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function onMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
    const v = e.currentTarget;
    if (Number.isFinite(v.duration)) setPreviewDuration(v.duration);
  }

  function submit() {
    if (!selected) return;
    setError(null);
    startUploading(async () => {
      const fd = new FormData();
      fd.append("driveSlug", driveSlug);
      fd.append("video", selected);
      const res = await uploadFairVideoIntro(fd);
      if (res.ok) {
        setUploaded(true);
        // Release the preview blob and clear the input so a second
        // re-upload of the same filename still triggers onChange.
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setSelected(null);
        if (inputRef.current) inputRef.current.value = "";
      } else {
        setError(res.error ?? "Upload failed — try again.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-hint text-emce-text-sec">
        Record a short clip on your phone (under 2 minutes, MP4 / MOV
        / WebM, under 50 MB), then upload it here. Recruiters at this
        fair&apos;s booths can watch it as a non-blocking intro.
        {hasExistingIntro && !uploaded && (
          <>
            {" "}
            <strong className="text-emce-text">
              You already uploaded one
            </strong>{" "}
            — uploading a new file replaces it.
          </>
        )}
      </p>

      <label className="block">
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
          onChange={onPick}
          className="block w-full text-sm text-emce-text-sec file:mr-4 file:rounded-md file:border-0 file:bg-emce-dark file:px-4 file:py-2 file:font-bold file:text-emce-light hover:file:bg-emce-dark-deep"
          disabled={uploading}
        />
      </label>

      {selected && previewUrl && (
        <div className="space-y-2 rounded-md border border-emce-border bg-emce-light-soft/30 p-3">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={previewUrl}
            controls
            className="aspect-video w-full rounded-md bg-black"
            onLoadedMetadata={onMetadata}
            preload="metadata"
          />
          <div className="flex flex-wrap items-center gap-3 text-hint text-emce-text-sec">
            <span>📎 {selected.name}</span>
            <span>{formatBytes(selected.size)}</span>
            {previewDuration !== null && (
              <span
                className={
                  previewDuration > 130
                    ? "font-bold text-emce-red-deep"
                    : "text-emce-text-muted"
                }
              >
                {previewDuration > 130
                  ? `⚠ ${Math.round(previewDuration)}s — over 2 min`
                  : `${Math.round(previewDuration)}s`}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={submit} disabled={uploading} size="sm">
              {uploading ? "Uploading…" : "Upload →"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setSelected(null);
                setPreviewUrl(null);
                setPreviewDuration(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              disabled={uploading}
            >
              Discard
            </Button>
            {error && (
              <p className="text-hint text-emce-red-deep" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {uploaded && (
        <div className="rounded-md border border-emce-mid/40 bg-emce-light-soft/40 p-3">
          <p className="text-sm font-bold text-emce-text">
            ✓ Video uploaded
          </p>
          <p className="mt-1 text-hint text-emce-text-sec">
            Recruiters at this fair will see a &quot;Watch intro&quot;
            link on your applications.
          </p>
        </div>
      )}
    </div>
  );
}
