"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { uploadAvatar } from "@/server/candidates/actions";

export function AvatarUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        setBusy(true);
        try {
          await uploadAvatar(fd);
          toast.success("Photo updated.");
        } catch (err) {
          // Server throws `new Error("…")` for every validation case
          // (file too large, wrong type, encode failed, etc.). The
          // message is the only useful payload — surface it directly
          // so the user actually knows why the upload didn't take.
          toast.error(err instanceof Error ? err.message : "Couldn't upload that photo.");
        } finally {
          setBusy(false);
          // Clear the file input so re-picking the same file after a
          // failure actually re-fires onChange.
          if (inputRef.current) inputRef.current.value = "";
        }
      }}
      encType="multipart/form-data"
      className="mt-2"
    >
      <label className="block cursor-pointer text-center text-hint font-bold text-emce-dark hover:underline">
        {busy ? "Uploading…" : "Change photo"}
        <input
          ref={inputRef}
          type="file"
          name="avatar"
          accept="image/*"
          className="sr-only"
          onChange={() => formRef.current?.requestSubmit()}
        />
      </label>
    </form>
  );
}
