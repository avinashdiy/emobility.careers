import Link from "next/link";
import { COMPLETENESS_THRESHOLDS, nextSteps, type CompletenessResult } from "@/lib/profile-completeness";

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
    : pct >= COMPLETENESS_THRESHOLDS.EXPLORE ? "stroke-emce-orange text-emce-orange"
    : "stroke-emce-red text-emce-red";

  // The inline variant is meant for sidebars where vertical space is
  // scarce — drop the next-steps list to a single top suggestion.
  const remaining = nextSteps(result, variant === "inline" ? 1 : 5);
  const headline =
    pct >= COMPLETENESS_THRESHOLDS.APPLY ? "Profile fully unlocked — you can apply to any job."
    : pct >= COMPLETENESS_THRESHOLDS.EXPLORE ? `${COMPLETENESS_THRESHOLDS.APPLY - pct}% more to apply for jobs.`
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
            <p className="mt-1 inline-block rounded-full bg-emce-red-light px-2 py-0.5 text-[10px] font-bold text-emce-red">
              Browsing limited
            </p>
          )}
          {variant === "card" && canExplore && !canApply && (
            <p className="mt-1 inline-block rounded-full bg-emce-orange-light px-2 py-0.5 text-[10px] font-bold text-emce-orange">
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
            <p className="text-[11px] font-bold uppercase tracking-wide text-emce-text-sec">
              Next steps
            </p>
          )}
          <ul className={variant === "card" ? "mt-1.5 space-y-1" : "space-y-0.5"}>
            {remaining.map((s) => (
              <li key={s.id}>
                <Link
                  href={s.href}
                  className={`flex items-center justify-between rounded-md text-sm hover:bg-emce-light-soft ${
                    variant === "card" ? "px-2 py-1.5" : "px-1 py-0.5"
                  }`}
                >
                  <span className="truncate text-emce-text">
                    {variant === "inline" ? `→ ${s.label}` : s.label}
                  </span>
                  <span className="ml-2 flex-shrink-0 rounded-full bg-emce-light-bg px-2 py-0.5 text-[10px] font-bold text-emce-dark">
                    +{s.weight}%
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
