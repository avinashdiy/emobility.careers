"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { reportJob } from "@/server/moderation/actions";

export function ReportJobButton({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-hint text-emce-text-muted hover:text-emce-red-deep hover:underline"
      >
        Report this job
      </button>
    );
  }

  return (
    <Card className="border-emce-red bg-emce-red-light/40 p-4">
      <div className="flex items-start justify-between">
        <h3 className="text-section text-emce-text">Report this job</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="text-emce-text-muted hover:text-emce-red-deep"
        >
          ✕
        </button>
      </div>
      <form
        action={async (fd) => {
          await reportJob(fd);
          setOpen(false);
        }}
        className="mt-3 space-y-2"
      >
        <input type="hidden" name="jobId" value={jobId} />
        <div>
          <Label htmlFor="reason">Reason</Label>
          <NativeSelect id="reason" name="reason" required defaultValue="">
            <option value="" disabled>
              Select a reason…
            </option>
            <option value="SPAM">Spam / duplicate</option>
            <option value="MISLEADING">Misleading or inaccurate</option>
            <option value="FRAUDULENT">Fraudulent / scam</option>
            <option value="INAPPROPRIATE">Inappropriate content</option>
            <option value="EXPIRED">Already filled / expired</option>
            <option value="OTHER">Other</option>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="details">Details (optional)</Label>
          <Textarea id="details" name="details" rows={3} maxLength={2000} placeholder="Help us investigate." />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton size="sm" variant="destructive" pendingLabel="Submitting…">
            Submit report
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
