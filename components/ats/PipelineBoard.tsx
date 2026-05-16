"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { Avatar } from "@/components/ui/avatar";
import { NativeSelect } from "@/components/ui/select";
import { ApplicationStage } from "@prisma/client";
import { moveStage, bulkMoveStage } from "@/server/ats/actions";
import { BulkWhatsAppDialog } from "@/components/employer/BulkWhatsAppDialog";
import { SelectionBar } from "@/components/ui/selection-bar";
import Link from "next/link";

const STAGE_ORDER: ApplicationStage[] = [
  "APPLIED",
  "SCREENED",
  "SHORTLISTED",
  "ASSESSMENT",
  "INTERVIEW",
  "OFFER",
  "HIRED",
];

/**
 * Stage colour — thin top-bar accent only (no chip-style background fill
 * on the column header). Heavier fills made the whole board read as a
 * grid of tinted blocks; a 3px bar gives the recruiter a glanceable
 * stage cue without competing with card content.
 */
const STAGE_BAR: Record<string, string> = {
  APPLIED: "bg-slate-300",
  SCREENED: "bg-sky-300",
  SHORTLISTED: "bg-emce-mid",
  ASSESSMENT: "bg-amber-300",
  INTERVIEW: "bg-amber-400",
  OFFER: "bg-emerald-400",
  HIRED: "bg-emce-dark",
  REJECTED: "bg-rose-300",
  WITHDRAWN: "bg-slate-300",
};

/**
 * Human-readable column labels. The DB enum uses ALL CAPS shouty names
 * (APPLIED, SHORTLISTED, …) — fine as keys, but rendered as title case
 * here so the board doesn't read like a screaming spreadsheet.
 */
