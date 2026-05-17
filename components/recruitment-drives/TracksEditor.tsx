import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge } from "@/components/ui/badge";
import {
  createDriveTrack as _createDriveTrack,
  deleteDriveTrack as _deleteDriveTrack,
} from "@/server/recruitment-drives/actions";

/**
 * Admin-only track CRUD block dropped into /admin/fairs/[id].
 *
 * Surfaces the existing tracks for this fair and a single inline
 * form for adding a new one. Each existing-track row carries a
 * "Remove" form — track deletion is `SetNull` on
 * RecruitmentDriveJob.trackId, so removing a track silently
 * unbinds it from every job rather than cascading the jobs.
 *
 * Server component — pure rendering + form actions; no client
 * state needed at all (the admin types name + colour + hits Add).
 * Each form is its own submission, no useActionState gymnastics.
 */
export function TracksEditor({
  driveId,
  tracks,
}: {
  driveId: string;
  tracks: {
    id: string;
    slug: string;
    name: string;
    color: string | null;
    description: string | null;
    _count: { jobs: number };
  }[];
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-section text-emce-text">Industry tracks</h2>
        <p className="text-hint text-emce-text-sec">
          Group attached jobs by track (e.g. Battery, Embedded, Sales). Candidates
          filter the public fair page using these chips.
        </p>
      </div>

      {tracks.length > 0 && (
        <ul className="mt-3 divide-y divide-emce-border rounded-md border border-emce-border">
          {tracks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 p-3">
              {/* Colour swatch — admin's choice surfaces here so they
                  can preview the chip styling without flipping to the
                  public page. Falls back to a neutral pill when the
                  admin left colour blank. */}
              <span
                aria-hidden
                className={`inline-block h-3 w-3 shrink-0 rounded-full ${
                  t.color ? `bg-${t.color}` : "bg-emce-mid"
                }`}
                style={
                  t.color && !t.color.match(/^[a-z]+-\d+$/)
                    ? { backgroundColor: t.color }
                    : undefined
                }
              />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-emce-text">
                  {t.name}{" "}
                  <span className="ml-1 font-normal text-hint text-emce-text-muted">
                    /{t.slug}
                  </span>
                </p>
                {t.description && (
                  <p className="line-clamp-1 text-hint text-emce-text-sec">
                    {t.description}
                  </p>
                )}
              </div>
              <Badge variant="default" size="sm">
                {t._count.jobs} job{t._count.jobs === 1 ? "" : "s"}
              </Badge>
              <form
                action={async (fd: FormData) => {
                  "use server";
                  await _deleteDriveTrack(fd);
                }}
              >
                <input type="hidden" name="driveId" value={driveId} />
                <input type="hidden" name="trackId" value={t.id} />
                <ConfirmSubmit
                  variant="ghost"
                  size="sm"
                  confirm={`Remove the "${t.name}" track? Jobs tagged with it will become untagged.`}
                  pendingLabel="…"
                  className="text-emce-red-deep"
                >
                  Remove
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      )}

      {tracks.length === 0 && (
        <p className="mt-3 rounded-md border border-dashed border-emce-border bg-emce-light-soft/30 p-3 text-hint text-emce-text-sec">
          No tracks yet. Add 3-6 tracks to slice your fair (e.g. Battery,
          Embedded, Manufacturing, Sales & Service).
        </p>
      )}

      <form
        action={async (fd: FormData) => {
          "use server";
          await _createDriveTrack(fd);
        }}
        className="mt-4 grid gap-2 border-t border-emce-border pt-4 sm:grid-cols-[2fr_1fr_auto]"
      >
        <input type="hidden" name="driveId" value={driveId} />
        <div>
          <Label htmlFor="track-name">Track name</Label>
          <Input
            id="track-name"
            name="name"
            placeholder="e.g. Battery Engineering"
            required
            maxLength={60}
          />
        </div>
        <div>
          <Label htmlFor="track-color">Accent colour (optional)</Label>
          <Input
            id="track-color"
            name="color"
            placeholder="emce-mid / amber-400 / #8fd299"
            maxLength={40}
          />
        </div>
        <div className="flex items-end">
          <SubmitButton size="sm" pendingLabel="Adding…">
            + Add track
          </SubmitButton>
        </div>
        <div className="sm:col-span-3">
          <Label htmlFor="track-desc">Short description (optional)</Label>
          <Input
            id="track-desc"
            name="description"
            placeholder="One-line context shown on the public page's track header"
            maxLength={200}
          />
        </div>
      </form>

      <p className="mt-2 text-hint text-emce-text-muted">
        Tip: a recruiter picks a track when they attach a job to your fair on{" "}
        <Link
          href={`/admin/fairs`}
          className="font-bold text-emce-dark hover:underline"
        >
          /employer/fairs
        </Link>
        . Tracks created here become the options in that picker.
      </p>
    </Card>
  );
}
