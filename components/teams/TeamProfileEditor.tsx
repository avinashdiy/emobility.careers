"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateTeam } from "@/server/competitions/team-actions";
import { emptyFormState } from "@/lib/form-state";
import { InstitutionPicker } from "@/components/teams/InstitutionPicker";
import { TeamLogoUploader } from "@/components/teams/TeamLogoUploader";

/**
 * Captain-only profile editor. Two-column on wide screens: identity
 * + external-event on the left, social links + faculty on the right.
 *
 * The team logo upload is a separate component (TeamLogoUploader)
 * because it needs MinIO presigned URLs and a multipart flow — this
 * form just accepts the resulting URL via a hidden input.
 *
 * Server action returns { ok, message } only. Errors render inline,
 * success shows a small toast-line above the submit button rather
 * than blocking the form.
 */
export function TeamProfileEditor({
  team,
}: {
  team: {
    id: string;
    teamName: string | null;
    teamBio: string | null;
    teamLogoUrl: string | null;
    institution: string | null;
    institutionId: string | null;
    externalEvent: string | null;
    externalTeamId: string | null;
    facultyAdvisor: string | null;
    facultyEmail: string | null;
    socialLinks: { instagram?: string; linkedin?: string; website?: string; youtube?: string } | null;
  };
}) {
  const [state, formAction] = useActionState(updateTeam, emptyFormState);

  const social = team.socialLinks ?? {};

  return (
    <Card className="p-5">
      <h2 className="text-section text-emce-text">Team profile</h2>
      <p className="mt-1 text-hint text-emce-text-sec">
        Filled fields appear on the public team page once the team is verified
        and you publish it. Faculty advisor + email are required for verification.
      </p>

      {/* Logo uploader — its own form (separate multipart submit) so
          uploading a logo doesn't lose any unsaved edits in the
          profile form below. */}
      <div className="mt-4 border-b border-emce-border pb-5">
        <TeamLogoUploader
          teamId={team.id}
          currentUrl={team.teamLogoUrl}
          teamName={team.teamName ?? "Team"}
        />
      </div>

      {state.ok && state.message && (
        <div className="mt-3 rounded-md bg-emce-light-soft p-2 text-hint text-emce-darkest">
          ✓ {state.message}
        </div>
      )}
      {!state.ok && state.message && (
        <div role="alert" className="mt-3 rounded-md bg-emce-red-light p-2 text-hint text-emce-red">
          {state.message}
        </div>
      )}

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="teamId" value={team.id} />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="teamName">Team name *</Label>
            <Input
              id="teamName"
              name="teamName"
              defaultValue={team.teamName ?? ""}
              required
              minLength={2}
              maxLength={80}
            />
          </div>
          <InstitutionPicker
            defaultValue={team.institution}
            defaultId={team.institutionId}
            placeholder="BMS College of Engineering"
            label="College / Institution"
          />
          <div>
            <Label htmlFor="externalEvent">Real-world event</Label>
            <Input
              id="externalEvent"
              name="externalEvent"
              defaultValue={team.externalEvent ?? ""}
              placeholder="eBAJA SAEINDIA 2026"
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="externalTeamId">Team number / ID at that event</Label>
            <Input
              id="externalTeamId"
              name="externalTeamId"
              defaultValue={team.externalTeamId ?? ""}
              placeholder="234"
              maxLength={50}
            />
          </div>
          <div>
            <Label htmlFor="facultyAdvisor">Faculty advisor</Label>
            <Input
              id="facultyAdvisor"
              name="facultyAdvisor"
              defaultValue={team.facultyAdvisor ?? ""}
              placeholder="Prof. Suresh Kumar"
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="facultyEmail">Faculty advisor email</Label>
            <Input
              id="facultyEmail"
              name="facultyEmail"
              type="email"
              defaultValue={team.facultyEmail ?? ""}
              placeholder="suresh@bmsce.ac.in"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="teamBio">Team bio</Label>
          <Textarea
            id="teamBio"
            name="teamBio"
            rows={4}
            defaultValue={team.teamBio ?? ""}
            placeholder="What your team is about, what you've achieved, what you're working on this season."
            maxLength={2000}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Social links (optional)
          </legend>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="instagram">Instagram</Label>
              <Input id="instagram" name="instagram" type="url" defaultValue={social.instagram ?? ""} placeholder="https://instagram.com/..." />
            </div>
            <div>
              <Label htmlFor="linkedin">LinkedIn</Label>
              <Input id="linkedin" name="linkedin" type="url" defaultValue={social.linkedin ?? ""} placeholder="https://linkedin.com/company/..." />
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" type="url" defaultValue={social.website ?? ""} placeholder="https://..." />
            </div>
            <div>
              <Label htmlFor="youtube">YouTube</Label>
              <Input id="youtube" name="youtube" type="url" defaultValue={social.youtube ?? ""} placeholder="https://youtube.com/@..." />
            </div>
          </div>
        </fieldset>

        <SubmitButton pendingLabel="Saving…">Save team profile</SubmitButton>
      </form>
    </Card>
  );
}
