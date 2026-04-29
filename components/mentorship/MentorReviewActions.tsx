"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { approveMentorKyc, rejectMentorKyc, recordMentorPayout } from "@/server/mentorship/actions";

export function MentorKycRowActions({ mentorId }: { mentorId: string }) {
  const [pending, startTransition] = useTransition();
  const [rejectMode, setRejectMode] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="accent"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const r = await approveMentorKyc(mentorId);
          r.ok ? toast.success("Approved.") : toast.error(r.message ?? "Failed.");
        })}
      >Approve</Button>
      {!rejectMode ? (
        <Button size="sm" variant="ghost" onClick={() => setRejectMode(true)}>Reject…</Button>
      ) : (
        <div className="flex gap-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason (visible to mentor)"
            className="w-64"
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || !note}
            onClick={() => startTransition(async () => {
              const r = await rejectMentorKyc(mentorId, note);
              r.ok ? toast.success("Rejected.") : toast.error(r.message ?? "Failed.");
              setRejectMode(false);
              setNote("");
            })}
          >Send</Button>
          <Button size="sm" variant="ghost" onClick={() => setRejectMode(false)}>Back</Button>
        </div>
      )}
    </div>
  );
}

export function MentorPayoutForm({ mentorId, owedMinor }: { mentorId: string; owedMinor: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("mentorId", mentorId);
        startTransition(async () => {
          const r = await recordMentorPayout({ ok: false }, fd);
          r.ok ? toast.success(r.message ?? "Recorded.") : toast.error(r.message ?? "Failed.");
        });
      }}
      className="grid gap-2 sm:grid-cols-12"
    >
      <Input name="amountMinor" type="number" min={1} required defaultValue={owedMinor || ""} placeholder="Amount (paise)" className="sm:col-span-3" />
      <Input name="externalRef" required placeholder="UPI / NEFT ref" className="sm:col-span-4" />
      <Input name="notes" placeholder="Notes (optional)" className="sm:col-span-3" />
      <Button type="submit" size="sm" disabled={pending} className="sm:col-span-2">Record payout</Button>
    </form>
  );
}
