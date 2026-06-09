"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Check, X } from "lucide-react";

/**
 * Embeddable typeahead used by the three Recruitathon registration
 * forms (Employer / TPO / Candidate). Lighter than the profile-side
 * `EntityPicker`: no internal label, no help text, no built-in
 * "Create new" affordance — the parent form handles validation copy,
 * and the new entity is created by the registration server action
 * itself when the picker returns no `id`.
 *
 * Behaviour:
 *   • User types ≥2 chars → debounced search (200 ms) → dropdown
 *   • User picks a row → input renders as a locked chip with a
 *     verified/pending badge + the parent's `onPick` callback fires
 *     so it can auto-fill OTHER form fields from the picked row
 *     (e.g., website from a Company match).
 *   • User clears the chip (X button) → returns to free-text mode
 *     and `onUnpick` fires so the parent can clear the auto-filled
 *     fields too (or keep them — caller's choice).
 *   • Form submission carries TWO fields:
 *       - `nameField` (text the user typed or the picked name)
 *       - `idField`   (the picked entity id, or empty string)
 *     The server action prefers the id when present, falls back to
 *     name-based dedupe otherwise.
 *
 * Match shape is structural: any object with `{ id, name, logoUrl?,
 * subtitle? }` works. Search/result types stay on the caller side.
 */

export interface AutocompleteMatch {
  id: string;
  name: string;
  logoUrl?: string | null;
  subtitle?: string | null;
  verificationStatus?: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
}

export interface EntityAutocompleteProps<M extends AutocompleteMatch> {
  /** Name attribute for the visible text input (the entity's display name). */
  nameField: string;
  /** Name attribute for the hidden id input (the picked entity's id). */
  idField: string;
  /** Initial typed value (when re-rendering after a server-action failure). */
  defaultName?: string;
  /** Initial picked id (rare — usually empty on first render). */
  defaultId?: string;
  placeholder?: string;
  /** Required attribute on the visible input. */
  required?: boolean;
  /** aria-invalid passthrough so the parent form's FieldError styling works. */
  ariaInvalid?: boolean;
  /** Async search function (debounced at 200 ms inside the component). */
  onSearch: (q: string) => Promise<M[]>;
  /** Fires when the user picks a match — parent uses this for auto-fill. */
  onPick?: (match: M) => void;
  /** Fires when the user clears a previously-picked match. */
  onUnpick?: () => void;
  /** Kept short so the dropdown doesn't dominate the page. */
  maxResults?: number;
}

export function EntityAutocomplete<M extends AutocompleteMatch>({
  nameField,
  idField,
  defaultName = "",
  defaultId = "",
  placeholder,
  required,
  ariaInvalid,
  onSearch,
  onPick,
  onUnpick,
  maxResults = 8,
}: EntityAutocompleteProps<M>) {
  const [text, setText] = useState(defaultName);
  const [pickedId, setPickedId] = useState(defaultId);
  const [pickedMatch, setPickedMatch] = useState<M | null>(null);
  const [matches, setMatches] = useState<M[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounced search. Cancelled when the user has already locked in
  // a pick (no point searching while they're staring at the chip).
  useEffect(() => {
    if (pickedId) return;
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setMatches([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const r = await onSearch(trimmed);
        setMatches(r.slice(0, maxResults));
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [text, pickedId, onSearch, maxResults]);

  // Click-outside collapses the dropdown but keeps the typed text —
  // user might be clicking away to consult another tab.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(m: M) {
    setPickedId(m.id);
    setPickedMatch(m);
    setText(m.name);
    setOpen(false);
    onPick?.(m);
  }

  function unpick() {
    setPickedId("");
    setPickedMatch(null);
    setOpen(false);
    onUnpick?.();
  }

  return (
    <div ref={wrapRef} className="relative">
      {pickedMatch ? (
        // Locked chip — entity is picked. Renders a small verified
        // tick OR pending pill depending on the row's status, plus
        // an X to clear and return to free-text mode.
        <div className="flex items-center gap-2 rounded-md border border-emce-mid bg-emce-light-soft/40 p-2.5">
          <Avatar src={pickedMatch.logoUrl ?? null} name={pickedMatch.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-bold text-emce-text">
                {pickedMatch.name}
              </span>
              {pickedMatch.verificationStatus &&
              pickedMatch.verificationStatus !== "VERIFIED" ? (
                <span className="inline-flex items-center rounded-full bg-emce-yellow-soft/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emce-yellow-deep">
                  ⏳ Pending review
                </span>
              ) : (
                <Check className="h-3.5 w-3.5 text-emce-mid-muted" aria-label="Verified" />
              )}
            </div>
            {pickedMatch.subtitle && (
              <p className="text-hint text-emce-text-sec">{pickedMatch.subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={unpick}
            className="rounded p-1 text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
            aria-label="Clear selection"
            title="Clear and type again"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <Input
          name={nameField}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          required={required}
          aria-invalid={ariaInvalid}
        />
      )}
      {/* Always-on hidden id field. Picked → carries the id. Unpicked
          → empty string. Server action does find-or-create using the
          id when set, name-based dedupe when not. */}
      <input type="hidden" name={idField} value={pickedId} />
      {/* When picked, ALSO post the canonical name as the visible
          field's value (the visible field is suppressed by the chip
          render branch, so we need a hidden duplicate to keep the
          form submission complete). */}
      {pickedMatch && (
        <input type="hidden" name={nameField} value={pickedMatch.name} />
      )}

      {open && !pickedId && (matches.length > 0 || searching) && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-emce-border bg-white shadow-emce-lg">
          {searching && (
            <div className="px-3 py-2 text-xs text-emce-text-sec">Searching…</div>
          )}
          {matches.map((m) => {
            const isPending =
              m.verificationStatus && m.verificationStatus !== "VERIFIED";
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => pick(m)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-emce-light-soft"
              >
                <Avatar src={m.logoUrl ?? null} name={m.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-emce-text">
                      {m.name}
                    </span>
                    {isPending ? (
                      <span className="inline-flex items-center rounded-full bg-emce-yellow-soft/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emce-yellow-deep">
                        Pending review
                      </span>
                    ) : (
                      <Check className="h-3 w-3 text-emce-mid-muted" aria-label="Verified" />
                    )}
                  </div>
                  {m.subtitle && (
                    <div className="truncate text-hint text-emce-text-sec">
                      {m.subtitle}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {!searching && matches.length === 0 && text.trim().length >= 2 && (
            <div className="px-3 py-2 text-xs text-emce-text-sec">
              No matches — keep typing to register as new.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
