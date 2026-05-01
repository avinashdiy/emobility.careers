"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { submitIDVerification, withdrawIDVerification } from "@/server/identity/actions";

/**
 * ID-verification submission form. The user picks a file, sees a
 * preview, and clicks Submit. We post the file directly through the
 * server action (multipart form-data with a single field) — no
 * presigned upload, because the file is small and the action needs
 * to validate + store + transition state in one round trip.
 *
 * If the candidate already has a PENDING request we show a withdraw
 * button instead, so they can cancel and re-submit a better photo.
 */
export function IDVerificationForm({
  status,
}: {
  status: "NONE" | "PENDING" | "VERIFIED" | "REJECTED";
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPicked(file);
    if (file.type.startsWith("image/")) {
      setPreview(URL.createObjectURL(file));
    } else {
      // PDFs — skip the preview, we'll show the file name only.
      setPreview(null);
    }
  }

  function clearPick() {
    setPicked(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleSubmit() {
    if (!picked) {
      toast.error("Please pick a file first.");
      return;
    }
    const fd = new FormData();
    fd.append("idDoc", picked);
    startTransition(async () => {
      const r = await submitIDVerification(fd);
      if (r.ok) {
        toast.success(r.message);
        clearPick();
        router.refresh();
      } else {
        toast.error(r.message);
      }
    });
  }

  function handleWithdraw() {
    startTransition(async () => {
      const r = await withdrawIDVerification();
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else {
        toast.error(r.message);
      }
    });
  }

  if (status === "PENDING") {
    return (
      <div>
        <p className="text-sm text-emce-text-sec">
          Your submission is in the admin queue. To swap it for a different
          file, withdraw and re-submit.
        </p>
        <div className="mt-3">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleWithdraw}>
            {pending ? "Withdrawing…" : "Withdraw submission"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={handlePick}
      />
      {!picked && (
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="mr-1 h-4 w-4" aria-hidden /> Choose file
        </Button>
      )}
      {picked && (
        <div className="space-y-2">
          {preview ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Selected ID preview"
                className="max-h-64 rounded-md border border-emce-border"
              />
              <button
                type="button"
                onClick={clearPick}
                aria-label="Remove selected file"
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-emce-border bg-emce-light-soft p-3 text-sm">
              <span className="font-bold">{picked.name}</span>
              <span className="text-emce-text-sec">
                ({(picked.size / 1024 / 1024).toFixed(1)} MB)
              </span>
              <button
                type="button"
                onClick={clearPick}
                aria-label="Remove selected file"
                className="ml-auto text-emce-text-sec hover:text-emce-text"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
          <Button type="button" disabled={pending} onClick={handleSubmit}>
            {pending ? "Submitting…" : "Submit for review"}
          </Button>
        </div>
      )}
    </div>
  );
}
