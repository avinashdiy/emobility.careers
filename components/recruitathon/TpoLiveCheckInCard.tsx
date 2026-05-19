import Link from "next/link";
import { Card } from "@/components/ui/card";
import { relativeTime } from "@/lib/utils";

/**
 * Live check-in card for the TPO dashboard. Renders only when at
 * least one fair the TPO has students at is IN_PROGRESS — gives the
 * placement officer single-glance visibility on "how many of my
 * students have arrived" without leaving the dashboard.
 *
 * Auto-refreshes every 30 seconds via meta-refresh. Same pattern as
 * the admin live event dashboard. 30s vs 15s: TPOs have less
 * operational urgency than admins (admins drive the venue ops; TPOs
 * just watch their cohort) so the cache hit is fine.
 */
export function TpoLiveCheckInCard({
  collegeName,
  liveFairs,
}: {
  collegeName: string;
  liveFairs: {
    driveTitle: string;
    driveSlug: string;
    totalRegistered: number;
    checkedIn: number;
    recentlyCheckedIn: {
      candidateName: string;
      candidateSlug: string;
      checkedInAt: Date;
    }[];
  }[];
}) {
  return (
    <Card className="border-2 border-emce-mid bg-gradient-to-br from-white to-emce-mid-soft p-5">
      {/* Meta-refresh — refreshes every 30s while a live fair is in
          progress. Disabled implicitly when the section unmounts
          (no live fairs → card is hidden by parent). */}
      <meta httpEquiv="refresh" content="30" />
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-emce-mid-deep">
            ⚡ Live now
          </p>
          <h2 className="mt-1 text-section text-emce-text">
            {collegeName} — fair-day check-ins
          </h2>
        </div>
        <span className="rounded-full bg-emce-mid px-2 py-0.5 text-[10px] font-bold uppercase text-white">
          Auto-refresh 30s
        </span>
      </div>

      <ul className="mt-4 space-y-4">
        {liveFairs.map((f) => {
          const pct = f.totalRegistered > 0
            ? Math.round((f.checkedIn / f.totalRegistered) * 100)
            : 0;
          return (
            <li key={f.driveSlug} className="rounded-md border border-emce-border bg-white p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold text-emce-text">{f.driveTitle}</p>
                <Link
                  href={`/fairs/${f.driveSlug}`}
                  className="text-xs font-bold text-emce-dark hover:underline"
                >
                  Fair page →
                </Link>
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-3xl font-extrabold tabular-nums text-emce-text">
                  {f.checkedIn}
                </span>
                <span className="text-emce-text-sec">
                  of {f.totalRegistered} students checked in ·{" "}
                  <strong className="text-emce-text">{pct}%</strong>
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-emce-light-soft">
                <div
                  className="h-full bg-emce-mid transition-all"
                  style={{ width: `${pct}%` }}
                  aria-hidden="true"
                />
              </div>
              {f.recentlyCheckedIn.length > 0 && (
                <div className="mt-3 border-t border-emce-border pt-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emce-text-muted">
                    Last 5 check-ins
                  </p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {f.recentlyCheckedIn.map((r) => (
                      <li key={r.candidateSlug + r.checkedInAt.getTime()} className="flex items-center justify-between">
                        <Link href={`/${r.candidateSlug}`} className="font-bold text-emce-text hover:underline">
                          {r.candidateName}
                        </Link>
                        <span className="text-hint text-emce-text-muted">
                          {relativeTime(r.checkedInAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
