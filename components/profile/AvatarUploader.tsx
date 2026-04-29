"use client";

import { useRef, useState } from "react";
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
        } finally {
          setBusy(false);
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
