"use client";

import { useRef, useState } from "react";
import { uploadTeamLogo } from "@/server/competitions/team-actions";

/**
 * Captain-only logo uploader. Mirrors AvatarUploader's pattern —
 * direct multipart submission, no presign dance. Server-side sharp
 * pipeline does the actual auto-cropping (centre-cover to 512×512
 * WebP), so this component is intentionally minimal: pick a file,
 * see preview update once the server returns the new URL.
 *
 * On error, surface the server message inline. We don't pull in a
 * toast lib here — a small inline error keeps the dashboard quiet
 * for the happy path while still being honest on failure.
 */
export function TeamLogoUploader({
  teamId,
  currentUrl,
  teamName,
}: {
  teamId: string;
  currentUrl: string | null;
  teamName: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentUrl);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        setBusy(true);
        setError(null);
        try {
          const r = await uploadTeamLogo(fd);
          if (r.ok && r.url) {
            // Bust the browser's image cache — the URL stays the
            // same after re-upload (key is keyed on team id), so we
            // append a cachebuster timestamp for the live preview.
            setPreviewUrl(`${r.url}?t=${Date.now()}`);
          } else {
            setError(r.message ?? "Couldn't upload that image.");
          }
        } finally {
          setBusy(false);
        }
      }}
      encType="multipart/form-data"
      className="flex items-start gap-4"
    >
      <input type="hidden" name="teamId" value={teamId} />
      {/* Square preview — the auto-cropped output is square so this
          mirrors what the public team page will render. Falls back
          to the team's first letter on a soft background. */}
      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-md border border-emce-border bg-emce-light-soft">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`${teamName} logo`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-2xl font-extrabold text-emce-dark">
            {teamName[0]?.toUpperCase() ?? "T"}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <label className="inline-block cursor-pointer rounded-md border border-emce-border bg-white px-3 py-1.5 text-hint font-bold text-emce-dark hover:bg-emce-light-soft">
          {busy ? "Uploading…" : currentUrl ? "Replace logo" : "Upload logo"}
          <input
            type="file"
            name="logo"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            disabled={busy}
            onChange={() => formRef.current?.requestSubmit()}
          />
        </label>
        <p className="mt-1 text-hint text-emce-text-muted">
          JPEG, PNG, WebP, or GIF up to 5 MB. We auto-crop to a 512×512
          square — upload a square image for best results.
        </p>
        {error && (
          <p role="alert" className="mt-1 text-hint text-emce-red-deep">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
