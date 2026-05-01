import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
// Chrome (header + footer) comes from `app/me/layout.tsx`. Don't
// import SiteHeader/SiteFooter here — that double-stacks the bar.
import { Download, AlertTriangle, ShieldAlert } from "lucide-react";
import { softDeleteAccount } from "@/server/account/data-rights";
import { humanReason } from "@/lib/strikes";
import { relativeTime } from "@/lib/utils";
import { DataExportButton } from "@/components/profile/DataExportButton";

export const metadata = { title: "Account & data rights" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/account");

  // Pull strike + state info so the user knows where they stand.
  // Always shows even at 0 strikes ("Account in good standing")
  // because reassurance + transparency is the whole point of the
  // moderation surface.
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      strikes: true,
      accountState: true,
      suspendedUntil: true,
      strikesReceived: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, reason: true, note: true, createdAt: true, newStrikeCount: true },
      },
    },
  });
  const strikes = me?.strikes ?? 0;
  const accountState = me?.accountState ?? "ACTIVE";

  return (
    <>
      <div className="container max-w-2xl py-10">
        <h1 className="text-dashboard text-emce-text">Account &amp; data rights</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Your DPDPA / GDPR rights — download a copy of your data, or close
          your account and erase your record.
        </p>

        {/* Account standing — strikes + state. Visible at 0 strikes too
            so the user gets confirmation their record is clean. */}
        <Card className="mt-6 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldAlert
              className={`h-5 w-5 ${
                accountState === "BANNED" || accountState === "SUSPENDED"
                  ? "text-emce-red"
                  : accountState === "WARNED"
                    ? "text-emce-orange"
                    : "text-emce-mid"
              }`}
              aria-hidden
            />
            <h2 className="text-section text-emce-text">Account standing</h2>
            <Badge
              variant={
                accountState === "BANNED"
                  ? "danger"
                  : accountState === "SUSPENDED"
                    ? "warning"
                    : accountState === "WARNED"
                      ? "warning"
                      : "success"
              }
            >
              {strikes} strike{strikes === 1 ? "" : "s"} · {accountState}
            </Badge>
          </div>
          {accountState === "ACTIVE" && (
            <p className="mt-2 text-sm text-emce-text-sec">
              You're in good standing — no moderation actions on your record.
            </p>
          )}
          {accountState === "WARNED" && (
            <p className="mt-2 text-sm text-emce-text-sec">
              You have {strikes} strike{strikes === 1 ? "" : "s"}. The next
              strike will trigger a 7-day suspension. After 5 strikes, accounts
              are permanently banned.
            </p>
          )}
          {accountState === "SUSPENDED" && (
            <p className="mt-2 text-sm text-emce-red">
              Your account is suspended
              {me?.suspendedUntil
                ? ` until ${me.suspendedUntil.toLocaleString()}`
                : ""}
              . You can read content but can't post, comment, apply, or message.
              The suspension lifts automatically — you don't need to ask.
            </p>
          )}
          {accountState === "BANNED" && (
            <p className="mt-2 text-sm text-emce-red">
              Your account has been permanently banned. To appeal, email{" "}
              <strong>support@emobility.careers</strong>.
            </p>
          )}
          {me && me.strikesReceived.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-bold text-emce-text-sec">
                Strike history ({me.strikesReceived.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {me.strikesReceived.map((s) => (
                  <li key={s.id} className="rounded-md bg-emce-light-soft p-2 text-hint">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">#{s.newStrikeCount}</Badge>
                      <span className="font-bold text-emce-text">
                        {humanReason(s.reason)}
                      </span>
                      <span className="text-emce-text-muted">
                        · {relativeTime(s.createdAt)}
                      </span>
                    </div>
                    {s.note && (
                      <p className="mt-1 text-emce-text-sec">{s.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>

        <Card className="mt-6 p-5">
          <h2 className="text-section text-emce-text">Download my data</h2>
          <p className="mt-1 text-sm text-emce-text-sec">
            We'll build a JSON file containing every row we have on you —
            profile, applications, posts, comments, reactions, sent messages,
            saved jobs, alerts, and your audit trail. Counter-party data
            (recruiter notes / ratings on your applications) is stripped —
            that's the recruiter's record, not yours. We'll email you a
            download link valid for 24 hours.
          </p>
          <div className="mt-3">
            <DataExportButton />
          </div>
        </Card>

        <Card className="mt-4 border-emce-red bg-emce-red-light/30 p-5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-emce-red" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-section text-emce-red">Close my account</h2>
              <p className="mt-1 text-sm text-emce-text-sec">
                Closes your account and immediately scrubs your name, photo,
                and contact info from every public surface. Your posts +
                profile become PRIVATE so nobody else can see them. After
                30 days the remaining records are permanently deleted. You
                have those 30 days to email{" "}
                <strong>support@emobility.careers</strong> if you change your
                mind.
              </p>
              <form action={softDeleteAccount} className="mt-3 space-y-2">
                <Textarea
                  name="reason"
                  rows={2}
                  placeholder="Optional — anything we could've done better?"
                  maxLength={500}
                  aria-label="Reason for closing account"
                />
                <ConfirmSubmit
                  variant="destructive"
                  size="sm"
                  confirm="Close your account? Your name + photo are scrubbed immediately, your data deletes permanently after 30 days. This is reversible by emailing support."
                >
                  Close my account
                </ConfirmSubmit>
              </form>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
