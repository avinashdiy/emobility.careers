import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  COMPLETENESS_THRESHOLDS,
  nextSteps,
  cheapestPathToThreshold,
  type CompletenessResult,
  type SectionResult,
} from "@/lib/profile-completeness";

/**
 * Donut + next-steps card for the candidate dashboard / profile editor.
 *
 * Single SVG donut sized via `size` (default 88px). Stroke colour shifts
 * by tier:
 *   - Red below 50% (can't fully use platform)
 *   - Amber 50–89% (can browse but not apply)
 *   - Green ≥90% (fully unlocked)
 *
 * Below the donut we list the top 3 next-steps, sorted by descending
 * weight, each with a deep-link into the editor section. Clicking any
 * pill jumps the editor to focus that section.
 */
export function ProfileCompletenessCard({
  result,
  size,
  variant = "card",
}: {
  result: CompletenessResult;
  size?: number;
  /** "card" = full panel; "inline" = compact for sidebar */
  variant?: "card" | "inline";
}) {
  const { pct, canApply, canExplore } = result;
  // Smaller donut for inline variant — matches LinkedIn's sidebar
  // gauge density. Card variant keeps the larger 88px donut so the
  // panel reads as a primary CTA.
  const donutSize = size ?? (variant === "inline" ? 56 : 88);
  const stroke = variant === "inline" ? 6 : 8;
  const radius = (donutSize - stroke - 2) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - pct / 100);

  const tierColor =
    pct >= COMPLETENESS_THRESHOLDS.APPLY ? "stroke-emce-mid-muted text-emce-mid-muted"
    : pct >= COMPLETENESS_THRESHOLDS.EXPLORE ? "stroke-emce-orange text-emce-orange-deep"
    : "stroke-emce-red text-emce-red-deep";

  // Pick the next-step list. When the candidate is in a gating band
  // we show the *quick path* — the smallest set of actions that
  // crosses the next threshold. That replaces the generic "X% more
  // to apply" copy with concrete "do these N things" guidance.
  //
  //   • Below EXPLORE (50%) → target EXPLORE first. Don't recommend
  //     a 90%-bound list to a 25%-complete user; they'd see ~10 items
  //     which is overwhelming. Get them past the explore gate first.
  //   • EXPLORE..APPLY (50–89%) → target APPLY (90%).
  //   • APPLY+ → no gating band; fall back to highest-impact list.
  const targetThreshold = !canExplore
    ? COMPLETENESS_THRESHOLDS.EXPLORE
    : !canApply
      ? COMPLETENESS_THRESHOLDS.APPLY
      : null;
  const quickPath = targetThreshold !== null
    ? cheapestPathToThreshold(result, targetThreshold)
    : null;

  // For the inline (sidebar) variant we only have room for one or two
  // rows — show the first item of the quick path or the top next step.
  const limit = variant === "inline" ? 1 : 5;
  const inGatingBand = !canApply && quickPath !== null && quickPath.path.length > 0;
  const remaining: SectionResult[] = inGatingBand
    ? quickPath!.path.slice(0, limit)
    : nextSteps(result, limit);

  const headline = pct >= COMPLETENESS_THRESHOLDS.APPLY
    ? "Profile fully unlocked — you can apply to any job."
    : inGatingBand
      ? // Concrete count + gap. The list itself is rendered below.
        canExplore
        ? `Tap ${quickPath!.path.length === 1 ? "this 1 item" : `these ${quickPath!.path.length} items`} (${quickPath!.path.reduce((acc, s) => acc + s.weight, 0)}%) to unlock applications.`
        : `Tap ${quickPath!.path.length === 1 ? "this 1 item" : `these ${quickPath!.path.length} items`} to start exploring jobs.`
      : pct >= COMPLETENESS_THRESHOLDS.EXPLORE
        ? `${COMPLETENESS_THRESHOLDS.APPLY - pct}% more to apply for jobs.`
        : `${COMPLETENESS_THRESHOLDS.EXPLORE - pct}% more to unlock the platform.`;

  return (
    <div className={variant === "card" ? "rounded-lg border border-emce-border bg-white p-4 shadow-emce" : ""}>
      <div className="flex items-center gap-3">
        <svg width={donutSize} height={donutSize} viewBox={`0 0 ${donutSize} ${donutSize}`} className="-rotate-90 flex-shrink-0">
          <circle
            cx={donutSize / 2}
            cy={donutSize / 2}
            r={radius}
            strokeWidth={stroke}
            fill="none"
            className="stroke-emce-border"
          />
          <circle
            cx={donutSize / 2}
            cy={donutSize / 2}
            r={radius}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={tierColor.split(" ")[0]}
            style={{ transition: "stroke-dashoffset 400ms ease" }}
          />
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="middle"
            className={`rotate-90 origin-center font-extrabold ${tierColor.split(" ")[1]} ${variant === "inline" ? "text-[11px]" : "text-base"}`}
            style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
          >
            {pct}%
          </text>
        </svg>

        <div className="min-w-0 flex-1">
          <p className={`font-bold text-emce-text ${variant === "inline" ? "text-xs" : "text-sm"}`}>
            Profile completeness
          </p>
          <p className="mt-0.5 line-clamp-2 text-hint text-emce-text-sec">{headline}</p>
          {variant === "card" && !canExplore && (
            <p className="mt-1 inline-block rounded-full bg-emce-red-light px-2 py-0.5 text-[10px] font-bold text-emce-red-deep">
              Browsing limited
            </p>
          )}
          {variant === "card" && canExplore && !canApply && (
            <p className="mt-1 inline-block rounded-full bg-emce-orange-light px-2 py-0.5 text-[10px] font-bold text-emce-orange-deep">
              Apply locked
            </p>
          )}
          {variant === "card" && canApply && (
            <p className="mt-1 inline-block rounded-full bg-emce-light-soft px-2 py-0.5 text-[10px] font-bold text-emce-mid-muted">
              ✓ Fully unlocked
            </p>
          )}
        </div>
      </div>

      {remaining.length > 0 && (
        <div className={variant === "card" ? "mt-3 border-t border-emce-border pt-3" : "mt-2"}>
          {variant === "card" && (
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emce-text-sec">
                {inGatingBand
                  ? canExplore
                    ? "⚡ Quick path to apply"
                    : "⚡ Quick path to explore"
                  : "Next steps"}
              </p>
              {inGatingBand && (
                <span className="text-[10px] font-semibold text-emce-mid-muted">
                  Fewest steps
                </span>
              )}
            </div>
          )}
          <ul className={variant === "card" ? "mt-1.5 space-y-1" : "space-y-0.5"}>
            {remaining.map((s) => {
              // Pick a verb-first action label so the row reads as
              // a button rather than a static fact. "Verify your phone"
              // works as both label and action; for "Add" / "Pick"
              // ones we surface "Add" / "Pick" / "Set" inside the chip.
              const action = s.label.startsWith("Verify")
                ? "Verify"
                : s.label.startsWith("Pick")
                  ? "Pick"
                  : s.label.startsWith("Set")
                    ? "Set"
                    : s.label.startsWith("Showcase")
                      ? "Add"
                      : s.label.startsWith("Write")
                        ? "Write"
                        : "Add";
              return (
                <li key={s.id}>
                  <Link
                    href={s.href}
                    className={`group flex items-center justify-between gap-2 rounded-md border border-transparent text-sm transition hover:border-emce-mid hover:bg-emce-light-soft hover:shadow-emce ${
                      variant === "card" ? "px-2 py-2" : "px-1 py-0.5"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-emce-text">
                      {variant === "inline" ? `→ ${s.label}` : s.label}
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-1.5">
                      <span className="rounded-full bg-emce-light-bg px-2 py-0.5 text-[10px] font-bold text-emce-dark">
                        +{s.weight}%
                      </span>
                      {variant === "card" && (
                        <span className="hidden items-center gap-0.5 rounded bg-emce-darkest px-2 py-0.5 text-[10px] font-bold text-emce-mid group-hover:inline-flex">
                          {action}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-emce-text-sec transition group-hover:translate-x-0.5 group-hover:text-emce-dark" />
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
