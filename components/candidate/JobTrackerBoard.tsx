"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { percentileBadge } from "@/lib/applications-percentile";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { withdrawApplication } from "@/server/jobs/actions";
import { saveTrackerNote, dropFromSaved } from "@/server/jobs/tracker-actions";

/**
 * Candidate-side Kanban for /me/applications.
 *
 * Six columns mapping the 9 ATS stages onto a candidate-friendly
 * shape. The candidate is read-only on stage transitions — recruiters
 * own that — so drag-drop is restricted to two cases:
 *
 *   1. Saved → Applied : works exactly like clicking Apply on the
 *      job page; we surface a confirmation dialog so the user
 *      doesn't fire off an apply by accident on a misclick. The
 *      actual server action (applyToJob) needs the cover-letter
 *      flow, so we redirect them to the job page rather than
 *      auto-submitting.
 *
 *   2. Card → Withdrawn : drops a card into the Rejected column
 *      *if it belongs to the candidate*. Confirmation dialog same
 *      as the existing list-view Withdraw button.
 *
 * Other drag attempts snap back. This is more LinkedIn-style than
 * Trello — the columns are a status visualisation, not a manual
 * editor.
 *
 * Notes: each card has an inline private-notes field that posts to
 * `saveTrackerNote`. Visibility is PRIVATE so recruiters viewing the
 * application detail drawer never see the candidate's notes.
 */

// Display columns (candidate-friendly labels) and the underlying
// ATS stages each one collects. Saved is virtual (sourced from
// SavedJob, not Application).
type ColumnKey =
  | "SAVED"
  | "APPLIED"
  | "SCREENING"
  | "INTERVIEW"
  | "OFFERED"
  | "REJECTED";

const COLUMNS: { key: ColumnKey; label: string; tone: string }[] = [
  { key: "SAVED", label: "Saved", tone: "bg-emce-light-soft" },
  { key: "APPLIED", label: "Applied", tone: "bg-blue-50" },
  { key: "SCREENING", label: "Screening", tone: "bg-amber-50" },
  { key: "INTERVIEW", label: "Interview", tone: "bg-emce-orange-light/70" },
  { key: "OFFERED", label: "Offered", tone: "bg-emce-light" },
  { key: "REJECTED", label: "Closed", tone: "bg-gray-50" },
];

// Candidate-side stage → column mapping. The mapping collapses the
// employer's fine-grained pipeline (Screened/Shortlisted/Assessment
// all roll up into Screening) so the candidate isn't stuck guessing
// what each ATS-internal name means.
function stageToColumn(stage: string): ColumnKey {
  switch (stage) {
    case "APPLIED":
      return "APPLIED";
    case "SCREENED":
    case "SHORTLISTED":
    case "ASSESSMENT":
      return "SCREENING";
    case "INTERVIEW":
      return "INTERVIEW";
    case "OFFER":
    case "HIRED":
      return "OFFERED";
    case "REJECTED":
    case "WITHDRAWN":
    default:
      return "REJECTED";
  }
}

export interface TrackerApplication {
  id: string;
  stage: string;
  appliedAt: string; // ISO
  matchScore: number | null;
  privateNote: string | null;
  /**
   * Wave A #3 — Top Applicant percentile rank, 0..1 with 0 being the
   * best. Null when the job has too few applicants to bucket
   * meaningfully (< 5 peers). The card derives the badge label +
   * tone via `percentileBadge()`.
   */
  topPercentile?: number | null;
  job: {
    id: string;
    slug: string;
    title: string;
    company: { name: string; slug: string; logoUrl: string | null };
  };
}

export interface TrackerSavedJob {
  jobId: string;
  savedAt: string;
  job: {
    id: string;
    slug: string;
    title: string;
    company: { name: string; slug: string; logoUrl: string | null };
  };
}

