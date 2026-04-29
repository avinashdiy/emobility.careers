"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { BulkInMailDialog } from "@/components/employer/BulkInMailDialog";
import { BulkWhatsAppDialog } from "@/components/employer/BulkWhatsAppDialog";
import { SelectionBar } from "@/components/ui/selection-bar";
import { bulkSaveCandidates } from "@/server/employer/actions";
import { relativeTime } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Recruiter-side candidate list with multi-select for bulk InMail.
 *
 * Each row carries a checkbox; selecting any row reveals the sticky
 * action bar at the bottom of the viewport ("3 selected · Message all").
 * Clicking opens the BulkInMailDialog which sends a cold-outreach
 * message to each selected candidate (one MessageThread per pair).
 *
 * The list itself is a client component so we can hold selection state
 * without round-tripping; rows are pure-presentational, mimicking the
 * server-rendered card layout we replaced.
 */

export interface SearchCandidate {
  id: string;
  slug: string;
  firstName: string;
  lastName: string | null;
  headline: string | null;
  profilePhotoUrl: string | null;
  isDIYguruVerified: boolean;
  openToWork: boolean;
  profileMode: string;
  location: string | null;
  totalExperienceMonths: number;
  /** ms since epoch — passed pre-serialised so server-component query stays simple. */
  lastActiveAt: number | null;
  /** Phone number for the bulk-WhatsApp deep-link — only forwarded
      when the candidate's contactVisibility allows employers to see it. */
  phone: string | null;
  evDomains: { evDomain: { slug: string; name: string } }[];
  skills: { skill: { id: string; name: string } }[];
}

export function CandidateSearchList({ candidates }: { candidates: SearchCandidate[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingPending, startSaving] = useTransition();
  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selected.has(c.id)),
    [candidates, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clear() {
    setSelected(new Set());
  }

  function saveShortlist() {
    if (selectedCandidates.length === 0) return;
    startSaving(async () => {
      const res = await bulkSaveCandidates({
        candidateIds: selectedCandidates.map((c) => c.id),
      });
      if (res.ok) {
        toast.success(
          `Saved ${res.saved} to your shortlist${res.skipped > 0 ? ` (${res.skipped} skipped — already saved)` : ""}.`,
        );
        clear();
      } else {
        toast.error(res.message ?? "Couldn't save shortlist.");
      }
    });
  }

  return (
    <>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {candidates.map((c) => {
          const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
          const isSelected = selected.has(c.id);
          return (
            <li key={c.id}>
              <Card
                className={`relative h-full ${
                  isSelected ? "ring-2 ring-emce-mid" : ""
                }`}
              >
                {/* Checkbox lives outside the link so clicking it doesn't
                    navigate to the profile. The whole card otherwise acts
                    as a navigation target via the inner <Link>. */}
                <label className="absolute right-3 top-3 z-10 flex cursor-pointer items-center gap-1.5 rounded-full bg-white/90 px-2 py-0.5 shadow-emce">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(c.id)}
                    className="h-4 w-4 accent-emce-mid"
                    aria-label={`Select ${fullName}`}
                  />
                  <span className="text-[10px] font-bold text-emce-text-sec">Select</span>
                </label>

                <Link href={`/${c.slug}`} className="block">
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={c.profilePhotoUrl}
                      name={fullName}
                      size="md"
                      openToWork={c.openToWork}
                    />
                    <div className="min-w-0 flex-1 pr-16">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-emce-text">{fullName}</h3>
                        {c.isDIYguruVerified && <Badge variant="verified">⭐</Badge>}
                        {c.lastActiveAt && (
                          <ActivePill lastActiveAt={new Date(c.lastActiveAt)} />
                        )}
                      </div>
                      {c.headline && (
                        <p className="line-clamp-1 text-hint text-emce-text-sec">{c.headline}</p>
                      )}
                      <p className="text-hint text-emce-text-muted">
                        {c.location ?? "—"} · {(c.totalExperienceMonths / 12).toFixed(1)} yrs
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="default">{c.profileMode}</Badge>
                        {c.evDomains.slice(0, 2).map((d) => (
                          <Badge key={d.evDomain.slug} variant="success">{d.evDomain.name}</Badge>
                        ))}
                      </div>
                      {c.skills.length > 0 && (
                        <p className="mt-2 line-clamp-1 text-hint text-emce-text-sec">
                          Skills: {c.skills.map((s) => s.skill.name).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              </Card>
            </li>
          );
        })}
      </ul>

      {/* Bulk-action bar — three actions: shortlist / InMail / WhatsApp.
          Uses the shared <SelectionBar> primitive so visual treatment
          matches every other bulk surface (ATS pipeline, AI matches). */}
      <SelectionBar count={selectedCandidates.length} onClear={clear}>
        <button
          type="button"
          onClick={saveShortlist}
          disabled={savingPending}
          className="rounded-full border border-emce-border px-3 py-1 text-xs font-bold text-emce-text hover:bg-emce-light-soft disabled:opacity-60"
        >
          {savingPending ? "Saving…" : "★ Save shortlist"}
        </button>
        <BulkInMailDialog candidates={selectedCandidates} onSent={clear} />
        <BulkWhatsAppDialog candidates={selectedCandidates} />
      </SelectionBar>
    </>
  );
}

/**
 * Small "Active 3d ago" pill. We render only when activity is within the
 * last 90 days — beyond that the freshness signal is too stale to be
 * meaningful and the pill becomes noise.
 */
function ActivePill({ lastActiveAt }: { lastActiveAt: Date }) {
  const ms = Date.now() - lastActiveAt.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (ms > 90 * day) return null;
  const recent = ms < 7 * day;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[10px] font-bold ${
        recent ? "bg-emce-light text-emce-darkest" : "bg-emce-light-soft text-emce-text-sec"
      }`}
      title={lastActiveAt.toLocaleString()}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          recent ? "bg-emce-mid" : "bg-emce-text-muted"
        }`}
      />
      Active {relativeTime(lastActiveAt)}
    </span>
  );
}