const STAGE_LABEL: Record<string, string> = {
  APPLIED: "Applied",
  SCREENED: "Screened",
  SHORTLISTED: "Shortlisted",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export interface PipelineApp {
  id: string;
  stage: ApplicationStage;
  rating: number | null;
  matchScore: number | null;
  source?: string | null;
  appliedAt: string;
  candidate: {
    id: string;
    slug: string;
    firstName: string;
    lastName: string | null;
    headline: string | null;
    profilePhotoUrl: string | null;
    isDIYguruVerified: boolean;
    /** Visibility-gated phone — null when contactVisibility is PRIVATE
        or no number is on file. The bulk-WhatsApp dialog disables rows
        without a phone instead of hiding them, so the recruiter can see
        which candidates fell through. */
    phone: string | null;
    // Wave A #1 — Open-to-Work / Hiring-now ring on the ATS card.
    // Recruiter triaging candidates sees the green ring at a glance
    // and prioritises active candidates without clicking through.
    openToWork?: boolean;
    hiringNow?: boolean;
    // Wave B #19 — trust pill row. Each flag drives one tiny pill;
    // the recruiter scans the row to triage by trust signal without
    // clicking into the profile.
    idVerified?: boolean;       // Twitter-style blue check
    emailVerified?: boolean;
    phoneVerified?: boolean;
    verifiedSkillCount?: number; // count of EV-skill badges held
    // Wave B #27 — last-active timestamp (ISO string). Drives the
    // "Active 2h ago" / "Active 4d ago" / "Active 2mo ago" pill.
    lastActiveAt?: string | null;
  };
  // Wave B #17 — preview of the AI applicant summary (first 120
  // chars). Recruiter expanding the card sees the full summary;
  // collapsed row shows just the preview so dense lists stay tidy.
  aiSummaryPreview?: string | null;
}

export function PipelineBoard({
  applications,
  jobId,
}: {
  applications: PipelineApp[];
  jobId: string;
}) {
  const [items, setItems] = useState(applications);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkMove(toStage: ApplicationStage) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setItems((prev) => prev.map((i) => (selected.has(i.id) ? { ...i, stage: toStage } : i)));
    setSelected(new Set());
    const fd = new FormData();
    fd.append("toStage", toStage);
    for (const id of ids) fd.append("ids", id);
    startTransition(async () => { await bulkMoveStage(fd); });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const stage = over.id as ApplicationStage;
    const item = items.find((i) => i.id === active.id);
    if (!item || item.stage === stage) return;

    // Optimistic update
    setItems((prev) => prev.map((i) => (i.id === active.id ? { ...i, stage } : i)));

    const fd = new FormData();
    fd.append("applicationId", String(active.id));
    fd.append("toStage", stage);
    startTransition(async () => {
      await moveStage(fd);
    });
  }

  const columns: Record<ApplicationStage, PipelineApp[]> = {
    APPLIED: [], SCREENED: [], SHORTLISTED: [], ASSESSMENT: [],
    INTERVIEW: [], OFFER: [], HIRED: [], REJECTED: [], WITHDRAWN: [],
  };
  for (const a of items) columns[a.stage].push(a);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SelectionBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        variant="sticky"
      >
        <NativeSelect
          className="sm:w-44"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) bulkMove(e.target.value as ApplicationStage);
          }}
        >
          <option value="">Move to stage…</option>
          {STAGE_ORDER.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
          <option value="REJECTED">REJECTED</option>
        </NativeSelect>
        {/* WhatsApp the selected candidates (deep-link bulk launcher).
            Renders only when at least one selected candidate has a
            visible phone — otherwise it'd be a dead button. */}
        <BulkWhatsAppDialog
          candidates={items
            .filter((i) => selected.has(i.id))
            .map((i) => ({
              id: i.candidate.id,
              firstName: i.candidate.firstName,
              lastName: i.candidate.lastName,
              phone: i.candidate.phone,
            }))}
        />
      </SelectionBar>
      {/* On phones the 7-column horizontal kanban becomes unusable —
          forces sideways scroll plus drag-drop is impractical on touch.
          Below `lg` we stack stages vertically and rely on the
          checkbox-then-bulk-move flow that's already wired into the
          SelectionBar above. The hint below makes that explicit so
          first-time mobile users don't try to drag. */}
      <p className="mb-3 text-hint text-emce-text-sec lg:hidden">
        On mobile, tap the checkbox on each card and use the
        <strong> Move to stage… </strong>
        bar that appears at the top to move candidates between stages.
        Drag-and-drop works best on desktop.
      </p>
      <div
        className="flex flex-col gap-3 pb-4 lg:grid lg:overflow-x-auto"
        style={{
          // grid-template-columns is ignored when display is flex
          // (mobile) and only kicks in once `lg:grid` flips display
          // back to grid at the lg breakpoint.
          // Column min-width tuned for the EV-recruiter screen — 240px
          // is the smallest width that comfortably fits a full short
          // name (~14 chars) + a 2-line headline without forcing
          // truncation on the typical candidate. Wider would push
          // horizontal scroll on 1280px laptops; narrower gives back
          // the truncation problem.
          gridTemplateColumns: `repeat(${STAGE_ORDER.length}, minmax(240px, 1fr))`,
        }}
      >
        {STAGE_ORDER.map((stage) => (
          <Column key={stage} stage={stage} apps={columns[stage]} jobId={jobId} selected={selected} onToggle={toggleSelect} />
        ))}
      </div>
      {(columns.REJECTED.length > 0 || columns.WITHDRAWN.length > 0) && (
        // Rejected + Withdrawn collapsed by default. Pre-redesign these
        // sat as two full-width columns under the active kanban,
        // competing for visual weight with the active funnel. The
        // recruiter rarely needs them — they're an audit trail, not a
        // working surface — so we tuck them behind a single summary
        // line. `open` only when the user actively reveals them.
        <details className="mt-6 rounded-md border border-emce-border bg-white/60">
          <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-[12px] font-semibold text-emce-text-sec hover:bg-emce-light-soft/60">
            <span>
              Show archived
              <span className="ml-2 text-emce-text-muted">
                {columns.REJECTED.length} rejected · {columns.WITHDRAWN.length} withdrawn
              </span>
            </span>
            <span aria-hidden className="text-emce-text-muted">▸</span>
          </summary>
          <div className="grid gap-3 border-t border-emce-border p-3 sm:grid-cols-2">
            <Column stage="REJECTED" apps={columns.REJECTED} jobId={jobId} selected={selected} onToggle={toggleSelect} />
            <Column stage="WITHDRAWN" apps={columns.WITHDRAWN} jobId={jobId} selected={selected} onToggle={toggleSelect} />
          </div>
        </details>
      )}
    </DndContext>
  );
}