interface BoardCard {
  /// Stable DnD id. Format: `app:<id>` for applications, `saved:<jobId>`
  /// for saved jobs.
  id: string;
  column: ColumnKey;
  appId?: string; // present for applications
  jobId: string;
  jobSlug: string;
  jobTitle: string;
  companyName: string;
  companySlug: string;
  companyLogoUrl: string | null;
  appliedAtMs: number | null; // null for saved-only entries
  matchScore: number | null;
  /// Wave A #3 — Top Applicant percentile (0..1, lower = better).
  /// Surfaces a "Top X%" badge on the card. Null = suppress.
  topPercentile: number | null;
  privateNote: string | null;
  stage?: string;
}

function daysSince(ms: number): number {
  return Math.max(0, Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000)));
}

export function JobTrackerBoard({
  applications,
  saved,
}: {
  applications: TrackerApplication[];
  saved: TrackerSavedJob[];
}) {
  // Hold the cards in local state so drag-drop can reflect optimistic
  // moves without waiting for revalidation. We re-derive on prop change.
  const initialCards = useMemo<BoardCard[]>(() => {
    const fromSaved: BoardCard[] = saved.map((s) => ({
      id: `saved:${s.jobId}`,
      column: "SAVED",
      jobId: s.jobId,
      jobSlug: s.job.slug,
      jobTitle: s.job.title,
      companyName: s.job.company.name,
      companySlug: s.job.company.slug,
      companyLogoUrl: s.job.company.logoUrl,
      appliedAtMs: null,
      matchScore: null,
      topPercentile: null,
      privateNote: null,
    }));
    const fromApps: BoardCard[] = applications.map((a) => ({
      id: `app:${a.id}`,
      column: stageToColumn(a.stage),
      appId: a.id,
      jobId: a.job.id,
      jobSlug: a.job.slug,
      jobTitle: a.job.title,
      companyName: a.job.company.name,
      companySlug: a.job.company.slug,
      companyLogoUrl: a.job.company.logoUrl,
      appliedAtMs: new Date(a.appliedAt).getTime(),
      matchScore: a.matchScore,
      topPercentile: a.topPercentile ?? null,
      privateNote: a.privateNote,
      stage: a.stage,
    }));
    return [...fromApps, ...fromSaved];
  }, [applications, saved]);

  const [cards, setCards] = useState(initialCards);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  // The card we're prompting the user to confirm-apply for. Set by
  // dragging a "saved:" card onto APPLIED; cleared on user resolve.
  const [pendingApply, setPendingApply] = useState<BoardCard | null>(null);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const targetCol = over.id as ColumnKey;
    const card = cards.find((c) => c.id === active.id);
    if (!card || card.column === targetCol) return;

    // Saved → Applied : confirmation prompt; the actual apply needs
    // the cover-letter form on the job page.
    if (card.column === "SAVED" && targetCol === "APPLIED") {
      setPendingApply(card);
      return;
    }
    // Application → Closed : equivalent to clicking Withdraw. We
    // optimistically move the card and let the existing
    // withdrawApplication action complete in the background.
    if (card.appId && targetCol === "REJECTED" && card.column !== "REJECTED") {
      // Block withdraw on terminal stages (already HIRED / REJECTED)
      if (
        card.stage === "HIRED" ||
        card.stage === "REJECTED" ||
        card.stage === "WITHDRAWN"
      )
        return;
      const ok = window.confirm(
        `Withdraw your application for "${card.jobTitle}"? This can't be undone.`,
      );
      if (!ok) return;
      setCards((prev) =>
        prev.map((c) =>
          c.id === card.id ? { ...c, column: "REJECTED", stage: "WITHDRAWN" } : c,
        ),
      );
      const fd = new FormData();
      fd.append("id", card.appId);
      startTransition(async () => {
        await withdrawApplication(fd);
      });
      return;
    }
    // Anything else (e.g. dragging an Applied card to Interview)
    // snaps back — the candidate can't manually move themselves
    // forward; the recruiter does that via the ATS.
  }

  function handleConfirmApply() {
    if (!pendingApply) return;
    // Send them to the job page where the apply form is. This is
    // intentional rather than a one-click apply — applyToJob requires
    // the cover-letter input + 90% completeness gate, which lives
    // on the job page.
    window.location.href = `/job/${pendingApply.jobSlug}`;
    setPendingApply(null);
  }

  function setNote(card: BoardCard, body: string) {
    setCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, privateNote: body } : c)),
    );
  }

  // Bucketed view for rendering — keeps the column .map() readable.
  const grouped: Record<ColumnKey, BoardCard[]> = {
    SAVED: [], APPLIED: [], SCREENING: [], INTERVIEW: [], OFFERED: [], REJECTED: [],
  };
  for (const c of cards) grouped[c.column].push(c);
  // Stable sort within column — most-recently-applied first; saved
  // sorted by saved-time (we don't carry savedAt in BoardCard so they
  // stay in the order the page provided).
  for (const col of Object.values(grouped)) {
    col.sort((a, b) => (b.appliedAtMs ?? 0) - (a.appliedAtMs ?? 0));
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <p className="mb-3 text-hint text-emce-text-sec lg:hidden">
        On mobile, drag-and-drop is fiddly. Use the buttons on each card
        to withdraw or open the role.
      </p>
      <div
        className="flex flex-col gap-3 pb-4 lg:grid lg:overflow-x-auto"
        style={{
          gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(220px, 1fr))`,
        }}
      >
        {COLUMNS.map((col) => (
          <Column
            key={col.key}
            col={col}
            cards={grouped[col.key]}
            onSetNote={setNote}
          />
        ))}
      </div>

      {pendingApply && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setPendingApply(null)}
        >
          <Card
            className="max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-section text-emce-text">
              Apply to {pendingApply.jobTitle}?
            </h3>
            <p className="mt-2 text-hint text-emce-text-sec">
              We&apos;ll take you to the job page where you can add a cover
              letter and submit. Your saved bookmark stays put until you
              actually apply.
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={handleConfirmApply}>Open job page →</Button>
              <Button variant="ghost" onClick={() => setPendingApply(null)}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </DndContext>
  );
}

function Column({
  col,
  cards,
  onSetNote,
}: {
  col: { key: ColumnKey; label: string; tone: string };
  cards: BoardCard[];
  onSetNote: (card: BoardCard, body: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div className="flex min-w-[220px] flex-col">
      <div className={`rounded-t-md ${col.tone} px-3 py-2`}>
        <div className="flex items-baseline justify-between">
          <h3 className="text-hint font-bold uppercase tracking-wide text-emce-darkest">
            {col.label}
          </h3>
          <span className="text-hint font-bold text-emce-darkest">
            {cards.length}
          </span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 rounded-b-md border border-t-0 border-emce-border bg-white p-2 transition-colors ${
          isOver ? "bg-emce-light-soft" : ""
        }`}
      >
        {cards.length === 0 ? (
          <p className="px-2 py-6 text-center text-hint text-emce-text-muted">
            {col.key === "SAVED"
              ? "Save jobs to revisit them here."
              : col.key === "APPLIED"
                ? "Your fresh applications land here."
                : "—"}
          </p>
        ) : (
          cards.map((c) => <CardItem key={c.id} card={c} onSetNote={onSetNote} />)
        )}
      </div>
    </div>
  );
}

