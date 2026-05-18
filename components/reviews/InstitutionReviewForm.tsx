import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { submitInstitutionReview } from "@/server/reviews/institution-actions";

/**
 * Server-rendered review form for an Institution. Posts to
 * submitInstitutionReview which validates, upserts a PENDING
 * review row and redirects back to /institutions/<slug> with a
 * notice / error toast. Plain HTML form — no client hooks needed.
 *
 * Ratings use a 1-5 star scale rendered as native <select>s so
 * the form works without JS, ships zero bytes of client JS, and
 * remains screen-reader-friendly.
 */

const RATING_AXES: { key: string; label: string }[] = [
  { key: "overallRating", label: "Overall (would you recommend?)" },
  { key: "facultyRating", label: "Faculty" },
  { key: "infrastructureRating", label: "Infrastructure & labs" },
  { key: "placementRating", label: "Placement support" },
  { key: "contentRating", label: "Content & curriculum" },
  { key: "alumniRating", label: "Alumni network" },
];

const RELATIONSHIPS: { value: string; label: string }[] = [
  { value: "CURRENT_STUDENT", label: "Current student" },
  { value: "ALUMNI", label: "Alumni" },
  { value: "FACULTY", label: "Faculty / staff" },
  { value: "EMPLOYER_RECRUITER", label: "Recruiter (I've hired their graduates)" },
  { value: "TRAINEE", label: "Trainee / short-course participant" },
  { value: "PROSPECTIVE", label: "Prospective student" },
];

export function InstitutionReviewForm({
  institutionId,
  institutionName,
}: {
  institutionId: string;
  institutionName: string;
}) {
  return (
    <form action={submitInstitutionReview} className="space-y-5">
      <input type="hidden" name="institutionId" value={institutionId} />

      <div>
        <Label htmlFor="ir-relationship">Your relationship with {institutionName}</Label>
        <NativeSelect id="ir-relationship" name="relationship" required>
          {RELATIONSHIPS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {RATING_AXES.map((axis) => (
          <div key={axis.key}>
            <Label htmlFor={`ir-${axis.key}`}>{axis.label}</Label>
            <NativeSelect id={`ir-${axis.key}`} name={axis.key} defaultValue="5" required>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {"★".repeat(n)}
                  {"☆".repeat(5 - n)} ({n}/5)
                </option>
              ))}
            </NativeSelect>
          </div>
        ))}
      </div>

      <div>
        <Label htmlFor="ir-headline">One-line summary</Label>
        <Input
          id="ir-headline"
          name="headline"
          required
          minLength={8}
          maxLength={220}
          placeholder="e.g. Solid BMS curriculum, weak placements outside Pune corridor"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="ir-pros">What worked well</Label>
          <Textarea
            id="ir-pros"
            name="pros"
            required
            minLength={20}
            maxLength={2000}
            rows={5}
            placeholder="Faculty depth, lab access, peer cohort, placement support, specific programs you'd recommend…"
          />
        </div>
        <div>
          <Label htmlFor="ir-cons">What could be better</Label>
          <Textarea
            id="ir-cons"
            name="cons"
            required
            minLength={20}
            maxLength={2000}
            rows={5}
            placeholder="Pain points around fees, hostel, infrastructure, specific faculty, placement gaps…"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="ir-program">Program / course (optional)</Label>
          <Input
            id="ir-program"
            name="programName"
            placeholder="B.Tech EV / PG Diploma in BMS / EV Powertrain Certificate"
            maxLength={120}
          />
        </div>
        <div>
          <Label htmlFor="ir-year">Graduation year (optional)</Label>
          <Input
            id="ir-year"
            name="graduationYear"
            type="number"
            min={1970}
            max={2099}
            placeholder="2024"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-emce-border pt-4">
        <p className="flex-1 text-hint text-emce-text-sec">
          Reviews are moderated before going live — usually within 24 hours.
        </p>
        <Button type="submit">Submit review</Button>
      </div>
    </form>
  );
}
