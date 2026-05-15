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
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

const STAGE_COLOR: Record<string, string> = {
  APPLIED: "bg-emce-light-soft text-emce-dark",
  SCREENED: "bg-blue-50 text-blue-800",
  SHORTLISTED: "bg-emce-light-soft text-[#1e5a32]",
  ASSESSMENT: "bg-emce-orange-light text-[#8a4a1a]",
  INTERVIEW: "bg-emce-orange-light text-[#8a4a1a]",
  OFFER: "bg-emce-light text-emce-darkest",
  HIRED: "bg-emce-mid text-emce-darkest",
  REJECTED: "bg-emce-red-light text-emce-red-deep",
  WITHDRAWN: "bg-gray-100 text-gray-500",
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
  };
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
          gridTemplateColumns: `repeat(${STAGE_ORDER.length}, minmax(220px, 1fr))`,
        }}
      >
        {STAGE_ORDER.map((stage) => (
          <Column key={stage} stage={stage} apps={columns[stage]} jobId={jobId} selected={selected} onToggle={toggleSelect} />
        ))}
      </div>
      {(columns.REJECTED.length > 0 || columns.WITHDRAWN.length > 0) && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Column stage="REJECTED" apps={columns.REJECTED} jobId={jobId} selected={selected} onToggle={toggleSelect} />
          <Column stage="WITHDRAWN" apps={columns.WITHDRAWN} jobId={jobId} selected={selected} onToggle={toggleSelect} />
        </div>
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
      // 400px min-height applies only on lg+ where columns sit
      // side-by-side (uniform column heights look intentional). Below
      // lg the columns are stacked, so an empty stage of 400px is just
      // a wasteful gap — let it size to its content instead.
      className={`flex flex-col rounded-lg border border-emce-border bg-white/60 p-2 transition lg:min-h-[400px] ${isOver ? "ring-2 ring-emce-mid" : ""}`}
    >
      <div className={`mb-2 rounded-md px-2 py-1.5 ${STAGE_COLOR[stage]}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wide">{stage}</span>
          <span className="text-xs font-bold">{apps.length}</span>
        </div>
      </div>
      <div className="space-y-2">
        {apps.map((a) => <Card key={a.id} app={a} jobId={jobId} selected={selected.has(a.id)} onToggle={onToggle} />)}
        {apps.length === 0 && (
          <div className="rounded-md border-2 border-dashed border-emce-border p-3 text-center text-hint text-emce-text-muted">
            Drop here
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
      className={`cursor-grab rounded-md border bg-white p-3 shadow-emce active:cursor-grabbing ${isDragging ? "opacity-50" : ""} ${selected ? "border-emce-mid ring-2 ring-emce-mid" : "border-emce-border"}`}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 flex-shrink-0 accent-emce-mid"
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
          openToWork={app.candidate.openToWork && !app.candidate.hiringNow}
          hiring={app.candidate.hiringNow}
        />
        <div className="min-w-0 flex-1">
          <Link
            href={`/employer/applications/${app.id}`}
            // Open in a new tab — recruiters review the candidate in
            // one tab while keeping the kanban board open in the
            // original tab to drag cards between stages. The detail
            // page also surfaces a sibling-candidate sidebar so
            // walking through every applicant doesn't need a round-
            // trip back to the board.
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-bold text-emce-text hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {fullName}
          </Link>
          {app.candidate.headline && (
            <p className="truncate text-hint text-emce-text-sec">{app.candidate.headline}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-1">
            {app.candidate.isDIYguruVerified && <Badge variant="verified">⭐</Badge>}
            {app.matchScore != null && (
              <Badge variant="success">{Math.round(app.matchScore * 100)}%</Badge>
            )}
            {app.source === "AI_INVITED" && <Badge variant="warning">Invited</Badge>}
            {app.source === "REFERRAL" && <Badge variant="default">Referral</Badge>}
            {app.rating && <Badge variant="default">{"★".repeat(app.rating)}</Badge>}
          </div>
        </div>
      </div>
    </div>
  );
}
