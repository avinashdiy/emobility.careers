"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Count-up to a target number when the component scrolls into view.
 * No animation library — pure rAF + IntersectionObserver so it adds
 * ~0 bytes beyond what it would otherwise cost to render the digit.
 *
 * Used by the dashboard hero (applications count, profile views,
 * followers) and the marketing landing's stat strip. The animation
 * is short (700ms) and one-shot — counting up to large numbers feels
 * like a kid's progress bar if you let it run too long.
 */
interface AnimatedNumberProps {
  to: number;
  durationMs?: number;
  formatter?: (n: number) => string;
  className?: string;
  /**
   * Suffix that doesn't get animated — e.g. "+", "%", "k". Sits to the
   * right of the counting digit at the final size so it doesn't pop in
   * at the end.
   */
  suffix?: string;
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString("en-IN");

export function AnimatedNumber({
  to,
  durationMs = 700,
  formatter = defaultFormat,
  className,
  suffix,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Respect reduced motion: jump straight to the target.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(to);
      return;
    }

    let started = false;
    let rafId = 0;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || started) return;
        started = true;
        obs.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / durationMs);
          // easeOutCubic — slows as it approaches the target so the
          // final digit feels deliberate, not abrupt.
          const eased = 1 - Math.pow(1 - t, 3);
          setDisplay(to * eased);
          if (t < 1) rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [to, durationMs]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {formatter(display)}
      {suffix}
    </span>
  );
}
