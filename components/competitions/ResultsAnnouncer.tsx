"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { announceResults } from "@/server/competitions/actions";

export function ResultsAnnouncer({ competitionId }: { competitionId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="accent"
      disabled={pending}
      onClick={() => {
        if (!confirm("Announce results? This locks ranks and triggers any recruitment perks.")) return;
        startTransition(async () => {
          const r = await announceResults(competitionId);
          r.ok ? toast.success(r.message ?? "Announced.") : toast.error(r.message ?? "Failed.");
        });
      }}
    >Announce results</Button>
  );
}
