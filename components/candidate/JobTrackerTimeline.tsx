import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";

/**
 * Timeline view across all of a candidate's applications. Renders
 * StageHistory rows in reverse-chronological order, grouped by job
 * for readability. Pure server component — no interactivity, no
 * server actions.
 *
 * The intent is "what happened to me this week?" — a candidate
 * applying to 20+ roles wants to see the activity stream without
 * clicking into each one. We surface only the events the candidate
 * cares about: stage moves and applied/withdrawn moments.
 */

export interface TimelineEvent {
  id: string;
  at: Date;
  /// One of: "applied" | "stage_change" | "withdrawn" | "saved"
  kind: string;
  fromStage: string | null;
  toStage: string;
  /// Whether the recruiter or the candidate triggered this. Drives
  /// the icon and the verb ("You applied", "Recruiter moved you to
  /// Interview").
  byCandidate: boolean;
  job: {
    id: string;
    slug: string;
    title: string;
    company: { name: string; logoUrl: string | null };
  };
}

const STAGE_LABEL: Record<string, string> = {
  APPLIED: "Applied",
  SCREENED: "Screened",
  SHORTLISTED: "Shortlisted",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Closed",
  WITHDRAWN: "Withdrawn",
};

function eventCopy(e: TimelineEvent): { icon: string; text: string; tone: "default" | "success" | "warning" | "danger" | "outline" } {
  if (e.kind === "applied") {
    return { icon: "📨", text: "You applied", tone: "default" };
  }
  if (e.kind === "withdrawn") {
    return { icon: "↩️", text: "You withdrew this application", tone: "outline" };
  }
  if (e.toStage === "HIRED") {
    return { icon: "🎉", text: "You were hired!", tone: "success" };
  }
  if (e.toStage === "OFFER") {
    return { icon: "💌", text: "Offer extended", tone: "success" };
  }
  if (e.toStage === "INTERVIEW") {
    return { icon: "📞", text: "Moved to interview", tone: "warning" };
  }
  if (e.toStage === "REJECTED") {
    return { icon: "✗", text: "Application closed", tone: "danger" };
  }
  if (e.toStage === "SHORTLISTED") {
    return { icon: "⭐", text: "Shortlisted", tone: "success" };
  }
  if (e.toStage === "ASSESSMENT") {
    return { icon: "📝", text: "Assessment requested", tone: "warning" };
  }
  return {
    icon: "→",
    text: `Stage changed: ${STAGE_LABEL[e.fromStage ?? "APPLIED"] ?? e.fromStage} → ${STAGE_LABEL[e.toStage] ?? e.toStage}`,
    tone: "default",
  };
}

export function JobTrackerTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="text-3xl">🕒</div>
        <p className="mt-2 text-section text-emce-text">No activity yet</p>
        <p className="mt-1 text-hint text-emce-text-sec">
          Applications and stage changes will show up here.
        </p>
      </Card>
    );
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const c = eventCopy(e);
        return (
          <li key={e.id}>
            <Card className="p-4">
              <div className="flex items-start gap-3">
                {/* Avatar slot — always renders the company logo when
                    available, falling back to the company initial.
                    We DON'T render the event icon here — the icon
                    sits beside the badge below, where it semantically
                    belongs (it describes the event, not the company). */}
                <div className="grid h-9 w-9 flex-shrink-0 place-items-center overflow-hidden rounded-md bg-emce-light-soft text-base font-extrabold text-emce-dark">
                  {e.job.company.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={e.job.company.logoUrl}
                      alt={e.job.company.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    e.job.company.name[0]?.toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span aria-hidden>{c.icon}</span>
                    <Badge variant={c.tone} size="sm">
                      {c.text}
                    </Badge>
                    <span className="text-hint text-emce-text-muted">
                      {relativeTime(e.at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">
                    <Link
                      href={`/job/${e.job.slug}`}
                      className="font-bold text-emce-text hover:underline"
                    >
                      {e.job.title}
                    </Link>{" "}
                    <span className="text-emce-text-sec">at {e.job.company.name}</span>
                  </p>
                </div>
              </div>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
