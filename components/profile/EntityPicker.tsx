"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Building2, GraduationCap, Plus, Check, X } from "lucide-react";

/**
 * LinkedIn-style "search or create" entity picker. Used by the experience
 * editor (companies) and the education editor (institutions). Three states
 * the candidate can land on:
 *
 *   1. Linked to an existing entity   → name + tiny logo + "✓ Linked"
 *   2. Plain text only                → name as text, FK stays null
 *   3. Just-created entity            → same as (1) but UNVERIFIED status
 *
 * The component itself is presentation-only — search/create are passed as
 * async functions so we can reuse the same picker for any entity type by
 * pointing it at different server actions.
 */

export interface EntityMatch {
  id: string;
  name: string;
  logoUrl: string | null;
  subtitle?: string | null;
}

export interface EntityPickerProps {
  kind: "company" | "institution";
  /** Field name posted with the form (the FK id, or empty string). */
  idFieldName: string;
  /** Field name for the canonical text (always required). */
  textFieldName: string;
  /** Initial values */
  initialId?: string | null;
  initialText?: string;
  initialEntity?: EntityMatch | null;
  /** Server-action that takes a query and returns candidate matches. */
  onSearch: (q: string) => Promise<EntityMatch[]>;
  /** Optional create handler — when omitted, the "Create new" button hides. */
  onCreate?: (
    name: string,
  ) => Promise<{ ok: boolean; id?: string; message?: string }>;
  placeholder?: string;
  label: string;
  helpText?: string;
}

export function EntityPicker({
  kind,
  idFieldName,
  textFieldName,
  initialId,
  initialText = "",
  initialEntity = null,
  onSearch,
  onCreate,
  placeholder,
  label,
  helpText,
}: EntityPickerProps) {
  const [text, setText] = useState(initialText);
  const [linkedId, setLinkedId] = useState<string | null>(initialId ?? null);
  const [linkedEntity, setLinkedEntity] = useState<EntityMatch | null>(initialEntity);
  const [matches, setMatches] = useState<EntityMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [creating, startCreate] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const Icon = kind === "company" ? Building2 : GraduationCap;

  // Debounced search — fires 200ms after the last keystroke. Cancelled if
  // the user already linked an entity (no search needed in that case).
  useEffect(() => {
    if (linkedId) return;
    const t = text.trim();
    if (t.length < 2) {
      setMatches([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const r = await onSearch(t);
      setMatches(r);
      setSearching(false);
    }, 200);
    return () => clearTimeout(handle);
  }, [text, linkedId, onSearch]);

  // Click-outside to close the dropdown without losing typed text.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(e: EntityMatch) {
    setLinkedId(e.id);
    setLinkedEntity(e);
    setText(e.name);
    setOpen(false);
  }
  function unlink() {
    setLinkedId(null);
    setLinkedEntity(null);
    setOpen(false);
  }
  function create() {
    if (!onCreate) return;
    const name = text.trim();
    if (name.length < 2) return;
    startCreate(async () => {
      const r = await onCreate(name);
      if (r.ok && r.id) {
        setLinkedId(r.id);
        setLinkedEntity({ id: r.id, name, logoUrl: null });
        setOpen(false);
      }
    });
  }

  const exactMatch = matches.find((m) => m.name.toLowerCase() === text.trim().toLowerCase());
  const showCreate = onCreate && text.trim().length >= 2 && !linkedId && !exactMatch;

  return (
    <div ref={ref} className="relative">
      <label className="mb-1 block text-sm font-bold text-emce-text" htmlFor={textFieldName}>
        {label}
      </label>

      {linkedEntity ? (
        // Locked-state chip — shows the linked entity, click X to unlink.
        <div className="flex items-center gap-2 rounded-md border border-emce-mid bg-emce-light-soft/40 p-2.5">
          <Avatar src={linkedEntity.logoUrl} name={linkedEntity.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold text-emce-text">{linkedEntity.name}</span>
              <Check className="h-3.5 w-3.5 text-emce-mid-muted" aria-label="Linked" />
            </div>
            {linkedEntity.subtitle && (
              <p className="text-hint text-emce-text-sec">{linkedEntity.subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={unlink}
            className="rounded p-1 text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
            aria-label="Unlink"
            title="Unlink and edit as text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <Input
          id={textFieldName}
          name={textFieldName}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? `Search or type a ${kind}…`}
          autoComplete="off"
          required
        />
      )}

      {/* When linked, post the FK and the canonical text both. When unlinked,
          only the text — institutionId / companyId stays null on the row. */}
      <input type="hidden" name={idFieldName} value={linkedId ?? ""} />
      {linkedEntity && <input type="hidden" name={textFieldName} value={linkedEntity.name} />}

      {helpText && <p className="mt-1 text-hint text-emce-text-sec">{helpText}</p>}

      {/* Dropdown */}
      {open && !linkedId && (matches.length > 0 || showCreate || searching) && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-emce-border bg-white shadow-emce-lg">
          {searching && (
            <div className="px-3 py-2 text-xs text-emce-text-sec">Searching…</div>
          )}
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-emce-light-soft"
            >
              <Avatar src={m.logoUrl} name={m.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-emce-text">{m.name}</div>
                {m.subtitle && <div className="truncate text-hint text-emce-text-sec">{m.subtitle}</div>}
              </div>
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={create}
              disabled={creating}
              className="flex w-full items-center gap-2 border-t border-emce-border px-3 py-2 text-left hover:bg-emce-light-soft"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-emce-light-soft text-emce-darkest">
                <Plus className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-emce-text">
                  {creating ? "Adding…" : `Add "${text.trim()}" as a new ${kind}`}
                </div>
                <div className="text-hint text-emce-text-sec">
                  We'll mark it unverified and an admin will review.
                </div>
              </div>
              <Icon className="h-4 w-4 text-emce-text-sec" />
            </button>
          )}
          {!searching && matches.length === 0 && !showCreate && (
            <div className="px-3 py-2 text-xs text-emce-text-sec">Keep typing…</div>
          )}
        </div>
      )}
    </div>
  );
}
