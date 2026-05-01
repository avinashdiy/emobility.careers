"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

/**
 * Combobox-style picker for the canonical Institution table.
 *
 * Behaviour:
 *   • Captain types — fetches /api/institutions?q=… debounced 200ms.
 *   • Suggestions render as a dropdown. Click → sets BOTH the
 *     hidden `institutionId` and the visible `institution` (name)
 *     fields, so the server action receives a canonical FK AND a
 *     human-readable label for display fallback.
 *   • Free-text fallback — if the captain doesn't pick anything
 *     from the list, we still post the typed string as
 *     `institution`; `institutionId` stays empty. This is the
 *     "long-tail college" path: a Tier 4 polytechnic not in our
 *     curated table still gets to register, and an admin can
 *     promote it later.
 *
 * Server-side, both fields end up on `CompetitionRegistration`. The
 * public team page renderer prefers `institutionRef.name` when set,
 * falls back to free-text.
 */

interface Suggestion {
  id: string;
  name: string;
  shortName: string | null;
  city: string | null;
  state: string | null;
  type: string;
  isVerified: boolean;
}

export function InstitutionPicker({
  defaultValue,
  defaultId,
  fieldName = "institution",
  idFieldName = "institutionId",
  label = "College / Institution",
  placeholder = "BMS College of Engineering",
  required = false,
  className,
}: {
  defaultValue?: string | null;
  defaultId?: string | null;
  fieldName?: string;
  idFieldName?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(defaultValue ?? "");
  const [pickedId, setPickedId] = useState(defaultId ?? "");
  const [pickedName, setPickedName] = useState(defaultValue ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Reset the picked id when the user edits the text — they're
  // searching again.
  useEffect(() => {
    if (pickedName && text !== pickedName) {
      setPickedId("");
      setPickedName("");
    }
  }, [text, pickedName]);

  // Debounced fetch — keeps us under the 60s API cache window so
  // repeat queries within the same suggestion popup are free.
  useEffect(() => {
    if (text.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    if (text === pickedName) {
      // Already-picked, no need to fetch again
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/institutions?q=${encodeURIComponent(text.trim())}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { results: Suggestion[] };
        if (!cancelled) setSuggestions(data.results);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, pickedName]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(s: Suggestion) {
    setText(s.name);
    setPickedId(s.id);
    setPickedName(s.name);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className={className}>
      <Label htmlFor={fieldName}>{label}</Label>
      <Input
        id={fieldName}
        name={fieldName}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={200}
        required={required}
      />
      {/* Hidden FK — set only when the captain picks from the dropdown.
          Empty string means "free-text fallback". */}
      <input type="hidden" name={idFieldName} value={pickedId} />

      {/* Status hint just under the input. Small affordance so the
          captain knows whether they're on a canonical row or a
          free-text one — affects verification and team-page linking. */}
      <p className="mt-1 text-hint text-emce-text-muted">
        {pickedId ? (
          <>
            <span className="text-emce-darkest font-bold">✓ Linked</span> to the
            canonical institution. Your team will appear on the institution&apos;s
            page.
          </>
        ) : text.trim().length === 0 ? (
          "Start typing — pick from the suggestions if your college is listed."
        ) : (
          "Free-text entry. Pick from suggestions for a verified link."
        )}
      </p>

      {/* Suggestions dropdown */}
      {open && (loading || suggestions.length > 0) && (
        <div className="relative">
          <ul
            role="listbox"
            className="absolute left-0 right-0 z-10 mt-1 max-h-72 overflow-y-auto rounded-md border border-emce-border bg-white shadow-emce-hover"
          >
            {loading && suggestions.length === 0 && (
              <li className="px-3 py-2 text-hint text-emce-text-muted">Searching…</li>
            )}
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-emce-light-soft"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-bold text-emce-text">{s.name}</span>
                    {s.shortName && (
                      <span className="text-hint text-emce-text-muted">{s.shortName}</span>
                    )}
                    {s.isVerified && (
                      <Badge variant="success" size="sm">
                        Verified
                      </Badge>
                    )}
                  </div>
                  <div className="text-hint text-emce-text-muted">
                    {[s.city, s.state, s.type.toLowerCase().replace(/_/g, " ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
