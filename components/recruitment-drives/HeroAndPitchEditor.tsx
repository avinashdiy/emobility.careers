"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateDriveHeroAndPitch } from "@/server/recruitment-drives/actions";

/**
 * Admin editor for two pre-launch marketing knobs:
 *
 *   • Hero stat targets — "1,000+ / 50+ / 500+". Real counters
 *     read 0 before anyone registers, which kills the page's
 *     momentum. Targets let the admin set aspirational numbers
 *     that the public page falls back to until real counts
 *     overtake them.
 *
 *   • Two pitch-block arrays — `pitchForHiringPartners` and
 *     `pitchForCandidates`. The brochure's "Pre-Event / During
 *     Event / Post-Event" pitch stack is the worked example; the
 *     candidate-facing version pitches "free entry, talks,
 *     workshops, networking". Each entry is `{ heading, body }`,
 *     capped at 6 per side.
 *
 * Pitch blocks JSON-serialise into hidden inputs on submit
 * (mirror of FAQ + application-questions editor patterns).
 */
const MAX_BLOCKS = 6;
const MAX_HEAD = 80;
const MAX_BODY = 600;

interface PitchBlock {
  heading: string;
  body: string;
}

export function HeroAndPitchEditor({
  driveId,
  initialHeroCandidates,
  initialHeroCompanies,
  initialHeroPositions,
  initialHiringPartnersPitch = [],
  initialCandidatesPitch = [],
}: {
  driveId: string;
  initialHeroCandidates: number | null;
  initialHeroCompanies: number | null;
  initialHeroPositions: number | null;
  initialHiringPartnersPitch?: PitchBlock[];
  initialCandidatesPitch?: PitchBlock[];
}) {
  const [hp, setHp] = useState<PitchBlock[]>(initialHiringPartnersPitch);
  const [cp, setCp] = useState<PitchBlock[]>(initialCandidatesPitch);

  // Clean both arrays — drop incomplete rows so the admin doesn't
  // have to. Server re-validates each block with Zod regardless.
  const cleanHp = hp
    .map((b) => ({ heading: b.heading.trim(), body: b.body.trim() }))
    .filter((b) => b.heading.length >= 2 && b.body.length >= 8);
  const cleanCp = cp
    .map((b) => ({ heading: b.heading.trim(), body: b.body.trim() }))
    .filter((b) => b.heading.length >= 2 && b.body.length >= 8);

  return (
    <Card className="p-5">
      <h2 className="text-section text-emce-text">Hero stats &amp; landing pitch</h2>
      <p className="mt-1 text-hint text-emce-text-sec">
        Pre-launch marketing knobs. Hero stat targets shown until the
        real counters overtake them. Pitch blocks render as 2-column
        value-prop strips on the public page.
      </p>

      <form action={updateDriveHeroAndPitch} className="mt-4 space-y-5">
        <input type="hidden" name="driveId" value={driveId} />

        {/* Hero stat targets — brochure pattern of "1,000+ / 50+ /
            500+". Live counters fall back to these until they're
            exceeded by real registrations / confirmations. */}
        <div>
          <p className="text-hint font-bold uppercase tracking-wider text-emce-text-muted">
            Hero stat targets
          </p>
          <p className="mt-1 text-hint text-emce-text-muted">
            Set aspirational targets you want to publish pre-launch.
            Leave blank to always show live counts.
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="heroStatCandidatesTarget">Candidates target</Label>
              <Input
                id="heroStatCandidatesTarget"
                name="heroStatCandidatesTarget"
                type="number"
                min={0}
                max={100000}
                defaultValue={initialHeroCandidates ?? ""}
                placeholder="1000"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label htmlFor="heroStatCompaniesTarget">Companies target</Label>
              <Input
                id="heroStatCompaniesTarget"
                name="heroStatCompaniesTarget"
                type="number"
                min={0}
                max={10000}
                defaultValue={initialHeroCompanies ?? ""}
                placeholder="50"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label htmlFor="heroStatPositionsTarget">Open positions target</Label>
              <Input
                id="heroStatPositionsTarget"
                name="heroStatPositionsTarget"
                type="number"
                min={0}
                max={100000}
                defaultValue={initialHeroPositions ?? ""}
                placeholder="500"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>

        {/* Hiring-partner pitch */}
        <PitchListEditor
          label="Hiring-partner pitch blocks"
          help="Brochure pattern: 'Pre-Event / During / Post-Event' value props. Shown to recruiters considering whether to participate."
          name="hiringPartnersPitchJson"
          entries={hp}
          setEntries={setHp}
        />

        {/* Candidate-side pitch */}
        <PitchListEditor
          label="Candidate-side pitch blocks"
          help="Pitch attendees on showing up — talks, workshops, free entry, networking. Renders as the candidate-facing value-prop strip."
          name="candidatesPitchJson"
          entries={cp}
          setEntries={setCp}
        />

        {/* Serialised hidden fields — server normalises + re-validates */}
        <input
          type="hidden"
          name="hiringPartnersPitchJson"
          value={cleanHp.length > 0 ? JSON.stringify(cleanHp) : ""}
        />
        <input
          type="hidden"
          name="candidatesPitchJson"
          value={cleanCp.length > 0 ? JSON.stringify(cleanCp) : ""}
        />

        <div className="flex justify-end border-t border-emce-border pt-4">
          <SubmitButton size="sm" pendingLabel="Saving…">
            Save hero &amp; pitch
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}

function PitchListEditor({
  label,
  help,
  name,
  entries,
  setEntries,
}: {
  label: string;
  help: string;
  name: string;
  entries: PitchBlock[];
  setEntries: (next: PitchBlock[]) => void;
}) {
  function add() {
    if (entries.length >= MAX_BLOCKS) return;
    setEntries([...entries, { heading: "", body: "" }]);
  }
  function update(idx: number, patch: Partial<PitchBlock>) {
    setEntries(entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function remove(idx: number) {
    setEntries(entries.filter((_, i) => i !== idx));
  }
  return (
    <div className="border-t border-emce-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-hint font-bold uppercase tracking-wider text-emce-text-muted">
            {label}
          </p>
          <p className="mt-1 text-hint text-emce-text-muted">{help}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={entries.length >= MAX_BLOCKS}
        >
          + Add block
        </Button>
      </div>

      {entries.length === 0 && (
        <p className="mt-2 text-hint text-emce-text-muted">
          No blocks yet. Skip to ship a slimmer page, or add 3-6 to
          turn the section on.
        </p>
      )}

      {entries.map((b, idx) => (
        <div
          key={`${name}-${idx}`}
          className="mt-3 rounded-md border border-emce-border bg-white p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-hint font-bold uppercase tracking-wider text-emce-text-muted">
              Block {idx + 1}
            </p>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-hint text-emce-red-deep hover:underline"
            >
              Remove
            </button>
          </div>
          <Input
            value={b.heading}
            onChange={(e) => update(idx, { heading: e.target.value })}
            placeholder="Heading (e.g. Pre-Event · 2 weeks before)"
            maxLength={MAX_HEAD}
          />
          <Textarea
            value={b.body}
            onChange={(e) => update(idx, { body: e.target.value })}
            placeholder="2-4 sentences. Bullet-y prose works — use • at line starts to render bullets on the public page."
            rows={3}
            maxLength={MAX_BODY}
          />
          <p className="text-right text-hint tabular-nums text-emce-text-muted">
            {b.heading.length}/{MAX_HEAD} · {b.body.length}/{MAX_BODY}
          </p>
        </div>
      ))}
    </div>
  );
}
