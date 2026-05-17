import { RecruitmentDriveSpeakerRole } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import {
  createSpeaker as _createSpeaker,
  deleteSpeaker as _deleteSpeaker,
} from "@/server/recruitment-drives/actions";

/**
 * Admin editor for the speakers / leadership panel — the brochure's
 * "Event Leadership & Dignitaries" block. Same server-component
 * pattern as PartnersEditor: render list + per-row remove form +
 * inline "Add speaker" form. The role enum drives grouping on the
 * public page (Patron → top, Chair → next, Speakers → grid).
 */
export function SpeakersEditor({
  driveId,
  speakers,
}: {
  driveId: string;
  speakers: {
    id: string;
    name: string;
    title: string | null;
    affiliation: string | null;
    photoUrl: string | null;
    bio: string | null;
    role: RecruitmentDriveSpeakerRole;
  }[];
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-section text-emce-text">Speakers &amp; leadership</h2>
        <p className="text-hint text-emce-text-sec">
          Patron, event chair, keynote speakers, panellists, dignitaries.
          Surfaces on the public page as a grid grouped by role.
        </p>
      </div>

      {speakers.length > 0 && (
        <ul className="mt-3 divide-y divide-emce-border rounded-md border border-emce-border">
          {speakers.map((s) => (
            <li key={s.id} className="flex items-center gap-3 p-3">
              <Avatar
                src={s.photoUrl}
                name={s.name}
                size="sm"
                className="h-10 w-10 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-emce-text">{s.name}</p>
                {(s.title || s.affiliation) && (
                  <p className="line-clamp-1 text-hint text-emce-text-sec">
                    {[s.title, s.affiliation].filter(Boolean).join(" · ")}
                  </p>
                )}
                {s.bio && (
                  <p className="line-clamp-1 text-[10px] text-emce-text-muted">
                    {s.bio}
                  </p>
                )}
              </div>
              <Badge variant="default" size="sm">
                {humaniseRole(s.role)}
              </Badge>
              <form
                action={async (fd: FormData) => {
                  "use server";
                  await _deleteSpeaker(fd);
                }}
              >
                <input type="hidden" name="driveId" value={driveId} />
                <input type="hidden" name="speakerId" value={s.id} />
                <ConfirmSubmit
                  variant="ghost"
                  size="sm"
                  confirm={`Remove ${s.name} from the speaker panel?`}
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

      {speakers.length === 0 && (
        <p className="mt-3 rounded-md border border-dashed border-emce-border bg-emce-light-soft/30 p-3 text-hint text-emce-text-sec">
          No speakers yet. Add the event chair, patron, and any
          headline keynote / panellists to draw attendees beyond just
          the booth-and-jobs visitors.
        </p>
      )}

      <form
        action={async (fd: FormData) => {
          "use server";
          await _createSpeaker(fd);
        }}
        className="mt-4 grid gap-2 border-t border-emce-border pt-4 sm:grid-cols-2"
      >
        <input type="hidden" name="driveId" value={driveId} />
        <div>
          <Label htmlFor="speaker-name">Name</Label>
          <Input
            id="speaker-name"
            name="name"
            placeholder="e.g. Prof. B.K. Panigrahi"
            required
            maxLength={120}
          />
        </div>
        <div>
          <Label htmlFor="speaker-role">Role</Label>
          <NativeSelect id="speaker-role" name="role" defaultValue="SPEAKER">
            <option value="PATRON">Patron</option>
            <option value="CHAIR">Event Chair</option>
            <option value="KEYNOTE">Keynote</option>
            <option value="PANELIST">Panellist</option>
            <option value="DIGNITARY">Dignitary</option>
            <option value="SPEAKER">Speaker</option>
            <option value="COORDINATOR">Coordinator</option>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="speaker-title">Title (optional)</Label>
          <Input
            id="speaker-title"
            name="title"
            placeholder="e.g. CEO, DIYguru"
            maxLength={160}
          />
        </div>
        <div>
          <Label htmlFor="speaker-affiliation">Affiliation (optional)</Label>
          <Input
            id="speaker-affiliation"
            name="affiliation"
            placeholder="e.g. IIT Delhi CART"
            maxLength={160}
          />
        </div>
        <div>
          <Label htmlFor="speaker-photo">Photo URL (optional)</Label>
          <Input
            id="speaker-photo"
            name="photoUrl"
            type="url"
            placeholder="https://…/headshot.jpg"
            maxLength={400}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="speaker-bio">Short bio (optional)</Label>
          <Textarea
            id="speaker-bio"
            name="bio"
            rows={2}
            maxLength={800}
            placeholder="1-2 sentences. Shown on the speaker card hover / expanded view."
          />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <SubmitButton size="sm" pendingLabel="Adding…">
            + Add speaker
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}

function humaniseRole(r: RecruitmentDriveSpeakerRole): string {
  switch (r) {
    case "PATRON": return "Patron";
    case "CHAIR": return "Chair";
    case "KEYNOTE": return "Keynote";
    case "PANELIST": return "Panellist";
    case "DIGNITARY": return "Dignitary";
    case "COORDINATOR": return "Coordinator";
    default: return "Speaker";
  }
}
