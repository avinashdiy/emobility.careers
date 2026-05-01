"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { requestDataExport } from "@/server/account/data-export";

/**
 * Client-side trigger for the async data-export flow. Disabling +
 * cooldown messaging is local — the server enforces 3 exports/24h
 * via the PG limiter so a re-click after the toast just gets the
 * friendlier "we already emailed you" response.
 */
export function DataExportButton() {
  const [pending, startTransition] = useTransition();
  const [requestedAt, setRequestedAt] = useState<number | null>(null);

  function go() {
    startTransition(async () => {
      try {
        const r = await requestDataExport();
        if (r.ok) {
          toast.success(r.message);
          setRequestedAt(Date.now());
        } else {
          toast.error(r.message);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[data-export] failed", err);
        toast.error("Couldn't start the export. Try again in a moment.");
      }
    });
  }

  if (requestedAt) {
    return (
      <Button variant="outline" size="sm" disabled className="opacity-70">
        <Download className="mr-1 h-4 w-4" aria-hidden /> Email sent — check your
        inbox
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={go} disabled={pending}>
      <Download className="mr-1 h-4 w-4" aria-hidden />
      {pending ? "Building export…" : "Email me my data"}
    </Button>
  );
}
