"use client";

import { useRef, useState } from "react";
import { uploadBanner, removeBanner } from "@/server/candidates/actions";

/**
 * Cover-photo file picker for the candidate profile editor. Renders
 * as a small overlay row on the banner area in /me/profile — gives
 * the candidate "Change cover" + "Remove" buttons that pin to the
 * top-right of the banner like LinkedIn's pencil icon.
 *
 * Pure progressive-enhancement: the file input is a `<form>` that
 * submits server-side via `uploadBanner`; same pattern as
 * AvatarUploader. No client-side image processing — the server
 * MIME-validates and magic-byte-sniffs every upload.
 */
export function BannerUploader({ hasBanner }: { hasBanner: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);

  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
      <form
        ref={formRef}
        action={async (fd) => {
          setBusy("upload");
          try {
            await uploadBanner(fd);
          } finally {
            setBusy(null);
          }
        }}
        encType="multipart/form-data"
      >
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-emce-darkest shadow-sm backdrop-blur transition hover:bg-white">
          {busy === "upload" ? "Uploading…" : hasBanner ? "Change cover" : "Add cover photo"}
          <input
            type="file"
            name="banner"
            accept="image/*"
            className="sr-only"
            onChange={() => formRef.current?.requestSubmit()}
            disabled={busy !== null}
          />
        </label>
      </form>
      {hasBanner && (
        <form
          action={async () => {
            setBusy("remove");
            try {
              await removeBanner();
            } finally {
              setBusy(null);
            }
          }}
        >
          <button
            type="submit"
            disabled={busy !== null}
            className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-emce-text-sec shadow-sm backdrop-blur transition hover:bg-white hover:text-emce-red-deep disabled:opacity-60"
          >
            {busy === "remove" ? "Removing…" : "Remove"}
          </button>
        </form>
      )}
    </div>
  );
}
