import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createEmailCampaign } from "@/server/admin/recruitathon-email-actions";

/**
 * Admin — Recruitathon bulk email. List of campaigns + a new-campaign
 * form. Import recipients (CSV) and send from the campaign detail page.
 */
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-emce-light-soft text-emce-dark",
  SENDING: "bg-emce-orange-light text-emce-orange-deep",
  SENT: "bg-emce-verified-bg text-emce-verified-text",
  FAILED: "bg-emce-red-light text-emce-red-deep",
};

export default async function RecruitathonEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const campaigns = await db.recruitathonEmailCampaign.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="container max-w-3xl py-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-emce-text">Recruitathon emails</h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        Import a CSV of student emails and send a bulk email via Amazon SES. Delivery / bounce reporting per campaign.
      </p>

      {sp.error && <p className="mt-4 rounded-md bg-emce-red-light p-3 text-sm font-semibold text-emce-red-deep">{sp.error}</p>}
      {sp.notice && <p className="mt-4 rounded-md bg-emce-light-soft p-3 text-sm font-semibold text-emce-dark">{sp.notice}</p>}

      <Card className="mt-6 p-5">
        <p className="text-section text-emce-text">New campaign</p>
        <form action={createEmailCampaign} className="mt-3 space-y-3">
          <div>
            <label className="text-hint font-bold text-emce-text-sec">Subject</label>
            <input name="subject" required minLength={2} maxLength={200} className="mt-1 w-full rounded-md border border-emce-border p-2.5 text-sm" placeholder="e.g. Your Bharat eMobility Recruitathon test link is live" />
          </div>
          <div>
            <label className="text-hint font-bold text-emce-text-sec">Body <span className="font-normal">(HTML supported)</span></label>
            <textarea name="bodyHtml" required rows={8} className="mt-1 w-full rounded-md border border-emce-border p-2.5 font-mono text-xs" placeholder={"<p>Hi there,</p>\n<p>Your test is ready: <a href=\"https://emobility.careers/recruitathon/onboarding\">start here</a>.</p>"} />
            <p className="mt-1 text-hint text-emce-text-muted">You&apos;ll import recipients (CSV) and send a test copy on the next screen before the real send.</p>
          </div>
          <Button type="submit">Create draft →</Button>
        </form>
      </Card>

      <h2 className="mt-8 text-section text-emce-text">Campaigns</h2>
      {campaigns.length === 0 ? (
        <p className="mt-2 text-sm text-emce-text-sec">No campaigns yet.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/admin/recruitathon/emails/${c.id}`} className="block">
              <Card className="flex items-center justify-between gap-3 p-4 transition hover:border-emce-mid">
                <div className="min-w-0">
                  <p className="truncate font-bold text-emce-text">{c.subject}</p>
                  <p className="text-hint text-emce-text-sec">
                    {c.recipientCount} recipients · sent {c.sentCount} · delivered {c.deliveredCount} · bounced {c.bouncedCount}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_BADGE[c.status] ?? ""}`}>{c.status}</span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
