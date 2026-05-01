"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

/**
 * Captain-transfer form. Renders inside a <details> so it doesn't
 * dominate the dashboard — it's a once-in-a-team action. The
 * confirm() prompt is the safety net since transfer is destructive
 * (the current captain loses captain role; redo requires the new
 * captain's cooperation).
 *
 * The actual mutation is the parent server action `transferCaptaincy`
 * passed in via `action` prop — keeps the component reusable across
 * captain dashboard and admin override surface.
 */
export function TransferCaptaincyForm({
  teamId,
  teamName,
  candidates,
  action,
}: {
  teamId: string;
  teamName: string;
  /// ACCEPTED non-captain members the captaincy can be transferred to.
  candidates: { userId: string; displayName: string; positionTitle: string | null }[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState("");

  if (candidates.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="text-section text-emce-text">Transfer captaincy</h3>
        <p className="mt-1 text-hint text-emce-text-sec">
          No teammates can take over yet — invite at least one accepted member
          first.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <details className="group">
        <summary className="cursor-pointer list-none">
          <h3 className="text-section text-emce-text">
            Transfer captaincy{" "}
            <span className="text-hint font-normal text-emce-text-muted">
              <span className="group-open:hidden">(click to expand)</span>
              <span className="hidden group-open:inline">(collapse)</span>
            </span>
          </h3>
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-hint text-emce-text-sec">
            Hand leadership of <strong>{teamName}</strong> to another accepted
            member. After transfer:
          </p>
          <ul className="list-disc pl-5 text-hint text-emce-text-sec">
            <li>You become a regular MEMBER (kept on the team).</li>
            <li>The new captain can invite, remove, submit, and edit the team profile.</li>
            <li>This is irreversible from your side — only the new captain can transfer back.</li>
          </ul>
          <form
            action={action}
            onSubmit={(e) => {
              const target = candidates.find((c) => c.userId === selected);
              if (!target) {
                e.preventDefault();
                return;
              }
              const ok = window.confirm(
                `Transfer captaincy of "${teamName}" to ${target.displayName}? You'll become a regular member.`,
              );
              if (!ok) e.preventDefault();
            }}
          >
            <input type="hidden" name="teamId" value={teamId} />
            <Label htmlFor="newCaptainUserId">New captain</Label>
            <NativeSelect
              id="newCaptainUserId"
              name="newCaptainUserId"
              required
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Pick a teammate…</option>
              {candidates.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.displayName}
                  {c.positionTitle ? ` — ${c.positionTitle}` : ""}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" variant="ghost" size="sm" className="mt-3" disabled={!selected}>
              Transfer captaincy →
            </Button>
          </form>
        </div>
      </details>
    </Card>
  );
}
