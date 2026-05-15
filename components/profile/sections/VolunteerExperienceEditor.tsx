"use client";

import { useActionState, useEffect, useState } from "react";
import type { VolunteerExperience } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";
import {
  saveVolunteerExperience,
  deleteVolunteerExperience,
} from "@/server/candidates/actions";
import { emptyFormState, type FormState } from "@/lib/form-state";
import { formatMonthYear } from "@/lib/utils";
import { Trash2 } from "lucide-react";

function isoMonth(d?: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 7);
}

function VolunteerForm({ entry }: { entry?: VolunteerExperience }) {
  const [state, formAction] = useActionState<FormState, FormData>(saveVolunteerExperience, emptyFormState);
  const e = state.fieldErrors ?? {};
  const v = state.prevValues ?? {};

  const [showOk, setShowOk] = useState(false);
  useEffect(() => {
    if (state.ok && state.message) {
      setShowOk(true);
      const t = setTimeout(() => setShowOk(false), 4000);
      return () => clearTimeout(t);
    }
  }, [state]);

  const idTag = entry?.id ?? "new";
  return (
    <>
      {state.ok && showOk && state.message && (
        <Alert variant="success" className="mb-3">✓ {state.message}</Alert>
      )}
      {!state.ok && state.message && (
        <Alert variant="danger" className="mb-3">{state.message}</Alert>
      )}
      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
        {entry && <input type="hidden" name="id" value={entry.id} />}
        <div>
          <Label htmlFor={`role-${idTag}`} required>Role</Label>
          <Input
            id={`role-${idTag}`}
            name="role"
            required
            defaultValue={v.role ?? entry?.role ?? ""}
            placeholder="e.g. Mentor, Volunteer instructor"
            aria-invalid={!!e.role}
          />
          <FieldError error={e.role} />
        </div>
        <div>
          <Label htmlFor={`organization-${idTag}`} required>Organization</Label>
          <Input
            id={`organization-${idTag}`}
            name="organization"
            required
            defaultValue={v.organization ?? entry?.organization ?? ""}
            placeholder="e.g. DIYguru, Akshaya Patra Foundation"
            aria-invalid={!!e.organization}
          />
          <FieldError error={e.organization} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`cause-${idTag}`} optional>Cause area</Label>
          <Input
            id={`cause-${idTag}`}
            name="cause"
            defaultValue={v.cause ?? entry?.cause ?? ""}
            placeholder="e.g. Education, Environment, Health"
            aria-invalid={!!e.cause}
          />
          <FieldError error={e.cause} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
          <div>
            <Label htmlFor={`startDate-vol-${idTag}`} required>Start</Label>
            <Input
              id={`startDate-vol-${idTag}`}
              name="startDate"
              type="month"
              required
              defaultValue={v.startDate ?? isoMonth(entry?.startDate)}
              aria-invalid={!!e.startDate}
            />
            <FieldError error={e.startDate} />
          </div>
          <div>
            <Label htmlFor={`endDate-vol-${idTag}`} optional>End</Label>
            <Input
              id={`endDate-vol-${idTag}`}
              name="endDate"
              type="month"
              defaultValue={v.endDate ?? isoMonth(entry?.endDate)}
              aria-invalid={!!e.endDate}
            />
            <FieldError error={e.endDate} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-emce-text-sec sm:col-span-2">
          <input
            type="checkbox"
            name="current"
            value="true"
            defaultChecked={v.current === "true" || (v.current == null && (entry?.current ?? false))}
            className="h-4 w-4 accent-emce-mid"
          />
          I&apos;m currently volunteering here
        </label>
        <div className="sm:col-span-2">
          <Label htmlFor={`description-vol-${idTag}`} optional>Description</Label>
          <Textarea
            id={`description-vol-${idTag}`}
            name="description"
            rows={3}
            maxLength={2000}
            defaultValue={v.description ?? entry?.description ?? ""}
            placeholder="What you did and the impact — be specific."
            aria-invalid={!!e.description}
          />
          <FieldError error={e.description} />
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="submit">{entry ? "Save changes" : "Add volunteer entry"}</Button>
        </div>
      </form>
    </>
  );
}

export function VolunteerExperienceEditor({
  entries,
}: {
  entries: VolunteerExperience[];
}) {
  return (
    <Card className="p-6">
      <h2 className="text-section text-emce-text">Volunteer experience</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        Causes you contribute to outside paid work. Optional — but
        recruiters often value the signal.
      </p>

      {entries.length > 0 && (
        <ul className="mb-6 space-y-3">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between gap-3 rounded-md border border-emce-border bg-white p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-bold text-emce-text">{e.role}</span>
                  <span className="text-sm text-emce-text-sec">at {e.organization}</span>
                  {e.cause && (
                    <Badge variant="default" size="sm">
                      {e.cause}
                    </Badge>
                  )}
                </div>
                <p className="text-hint text-emce-text-muted">
                  {formatMonthYear(e.startDate)} –{" "}
                  {e.current ? "Present" : e.endDate ? formatMonthYear(e.endDate) : "—"}
                </p>
                {e.description && (
                  <p className="mt-1 line-clamp-3 text-sm text-emce-text-sec">{e.description}</p>
                )}
              </div>
              <form action={deleteVolunteerExperience}>
                <input type="hidden" name="id" value={e.id} />
                <ConfirmSubmit
                  confirm={`Remove "${e.role} at ${e.organization}"?`}
                  size="sm"
                  variant="ghost"
                  className="text-emce-text-sec hover:text-emce-red-deep"
                  aria-label="Remove volunteer entry"
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-md border border-emce-border bg-emce-bg p-4 group">
        <summary className="cursor-pointer text-sm font-bold text-emce-dark group-open:mb-3">
          + Add volunteer entry
        </summary>
        <VolunteerForm />
      </details>
    </Card>
  );
}
