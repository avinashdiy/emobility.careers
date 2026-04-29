import type { ApplicationStats } from "@/lib/applications-stats";

/**
 * One-line application tracker — "Applied 14 · Interviewed 3 · Offers 1".
 * Renders nothing when the candidate has zero applications (a banner-y
 * empty state belongs in the parent, not in the tracker itself).
 *
 * Each cell is keyboard-focusable + has an aria-label so screen readers
 * announce "3 interviews" rather than "3" alone.
 */
export function ApplicationTracker({ stats }: { stats: ApplicationStats }) {
  if (stats.applied === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <Cell label="Applied" value={stats.applied} tone="default" />
      <Cell label="Interviewed" value={stats.interviewed} tone="info" />
      <Cell label="Offers" value={stats.offers} tone="ok" highlight={stats.offers > 0} />
      <Cell label="Hired" value={stats.hired} tone="ok" highlight={stats.hired > 0} />
      <Cell label="Active" value={stats.active} tone="info" />
    </div>
  );
}

function Cell({
  label,
  value,
  tone = "default",
  highlight = false,
}: {
  label: string;
  value: number;
  tone?: "default" | "info" | "ok";
  highlight?: boolean;
}) {
  const toneClass =
    tone === "ok" ? "text-emce-mid-muted"
    : tone === "info" ? "text-emce-dark"
    : "text-emce-text";
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        highlight ? "border-emce-mid bg-emce-light-soft" : "border-emce-border bg-white"
      }`}
      aria-label={`${value} ${label.toLowerCase()}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-emce-text-sec">{label}</p>
      <p className={`mt-0.5 text-xl font-extrabold ${toneClass}`}>{value}</p>
    </div>
  );
}
