"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { FieldError } from "@/components/ui/field-error";
import { createCompetitionDraft, updateCompetitionDraft } from "@/server/competitions/actions";
import { emptyFormState } from "@/lib/form-state";

interface Props {
  hostCompanyId: string;
  initial?: {
    id?: string;
    title?: string;
    tagline?: string | null;
    description?: string;
    type?: string;
    bannerImageUrl?: string | null;
    eligibility?: string | null;
    rules?: string | null;
    isTeamBased?: boolean;
    minTeamSize?: number | null;
    maxTeamSize?: number | null;
    registrationOpensAt?: Date | null;
    registrationClosesAt?: Date | null;
    startsAt?: Date;
    endsAt?: Date;
    resultsAt?: Date | null;
    totalPrizePoolMinor?: number;
    prizeCurrency?: string;
    evDomainSlugs?: string[];
  };
  evDomains: { slug: string; name: string }[];
}

const TYPES = [
  "HACKATHON", "CASE_STUDY", "QUIZ", "DESIGN_CHALLENGE", "INNOVATION", "INTERNSHIP_HUNT", "IDEATHON", "RESEARCH",
];

function isoLocal(d?: Date | null): string {
  if (!d) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function CompetitionDraftForm({ hostCompanyId, initial, evDomains }: Props) {
  const router = useRouter();

  const action = initial?.id
    ? updateCompetitionDraft.bind(null, initial.id)
    : async (prev: { ok: boolean; message?: string; id?: string; fieldErrors?: Record<string, string> }, fd: FormData) => {
        const r = await createCompetitionDraft(prev, fd);
        if (r.ok && r.id) router.push(`/employer/competitions/${r.id}`);
        return r;
      };

  const [state, formAction] = useActionState(
    action as (prev: ReturnType<typeof emptyState>, fd: FormData) => Promise<ReturnType<typeof emptyState>>,
    emptyState(),
  );

  return (
    <Card>
      <h2 className="text-section text-emce-text">Competition details</h2>
      <form action={formAction} className="mt-4 space-y-4" noValidate>
        <input type="hidden" name="hostCompanyId" value={hostCompanyId} />
        {state.message && (
          <div role="alert" className={`rounded-md p-3 text-sm ${state.ok ? "bg-emce-light-soft" : "bg-emce-red-light text-emce-red-deep"}`}>
            {state.message}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required maxLength={160} defaultValue={initial?.title ?? ""} aria-invalid={!!state.fieldErrors?.title} />
            <FieldError error={state.fieldErrors?.title} />
          </div>
          <div>
            <Label htmlFor="type">Type</Label>
            <NativeSelect id="type" name="type" defaultValue={initial?.type ?? "HACKATHON"}>
              {TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </NativeSelect>
          </div>
        </div>
        <div>
          <Label htmlFor="tagline">Tagline</Label>
          <Input id="tagline" name="tagline" maxLength={200} defaultValue={initial?.tagline ?? ""} placeholder="One-line pitch shown on the directory card." />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" required minLength={50} maxLength={20000} rows={6} defaultValue={initial?.description ?? ""} aria-invalid={!!state.fieldErrors?.description} />
          <FieldError error={state.fieldErrors?.description} />
        </div>
        <div>
          <Label htmlFor="bannerImageUrl">Banner image URL</Label>
          <Input id="bannerImageUrl" name="bannerImageUrl" type="url" defaultValue={initial?.bannerImageUrl ?? ""} placeholder="https://…" />
        </div>
        <div>
          <Label htmlFor="evDomainSlugs">EV domains</Label>
          <NativeSelect id="evDomainSlugs" name="evDomainSlugs" multiple defaultValue={initial?.evDomainSlugs ?? []} className="h-28">
            {evDomains.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </NativeSelect>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="eligibility">Eligibility (optional)</Label>
            <Textarea id="eligibility" name="eligibility" rows={3} maxLength={2000} defaultValue={initial?.eligibility ?? ""} />
          </div>
          <div>
            <Label htmlFor="rules">Rules (optional)</Label>
            <Textarea id="rules" name="rules" rows={3} maxLength={20000} defaultValue={initial?.rules ?? ""} />
          </div>
        </div>

        <div className="rounded-emce border border-emce-border p-3">
          <Label>Team configuration</Label>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isTeamBased" value="on" defaultChecked={initial?.isTeamBased ?? false} />
              Team-based
            </label>
            <div>
              <Label htmlFor="minTeamSize">Min team size</Label>
              <Input id="minTeamSize" name="minTeamSize" type="number" min={1} max={20} defaultValue={initial?.minTeamSize ?? ""} />
            </div>
            <div>
              <Label htmlFor="maxTeamSize">Max team size</Label>
              <Input id="maxTeamSize" name="maxTeamSize" type="number" min={1} max={20} defaultValue={initial?.maxTeamSize ?? ""} />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="registrationOpensAt">Reg opens</Label>
            <Input id="registrationOpensAt" name="registrationOpensAt" type="datetime-local" defaultValue={isoLocal(initial?.registrationOpensAt)} />
          </div>
          <div>
            <Label htmlFor="registrationClosesAt">Reg closes</Label>
            <Input id="registrationClosesAt" name="registrationClosesAt" type="datetime-local" defaultValue={isoLocal(initial?.registrationClosesAt)} />
          </div>
          <div>
            <Label htmlFor="resultsAt">Results announced</Label>
            <Input id="resultsAt" name="resultsAt" type="datetime-local" defaultValue={isoLocal(initial?.resultsAt)} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="startsAt">Starts</Label>
            <Input id="startsAt" name="startsAt" type="datetime-local" required defaultValue={isoLocal(initial?.startsAt)} />
          </div>
          <div>
            <Label htmlFor="endsAt">Ends</Label>
            <Input id="endsAt" name="endsAt" type="datetime-local" required defaultValue={isoLocal(initial?.endsAt)} />
          </div>
        </div>

        <div className="rounded-emce border border-emce-border p-3">
          <Label>Prize pool (optional)</Label>
          <p className="text-hint text-emce-text-sec">Total prize pool in minor units. Break it down per rank in the next step.</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Input name="totalPrizePoolMinor" type="number" min={0} defaultValue={initial?.totalPrizePoolMinor ?? 0} placeholder="50000 = ₹500" />
            <NativeSelect name="prizeCurrency" defaultValue={initial?.prizeCurrency ?? "INR"}>
              <option value="INR">INR</option>
              <option value="USD">USD</option>
            </NativeSelect>
          </div>
        </div>

        <SubmitButton size="lg" pendingLabel="Saving…">{initial?.id ? "Save draft" : "Create draft"}</SubmitButton>
      </form>
    </Card>
  );
}

function emptyState() {
  return { ok: false } as { ok: boolean; message?: string; id?: string; fieldErrors?: Record<string, string> };
}
