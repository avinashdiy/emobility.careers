import type { Education } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveEducation, deleteEducation } from "@/server/candidates/actions";
import { Trash2 } from "lucide-react";

export function EducationEditor({ education }: { education: Education[] }) {
  return (
    <Card className="p-6">
      <h2 className="text-section text-emce-text">Education</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        Degrees, diplomas, ITI courses, and DIYguru certifications.
      </p>

      {education.length === 0 ? (
        <p className="mb-4 rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
          No education entries yet.
        </p>
      ) : (
        <ul className="mb-6 space-y-3">
          {education.map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between rounded-md border border-emce-border p-3"
            >
              <div>
                <div className="font-bold text-emce-text">{e.institution}</div>
                <div className="text-hint text-emce-text-muted">
                  {[e.degree, e.field].filter(Boolean).join(" · ")} ·{" "}
                  {e.startYear ?? "?"}–{e.endYear ?? "?"}
                </div>
              </div>
              <form action={deleteEducation}>
                <input type="hidden" name="id" value={e.id} />
                <ConfirmSubmit
                  confirm={`Remove ${e.institution} from your education?`}
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
          + Add education
        </summary>
        <form action={saveEducation} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="institution">Institution</Label>
            <Input id="institution" name="institution" required />
          </div>
          <div>
            <Label htmlFor="degree">Degree</Label>
            <Input id="degree" name="degree" placeholder="e.g. B.Tech, ITI, Diploma" />
          </div>
          <div>
            <Label htmlFor="field">Field of study</Label>
            <Input id="field" name="field" placeholder="e.g. Electrical, Mechanical" />
          </div>
          <div>
            <Label htmlFor="startYear">Start year</Label>
            <Input id="startYear" name="startYear" type="number" min="1950" max="2100" />
          </div>
          <div>
            <Label htmlFor="endYear">End year</Label>
            <Input id="endYear" name="endYear" type="number" min="1950" max="2100" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="grade">Grade / CGPA (optional)</Label>
            <Input id="grade" name="grade" />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" size="sm">Add</Button>
          </div>
        </form>
      </details>
    </Card>
  );
}
