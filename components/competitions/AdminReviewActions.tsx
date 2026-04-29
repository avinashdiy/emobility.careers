"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  approveCompetition,
  requestCompetitionChanges,
  rejectCompetition,
  recordPrizePayout,
} from "@/server/competitions/actions";

export function AdminReviewActions({ competitionId }: { competitionId: string }) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<null | "changes" | "reject">(null);
  const [note, setNote] = useState("");

  return (
    <div className="flex flex-wrap items-start gap-2">
      {!mode && (
        <>
          <Button
            size="sm"
            variant="accent"
            disabled={pending}
            onClick={() => startTransition(async () => {
              const r = await approveCompetition(competitionId);
              r.ok ? toast.success("Approved.") : toast.error(r.message ?? "Failed.");
            })}
          >Approve & publish</Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("changes")}>Request changes…</Button>
          <Button size="sm" variant="destructive" onClick={() => setMode("reject")}>Reject…</Button>
        </>
      )}
      {mode && (
        <div className="flex w-full flex-col gap-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === "changes" ? "What needs changing? (visible to host)" : "Reason for rejection (visible to host)"}
            rows={2}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === "reject" ? "destructive" : "default"}
              disabled={pending || !note.trim()}
              onClick={() => startTransition(async () => {
                const r = mode === "changes"
                  ? await requestCompetitionChanges(competitionId, note)
                  : await rejectCompetition(competitionId, note);
                r.ok
                  ? toast.success(mode === "changes" ? "Changes requested." : "Rejected.")
                  : toast.error(r.message ?? "Failed.");
                setMode(null);
                setNote("");
              })}
            >Send</Button>
            <Button size="sm" variant="ghost" onClick={() => { setMode(null); setNote(""); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PrizePayoutForm({ prizeId, defaultAmount }: { prizeId: string; defaultAmount?: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("prizeId", prizeId);
        startTransition(async () => {
          const r = await recordPrizePayout({ ok: false }, fd);
          r.ok ? toast.success("Recorded.") : toast.error(r.message ?? "Failed.");
        });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <Input name="externalRef" required placeholder="UPI / NEFT ref" className="max-w-[200px]" />
      <Input name="notes" placeholder="Notes (optional)" className="max-w-[260px]" />
      <Button type="submit" size="sm" disabled={pending}>Mark paid</Button>
    </form>
  );
}
