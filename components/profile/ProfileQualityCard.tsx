import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ProfileQualityResult } from "@/lib/profile-quality";

/**
 * #2 Wave A — Profile Quality Score card. Big 0-100 number on the
 * left, five horizontal axis bars on the right with the top hint
 * surfaced below each. Designed for the /me dashboard right rail —
 * sized to fit alongside the WhatsApp share + Coming-up cards.
 *
 * Tone bands (mirrors the existing completeness colours):
 *   < 50 → "Build it up" (warning tone)
 *   50-74 → "Getting there" (default)
 *   75-89 → "Strong" (success)
 *   ≥ 90 → "Outstanding" (verified)
 */
export function ProfileQualityCard({ result }: { result: ProfileQualityResult }) {
  const tone = ratingTone(result.total);

  return (
    <Card variant="glow" className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-section text-emce-text">Profile quality</h3>
        <Badge variant={tone.badge}>{tone.label}</Badge>
      </div>

      <div className="flex items-center gap-4">
        <p className="text-5xl font-extrabold leading-none emce-text-gradient tabular-nums">
          {result.total}
        </p>
        <p className="text-hint text-emce-text-sec">
          out of 100 ·{" "}
          <span className="font-bold text-emce-text">
            recruiter-visibility score
          </span>
          . Higher scores rank above peers in EV recruiter searches.
        </p>
      </div>

      <ul className="space-y-2">
        {result.axes.map((a) => (
          <li key={a.id}>
            <div className="flex items-baseline justify-between gap-2 text-hint">
              <span className="font-bold text-emce-text">{a.label}</span>
              <span className="text-emce-text-muted tabular-nums">{a.score}/100</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-emce-light-soft">
              <div
                className={`h-full transition-all ${barColor(a.score)}`}
                style={{ width: `${a.score}%` }}
              />
            </div>
            {a.score < 100 && a.hint && (
              <p className="mt-1 text-[11px] text-emce-text-muted">{a.hint}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ratingTone(score: number): {
  label: string;
  badge: "warning" | "default" | "success" | "verified";
} {
  if (score >= 90) return { label: "Outstanding", badge: "verified" };
  if (score >= 75) return { label: "Strong", badge: "success" };
  if (score >= 50) return { label: "Getting there", badge: "default" };
  return { label: "Build it up", badge: "warning" };
}

function barColor(score: number): string {
  if (score >= 75) return "bg-gradient-to-r from-emce-mid to-emce-light";
  if (score >= 50) return "bg-emce-mid";
  return "bg-emce-orange/70";
}
