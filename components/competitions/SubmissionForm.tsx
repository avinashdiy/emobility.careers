"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { submitCompetitionEntry } from "@/server/competitions/actions";
import { emptyFormState } from "@/lib/form-state";

interface Stage {
  id: string;
  name: string;
  kind: string;
  startsAt: Date;
  endsAt: Date;
}

interface ExistingSubmission {
  stageId: string;
  title: string;
  summary: string | null;
  body: string | null;
  attachmentUrls: string[];
  externalUrl: string | null;
  prototypeVideoUrl: string | null;
}

interface Props {
  registrationId: string;
  stages: Stage[];
  existing: ExistingSubmission[];
}

export function SubmissionForm(props: Props) {
  const [state, formAction] = useActionState(submitCompetitionEntry, emptyFormState);
  const submittableStages = props.stages.filter((s) => s.kind === "SUBMISSION");
  const [stageId, setStageId] = useState(submittableStages[0]?.id ?? "");
  const found = props.existing.find((e) => e.stageId === stageId);
  const [attachUrls, setAttachUrls] = useState<string[]>(found?.attachmentUrls ?? [""]);

  if (submittableStages.length === 0) {
    return (
      <Card>
        <p className="text-sm text-emce-text-sec">This competition has no submission stages — entries are scored on registration / quiz alone.</p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-section text-emce-text">Submit your entry</h1>
      <form action={formAction} className="mt-4 space-y-3" key={stageId}>
        <input type="hidden" name="registrationId" value={props.registrationId} />
        {state.message && (
          <div role="alert" className={`rounded-md p-3 text-sm ${state.ok ? "bg-emce-light-soft" : "bg-emce-red-light text-emce-red"}`}>
            {state.message}
          </div>
        )}

        <div>
          <Label htmlFor="stageId">Stage</Label>
          <NativeSelect id="stageId" name="stageId" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {submittableStages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (closes {s.endsAt.toLocaleDateString("en-IN")})
              </option>
            ))}
          </NativeSelect>
        </div>

        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required defaultValue={found?.title ?? ""} maxLength={160} />
        </div>
        <div>
          <Label htmlFor="summary">Summary</Label>
          <Textarea id="summary" name="summary" rows={3} maxLength={4000} defaultValue={found?.summary ?? ""} placeholder="One paragraph elevator pitch." />
        </div>
        <div>
          <Label htmlFor="body">Write-up</Label>
          <Textarea id="body" name="body" rows={10} maxLength={50_000} defaultValue={found?.body ?? ""} placeholder="Approach, architecture, results, what you'd do next…" />
        </div>
        <div>
          {/* First-class field for the working-prototype video — surfaces
              inline on the public team page when the team is published
              (YouTube + Vimeo embed; everything else as a "Watch video"
              link). The whiteboard flow makes this central, hence its
              own field rather than rolling it into attachments. */}
          <Label htmlFor="prototypeVideoUrl">Working prototype video</Label>
          <Input
            id="prototypeVideoUrl"
            name="prototypeVideoUrl"
            type="url"
            defaultValue={found?.prototypeVideoUrl ?? ""}
            placeholder="https://youtube.com/… or https://vimeo.com/…"
          />
          <p className="text-hint text-emce-text-muted">
            YouTube and Vimeo embed inline on the team page. Drive / MinIO
            URLs render as a &quot;Watch video&quot; link.
          </p>
        </div>
        <div>
          <Label htmlFor="externalUrl">External link (GitHub, Figma, Drive)</Label>
          <Input id="externalUrl" name="externalUrl" type="url" defaultValue={found?.externalUrl ?? ""} placeholder="https://…" />
        </div>
        <div>
          <Label>Attachment URLs</Label>
          <p className="text-hint text-emce-text-sec">Paste public links to your files (PDF, images). Limit 10.</p>
          <div className="mt-2 space-y-2">
            {attachUrls.map((url, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  type="url"
                  name="attachmentUrls"
                  value={url}
                  onChange={(e) => setAttachUrls((curr) => curr.map((u, idx) => (idx === i ? e.target.value : u)))}
                  placeholder="https://…"
                />
                {attachUrls.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAttachUrls((curr) => curr.filter((_, idx) => idx !== i))}>×</Button>
                )}
              </div>
            ))}
            {attachUrls.length < 10 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setAttachUrls((curr) => [...curr, ""])}>
                + Add link
              </Button>
            )}
          </div>
        </div>

        <SubmitButton variant="accent" pendingLabel="Submitting…">Save submission</SubmitButton>
      </form>
    </Card>
  );
}
