"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { GraduationCap, CheckCircle2, AlertCircle } from "lucide-react";
import { claimDIYguruVerification } from "@/server/diyguru/actions";

/**
 * Self-claim panel for the DIYguru Verified badge. Shown only when the
 * signed-in candidate is NOT already verified.
 *
 * Why this exists: the admin CSV import auto-verifies users who *exist
 * at import time*. Anyone who signs up later is invisible to that one
 * pass. This card lets the candidate trigger the lookup themselves —
 * server checks the roster against their already-verified email and
 * either flips the badge on or returns a soft "no match" message.
 *
 * No PII or roster contents are leaked back to the user — the response
 * is binary (eligible / not eligible). On success, the page refreshes
 * so the badge appears in the header strip + completeness card.
 */
export function DIYguruClaimCard({ verifiedEmail }: { verifiedEmail: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  function handleClaim() {
    setResult(null);
    startTransition(async () => {
      const r = await claimDIYguruVerification();
      setResult(r);
      if (r.ok) {
        // Re-render the parent so the new badge shows + completeness recalcs.
        router.refresh();
      }
    });
  }

  // Hide entirely once a successful claim has been processed — the
  // page refresh will replace this card with the verified badge in
  // the header. We keep showing it until refresh completes.
  return (
    <Card className="mb-6 border-emce-mid/40 bg-emce-light-soft/40 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emce-mid/10 text-emce-darkest">
          <GraduationCap className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-section text-emce-text">DIYguru graduate?</h3>
            <Badge variant="outline">Free badge</Badge>
          </div>
          <p className="mt-1 text-sm text-emce-text-sec">
            We'll cross-check <strong className="font-bold text-emce-text">{verifiedEmail}</strong>{" "}
            against the latest DIYguru roster. If you're listed, your profile
            instantly gets the <span className="font-bold text-emce-darkest">⭐ DIYguru Verified</span>{" "}
            badge — recruiters see it across the platform and on every
            application you submit.
          </p>
          {result && (
            <div
              role="status"
              aria-live="polite"
              className={`mt-3 flex items-start gap-2 rounded-md p-3 text-sm ${
                result.ok
                  ? "bg-emce-mid/10 text-emce-darkest"
                  : "bg-emce-red-light text-emce-red"
              }`}
            >
              {result.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              <span>{result.message}</span>
            </div>
          )}
          <div className="mt-3">
            <Button type="button" onClick={handleClaim} disabled={pending} size="sm">
              {pending ? "Checking…" : "Check my eligibility"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