function CardItem({
  card,
  onSetNote,
}: {
  card: BoardCard;
  onSetNote: (card: BoardCard, body: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: card.id });
  const style: React.CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : {};
  const days = card.appliedAtMs != null ? daysSince(card.appliedAtMs) : null;
  // Local edit-mode state so the textarea only mounts when the user
  // clicks "Add note" — keeps the column DOM lean for hundreds of
  // cards and avoids stealing scroll focus on tap-to-drag.
  const [editing, setEditing] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-md border border-emce-border bg-white p-3 shadow-emce hover:border-emce-mid ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      {/* Drag handle is the top half of the card. Clicking the title
          link or the note textarea must NOT initiate drag — that's
          why those elements are outside the listeners spread below. */}
      <div {...listeners} {...attributes} className="cursor-grab">
        <div className="flex items-start gap-2">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center overflow-hidden rounded-md bg-emce-light-soft text-sm font-extrabold text-emce-dark">
            {card.companyLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.companyLogoUrl}
                alt={card.companyName}
                className="h-full w-full object-cover"
              />
            ) : (
              card.companyName[0]?.toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <Link
              href={`/job/${card.jobSlug}`}
              className="block truncate font-bold text-emce-text hover:underline"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {card.jobTitle}
            </Link>
            <p className="truncate text-hint text-emce-text-sec">
              {card.companyName}
            </p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {typeof card.matchScore === "number" && (
            <Badge variant="success" size="sm">
              {Math.round(card.matchScore * 100)}% match
            </Badge>
          )}
          {/* Wave A #3 — Top Applicant badge. Renders only when the
              job has enough peer applications to be meaningful (the
              compute helper returns null for low-peer jobs). */}
          {(() => {
            const badge = percentileBadge(card.topPercentile ?? null);
            if (!badge) return null;
            return (
              <Badge variant={badge.tone} size="sm">
                ✨ {badge.label}
              </Badge>
            );
          })()}
          {days != null && (
            <span className="text-hint text-emce-text-muted">
              {days === 0 ? "today" : days === 1 ? "1 day ago" : `${days}d ago`}
            </span>
          )}
          {card.stage && card.stage !== card.column && (
            <Badge variant="default" size="sm">
              {card.stage.toLowerCase()}
            </Badge>
          )}
        </div>
      </div>

      {/* Note editor — kept outside the drag handler so editing
          doesn't initiate drag on touch devices. */}
      {editing ? (
        <form
          action={saveTrackerNote}
          className="mt-2 space-y-1"
          onPointerDown={(e) => e.stopPropagation()}
          onSubmit={() => setEditing(false)}
        >
          <input
            type="hidden"
            name="applicationId"
            value={card.appId ?? ""}
          />
          <Textarea
            name="body"
            rows={2}
            defaultValue={card.privateNote ?? ""}
            placeholder="Private note to yourself…"
            maxLength={2000}
            onChange={(e) => onSetNote(card, e.currentTarget.value)}
          />
          <div className="flex gap-1">
            <Button type="submit" size="sm">Save</Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : card.privateNote ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-2 line-clamp-2 w-full rounded-md bg-emce-light-soft p-2 text-left text-hint text-emce-text hover:bg-emce-mid/30"
        >
          📝 {card.privateNote}
        </button>
      ) : card.appId ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-2 text-hint font-bold text-emce-dark hover:underline"
        >
          + Add note
        </button>
      ) : null}

      {/* Per-card actions — withdraw lives here as a fallback for
          users who can't drag (mobile / accessibility). */}
      {card.appId && card.stage !== "HIRED" && card.stage !== "REJECTED" && card.stage !== "WITHDRAWN" && (
        <form
          action={withdrawApplication}
          className="mt-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input type="hidden" name="id" value={card.appId} />
          <ConfirmSubmit
            confirm={`Withdraw your application for "${card.jobTitle}"? This can't be undone.`}
            variant="ghost"
            size="sm"
            pendingLabel="Withdrawing…"
          >
            Withdraw
          </ConfirmSubmit>
        </form>
      )}
      {!card.appId && (
        <form
          action={dropFromSaved}
          className="mt-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input type="hidden" name="jobId" value={card.jobId} />
          <Button type="submit" variant="ghost" size="sm" className="w-full">
            Remove
          </Button>
        </form>
      )}
    </div>
  );
}
