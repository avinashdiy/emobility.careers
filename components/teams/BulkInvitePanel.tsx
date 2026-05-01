"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { bulkInviteTeamMembers, type BulkInviteResult } from "@/server/competitions/team-actions";
import { emptyFormState } from "@/lib/form-state";

const initialState: BulkInviteResult = emptyFormState;

/**
 * Bulk-invite textarea — captain pastes 25 emails in any common format
 * and the server splits/dedupes/validates. Renders per-batch result
 * (invited, already on team, invalid, blocked-by-team-size) so the
 * captain doesn't have to guess which addresses landed.
 *
 * Why one giant textarea instead of N email inputs: that's the
 * realistic captain workflow — they have a Google Sheet or WhatsApp
 * thread of teammates' emails. One paste beats 25 form rows.
 */
export function BulkInvitePanel({
  teamId,
  remainingSlots,
}: {
  teamId: string;
  /// How many more members the team can take. We render this as a
  /// hint in the textarea label so captains don't paste 30 emails
  /// into a team with 5 slots remaining and feel ambushed by the
  /// "blocked by max size" report.
  remainingSlots: number;
}) {
  const [state, formAction] = useActionState(bulkInviteTeamMembers, initialState);

  if (remainingSlots <= 0) {
    return (
      <Card className="p-4">
        <h3 className="text-section text-emce-text">Invite teammates</h3>
        <p className="mt-2 rounded-md bg-emce-orange-light/40 p-3 text-sm text-emce-text">
          Team is at the size cap. Remove a member or wait for an invite to be
          declined / expire before adding more.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-section text-emce-text">Invite teammates</h3>
          <p className="mt-1 text-hint text-emce-text-sec">
            Paste up to <strong>{remainingSlots}</strong> email{remainingSlots === 1 ? "" : "s"} —
            comma-, semicolon-, or newline-separated. We send each person an
            onboarding email with a magic link that auto-joins your team.
          </p>
        </div>
      </div>

      {state.ok && (
        <div className="mt-3 rounded-md bg-emce-light-soft p-3 text-sm">
          <p className="font-bold text-emce-darkest">
            ✓ Invited {state.invited} {state.invited === 1 ? "person" : "people"}.
          </p>
          {state.skippedExisting != null && state.skippedExisting > 0 && (
            <p className="mt-1 text-emce-text-sec">
              Skipped {state.skippedExisting} already on the team.
            </p>
          )}
          {state.blockedByMaxSize != null && state.blockedByMaxSize > 0 && (
            <p className="mt-1 text-emce-orange">
              {state.blockedByMaxSize} email
              {state.blockedByMaxSize === 1 ? " was" : "s were"} skipped because
              the team would exceed the size cap. Remove members or ask the
              host to raise the limit.
            </p>
          )}
          {state.skippedInvalid && state.skippedInvalid.length > 0 && (
            <p className="mt-1 text-emce-text-sec">
              <span className="text-emce-red">Ignored {state.skippedInvalid.length} invalid:</span>{" "}
              <code className="text-hint">{state.skippedInvalid.slice(0, 6).join(", ")}{state.skippedInvalid.length > 6 ? "…" : ""}</code>
            </p>
          )}
        </div>
      )}
      {!state.ok && state.message && (
        <div role="alert" className="mt-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
          {state.message}
        </div>
      )}

      <form action={formAction} className="mt-3 space-y-2">
        <input type="hidden" name="teamId" value={teamId} />
        <Textarea
          name="rawEmails"
          rows={5}
          placeholder={"priya@bmsce.ac.in, rajesh@bmsce.ac.in\nrina@bmsce.ac.in"}
          required
          minLength={3}
          maxLength={20000}
          aria-label="Email addresses to invite"
          className="font-mono text-sm"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-hint text-emce-text-muted">
            <Badge variant="default" size="sm">14-day validity</Badge> Invites
            expire automatically after 14 days.
          </p>
          <SubmitButton pendingLabel="Sending invites…">Send invites</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
