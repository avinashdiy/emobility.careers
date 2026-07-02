import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { importRecipients, sendTestEmail, sendCampaign, deleteCampaign } from "@/server/admin/recruitathon-email-actions";

/**
 * Admin — one Recruitathon email campaign: import CSV recipients, send a
 * test copy, fire the real (queued) send, and read the delivery report.
 */
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-emce-light-soft text-emce-dark",
  SENDING: "bg-emce-orange-light text-emce-orange-deep",
  SENT: "bg-emce-verified-bg text-emce-verified-text",
  FAILED: "bg-emce-red-light text-emce-red-deep",
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-emce-success-deep" : tone === "bad" ? "text-emce-red-deep" : tone === "warn" ? "text-emce-orange-deep" : "text-emce-dark";
  return (
    <div className="rounded-md border border-emce-border bg-white p-3 text-center">
      <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
      <p className="text-hint text-emce-text-sec">{label}</p>
    </div>
  );
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;
  const sp = await searchParams;

  const campaign = await db.recruitathonEmailCampaign.findUnique({ where: { id } });
  if (!campaign) notFound();

  const grouped = await db.recruitathonEmailRecipient.groupBy({ by: ["status"], where: { campaignId: id }, _count: true });
  const n = (s: string) => grouped.find((g) => g.status === s)?._count ?? 0;
  const total = grouped.reduce((sum, g) => sum + g._count, 0);
  const pending = n("PENDING"), sent = n("SENT"), delivered = n("DELIVERED"), bounced = n("BOUNCED"), complained = n("COMPLAINED"), failed = n("FAILED");
  const attempted = sent + delivered + bounced + complained;

  // Problem recipients (bounced / complained / send-failed) — the rows an
  // admin actually needs to see; delivered/sent are summarised by counts.
  const problems = await db.recruitathonEmailRecipient.findMany({
    where: { campaignId: id, status: { in: ["FAILED", "BOUNCED", "COMPLAINED"] } },
    orderBy: { status: "asc" },
    take: 500,
    select: { email: true, status: true, error: true, bouncedAt: true },
  });

  const canSend = (campaign.status === "DRAFT" || campaign.status === "FAILED") && total > 0;

  return (
    <div className="container max-w-3xl py-8">
      <nav className="text-hint text-emce-text-muted">
        <Link href="/admin/recruitathon/emails" className="font-bold text-emce-dark hover:underline">Recruitathon emails</Link>
        <span className="mx-1.5">›</span><span>Campaign</span>
      </nav>
      <div className="mt-2 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-emce-text">{campaign.subject}</h1>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_BADGE[campaign.status] ?? ""}`}>{campaign.status}</span>
      </div>

      {sp.error && <p className="mt-4 rounded-md bg-emce-red-light p-3 text-sm font-semibold text-emce-red-deep">{sp.error}</p>}
      {sp.notice && <p className="mt-4 rounded-md bg-emce-light-soft p-3 text-sm font-semibold text-emce-dark">{sp.notice}</p>}

      {/* Report */}
      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label="Recipients" value={total} />
        <Stat label="Delivered" value={delivered} tone="good" />
        <Stat label="Bounced" value={bounced} tone="bad" />
        <Stat label="Complained" value={complained} tone="warn" />
        <Stat label="Sent*" value={sent} />
        <Stat label="Failed" value={failed} tone="bad" />
      </div>
      <p className="mt-1.5 text-hint text-emce-text-muted">
        {pending > 0 && `${pending} not yet sent. `}
        *&ldquo;Sent&rdquo; = handed to SES, awaiting a delivery/bounce event. Delivered &amp; bounced populate as SES reports them (open/click reporting is not enabled yet).
      </p>

      {/* Body preview */}
      <Card className="mt-5 p-5">
        <p className="text-hint font-bold uppercase tracking-wide text-emce-mid-muted">Message preview</p>
        <div className="prose prose-sm mt-2 max-w-none rounded-md border border-emce-border bg-white p-3 text-sm" dangerouslySetInnerHTML={{ __html: campaign.bodyHtml }} />
      </Card>

      {campaign.status === "DRAFT" && (
        <Card className="mt-4 p-5">
          <p className="text-section text-emce-text">1 · Import recipients (CSV)</p>
          <p className="mt-1 text-sm text-emce-text-sec">Upload a CSV — we extract &amp; dedupe every email address in it (any column, with or without headers).</p>
          <form action={importRecipients} className="mt-3 flex flex-wrap items-center gap-3">
            <input type="hidden" name="campaignId" value={id} />
            <input type="file" name="csv" accept=".csv,text/csv" required className="block text-sm text-emce-text-sec file:mr-3 file:rounded-md file:border-0 file:bg-emce-dark file:px-4 file:py-2 file:text-sm file:font-bold file:text-emce-light hover:file:bg-emce-darkest" />
            <Button type="submit" variant="outline">Import CSV</Button>
          </form>
        </Card>
      )}

      <Card className="mt-4 p-5">
        <p className="text-section text-emce-text">{campaign.status === "DRAFT" ? "2 · " : ""}Send a test first</p>
        <form action={sendTestEmail} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="campaignId" value={id} />
          <input name="testEmail" type="email" placeholder={session.user.email ?? "you@example.com"} className="rounded-md border border-emce-border p-2 text-sm" />
          <Button type="submit" variant="outline">Send test</Button>
        </form>
      </Card>

      {canSend && (
        <Card className="mt-4 border-2 border-emce-dark p-5">
          <p className="text-section text-emce-text">{campaign.status === "DRAFT" ? "3 · " : ""}Send to all {total} recipients</p>
          <p className="mt-1 text-sm text-emce-text-sec">This sends a real email to every recipient via Amazon SES. It can&apos;t be undone. Send a test first.</p>
          <form action={sendCampaign} className="mt-3">
            <input type="hidden" name="campaignId" value={id} />
            <ConfirmSubmit confirm={`Send this email to ${total} recipients now? This cannot be undone.`} size="lg" pendingLabel="Starting…">
              Send to {total} recipients →
            </ConfirmSubmit>
          </form>
        </Card>
      )}

      {campaign.status === "SENDING" && (
        <p className="mt-4 rounded-md bg-emce-orange-light p-3 text-sm font-semibold text-emce-orange-deep">
          Sending in progress — {attempted}/{total} handed to SES. Refresh to update.
        </p>
      )}

      {/* Problem recipients */}
      {problems.length > 0 && (
        <div className="mt-6">
          <h2 className="text-section text-emce-text">Bounced / failed ({problems.length}{problems.length === 500 ? "+" : ""})</h2>
          <div className="mt-2 overflow-hidden rounded-md border border-emce-border">
            <table className="w-full text-sm">
              <thead className="bg-emce-light-soft text-left text-hint text-emce-text-sec">
                <tr><th className="p-2">Email</th><th className="p-2">Status</th><th className="p-2">Reason</th></tr>
              </thead>
              <tbody>
                {problems.map((p, i) => (
                  <tr key={i} className="border-t border-emce-border">
                    <td className="p-2 text-emce-text">{p.email}</td>
                    <td className="p-2 font-bold text-emce-red-deep">{p.status}</td>
                    <td className="p-2 text-hint text-emce-text-sec">{p.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(campaign.status === "DRAFT" || campaign.status === "FAILED") && (
        <form action={deleteCampaign} className="mt-8">
          <input type="hidden" name="campaignId" value={id} />
          <ConfirmSubmit confirm="Delete this draft campaign?" variant="outline" size="sm">Delete campaign</ConfirmSubmit>
        </form>
      )}
    </div>
  );
}
