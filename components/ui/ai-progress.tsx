"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * AI progress indicator — V2 polish (#5).
 *
 * The expensive AI surfaces (Career Explorer's exploreCareer, AI
 * Hiring Assistant run, AI Summary regen, JD writer) all use blocking
 * form submits that can take 3–12 seconds. Previously the only signal
 * was a spinner inside the SubmitButton, which made the UI feel
 * stuck — users started clicking again or refreshing.
 *
 * This component renders a 3-step "Reading… → Thinking… → Writing…"
 * pill row that auto-advances on a soft timer (the steps are an
 * illusion — we don't actually know which phase the OpenAI call is in,
 * but a paced advance reads like real progress and reduces the
 * perception of waiting). Renders nothing when the form is idle, so
 * it can be dropped inside any `<form>` without affecting the layout
 * at rest.
 *
 * Usage:
 *   <form action={runHiringAssistantNow}>
 *     <SubmitButton>Run now</SubmitButton>
 *     <AIProgress />
 *   </form>
 */
export function AIProgress({
  steps = ["Reading…", "Thinking…", "Writing…"],
  /// ms between auto-advances. 1500ms feels right for sub-10s
  /// operations; bump to 3000 for the slow hiring-assistant run.
  stepMs = 1500,
  className,
}: {
  steps?: string[];
  stepMs?: number;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!pending) {
      setIdx(0);
      return;
    }
    const t = setInterval(() => {
      // Cap at the last step so we don't loop back to 1.
      setIdx((i) => Math.min(i + 1, steps.length - 1));
    }, stepMs);
    return () => clearInterval(t);
  }, [pending, stepMs, steps.length]);

  if (!pending) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "mt-3 flex items-center gap-2 rounded-md border border-emce-mid/40 bg-emce-light-soft/60 px-3 py-2 text-hint text-emce-text-sec dark:border-emce-mid/30 dark:bg-secondary/60 dark:text-muted-foreground animate-fade-up",
        className,
      )}
    >
      {/* Sparkle dot — the only animated element so the row reads as
          "alive" without strobe. */}
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emce-mid animate-ping-soft" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emce-mid-muted" />
      </span>
      {steps.map((s, i) => (
        <span
          key={s}
          className={cn(
            "transition-all",
            i < idx && "text-emce-text-muted dark:text-muted-foreground/60 line-through decoration-emce-mid/40",
            i === idx && "font-bold text-emce-dark dark:text-emce-mid",
            i > idx && "text-emce-text-muted dark:text-muted-foreground/60",
          )}
        >
          {s}
          {i < steps.length - 1 && <span className="ml-2 text-emce-text-muted/50">·</span>}
        </span>
      ))}
    </div>
  );
}
