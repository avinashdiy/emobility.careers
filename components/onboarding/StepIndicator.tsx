"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const STEPS = [
  { path: "/onboarding", label: "Profile mode" },
  { path: "/onboarding/resume", label: "Resume" },
  { path: "/onboarding/confirm", label: "Confirm" },
  { path: "/onboarding/preferences", label: "Preferences" },
];

export function StepIndicator() {
  const pathname = usePathname();
  const activeIndex = STEPS.findIndex((s) => s.path === pathname);

  return (
    <ol className="mb-8 flex items-center gap-2 overflow-x-auto pb-1" aria-label="Onboarding steps">
      {STEPS.map((s, i) => {
        const active = i === activeIndex;
        const done = activeIndex > i;
        const clickable = done || active;

        const inner = (
          <div
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors",
              active && "bg-emce-dark text-emce-light",
              done && "bg-emce-mid text-emce-darkest",
              !active && !done && "bg-white text-emce-text-muted shadow-emce",
              clickable && !active && "hover:bg-emce-light",
            )}
            aria-current={active ? "step" : undefined}
          >
            <span className={cn(
              "grid h-5 w-5 place-items-center rounded-full text-[10px]",
              active && "bg-emce-light text-emce-darkest",
              done && "bg-emce-darkest text-emce-light",
              !active && !done && "bg-emce-light-soft text-emce-dark",
            )}>
              {done ? "✓" : i + 1}
            </span>
            <span className="hidden sm:inline">{s.label}</span>
          </div>
        );

        return (
          <li key={s.path} className="flex flex-shrink-0 items-center gap-2">
            {clickable ? (
              <Link href={s.path} aria-label={`Step ${i + 1}: ${s.label}`}>
                {inner}
              </Link>
            ) : (
              <span aria-label={`Step ${i + 1}: ${s.label} (locked)`}>{inner}</span>
            )}
            {i < STEPS.length - 1 && (
              <span className={cn("hidden h-px w-4 sm:inline-block", done ? "bg-emce-mid" : "bg-emce-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
