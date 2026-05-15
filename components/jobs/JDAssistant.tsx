"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { polishJD, type PolishedJD } from "@/server/employer/jd-actions";

interface Props {
  // IDs of the form inputs to populate
  fields: {
    title: string;            // input id for title
    description: string;
    responsibilities: string;
    requirements: string;
    skillNames: string;
    evDomainSlugs: string;
    seniorityLevel: string;
    benefits: string;
  };
}

export function JDAssistant({ fields }: Props) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PolishedJD | null>(null);

  async function run() {
    setBusy(true); setError(null);
    try {
      const title = (document.getElementById(fields.title) as HTMLInputElement | null)?.value ?? "";
      if (title.length < 2) {
        setError("Add the job title first."); setBusy(false); return;
      }
      const r = await polishJD({ title, notes });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to draft");
    } finally {
      setBusy(false);
    }
  }

  function applyResult() {
    if (!result) return;
    const setVal = (id: string, v: string) => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el) {
        el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    setVal(fields.description, result.description);
    setVal(fields.responsibilities, result.responsibilities);
    setVal(fields.requirements, result.requirements);
    setVal(fields.skillNames, result.skills.join(", "));
    setVal(fields.evDomainSlugs, result.evDomains.join(", "));
    setVal(fields.seniorityLevel, result.seniorityLevel);
    if (result.benefits) setVal(fields.benefits, result.benefits);
    setOpen(false);
    setResult(null);
    setNotes("");
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        ✨ Draft with AI
      </Button>
    );
  }

  return (
    <Card className="border-emce-mid bg-emce-light-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="text-section text-emce-text">JD assistant</h3>
          <p className="mt-1 text-hint text-emce-text-sec">
            Paste rough notes (responsibilities, must-haves, vibe). We&apos;ll structure them into a polished JD.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>✕</Button>
      </div>
      {result ? (
        <div className="mt-3 space-y-2">
          <div className="rounded-md border border-emce-border bg-white p-3 text-sm">
            <p className="font-bold text-emce-text">Suggested seniority:</p>
            <Badge variant="default">{result.seniorityLevel}</Badge>
          </div>
          <div className="rounded-md border border-emce-border bg-white p-3 text-sm">
            <p className="font-bold text-emce-text">Skills</p>
            <p className="text-emce-text-sec">{result.skills.join(" · ")}</p>
          </div>
          <div className="rounded-md border border-emce-border bg-white p-3 text-sm">
            <p className="font-bold text-emce-text">EV domains</p>
            <p className="text-emce-text-sec">{result.evDomains.join(" · ")}</p>
          </div>
          <details>
            <summary className="cursor-pointer text-hint font-bold text-emce-dark">Preview body</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-emce-border bg-white p-2 text-xs text-emce-text-sec">{result.description}{"\n\n"}{result.responsibilities}{"\n\n"}{result.requirements}</pre>
          </details>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setResult(null)}>Try again</Button>
            <Button type="button" size="sm" onClick={applyResult}>Apply to form</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            placeholder="e.g. Looking for someone with 3-5 yrs in BMS firmware. Must know C, ARM Cortex, RTOS. Will own pack-level safety logic. Bangalore on-site."
            disabled={busy}
          />
          {error && <p className="text-hint text-emce-red-deep">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" size="sm" onClick={run} disabled={busy || notes.length < 20}>
              {busy ? "Drafting…" : "Draft JD"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
