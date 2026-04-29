"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { requestEmailVerification } from "@/server/auth/actions";
import { toast } from "sonner";

export function VerifyEmailBanner({
  email,
  labels,
}: {
  email: string;
  labels?: { title: string; body: string; cta: string };
}) {
  const L = labels ?? {
    title: "Verify your email",
    body: `Verify your email to apply to jobs and post listings. We'll send a link to ${email}.`,
    cta: "Send verification email",
  };
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);

  return (
    <div className="mb-4 flex flex-col items-start justify-between gap-3 rounded-md bg-emce-orange-light p-3 text-sm sm:flex-row sm:items-center">
      <p className="text-[#8a4a1a]">
        <strong>{L.title}</strong> — {L.body}
      </p>
      <Button
        size="sm"
        variant="default"
        disabled={pending || sent}
        onClick={() =>
          start(async () => {
            const r = await requestEmailVerification();
            if (r.ok) {
              toast.success(r.message ?? "Verification email sent.");
              setSent(true);
            } else {
              toast.error(r.message ?? "Could not send verification email.");
            }
          })
        }
      >
        {sent ? "Sent ✓" : pending ? "Sending…" : L.cta}
      </Button>
    </div>
  );
}
