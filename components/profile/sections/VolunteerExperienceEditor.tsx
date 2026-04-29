import type { VolunteerExperience } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  saveVolunteerExperience,
  deleteVolunteerExperience,
} from "@/server/candidates/actions";
import { formatMonthYear } from "@/lib/utils";
import { Trash2 } from "lucide-react";

function isoMonth(d?: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 7);
}

function VolunteerForm({ entry }: { entry?: VolunteerExperience }) {
  return (
    <form action={saveVolunteerExperience} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <div>
        <Label htmlFor={`role-${entry?.id ?? "new"}`}>Role</Label>
        <Input
          id={`role-${entry?.id ?? "new"}`}
          name="role"
          required
          defaultValue={entry?.role ?? ""}
          placeholder="e.g. Mentor, Volunteer instructor"
        />
      </div>
      <div>
        <Label htmlFor={`organization-${entry?.id ?? "new"}`}>Organization</Label>
        <Input
          id={`organization-${entry?.id ?? "new"}`}
          name="organization"
          required
          defaultValue={entry?.organization ?? ""}
          placeholder="e.g. DIYguru, Akshaya Patra Foundation"
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`cause-${entry?.id ?? "new"}`}>Cause area</Label>
        <Input
          id={`cause-${entry?.id ?? "new"}`}
          name="cause"
          defaultValue={entry?.cause ?? ""}
          placeholder="e.g. Education, Environment, Health"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:col-span-2">
        <div>
          <Label htmlFor={`startDate-vol-${entry?.id ?? "new"}`}>Start</Label>
          <Input
            id={`startDate-vol-${entry?.id ?? "new"}`}
            name="startDate"
            type="month"
            required
            defaultValue={isoMonth(entry?.startDate)}
          />
        </div>
        <div>
          <Label htmlFor={`endDate-vol-${entry?.id ?? "new"}`}>End</Label>
          <Input
            id={`endDate-vol-${entry?.id ?? "new"}`}
            name="endDate"
            type="month"
            defaultValue={isoMonth(entry?.endDate)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm font-bold text-emce-text-sec sm:col-span-2">
        <input
          type="checkbox"
          name="current"
          value="true"
          defaultChecked={entry?.current ?? false}
          className="h-4 w-4 accent-emce-mid"
        />
        I'm currently volunteering here
      </label>
      <div className="sm:col-span-2">
        <Label htmlFor={`description-vol-${entry?.id ?? "new"}`}>Description</Label>
        <Textarea
          id={`description-vol-${entry?.id ?? "new"}`}
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={entry?.description ?? ""}
          placeholder="What you did and the impact — be specific."
        />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="submit">{entry ? "Save changes" : "Add volunteer entry"}</Button>
      </div>
    </form>
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
                  className="text-emce-text-sec hover:text-emce-red"
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
