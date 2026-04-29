import { formatResponse, type ResponseStats } from "@/lib/sla";

/**
 * "Recruiter typically responds in 2 days" pill — IIMjobs-style trust
 * signal. Renders nothing when stats are null (insufficient data) so
 * brand-new companies don't get an inferred-from-thin-air number.
 *
 * Three tones map to a color cue: green (<2 days), amber (2–6 days),
 * red (≥7 days). Tooltip on hover reveals the sample size for honesty.
 */
export function ResponseTimePill({ stats, className }: { stats: ResponseStats | null; className?: string }) {
  const formatted = formatResponse(stats);
  if (!formatted || !stats) return null;
  const toneClass =
    formatted.tone === "fast" ? "bg-emce-light text-emce-darkest"
    : formatted.tone === "typical" ? "bg-emce-orange-light text-emce-orange"
    : "bg-emce-red-light text-emce-red";
  const dot =
    formatted.tone === "fast" ? "bg-emce-mid"
    : formatted.tone === "typical" ? "bg-emce-orange"
    : "bg-emce-red";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${toneClass} ${className ?? ""}`}
      title={`Median over the last 90 days · ${stats.sampleCount} application${stats.sampleCount === 1 ? "" : "s"} sampled`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
      ⚡ {formatted.label}
    </span>
  );
}
