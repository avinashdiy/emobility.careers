"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Search } from "lucide-react";

/**
 * Global search box. Submits to /search?q=… which renders grouped results
 * across people, jobs, companies, mentors, and competitions. Sized to match
 * LinkedIn's top-bar pattern: short pill on desktop, icon-only on mobile that
 * expands inline when tapped.
 */
export function HeaderSearch({ placeholder }: { placeholder?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={submit} className="relative flex items-center" role="search">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Search"
        className="grid h-9 w-9 place-items-center rounded-md text-white/80 hover:bg-white/10 hover:text-white sm:hidden"
      >
        <Search className="h-4 w-4" />
      </button>
      <div className={`hidden items-center sm:flex ${open ? "" : ""}`}>
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-emce-text-sec" />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder ?? "Search people, jobs, mentors, competitions…"}
          className="h-9 w-64 rounded-md bg-white/10 pl-9 pr-3 text-sm text-white placeholder-white/60 outline-none ring-0 transition-colors focus:bg-white focus:text-emce-text focus:placeholder-emce-text-sec md:w-72"
          aria-label="Search the platform"
        />
      </div>
      {open && (
        <div className="fixed left-0 right-0 top-14 z-50 border-b border-emce-border bg-white p-2 shadow-md sm:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emce-text-sec" />
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => setOpen(false)}
              placeholder="Search people, jobs, mentors, competitions…"
              className="h-10 w-full rounded-md bg-emce-light-soft pl-9 pr-3 text-sm outline-none"
              aria-label="Search the platform"
            />
          </div>
        </div>
      )}
    </form>
  );
}
