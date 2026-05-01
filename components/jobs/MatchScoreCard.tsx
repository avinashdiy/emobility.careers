import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Server-rendered card that surfaces the candidate-side match score
 * on a job detail page. Visual goal: make it obvious whether to
 * apply without reading the JD twice — big number, tone-coded,
 * three reason chips, optional caveats.
 *
 * No client-side state: the score arrives pre-computed from
 * `getOrComputeCandidateMatch`, so the entire card renders on the
 * server. If the score is null (no candidate, or compute errored)
 * we render nothing — the rest of the page is unaffected.
 */
export interface MatchScoreData {
  score: number;
  breakdown: {
    vectorScore: number;
    skillScore: number;
    domainScore: number;
    diyguruBoost: number;
    matchedSkills: string[];
    missingRequiredSkills: string[];
    sharedDomains: string[];
    reasons: string[];
    caveats: string[];
  };
}

function tone(score: number): {
  label: string;
  bg: string;
  text: string;
  bar: string;
  /// Stroke colour for the SVG progress ring. Direct hex (rather
  /// than a Tailwind text-class) because SVG `stroke=` won't pick
  /// up `currentColor` from the parent — we need to drive it
  /// inline.
  stroke: string;
} {
  // Three buckets — under 40 reads as "weak fit", 40–69 as "decent
  // fit", 70+ as "strong fit". Keeping the language honest is
  // important: candidates trust an "87% match" badge way less if the
  // platform routinely shows 87% for marginal fits.
  if (score >= 0.7) {
    return {
      label: "Strong match",
      bg: "bg-emce-light-soft",
      text: "text-emce-darkest",
      bar: "bg-emce-dark",
      stroke: "#374a47",
    };
  }
  if (score >= 0.4) {
    return {
      label: "Decent match",
      bg: "bg-emce-orange-light/60",
      text: "text-[#8a4a1a]",
      bar: "bg-emce-orange",
      stroke: "#ff8b3d",
    };
  }
  return {
    label: "Long shot",
    bg: "bg-emce-red-light/60",
    text: "text-emce-red",
    bar: "bg-emce-red",
    stroke: "#dc2626",
  };
}

export function MatchScoreCard({ match }: { match: MatchScoreData }) {
  const pct = Math.round(match.score * 100);
  const t = tone(match.score);
  // Render the per-axis sub-bars only when the parent score actually
  // varies across them — for a homogeneous "all 50s" score the bars
  // are noise, not signal. The threshold (0.05 stdev) is empirical.
  const subBars = [
    { name: "Skills", value: match.breakdown.skillScore },
    { name: "Profile fit", value: match.breakdown.vectorScore },
    { name: "Domain", value: match.breakdown.domainScore },
  ];

  return (
    <Card className={`p-5 ${t.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            For you
          </p>
          <h3 className={`mt-1 text-2xl font-extrabold ${t.text}`}>
            {pct}% match
          </h3>
          <p className={`text-hint font-bold ${t.text}`}>{t.label}</p>
        </div>
        {/* Progress ring — single inline SVG so we don't pull a chart
            library for one badge. Two concentric circles: a faint
            track + a foreground arc whose length is driven by
            stroke-dasharray. The arc starts at 12 o'clock (rotation
            -90°) and grows clockwise as `pct` increases, so 0% = no
            arc and 100% = full ring — accurate at every value, unlike
            the polygon clip-path approach this replaced. */}
        <div className="relative grid h-16 w-16 place-items-center" aria-hidden>
          <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90">
            {/* Track — full grey ring */}
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="white"
              stroke="#e5e7eb"
              strokeWidth="3"
            />
            {/* Foreground arc — circumference is 2πr ≈ 100.5 for r=16,
                rounded to 100 so dasharray = pct directly. */}
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke={t.stroke}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${pct} 100`}
              pathLength={100}
            />
          </svg>
          <span className={`relative font-extrabold ${t.text}`}>{pct}</span>
        </div>
      </div>

      {/* Reasons — the most-load-bearing part of the card. We cap at 3
          so the list doesn't dominate the apply column. */}
      {match.breakdown.reasons.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {match.breakdown.reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-emce-text">
              <span className="mt-0.5 text-emce-dark" aria-hidden>
                ✓
              </span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Caveats — render only when we have something honest to say.
          For a Strong match we usually skip this entirely. */}
      {match.breakdown.caveats.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-emce-border pt-3">
          {match.breakdown.caveats.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-hint text-emce-text-sec">
              <span className="mt-0.5 text-emce-orange" aria-hidden>
                !
              </span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Per-axis sub-bars. Useful for the "I'm 60%, where's the gap?"
          curiosity. Hidden by default behind a <details> so the
          eye-catching number stays the hero. */}
      <details className="mt-4 group">
        <summary className="cursor-pointer list-none border-t border-emce-border pt-3 text-hint font-bold text-emce-dark hover:underline">
          <span className="group-open:hidden">How is this calculated? →</span>
          <span className="hidden group-open:inline">Hide details</span>
        </summary>
        <div className="mt-3 space-y-2">
          {subBars.map((b) => {
            const v = Math.round(b.value * 100);
            return (
              <div key={b.name} className="text-hint">
                <div className="flex items-center justify-between">
                  <span className="text-emce-text-sec">{b.name}</span>
                  <span className="font-bold text-emce-text">{v}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-emce-border">
                  <div
                    className={`h-full rounded-full ${t.bar}`}
                    style={{ width: `${v}%` }}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-hint text-emce-text-muted">
            Score blends profile-fit (50%), skill overlap (25%), EV-domain
            overlap (15%), plus a DIYguru-verified boost. Refreshes after
            7 days or when you edit your profile.
          </p>
        </div>
      </details>

      {/* Top matched skills — secondary chip strip. Reads "you and the
          job both list X, Y, Z" which is reassurance you're not
          fooling yourself when the score is decent-but-not-strong. */}
      {match.breakdown.matchedSkills.length > 0 && (
        <div className="mt-4 border-t border-emce-border pt-3">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Skills you both share
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {match.breakdown.matchedSkills.slice(0, 8).map((s) => (
              <Badge key={s} variant="success" size="sm">
                {s}
              </Badge>
            ))}
            {match.breakdown.matchedSkills.length > 8 && (
              <Badge variant="default" size="sm">
                +{match.breakdown.matchedSkills.length - 8}
              </Badge>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Compact inline pill used in lists ("87% match" next to a job card
 * on /jobs). No reasons, just the number + tone — when the user
 * clicks through they get the full MatchScoreCard.
 */
export function MatchScorePill({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const t = tone(score);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${t.bg} ${t.text}`}
      title={t.label}
    >
      <span aria-hidden>★</span> {pct}% match
    </span>
  );
}
