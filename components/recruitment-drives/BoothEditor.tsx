"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateBooth } from "@/server/recruitment-drives/actions";
import { emptyFormState } from "@/lib/form-state";

/**
 * Per-fair booth editor for the recruiter. Two fields:
 *   • Booth label — what shows on the public fair landing
 *     ("Booth 7", "Hall B / Booth 12"). Free-text; admins may
 *     leave blank for virtual fairs.
 *   • About at fair — per-fair pitch ("Hiring 5 battery engineers
 *     at Pune fair — talk to us at Booth 7"). Different from
 *     Company.about, which is the permanent corporate copy.
 */
export function BoothEditor({
  driveId,
  boothLabel,
  aboutAtFair,
}: {
  driveId: string;
  boothLabel: string | null;
  aboutAtFair: string | null;
}) {
  const [state, formAction] = useActionState(updateBooth, emptyFormState);

  return (
    <Card className="p-5">
      <h2 className="text-section text-emce-text">Your booth</h2>
      <p className="mt-1 text-hint text-emce-text-sec">
        Public on the fair page — keep the pitch tight (1–2 lines on what
        you&apos;re hiring for at this fair).
      </p>

      {state.ok && state.message && (
        <div className="mt-3 rounded-md bg-emce-light-soft p-2 text-hint text-emce-darkest">
          ✓ {state.message}
        </div>
      )}
      {!state.ok && state.message && (
        <div role="alert" className="mt-3 rounded-md bg-emce-red-light p-2 text-hint text-emce-red">
          {state.message}
        </div>
      )}

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="driveId" value={driveId} />
        <div>
          <Label htmlFor="boothLabel">Booth label</Label>
          <Input
            id="boothLabel"
            name="boothLabel"
            defaultValue={boothLabel ?? ""}
            maxLength={60}
            placeholder="Booth 7 · Hall B"
          />
        </div>
        <div>
          <Label htmlFor="aboutAtFair">What you&apos;re looking for at this fair</Label>
          <Textarea
            id="aboutAtFair"
            name="aboutAtFair"
            rows={3}
            defaultValue={aboutAtFair ?? ""}
            maxLength={2000}
            placeholder="Hiring 5 battery engineers + 2 cell QA leads. Looking for hands-on experience with Li-ion pack design."
          />
          <p className="mt-1 text-hint text-emce-text-muted">
            Up to 2000 characters. Visible on the public fair page beside your logo.
          </p>
        </div>
        <SubmitButton pendingLabel="Saving…">Save booth</SubmitButton>
      </form>
    </Card>
  );
}
