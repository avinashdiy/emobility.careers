"use client";

import { useActionState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { toast } from "sonner";
import { addRecurringAvailability, addDateOverride, removeAvailabilityRule } from "@/server/mentorship/actions";
import { emptyFormState } from "@/lib/form-state";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Rule {
  id: string;
  kind: "RECURRING" | "OVERRIDE" | "BLOCKED";
  dayOfWeek: number | null;
  startMinute: number | null;
  endMinute: number | null;
  startAt: Date | null;
  endAt: Date | null;
}

function minutesToHHMM(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function AvailabilityEditor({ rules }: { rules: Rule[] }) {
  const [recurringState, recurringAction] = useActionState(addRecurringAvailability, emptyFormState);
  const [overrideState, overrideAction] = useActionState(addDateOverride, emptyFormState);
  const [pending, startTransition] = useTransition();

  const recurring = rules.filter((r) => r.kind === "RECURRING");
  const overrides = rules.filter((r) => r.kind === "OVERRIDE");
  const blocked = rules.filter((r) => r.kind === "BLOCKED");

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-section text-emce-text">Weekly recurring hours</h2>
        <p className="text-hint text-emce-text-sec">All times in IST (Asia/Kolkata).</p>
        <form action={recurringAction} className="mt-3 grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-3">
            <Label htmlFor="dayOfWeek">Day</Label>
            <NativeSelect id="dayOfWeek" name="dayOfWeek" defaultValue="1">
              {DAY_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
            </NativeSelect>
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="start">Start (HH:MM, 24h)</Label>
            <Input id="start" name="startMinute" type="number" min={0} max={1440} defaultValue={1080} required />
            <p className="mt-1 text-hint text-emce-text-sec">e.g. 1080 = 18:00</p>
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="end">End</Label>
            <Input id="end" name="endMinute" type="number" min={0} max={1440} defaultValue={1260} required />
            <p className="mt-1 text-hint text-emce-text-sec">e.g. 1260 = 21:00</p>
          </div>
          <div className="sm:col-span-3 flex items-end">
            <SubmitButton className="w-full">Add</SubmitButton>
          </div>
          {recurringState.message && (
            <p className="sm:col-span-12 text-sm text-emce-red">{recurringState.message}</p>
          )}
        </form>

        <ul className="mt-4 divide-y divide-emce-border">
          {recurring.length === 0 && <li className="py-3 text-sm text-emce-text-sec">No recurring hours yet.</li>}
          {recurring.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span><strong>{DAY_NAMES[r.dayOfWeek ?? 0]}</strong> · {minutesToHHMM(r.startMinute ?? 0)} – {minutesToHHMM(r.endMinute ?? 0)} IST</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => startTransition(async () => {
                  const res = await removeAvailabilityRule(r.id);
                  res.ok ? toast.success("Removed.") : toast.error(res.message ?? "Failed.");
                })}
              >Remove</Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-section text-emce-text">Date overrides</h2>
        <p className="text-hint text-emce-text-sec">Add extra hours on a specific date, or block a window you'd otherwise be available.</p>
        <form action={overrideAction} className="mt-3 grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-3">
            <Label htmlFor="kind">Kind</Label>
            <NativeSelect id="kind" name="kind" defaultValue="OVERRIDE">
              <option value="OVERRIDE">Add hours</option>
              <option value="BLOCKED">Block window</option>
            </NativeSelect>
          </div>
          <div className="sm:col-span-4">
            <Label htmlFor="startAt">Start</Label>
            <Input id="startAt" name="startAt" type="datetime-local" required />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="endAt">End</Label>
            <Input id="endAt" name="endAt" type="datetime-local" required />
          </div>
          <div className="sm:col-span-2 flex items-end">
            <SubmitButton className="w-full">Add</SubmitButton>
          </div>
          {overrideState.message && (
            <p className="sm:col-span-12 text-sm text-emce-red">{overrideState.message}</p>
          )}
        </form>

        <ul className="mt-4 divide-y divide-emce-border">
          {[...overrides, ...blocked].length === 0 && <li className="py-3 text-sm text-emce-text-sec">No overrides yet.</li>}
          {[...overrides, ...blocked].map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <strong>{r.kind === "OVERRIDE" ? "Extra" : "Blocked"}</strong>
                {" "}· {r.startAt?.toLocaleString("en-IN")} → {r.endAt?.toLocaleString("en-IN")}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => startTransition(async () => {
                  const res = await removeAvailabilityRule(r.id);
                  res.ok ? toast.success("Removed.") : toast.error(res.message ?? "Failed.");
                })}
              >Remove</Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
