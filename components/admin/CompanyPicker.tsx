"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * Typeahead picker over a pre-loaded list of companies. Replaces
 * the prior NativeSelect approach which became unscrollable once
 * the directory crossed ~1,000 entries.
 *
 * Why client-side filtering (no API)?
 *   • ~1k companies × ~50 bytes = ~50KB payload — already shipped
 *     to the page by the server component. Adding a search API
 *     would be slower (network round-trip per keystroke) and more
 *     fragile (network errors, debounce tuning).
 *   • Filter runs synchronously on the keystroke — feels instant.
 *
 * Behaviour:
 *   • Empty input → shows top 20 companies (the most recently-
 *     added per the caller's sort order — typically `name asc`).
 *   • As the user types → case-insensitive substring match on
 *     name. Up to 20 results.
 *   • Click a row → fills the visible input + writes the
 *     companyId into the hidden field (which is what the server
 *     action reads).
 *   • Clear button → empties both fields so the recruiter can
 *     re-pick or fall through to the inline-new-company section.
 *
 * Accessibility:
 *   • The visible input is a `combobox` with `aria-expanded`
 *     reflecting the dropdown state.
 *   • Suggestions are a `listbox`; rows are `option` with
 *     `aria-selected`.
 *   • Keyboard: ↑/↓ to move, Enter to select, Esc to close.
 */

export interface CompanyOption {
  id: string;
  name: string;
  slug: string;
}

export function CompanyPicker({
  companies,
  defaultValue,
  fieldName = "companyId",
  ariaInvalid,
  placeholder = "Type a company name (e.g. Ola, Tata, BYD…)",
}: {
  companies: CompanyOption[];
  defaultValue?: string;
  fieldName?: string;
  ariaInvalid?: boolean;
  placeholder?: string;
}) {
  // Resolve initial label from defaultValue (when the form is in
  // re-render-after-error mode and the server returned a companyId
  // we should display the name for).
  const initial = useMemo(() => {
    if (!defaultValue) return { id: "", name: "" };
    const c = companies.find((x) => x.id === defaultValue);
    return c ? { id: c.id, name: c.name } : { id: defaultValue, name: "" };
  }, [defaultValue, companies]);

  const [text, setText] = useState(initial.name);
  const [pickedId, setPickedId] = useState(initial.id);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filtered + capped suggestions. Empty input → first 20 alphabetical.
  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return companies.slice(0, 20);
    return companies
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [text, companies]);

  // Reset highlight whenever the suggestion list changes shape.
  useEffect(() => {
    setHighlight(0);
  }, [suggestions.length]);

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

  function pick(c: CompanyOption) {
    setText(c.name);
    setPickedId(c.id);
    setOpen(false);
    // Restore focus to the input — easier to keep typing or tab on.
    inputRef.current?.focus();
  }

  function clear() {
    setText("");
    setPickedId("");
    inputRef.current?.focus();
    setOpen(true);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && suggestions[highlight]) {
        e.preventDefault();
        pick(suggestions[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Hidden field — what the server action actually reads.
          Empty string means "no company picked", which is the
          signal to fall through to the inline-new-company section. */}
      <input type="hidden" name={fieldName} value={pickedId} />

      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // Typing invalidates any prior pick — server will read
            // empty companyId and bail unless the user picks again.
            if (pickedId) setPickedId("");
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-invalid={ariaInvalid}
          className={pickedId ? "pr-20" : ""}
        />
        {pickedId && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-0.5 text-[10px] font-bold text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-dark"
            aria-label="Clear company selection"
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Status pill — small confidence signal. */}
      <p className="mt-1 text-hint text-emce-text-muted">
        {pickedId ? (
          <>
            <span className="font-bold text-emce-darkest">✓ Linked</span> —{" "}
            {companies.length.toLocaleString("en-IN")} companies in the directory.
          </>
        ) : (
          <>
            Search across {companies.length.toLocaleString("en-IN")} companies, or leave
            blank to fill the new-company section below.
          </>
        )}
      </p>

      {/* Suggestion dropdown. Absolute-positioned so it overlays the
          form below without pushing layout around. */}
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-10 mt-1 max-h-72 overflow-y-auto rounded-md border border-emce-border bg-white shadow-emce-hover"
        >
          {suggestions.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onClick={() => pick(c)}
                onMouseEnter={() => setHighlight(i)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  i === highlight
                    ? "bg-emce-light-soft font-bold text-emce-darkest"
                    : "text-emce-text hover:bg-emce-light-soft"
                }`}
              >
                {c.name}
              </button>
            </li>
          ))}
          {/* Footer hint when filter has hit the cap of 20. Pushes
              the user to refine the query rather than scroll. */}
          {text.trim() &&
            companies.filter((c) =>
              c.name.toLowerCase().includes(text.trim().toLowerCase()),
            ).length > 20 && (
              <li className="border-t border-emce-border bg-emce-light-soft px-3 py-2 text-[10px] text-emce-text-muted">
                Showing first 20 matches — refine your search to narrow down.
              </li>
            )}
        </ul>
      )}
    </div>
  );
}
