"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { SelectionBar } from "@/components/ui/selection-bar";
import { bulkInviteCandidates } from "@/server/employer/actions";
import type { RerankedCandidate } from "@/lib/ai/rerank";
import { toast } from "sonner";

export function InviteableMatchList({
  jobId,
  matches,
}: {
  jobId: string;
  matches: RerankedCandidate[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(matches.map((m) => m.candidateId)));
  }
  function clearAll() {
    setSelected(new Set());
  }

  function inviteSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`Invite ${selected.size} candidate${selected.size === 1 ? "" : "s"} to apply for this job? They'll get an in-app + email notification.`)) {
      return;
    }
    const fd = new FormData();
    fd.append("jobId", jobId);
    fd.append("candidateIds", [...selected].join(","));
    startTransition(async () => {
      try {
        await bulkInviteCandidates(fd);
      } catch (e) {
        // bulkInviteCandidates redirects on success; only catches go here
        if (e instanceof Error && e.message !== "NEXT_REDIRECT") {
          toast.error("Couldn't send invites. Try again.");
        }
      }
    });
  }

  return (
    <>
      <SelectionBar count={selected.size} onClear={clearAll} variant="sticky">
        <Button type="button" size="sm" onClick={inviteSelected}>
          ✉ Invite to apply
        </Button>
      </SelectionBar>

      <div className="mb-3 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
          Select all on this page
        </Button>
      </div>

      <ul className="space-y-3">
        {matches.map((m, idx) => {
          const fullName = [m.firstName, m.lastName].filter(Boolean).join(" ");
          const isSelected = selected.has(m.candidateId);
          return (
            <li key={m.candidateId}>
              <Card className={isSelected ? "border-emce-mid ring-2 ring-emce-mid" : ""}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(m.candidateId)}
                    aria-label={`Select ${fullName}`}
                    className="mt-1 h-4 w-4 flex-shrink-0 accent-emce-mid"
                  />
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-emce-light-soft text-sm font-extrabold text-emce-dark">
                    {idx + 1}
                  </div>
                  <Avatar src={m.profilePhotoUrl} name={fullName} size="md" openToWork={m.openToWork && !m.hiringNow} hiring={m.hiringNow} />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/${m.slug}`} className="font-bold text-emce-text hover:underline">
                        {fullName}
                      </Link>
                      {m.isDIYguruVerified && <Badge variant="verified">⭐ DIYguru</Badge>}
                      <Badge variant="success">
                        {Math.round((m.combinedScore || m.finalScore) * 100)}% match
                      </Badge>
                    </div>
                    {m.headline && <p className="text-hint text-emce-text-sec">{m.headline}</p>}
                    <p className="text-hint text-emce-text-muted">
                      {m.location ?? "—"} · {(m.totalExperienceMonths / 12).toFixed(1)} yrs
                    </p>
                    {m.rerankReason && (
                      <p className="mt-2 rounded-md bg-emce-light-soft p-2 text-hint italic text-emce-text">
                        ✨ {m.rerankReason}
                      </p>
                    )}
                    {m.matchedSkills.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.matchedSkills.slice(0, 6).map((s) => (
                          <Badge key={s} variant="default">{s}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/${m.slug}`}>Profile →</Link>
                    </Button>
                    {!isSelected && (
                      <form
                        action={async (fd) => {
                          if (!window.confirm(`Invite ${fullName} to apply?`)) return;
                          fd.set("jobId", jobId);
                          fd.set("candidateIds", m.candidateId);
                          await bulkInviteCandidates(fd);
                        }}
                      >
                        <Button type="submit" size="sm" variant="ghost">
                          ✉ Invite
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
