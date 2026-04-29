"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Briefcase, Trophy, GraduationCap, Users, Building2 } from "lucide-react";

/**
 * "Discover" megamenu collapses the secondary nav (Jobs / Competitions /
 * Mentors / People / Companies) into one slot — frees the header for the
 * primary social actions while keeping every pillar one click away. Mirrors
 * the LinkedIn "Work" app launcher pattern but tuned for our four pillars.
 */
const ITEMS = [
  { href: "/jobs", label: "Jobs", desc: "EV roles across India", icon: Briefcase },
  { href: "/competitions", label: "Competitions", desc: "Hackathons, case studies, ideathons", icon: Trophy },
  { href: "/mentors", label: "Mentors", desc: "Book 1:1 sessions with EV experts", icon: GraduationCap },
  { href: "/people", label: "People", desc: "Engineers, students, faculty, leaders", icon: Users },
  { href: "/companies", label: "Companies", desc: "Browse EV companies hiring", icon: Building2 },
] as const;

export function DiscoverMenu({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      window.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold hover:bg-white/10 hover:text-emce-light"
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-md border border-emce-border bg-white shadow-emce-lg">
          <ul className="p-2">
            {ITEMS.map((it) => {
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 rounded-md p-2.5 hover:bg-emce-light-soft"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-md bg-emce-light-soft text-emce-darkest">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-bold text-emce-text">{it.label}</span>
                      <span className="block text-xs text-emce-text-sec">{it.desc}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
