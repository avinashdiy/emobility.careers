"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { selectJds } from "@/server/recruitathon/select-actions";
import { MAX_JD_SELECTIONS } from "@/lib/recruitathon/exam-config";

export interface SelectorJd {
  id: string;
  role: string;
  level: "BASIC" | "INTERMEDIATE" | "ADVANCED";
  eligibility: string | null;
  location: string | null;
  description: string;
  skills: string[];
  score: number;
  reason: string;
}
export interface SelectorCompany {
  company: string;
  bestScore: number;
  jds: SelectorJd[];
}

const LEVEL_LABEL: Record<SelectorJd["level"], string> = { BASIC: "ITI / Diploma", INTERMEDIATE: "Diploma / Grad", ADVANCED: "Graduate / Exp" };

function scoreColor(s: number) {
  if (s >= 80) return "bg-emce-dark text-emce-light";
  if (s >= 60) return "bg-emce-mid text-emce-darkest";
  if (s >= 40) return "bg-emce-light-soft text-emce-dark";
  return "bg-emce-light-soft text-emce-text-muted";
}

export function JdSelector({
  companies,
  preselected,
}: {
  companies: SelectorCompany[];
  preselected: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(preselected));
  const [open, setOpen] = useState<Set<string>>(new Set(companies.slice(0, 1).map((c) => c.company)));
  const [submitting, setSubmitting] = useState(false);

  const atMax = selected.size >= MAX_JD_SELECTIONS;

  function toggleJd(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_JD_SELECTIONS) next.add(id);
      return next;
    });
  }
  function toggleCompany(c: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  }

  const countLabel = `${selected.size}/${MAX_JD_SELECTIONS} selected${atMax ? " · max reached" : ""}`;
  const btnLabel = submitting ? "Saving…" : `Continue with ${selected.size} test${selected.size === 1 ? "" : "s"} →`;
  const submitAction = (fd: FormData) => { setSubmitting(true); selected.forEach((id) => fd.append("jdId", id)); return selectJds(fd); };

  return (
    <form action={submitAction}>
      {/* Top action bar — mirrors the sticky bottom bar so Continue is
          reachable without scrolling to the bottom (some phones hid it). */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-emce-border bg-white p-3 shadow-sm">
        <p className="text-sm font-semibold text-emce-text-sec">{countLabel}</p>
        <Button type="submit" disabled={selected.size === 0 || submitting}>{btnLabel}</Button>
      </div>

      <div className="space-y-3 pb-28">
        {companies.map((co) => {
          const expanded = open.has(co.company);
          const selectedHere = co.jds.filter((j) => selected.has(j.id)).length;
          return (
            <Card key={co.company} className="overflow-hidden p-0">
              <button
                type="button"
                onClick={() => toggleCompany(co.company)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-emce-light-soft/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-emce-text">{co.company}</p>
                  <p className="text-hint text-emce-text-sec">
                    {co.jds.length} role{co.jds.length === 1 ? "" : "s"}
                    {selectedHere > 0 && <span className="font-bold text-emce-dark"> · {selectedHere} selected</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${scoreColor(co.bestScore)}`}>{co.bestScore}% best fit</span>
                  <span className="text-emce-text-muted">{expanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {expanded && (
                <div className="space-y-2 border-t border-emce-border bg-emce-light-bg/40 p-3">
                  {co.jds.map((jd) => {
                    const isSel = selected.has(jd.id);
                    const disabled = !isSel && atMax;
                    return (
                      <button
                        key={jd.id}
                        type="button"
                        onClick={() => toggleJd(jd.id)}
                        disabled={disabled}
                        className={`block w-full rounded-md border-2 p-3 text-left transition ${
                          isSel ? "border-emce-dark bg-white" : disabled ? "border-emce-border bg-white/50 opacity-60" : "border-emce-border bg-white hover:border-emce-mid"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-emce-text">{jd.role}</p>
                            <p className="text-hint text-emce-text-sec">
                              {jd.eligibility ?? LEVEL_LABEL[jd.level]}{jd.location && jd.location !== "—" ? ` · ${jd.location}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${scoreColor(jd.score)}`}>{jd.score}%</span>
                            <span className={`grid h-5 w-5 place-items-center rounded border-2 text-xs font-bold ${isSel ? "border-emce-dark bg-emce-dark text-emce-light" : "border-emce-border text-transparent"}`}>✓</span>
                          </div>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-hint text-emce-text-sec">{jd.description}</p>
                        {jd.skills.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {jd.skills.slice(0, 6).map((s) => (
                              <span key={s} className="rounded bg-emce-light-soft px-1.5 py-0.5 text-[10px] font-semibold text-emce-dark">{s}</span>
                            ))}
                          </div>
                        )}
                        {jd.score >= 60 && jd.reason && (
                          <p className="mt-1.5 text-[11px] font-semibold text-emce-mid-muted">✨ {jd.reason}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Sticky bottom bar (safe-area aware so mobile browser chrome
          can't hide it) */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-emce-border bg-white/95 backdrop-blur">
        <div
          className="container flex max-w-2xl items-center justify-between gap-4 py-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <p className="text-sm font-semibold text-emce-text-sec">{countLabel}</p>
          <Button type="submit" size="lg" disabled={selected.size === 0 || submitting}>{btnLabel}</Button>
        </div>
      </div>
    </form>
  );
}
