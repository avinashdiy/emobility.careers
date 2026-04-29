import type { Award } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveAward, deleteAward } from "@/server/candidates/actions";
import { formatMonthYear } from "@/lib/utils";
import { Trash2 } from "lucide-react";

export function AwardsEditor({ awards }: { awards: Award[] }) {
  return (
    <Card>
      <h2 className="text-section text-emce-text">Awards &amp; recognition</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        Hackathon wins, scholarships, industry awards, patents.
      </p>

      {awards.length === 0 ? (
        <p className="mb-4 rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
          No awards yet.
        </p>
      ) : (
        <ul className="mb-6 space-y-3">
          {awards.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 rounded-md border border-emce-border p-3">
              <div>
                <div className="font-bold text-emce-text">{a.title}</div>
                <div className="text-hint text-emce-text-sec">
                  {[a.issuer, a.date ? formatMonthYear(a.date) : null].filter(Boolean).join(" · ")}
                </div>
                {a.description && <p className="mt-1 text-body text-emce-text-sec">{a.description}</p>}
              </div>
              <form action={deleteAward}>
                <input type="hidden" name="id" value={a.id} />
                <ConfirmSubmit
                  confirm={`Delete "${a.title}"?`}
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
          + Add award
        </summary>
        <form action={saveAward} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="award-title">Title</Label>
            <Input id="award-title" name="title" required maxLength={140} />
          </div>
          <div>
            <Label htmlFor="award-issuer">Issuer</Label>
            <Input id="award-issuer" name="issuer" maxLength={120} />
          </div>
          <div>
            <Label htmlFor="award-date">Date</Label>
            <Input id="award-date" name="date" type="month" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="award-desc">Description</Label>
            <Textarea id="award-desc" name="description" rows={2} maxLength={1000} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" size="sm">Add</Button>
          </div>
        </form>
      </details>
    </Card>
  );
}
