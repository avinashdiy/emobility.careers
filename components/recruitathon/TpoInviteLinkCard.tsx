"use client";

/**
 * TPO invite-link card. Renders on /tpo dashboard for any approved
 * placement cell with an inviteToken. Shows the shareable URL +
 * one-click copy + per-fair "students from my link" counts.
 *
 * Client component because of the copy-to-clipboard interaction —
 * the rest of the dashboard stays a server component; this slot
 * just hydrates the share affordance.
 */

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function TpoInviteLinkCard({
  collegeName,
  inviteUrls,
  perFair,
}: {
  collegeName: string;
  /**
   * The first URL is the canonical link (the "primary fair" — usually
   * the soonest upcoming recruitment drive). Additional fairs render
   * as one-line entries under the primary CTA with their own count
   * + their own copy-link. Empty array → "no upcoming fairs to link
   * to" empty state.
   */
  inviteUrls: { driveSlug: string; driveTitle: string; url: string; registeredCount: number }[];
  perFair: { driveTitle: string; registeredCount: number; profileCompletePct: number; checkedInCount: number }[];
}) {
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  function copyToClipboard(url: string, slug: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 1500);
    });
  }

  return (
    <Card className="border-emce-mid bg-gradient-to-br from-white to-emce-light-soft p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-section text-emce-text">📨 Your invite links</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Share these URLs with {collegeName} students. Anyone who registers
            via them is auto-credited to your placement cell.
          </p>
        </div>
      </div>

      {inviteUrls.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-emce-border bg-white p-3 text-sm text-emce-text-sec">
          No active recruitment drives to link to right now. The next time we
          open a fair for registration, the invite link will appear here.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {inviteUrls.map((u) => (
            <li key={u.driveSlug} className="rounded-md border border-emce-border bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-emce-text">{u.driveTitle}</p>
                  <p className="text-hint text-emce-text-sec">
                    {u.registeredCount} student{u.registeredCount === 1 ? "" : "s"} registered via your link so far
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={copiedSlug === u.driveSlug ? "default" : "outline"}
                  onClick={() => copyToClipboard(u.url, u.driveSlug)}
                >
                  {copiedSlug === u.driveSlug ? "✓ Copied" : "📋 Copy link"}
                </Button>
              </div>
              <div className="mt-2 break-all rounded bg-emce-light-soft p-2 font-mono text-[11px] text-emce-text-sec">
                {u.url}
              </div>
            </li>
          ))}
        </ul>
      )}

      {perFair.length > 0 && (
        <div className="mt-5 border-t border-emce-border pt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emce-mid-muted">
            {collegeName} performance per fair
          </p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-hint text-emce-text-sec">
                <th className="py-1.5 font-normal">Fair</th>
                <th className="py-1.5 text-right font-normal">Registered</th>
                <th className="py-1.5 text-right font-normal">Avg profile %</th>
                <th className="py-1.5 text-right font-normal">Checked in</th>
              </tr>
            </thead>
            <tbody>
              {perFair.map((row) => (
                <tr key={row.driveTitle} className="border-t border-emce-border">
                  <td className="py-2 font-bold text-emce-text">{row.driveTitle}</td>
                  <td className="py-2 text-right tabular-nums text-emce-text">{row.registeredCount}</td>
                  <td className="py-2 text-right tabular-nums text-emce-text-sec">{row.profileCompletePct}%</td>
                  <td className="py-2 text-right tabular-nums text-emce-text-sec">{row.checkedInCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-hint text-emce-text-muted">
        💡 Tip: post the link in your placement WhatsApp group + LinkedIn page
        + send it from your TPO email. Students who register here automatically
        appear in your{" "}
        <Link href="/tpo/cohorts" className="font-bold text-emce-dark hover:underline">
          cohort dashboard
        </Link>
        .
      </p>
    </Card>
  );
}
