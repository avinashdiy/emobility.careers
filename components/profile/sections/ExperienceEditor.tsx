import type { Experience } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveExperience, deleteExperience } from "@/server/candidates/actions";
import { formatMonthYear } from "@/lib/utils";
import { Trash2 } from "lucide-react";

function isoMonth(d?: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 7);
}

function ExperienceForm({ experience }: { experience?: Experience }) {
  return (
    <form action={saveExperience} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {experience && <input type="hidden" name="id" value={experience.id} />}
      <div>
        <Label htmlFor={`title-${experience?.id ?? "new"}`}>Title</Label>
        <Input
          id={`title-${experience?.id ?? "new"}`}
          name="title"
          required
          defaultValue={experience?.title ?? ""}
        />
      </div>
      <div>
        <Label htmlFor={`company-${experience?.id ?? "new"}`}>Company</Label>
        <Input
          id={`company-${experience?.id ?? "new"}`}
          name="company"
          required
          defaultValue={experience?.company ?? ""}
        />
      </div>
      <div>
        <Label htmlFor={`location-${experience?.id ?? "new"}`}>Location</Label>
        <Input
          id={`location-${experience?.id ?? "new"}`}
          name="location"
          defaultValue={experience?.location ?? ""}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor={`startDate-${experience?.id ?? "new"}`}>Start</Label>
          <Input
            id={`startDate-${experience?.id ?? "new"}`}
            name="startDate"
            type="month"
            required
            defaultValue={isoMonth(experience?.startDate)}
          />
        </div>
        <div>
          <Label htmlFor={`endDate-${experience?.id ?? "new"}`}>End</Label>
          <Input
            id={`endDate-${experience?.id ?? "new"}`}
            name="endDate"
            type="month"
            defaultValue={isoMonth(experience?.endDate)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm font-bold text-emce-text-sec sm:col-span-2">
        <input
          type="checkbox"
          name="current"
          value="true"
          defaultChecked={experience?.current ?? false}
          className="h-4 w-4 accent-emce-mid"
        />
        I currently work here
      </label>
      <div className="sm:col-span-2">
        <Label htmlFor={`description-${experience?.id ?? "new"}`}>What you did</Label>
        <Textarea
          id={`description-${experience?.id ?? "new"}`}
          name="description"
          defaultValue={experience?.description ?? ""}
          rows={3}
          placeholder="2–4 bullet points on impact, scale, technologies."
        />
      </div>
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" size="sm">
          {experience ? "Update" : "Add experience"}
        </Button>
      </div>
    </form>
  );
}

export function ExperienceEditor({ experiences }: { experiences: Experience[] }) {
  return (
    <Card className="p-6">
      <h2 className="text-section text-emce-text">Experience</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        Most-recent first. Add roles, internships, or relevant lab/project work.
      </p>

      {experiences.length === 0 ? (
        <p className="mb-4 rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
          No experience yet. Add your first below.
        </p>
      ) : (
        <ul className="mb-6 space-y-3">
          {experiences.map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between rounded-md border border-emce-border p-3"
            >
              <div>
                <div className="font-bold text-emce-text">
                  {e.title} <span className="text-emce-text-sec">— {e.company}</span>
                </div>
                <div className="text-hint text-emce-text-muted">
                  {formatMonthYear(e.startDate)} – {e.current ? "Present" : formatMonthYear(e.endDate)}
                  {e.location ? ` · ${e.location}` : ""}
                </div>
              </div>
              <form action={deleteExperience}>
                <input type="hidden" name="id" value={e.id} />
                <ConfirmSubmit
                  confirm={`Delete the "${e.title}" role at ${e.company}?`}
                  variant="ghost"
                  size="icon"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-md border border-dashed border-emce-border p-4">
        <summary className="cursor-pointer text-sm font-bold text-emce-dark">
          + Add experience
        </summary>
        <div className="mt-4">
          <ExperienceForm />
        </div>
      </details>
    </Card>
  );
}
