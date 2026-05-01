import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";
import type { WhosMovingRow } from "@/lib/pulse";

/**
 * The "Who's Moving" feed — a public, opt-in stream of recent EV-
 * industry job changes. Visible on /pulse. Powers the social-proof
 * narrative ("EV is hiring") that the Pulse page is built around.
 *
 * Privacy stance: we render this exclusively from
 * JobChangeAnnouncement rows that the candidate explicitly wrote
 * (the worker doesn't auto-announce — see workers/processors/
 * profile-changes.ts comment for the rationale). So if a candidate
 * is here, they wanted to be.
 *
 * No congrats interaction in v1 — the row is read-only on Pulse.
 * A future revision can add a "Congrats!" button that pings the
 * person's notifications inbox.
 */

export function WhosMovingFeed({ rows }: { rows: WhosMovingRow[] }) {
  if (rows.length === 0) {
    // Quiet empty-state. Pulse's job is to feel alive, so we show a
    // light prompt rather than a Big Empty Message.
    return (
      <Card className="p-5 text-center">
        <p className="text-hint text-emce-text-sec">
          When professionals announce new EV-industry roles, they&apos;ll appear
          here. <Link href="/me/preferences" className="font-bold text-emce-dark hover:underline">
            Opt in →
          </Link>
        </p>
      </Card>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id}>
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <Link href={`/${r.candidateSlug}`} className="flex-shrink-0">
                <Avatar src={r.candidatePhotoUrl} name={r.candidateName} size="md" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <Link
                    href={`/${r.candidateSlug}`}
                    className="font-bold text-emce-text hover:underline"
                  >
                    {r.candidateName}
                  </Link>{" "}
                  <span className="text-emce-text-sec">
                    {r.fromTitle && r.fromCompany
                      ? `moved on from ${r.fromTitle} at ${r.fromCompany}`
                      : "started a new role"}
                  </span>
                </p>
                <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                  <Badge variant="success" size="sm">
                    {r.toTitle}
                  </Badge>
                  <span className="text-hint text-emce-text-muted">at</span>
                  {r.toCompanySlug ? (
                    <Link
                      href={`/company/${r.toCompanySlug}`}
                      className="font-bold text-emce-dark hover:underline"
                    >
                      {r.toCompany}
                    </Link>
                  ) : (
                    <span className="font-bold text-emce-text">{r.toCompany}</span>
                  )}
                  <span className="text-hint text-emce-text-muted">
                    · {relativeTime(r.createdAt)}
                  </span>
                </div>
                {r.note && (
                  <p className="mt-2 whitespace-pre-line rounded-md bg-emce-light-soft p-2 text-sm text-emce-text-sec">
                    {r.note}
                  </p>
                )}
                {r.congratsCount > 0 && (
                  <p className="mt-2 text-hint text-emce-text-muted">
                    🎉 {r.congratsCount} congrats
                  </p>
                )}
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
