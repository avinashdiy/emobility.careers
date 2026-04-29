import type { RecruiterRating as RatingShape } from "@/lib/sla";

/**
 * 5-star recruiter responsiveness rating, IIMjobs-style. Renders
 * nothing when the rating is null (insufficient data) so brand-new
 * companies don't get a misleading inferred score.
 *
 * Variants:
 *   - "pill"  → compact one-line pill ("★ 4.5 · Great") for the
 *               company hero next to the verified badge.
 *   - "card"  → multi-line card with breach-rate + median-response-
 *               time hint. Used in the company "About" section so
 *               candidates see *why* the rating is what it is.
 */
export function RecruiterRating({
  rating,
  variant = "pill",
  className,
}: {
  rating: RatingShape | null;
  variant?: "pill" | "card";
  className?: string;
}) {
  if (!rating) return null;
  const tone =
    rating.stars >= 4 ? "good"
    : rating.stars >= 3 ? "okay"
    : "poor";

  if (variant === "pill") {
    const toneClass =
      tone === "good" ? "bg-emce-light text-emce-darkest"
      : tone === "okay" ? "bg-emce-orange-light text-emce-orange"
      : "bg-emce-red-light text-emce-red";
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${toneClass} ${className ?? ""}`}
        title={`Median response: ${rating.medianDays ?? "?"} days · SLA breach rate: ${rating.breachRate}% · ${rating.sampleCount} applications sampled (last 90 days)`}
      >
        <Stars stars={rating.stars} />
        <span>{rating.stars.toFixed(1)} · {rating.label}</span>
      </span>
    );
  }

  // Card
  const cardTone =
    tone === "good" ? "border-emce-mid-muted bg-emce-light-soft"
    : tone === "okay" ? "border-emce-orange bg-emce-orange-light"
    : "border-emce-red bg-emce-red-light";
  return (
    <div className={`rounded-lg border p-3 ${cardTone} ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-emce-text-sec">
          Recruiter responsiveness
        </p>
        <span className="text-2xl font-extrabold text-emce-text">
          {rating.stars.toFixed(1)}
          <span className="ml-0.5 text-sm font-bold text-emce-text-sec">/5</span>
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <Stars stars={rating.stars} large />
        <span className="ml-1 text-sm font-bold text-emce-text">{rating.label}</span>
      </div>
      <ul className="mt-2 space-y-0.5 text-hint text-emce-text-sec">
        {rating.medianDays !== null && (
          <li>⚡ Typically responds in {rating.medianDays} {rating.medianDays === 1 ? "day" : "days"}</li>
        )}
        <li>📋 {rating.breachRate}% of applications hit an SLA breach</li>
        <li>📊 Sampled across {rating.sampleCount} applications (last 90 days)</li>
      </ul>
    </div>
  );
}

/**
 * Inline star row. Accepts decimals — 4.5 renders four full stars + a
 * half. Beyond 5 we cap visually (the rating helper already clamps).
 */
function Stars({ stars, large = false }: { stars: number; large?: boolean }) {
  const size = large ? "h-4 w-4" : "h-3 w-3";
  const items: React.ReactNode[] = [];
  for (let i = 1; i <= 5; i++) {
    if (stars >= i) items.push(<Star key={i} fill="full" className={size} />);
    else if (stars >= i - 0.5) items.push(<Star key={i} fill="half" className={size} />);
    else items.push(<Star key={i} fill="empty" className={size} />);
  }
  return <span className="inline-flex items-center gap-0">{items}</span>;
}

function Star({
  fill,
  className,
}: {
  fill: "full" | "half" | "empty";
  className?: string;
}) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className}>
      <defs>
        {/* Half-star uses a linear gradient so the left half is the
            current colour and the right half is the empty colour. */}
        <linearGradient id="star-half">
          <stop offset="50%" stopColor="currentColor" />
          <stop offset="50%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M10 1.5l2.6 5.3 5.9.9-4.3 4.2 1 5.9L10 15l-5.2 2.8 1-5.9L1.5 7.7l5.9-.9z"
        fill={fill === "full" ? "currentColor" : fill === "half" ? "url(#star-half)" : "none"}
        stroke="currentColor"
        strokeWidth={fill === "empty" ? 1 : 0.5}
      />
    </svg>
  );
}
