"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { createTeam, type CreateTeamResult } from "@/server/competitions/team-actions";
import { emptyFormState } from "@/lib/form-state";
import { InstitutionPicker } from "@/components/teams/InstitutionPicker";

const initialState: CreateTeamResult = emptyFormState;

/**
 * Team registration form — replaces the per-email-row registration
 * form for team-based competitions. The captain creates the team
 * with profile fields up front; member invites happen on the
 * captain dashboard after the team exists. This split:
 *   • Reduces registration friction (one form, no "fill 25 emails")
 *   • Lets verification details (institution, faculty advisor) be
 *     captured at the right moment — when the captain is being
 *     attentive, not at end of a long invite list.
 *
 * On success we router.push to /me/teams/[id] where the captain
 * lands on the dashboard with the bulk-invite panel front-and-centre.
 */
export function TeamRegisterForm({
  competitionId,
  competitionTitle,
  minTeamSize,
  maxTeamSize,
}: {
  competitionId: string;
  competitionTitle: string;
  minTeamSize: number | null;
  maxTeamSize: number | null;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    async (prev: CreateTeamResult, fd: FormData) => {
      const r = await createTeam(prev, fd);
      if (r.ok && r.teamId) {
        router.push(`/me/teams/${r.teamId}`);
      }
      return r;
    },
    initialState,
  );

  return (
    <Card className="p-5">
      <h1 className="text-section text-emce-text">Register your team</h1>
      <p className="mt-1 text-hint text-emce-text-sec">
        Team size for this competition: {minTeamSize ?? 1}–{maxTeamSize ?? 50}{" "}
        members. Create the team now; invite members from the dashboard next.
      </p>

      {!state.ok && state.message && (
        <div role="alert" className="mt-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
          {state.message}
        </div>
      )}

      <form action={formAction} className="mt-4 space-y-4" noValidate>
        <input type="hidden" name="competitionId" value={competitionId} />

        <div>
          <Label htmlFor="teamName">Team name *</Label>
          <Input
            id="teamName"
            name="teamName"
            required
            minLength={2}
            maxLength={80}
            placeholder="Volt Avengers"
          />
          <p className="text-hint text-emce-text-muted">
            Used in your team URL — pick something memorable. You can rename
            later but the URL slug stays.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <InstitutionPicker
            placeholder="BMS College of Engineering"
            label="College / Institution"
          />
          <div>
            <Label htmlFor="externalEvent">Real-world event</Label>
            <Input
              id="externalEvent"
              name="externalEvent"
              maxLength={200}
              placeholder="eBAJA SAEINDIA 2026"
            />
          </div>
          <div>
            <Label htmlFor="externalTeamId">Team number / ID</Label>
            <Input
              id="externalTeamId"
              name="externalTeamId"
              maxLength={50}
              placeholder="234"
            />
          </div>
          <div>
            <Label htmlFor="facultyAdvisor">Faculty advisor</Label>
            <Input
              id="facultyAdvisor"
              name="facultyAdvisor"
              maxLength={120}
              placeholder="Prof. Suresh Kumar"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="facultyEmail">Faculty advisor email</Label>
            <Input
              id="facultyEmail"
              name="facultyEmail"
              type="email"
              placeholder="suresh@bmsce.ac.in"
            />
            <p className="text-hint text-emce-text-muted">
              Required for team verification. We&apos;ll send a courtesy
              confirmation to this address when you submit for review.
            </p>
          </div>
        </div>

        <div>
          <Label htmlFor="teamBio">Team bio (optional)</Label>
          <Textarea
            id="teamBio"
            name="teamBio"
            rows={4}
            maxLength={2000}
            placeholder="What your team is about and what you're working on this season."
          />
        </div>

        <SubmitButton pendingLabel="Creating team…">
          Create team for {competitionTitle} →
        </SubmitButton>
      </form>
    </Card>
  );
}
