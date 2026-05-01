"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useTransition } from "react";
import { Search, User as UserIcon, Briefcase, Building2, GraduationCap } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { quickSearch, type QuickResults, type QuickHit } from "@/server/search/quick";

/**
 * Global typeahead. As the user types we hit `quickSearch(q)` after a
 * 250ms debounce and surface the top three of each entity (people,
 * companies, jobs, mentors) in a dropdown. Pressing Enter still fires
 * a full /search?q=… navigation; clicking any row goes straight to the
 * detail page.
 *
 * Concurrency: a typing user can fire multiple in-flight queries.
 * We track the last submitted query in a ref and discard responses
 * that don't match — prevents an old slow response from clobbering
 * a newer fast one.
 *
 * Mobile: the icon-only button still expands inline; the dropdown
 * renders inside that overlay on small screens.
 */

const KIND_ICON: Record<QuickHit["kind"], React.ReactNode> = {
  person: <UserIcon className="h-3 w-3" />,
  company: <Building2 className="h-3 w-3" />,
  job: <Briefcase className="h-3 w-3" />,
  mentor: <GraduationCap className="h-3 w-3" />,
};

const KIND_LABEL: Record<QuickHit["kind"], string> = {
  person: "Person",
  company: "Company",
  job: "Job",
  mentor: "Mentor",
};

export function HeaderSearch({ placeholder }: { placeholder?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false); // mobile overlay open
  const [q, setQ] = useState("");
  const [results, setResults] = useState<QuickResults | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [pending, startSearch] = useTransition();
  const [active, setActive] = useState(0); // keyboard-highlighted row
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef("");

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced live search. Fires only when q changes; cancelled if the
  // user keeps typing within the 250ms window. Empty / single-char
  // queries clear results without hitting the server.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setActive(0);
      return;
    }
    debounceRef.current = setTimeout(() => {
      lastQueryRef.current = trimmed;
      startSearch(async () => {
        const r = await quickSearch(trimmed);
        // Stale-response guard. The user may have typed past the
        // value this request was issued for; only commit if the
        // result matches the latest query.
        if (r.q === lastQueryRef.current) {
          setResults(r);
          setActive(0);
        }
      });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  // Click-outside / Escape closes the dropdown.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDropdownOpen(false);
        setOpen(false);
      }
    }
    if (dropdownOpen || open) {
      document.addEventListener("mousedown", onClick);
      window.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [dropdownOpen, open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    setOpen(false);
    setDropdownOpen(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results || results.hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      // If a row is highlighted, navigate to it; otherwise fall
      // through to the form submit (full /search page).
      const hit = results.hits[active];
      if (hit) {
        e.preventDefault();
        setDropdownOpen(false);
        setOpen(false);
        router.push(hit.href);
      }
    }
  }

  const totalCount = results
    ? results.totals.people + results.totals.companies + results.totals.jobs + results.totals.mentors
    : 0;
  const showingCount = results?.hits.length ?? 0;
  const moreCount = Math.max(0, totalCount - showingCount);

  return (
    <div ref={containerRef} className="relative" role="search">
      <form onSubmit={submit} className="relative flex items-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Search"
          className="grid h-9 w-9 place-items-center rounded-md text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text sm:hidden"
        >
          <Search className="h-4 w-4" />
        </button>
        <div className="hidden items-center sm:flex">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-emce-text-sec" />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder ?? "Search people, jobs, mentors, competitions…"}
            className="h-9 w-64 rounded-md bg-emce-light-soft pl-9 pr-3 text-sm text-emce-text placeholder-emce-text-sec outline-none ring-0 transition-colors focus:bg-white focus:ring-1 focus:ring-emce-mid md:w-96 lg:w-[28rem]"
            aria-label="Search the platform"
            aria-autocomplete="list"
            aria-expanded={dropdownOpen}
            aria-controls="header-search-listbox"
          />
        </div>
      </form>

      {/* Desktop dropdown */}
      {dropdownOpen && q.trim().length >= 2 && (
        <div
          id="header-search-listbox"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 hidden overflow-hidden rounded-md border border-emce-border bg-white shadow-emce-lg sm:block"
        >
          <DropdownContent
            results={results}
            pending={pending}
            active={active}
            onHover={setActive}
            onPick={() => {
              setDropdownOpen(false);
              setOpen(false);
            }}
            q={q.trim()}
            moreCount={moreCount}
          />
        </div>
      )}

      {/* Mobile expanded overlay (with embedded dropdown) */}
      {open && (
        <div className="fixed left-0 right-0 top-14 z-50 border-b border-emce-border bg-white p-2 shadow-md sm:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emce-text-sec" />
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setDropdownOpen(true);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search people, jobs, mentors, competitions…"
              className="h-10 w-full rounded-md bg-emce-light-soft pl-9 pr-3 text-sm outline-none"
              aria-label="Search the platform"
            />
          </div>
          {q.trim().length >= 2 && (
            <div className="mt-2 max-h-[70vh] overflow-y-auto rounded-md border border-emce-border bg-white">
              <DropdownContent
                results={results}
                pending={pending}
                active={active}
                onHover={setActive}
                onPick={() => {
                  setDropdownOpen(false);
                  setOpen(false);
                }}
                q={q.trim()}
                moreCount={moreCount}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface DropdownProps {
  results: QuickResults | null;
  pending: boolean;
  active: number;
  onHover: (i: number) => void;
  onPick: () => void;
  q: string;
  moreCount: number;
}

function DropdownContent({
  results,
  pending,
  active,
  onHover,
  onPick,
  q,
  moreCount,
}: DropdownProps) {
  // Pending + no prior results = first request in flight
  if (!results && pending) {
    return (
      <div className="px-3 py-4 text-sm text-emce-text-sec">Searching for &ldquo;{q}&rdquo;…</div>
    );
  }
  if (!results) {
    return null;
  }
  if (results.hits.length === 0) {
    return (
      <div className="px-3 py-4">
        <p className="text-sm font-bold text-emce-text">No matches for &ldquo;{q}&rdquo;</p>
        <p className="mt-1 text-hint text-emce-text-sec">
          Try a different spelling, or browse{" "}
          <Link
            href={`/search?q=${encodeURIComponent(q)}`}
            onClick={onPick}
            className="font-bold text-emce-dark hover:underline"
          >
            full search →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-emce-border">
        {results.hits.map((h, i) => (
          <li key={`${h.kind}-${h.id}`}>
            <Link
              href={h.href}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => onHover(i)}
              onClick={onPick}
              className={`flex items-center gap-3 px-3 py-2 transition ${
                i === active ? "bg-emce-light-soft" : "hover:bg-emce-light-soft"
              }`}
            >
              <Avatar src={h.avatarUrl} name={h.title} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="line-clamp-1 text-sm font-bold text-emce-text">{h.title}</span>
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emce-light-bg px-1.5 py-0.5 text-[10px] font-semibold text-emce-text-sec">
                    {KIND_ICON[h.kind]}
                    {KIND_LABEL[h.kind]}
                  </span>
                </div>
                {h.subtitle && (
                  <p className="line-clamp-1 text-hint text-emce-text-sec">{h.subtitle}</p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={`/search?q=${encodeURIComponent(q)}`}
        onClick={onPick}
        className="block border-t border-emce-border bg-emce-light-soft px-3 py-2 text-center text-xs font-bold text-emce-dark hover:bg-emce-light-bg"
      >
        {moreCount > 0
          ? `See all ${results.hits.length + moreCount} results →`
          : `Open full search for "${q}" →`}
      </Link>
    </>
  );
}
