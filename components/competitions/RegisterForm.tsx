"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { registerForCompetition } from "@/server/competitions/actions";
import { emptyFormState } from "@/lib/form-state";

interface Props {
  competitionId: string;
  competitionSlug: string;
  isTeamBased: boolean;
  minTeamSize: number | null;
  maxTeamSize: number | null;
}

export function RegisterForm(props: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    async (prev: { ok: boolean; message?: string; registrationId?: string }, fd: FormData) => {
      const r = await registerForCompetition(prev, fd);
      if (r.ok) {
        router.push(`/me/competitions`);
      }
      return r;
    },
    emptyFormState as { ok: boolean; message?: string; registrationId?: string },
  );

  const [emails, setEmails] = useState<string[]>([""]);

  function setEmail(i: number, value: string) {
    setEmails((curr) => curr.map((e, idx) => (idx === i ? value : e)));
  }

  return (
    <Card>
      <h1 className="text-section text-emce-text">Register</h1>
      <form action={formAction} className="mt-4 space-y-3" noValidate>
        <input type="hidden" name="competitionId" value={props.competitionId} />
        {state.message && (
          <div role="alert" className={`rounded-md p-3 text-sm ${state.ok ? "bg-emce-light-soft" : "bg-emce-red-light text-emce-red-deep"}`}>
            {state.message}
          </div>
        )}

        {props.isTeamBased && (
          <>
            <div>
              <Label htmlFor="teamName">Team name</Label>
              <Input id="teamName" name="teamName" required maxLength={80} placeholder="e.g. Battery Mavericks" />
            </div>
            <div>
              <Label>Teammates (their emails)</Label>
              <p className="text-hint text-emce-text-sec">
                Required: {props.minTeamSize ?? 1}–{props.maxTeamSize ?? 4} members including you. They'll get an email invite.
              </p>
              <div className="mt-2 space-y-2">
                {emails.map((email, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      type="email"
                      name="inviteEmails"
                      value={email}
                      onChange={(e) => setEmail(i, e.target.value)}
                      placeholder="teammate@example.com"
                    />
                    {emails.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEmails((curr) => curr.filter((_, idx) => idx !== i))}>×</Button>
                    )}
                  </div>
                ))}
                {emails.length < (props.maxTeamSize ?? 4) - 1 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setEmails((curr) => [...curr, ""])}>
                    + Add teammate
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        <div className="flex gap-2 pt-2">
          <SubmitButton variant="accent" pendingLabel="Registering…">Register</SubmitButton>
          <Button asChild type="button" variant="ghost">
            <a href={`/competitions/${props.competitionSlug}`}>Cancel</a>
          </Button>
        </div>
      </form>
    </Card>
  );
}
