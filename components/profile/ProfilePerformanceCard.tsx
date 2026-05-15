import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/ui/animated-number";
import type { ProfilePerformanceStats } from "@/lib/profile-performance";

/**
 * #10 Wave A — Profile Performance card. Surfaces "you appeared in
 * N recruiter searches this week" with a 4-week sparkline + week-on-
 * week trend pill. Mirrors LinkedIn's "Profile views this week" stat.
 *
 * Renders only when the candidate has at least ONE impression on
 * record — a "0 searches this week" card is sad/noisy on a brand-new
 * profile and discourages users who haven't earned a result yet.
 */
export function ProfilePerformanceCard({
  stats,
}: {
  stats: ProfilePerformanceStats;
}) {
  if (stats.thisWeekImpressions === 0 && stats.lastWeekImpressions === 0) {
    return null;
  }

  const trend = trendPill(stats.weekOverWeekPct);
  const max = Math.max(1, ...stats.weeklyHistogram);

  return (
    <Card variant="interactive">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-section text-emce-text">Profile performance</h3>
        {trend && (
          <Badge variant={trend.tone}>
            {trend.symbol} {trend.label}
          </Badge>
        )}
      </div>

      <p className="mt-2 text-hint text-emce-text-sec">This week</p>
      <p className="mt-0.5 text-3xl font-extrabold leading-none text-emce-text tabular-nums">
        <AnimatedNumber to={stats.thisWeekImpressions} />
        <span className="ml-2 text-hint font-bold text-emce-text-sec">
          recruiter search{stats.thisWeekImpressions === 1 ? "" : "es"}
        </span>
      </p>

      {stats.distinctRecruitersThisWeek > 0 && (
        <p className="mt-1 text-hint text-emce-text-muted">
          From {stats.distinctRecruitersThisWeek} distinct recruiter{stats.distinctRecruitersThisWeek === 1 ? "" : "s"}
        </p>
      )}

      {/* Sparkline — 4-week histogram bars. Last bar (this week) is
          highlighted; previous weeks dim. */}
      <div className="mt-3 flex h-10 items-end gap-1.5">
        {stats.weeklyHistogram.map((v, i) => {
          const isCurrent = i === stats.weeklyHistogram.length - 1;
          return (
            <div key={i} className="flex flex-1 flex-col items-center">
              <div
                className={`w-full rounded-sm transition-all ${
                  isCurrent ? "bg-emce-mid" : "bg-emce-light-soft"
                }`}
                style={{ height: `${(v / max) * 100}%`, minHeight: "2px" }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5 text-[10px] text-emce-text-muted">
        {["3w ago", "2w ago", "1w ago", "This week"].map((w) => (
          <span key={w} className="flex-1 text-center">
            {w}
          </span>
        ))}
      </div>

      <p className="mt-3 text-hint text-emce-text-muted">
        Edit your profile, add a verified skill badge, or post in your domain
        to bump this number — recruiters search the freshest profiles first.{" "}
        <Link href="/me/profile" className="font-bold text-emce-dark hover:underline">
          Improve profile →
        </Link>
      </p>
    </Card>
  );
}

function trendPill(pct: number | null): {
  symbol: string;
  label: string;
  tone: "success" | "default" | "warning";
} | null {
  if (pct === null) return { symbol: "✨", label: "New this week", tone: "success" };
  if (pct >= 25) return { symbol: "▲", label: `+${pct}%`, tone: "success" };
  if (pct >= 5) return { symbol: "▲", label: `+${pct}%`, tone: "default" };
  if (pct <= -25) return { symbol: "▼", label: `${pct}%`, tone: "warning" };
  if (pct <= -5) return { symbol: "▼", label: `${pct}%`, tone: "default" };
  return null;
}
