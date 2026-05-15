import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  InterviewBreakdown,
  InterviewFeedbackItem,
} from "@/lib/ai/interview";

/**
 * Result view shown after a candidate ends a mock-interview or
 * simulator session. Mirrors the Roast Resume result card visually
 * so users get a consistent "AI scoring" experience across tools —
 * big number on the left, per-dimension bars, prioritised feedback
 * list, summary paragraph below.
 */

const DIM_LABELS: Record<keyof InterviewBreakdown, { label: string; emoji: string }> = {
  technicalDepth: { label: "Technical depth", emoji: "🔋" },
  communicationClarity: { label: "Communication", emoji: "💬" },
  structuredThinking: { label: "Structured thinking", emoji: "📐" },
  evIndustryAwareness: { label: "EV industry awareness", emoji: "🏭" },
  behaviouralFit: { label: "Behavioural fit", emoji: "🤝" },
};

const SEVERITY_TONE: Record<InterviewFeedbackItem["severity"], string> = {
  high: "border-emce-red bg-emce-red-light text-emce-red-deep",
  medium: "border-emce-orange bg-emce-orange-light text-emce-orange-deep",
  low: "border-emce-border bg-emce-light-soft text-emce-text-sec",
};

const SEVERITY_LABEL: Record<InterviewFeedbackItem["severity"], string> = {
  high: "Top priority",
  medium: "Worth fixing",
  low: "Nice to have",
};

interface Props {
  overall: number;
  breakdown: InterviewBreakdown;
  feedback: InterviewFeedbackItem[];
  summary: string;
}

export function InterviewResultCard({ overall, breakdown, feedback, summary }: Props) {
  const tier =
    overall >= 85 ? { label: "Hire signal", tone: "bg-emce-mid text-emce-darkest" }
    : overall >= 70 ? { label: "Strong", tone: "bg-emce-light text-emce-darkest" }
    : overall >= 55 ? { label: "Promising", tone: "bg-emce-orange-light text-emce-orange-deep" }
    : overall >= 40 ? { label: "Needs work", tone: "bg-emce-orange text-white" }
    : { label: "Practice more", tone: "bg-emce-red text-white" };

  return (
    <div className="space-y-4">
      <Card className="emce-hero-gradient text-white">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <p className="text-hint font-bold uppercase tracking-wide text-emce-mid">
              Your interview score
            </p>
            <p className="mt-1 text-5xl font-extrabold leading-none text-white">
              {overall}
              <span className="ml-1 text-2xl text-white/60">/100</span>
            </p>
            <Badge className={`mt-3 ${tier.tone}`}>{tier.label}</Badge>
          </div>
          {summary && (
            <p className="basis-full text-white/90 sm:basis-1/2">{summary}</p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-section text-emce-text">Per-dimension breakdown</h2>
        <ul className="mt-3 space-y-2">
          {(Object.keys(DIM_LABELS) as (keyof InterviewBreakdown)[]).map((key) => {
            const value = breakdown[key];
            const dim = DIM_LABELS[key];
            return (
              <li key={key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emce-text">
                    {dim.emoji} {dim.label}
                  </span>
                  <span className="font-bold text-emce-text">{value}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-emce-light-soft">
                  <div
                    className="h-full rounded-full bg-emce-mid"
                    style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {feedback.length > 0 && (
        <Card>
          <h2 className="text-section text-emce-text">What to work on</h2>
          <ul className="mt-3 space-y-3">
            {feedback.map((f, i) => (
              <li
                key={i}
                className={`rounded-md border-l-4 p-3 ${SEVERITY_TONE[f.severity]}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="text-sm">{f.title}</strong>
                  <span className="text-hint font-bold uppercase tracking-wide">
                    {SEVERITY_LABEL[f.severity]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-emce-text">{f.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