function Column({ stage, apps, jobId, selected, onToggle }: {
  stage: ApplicationStage;
  apps: PipelineApp[];
  jobId: string;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      // Column shell: subtle bg + soft border. No min-height on lg —
      // pinned 400px previously made every column rectangle huge even
      // when half the stages were empty, which is the very thing that
      // made the board feel "clumsy". Let columns size to their content
      // and use the drop-zone strip for affordance instead.
      className={`relative flex flex-col overflow-hidden rounded-md bg-emce-light-bg/70 transition ${isOver ? "ring-2 ring-emce-mid ring-offset-1" : ""}`}
    >
      {/* Thin colored stage bar — 3px, edge-to-edge. Replaces the chip-
          style header background; the recruiter still sees a glanceable
          stage cue but cards don't compete with a tinted header block. */}
      <div className={`h-[3px] w-full ${STAGE_BAR[stage] ?? "bg-emce-border"}`} />
      <div className="flex items-center justify-between px-2.5 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-emce-text-sec">
          {STAGE_LABEL[stage] ?? stage}
        </span>
        <span className="text-[11px] font-bold tabular-nums text-emce-text-muted">
          {apps.length}
        </span>
      </div>
      <div className="flex-1 space-y-1.5 px-1.5 pb-2">
        {apps.map((a) => <Card key={a.id} app={a} jobId={jobId} selected={selected.has(a.id)} onToggle={onToggle} />)}
        {apps.length === 0 && (
          // Tall, prominent only WHILE dragging over this column.
          // At rest it's a faint placeholder strip so empty columns
          // don't dominate the visual weight of the board.
          <div
            className={`rounded border border-dashed text-center text-[10px] uppercase tracking-wider transition-all ${
              isOver
                ? "border-emce-mid bg-emce-light-soft/60 py-8 text-emce-success-deep"
                : "border-emce-border/50 py-3 text-emce-text-muted/70"
            }`}
          >
            {isOver ? "Drop to move here" : "—"}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ app, jobId, selected, onToggle }: { app: PipelineApp; jobId: string; selected: boolean; onToggle: (id: string) => void }) {
  void jobId;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: app.id });
  const fullName = [app.candidate.firstName, app.candidate.lastName].filter(Boolean).join(" ");
  return (
    <div
      ref={setNodeRef}
      style={{ transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined }}
      {...attributes}
      {...listeners}
      className={`group cursor-grab rounded-md border bg-white p-2 transition-all hover:border-emce-mid/50 hover:shadow-emce active:cursor-grabbing ${isDragging ? "opacity-50" : ""} ${selected ? "border-emce-mid ring-1 ring-emce-mid" : "border-emce-border/80"}`}
    >
      {/* World-class ATS cards (Greenhouse / Ashby / Workable) hit ~64px
          tall. Pre-redesign we were at ~140px because each card stacked
          name → headline → match pill row → trust pills row → AI
          summary preview — five blocks where the recruiter needs two
          (identity + signals).
          The new shape:
            row 1 — checkbox + avatar + name (truncated) + trust icons
            row 2 — headline (truncated)
            row 3 — meta dot line: match % · active dot · DIYguru
          AI summary moves to the detail page where there's room to
          read it. Avatar `openToWork` / `hiring` rings are intentionally
          NOT passed here — in a 220px column with 11+ rows, the green
          ring on every avatar made the whole board read green. */}
      {/* Density tuning notes (V3 ATS pass — "fit more without cutting"):
          • gap-2 → gap-1.5 (saves ~4px across the two horizontal gaps)
          • checkbox h-3.5 → h-3 (saves 2px)
          • avatar via className h-7 w-7 overrides sm's h-8 (saves 4px)
          • headline truncate → line-clamp-2 so multi-word EV titles
            ("EV Diagnostics & Field Support | MATLAB-Simulink") show
            in full across 2 lines instead of "EV Diagnostics & F…"
          • name keeps single-line truncate (a 3-line name reads as
            broken) but gains a title attr so hover reveals the full
            string — recruiters never lose information, they just need
            to mouse over for the rare long name. */}
      <div className="flex items-start gap-1.5">
        <input
          type="checkbox"
          className="mt-1 h-3 w-3 flex-shrink-0 accent-emce-mid"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={() => onToggle(app.id)}
          aria-label="Select"
        />
        <Avatar
          src={app.candidate.profilePhotoUrl}
          name={fullName}
          size="sm"
          className="h-7 w-7"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/employer/applications/${app.id}`}
              // Open in a new tab — recruiters review the candidate in
              // one tab while keeping the kanban board open in the
              // original tab to drag cards between stages.
              target="_blank"
              rel="noopener noreferrer"
              title={fullName}
              className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-emce-text hover:underline"
              // @dnd-kit's PointerSensor arms drag on pointerdown.
              // Without stopping pointerdown here, a hesitant touch
              // that drifts >5px reads as a drag — the click is
              // suppressed and the user can't open the detail page.
              // The checkbox already does this; do the same here.
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {fullName}
            </Link>
            {/* Inline trust glyphs — no chips, no borders, no row of
                their own. A recruiter scans the column for verified
                signals; tiny coloured glyphs next to the name surface
                that without eating vertical space. */}
            <TrustIcons candidate={app.candidate} />
          </div>
          {app.candidate.headline && (
            <p
              className="line-clamp-2 text-[11px] leading-snug text-emce-text-sec"
              title={app.candidate.headline}
            >
              {app.candidate.headline}
            </p>
          )}
          {/* Meta line — three tiny pieces max, all in one row, in
              tabular-nums so 9% / 91% / 100% line up across cards.
              Trailing badges (`Invited`, `Referral`, rating ★) only
              render when set; on a typical candidate the line is just
              "92% · ● 19h · ⭐". */}
          <div className="mt-1 flex items-center gap-2 text-[10px] tabular-nums text-emce-text-muted">
            {app.matchScore != null && (
              <span
                title={`Match score ${Math.round(app.matchScore * 100)}%`}
                className="font-bold text-emce-success-deep"
              >
                {Math.round(app.matchScore * 100)}%
              </span>
            )}
            {app.candidate.lastActiveAt && (
              <span
                className="inline-flex items-center gap-1"
                title={`Last active ${new Date(app.candidate.lastActiveAt).toLocaleString("en-IN")}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${lastActiveDot(app.candidate.lastActiveAt)}`} />
                {lastActiveShort(app.candidate.lastActiveAt)}
              </span>
            )}
            {app.candidate.isDIYguruVerified && (
              <span title="DIYguru verified" className="text-emce-orange-deep">⭐</span>
            )}
            {app.source === "AI_INVITED" && (
              <span title="AI invited" className="text-emce-mid-muted">✨</span>
            )}
            {app.source === "REFERRAL" && (
              <span title="Referral" className="text-emce-text-sec">↗</span>
            )}
            {app.rating != null && app.rating > 0 && (
              <span title={`Rated ${app.rating}/5`} className="text-amber-500">
                {"★".repeat(app.rating)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline trust glyphs — no chips, no borders, no row of their own.
 * Sit immediately after the candidate's name on the kanban card.
 * Pre-redesign these lived on their own wrap row as filled pills; the
 * row dominated the card's vertical space on cards with even one
 * trust signal. As icon glyphs they convey the same information in
 * <16px of horizontal space and zero additional vertical space.
 *
 * Renders nothing when no signal is earned — fresh-signup cards stay
 * clean instead of showing a row of grey empties.
 */
function TrustIcons({
  candidate,
}: {
  candidate: PipelineApp["candidate"];
}) {
  const idV = candidate.idVerified;
  const skillCount = candidate.verifiedSkillCount ?? 0;
  if (!idV && skillCount === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {idV && (
        <span
          title="ID verified"
          aria-label="ID verified"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emce-verified-bg text-[9px] font-bold text-emce-verified-text"
        >
          ✓
        </span>
      )}
      {skillCount > 0 && (
        <span
          title={`${skillCount} verified EV-skill badge${skillCount === 1 ? "" : "s"}`}
          aria-label={`${skillCount} verified skill badges`}
          className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emce-success-deep"
        >
          🏅<span className="tabular-nums">{skillCount}</span>
        </span>
      )}
    </span>
  );
}

/** Compact last-active text — "now", "19h", "3d", "2mo". Renders inline
 *  next to a coloured dot; the recruiter reads the dot first (heat) and
 *  the number second (precision). Long "Active …" prose moved to the
 *  card title attribute (hover tooltip) so the visible label stays
 *  short. */
function lastActiveShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(d / 365)}y+`;
}

/** Coloured dot beside the last-active label. Today → green, this
 *  week → amber, older → muted grey. The dot's the recruiter's first
 *  glance signal of who's still warm. */
function lastActiveDot(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = ms / (24 * 60 * 60 * 1000);
  if (days < 1) return "bg-emce-mid";
  if (days < 7) return "bg-amber-400";
  return "bg-emce-text-muted/40";
}
