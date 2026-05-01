import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { relativeTime } from "@/lib/utils";
import type { Prisma, DeliveryChannel } from "@prisma/client";

export const metadata = { title: "Delivery health" };
export const dynamic = "force-dynamic";

const RANGES = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

const KIND_TONE: Record<string, "default" | "success" | "warning" | "danger" | "outline"> = {
  ACCEPTED: "default",
  DELIVERED: "success",
  BOUNCED: "danger",
  COMPLAINED: "danger",
  DEFERRED: "warning",
  FAILED: "danger",
  OPENED: "outline",
  CLICKED: "outline",
};

export default async function DeliveryHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; channel?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const range = RANGES.find((r) => r.label === sp.range) ?? RANGES[1];
  const since = new Date(Date.now() - range.days * 24 * 3600 * 1000);
  const channelFilter: DeliveryChannel | null =
    sp.channel === "EMAIL" || sp.channel === "SMS" || sp.channel === "WHATSAPP"
      ? sp.channel
      : null;

  const where: Prisma.EmailDeliveryEventWhereInput = {
    occurredAt: { gte: since },
    ...(channelFilter ? { channel: channelFilter } : {}),
  };

  const [byKind, recentBounces, recentComplaints, totals] = await Promise.all([
    db.emailDeliveryEvent.groupBy({
      by: ["channel", "kind", "provider"],
      where,
      _count: { _all: true },
    }),
    db.emailDeliveryEvent.findMany({
      where: { ...where, kind: "BOUNCED" },
      orderBy: { occurredAt: "desc" },
      take: 25,
      select: {
        id: true,
        recipient: true,
        provider: true,
        reason: true,
        occurredAt: true,
        channel: true,
      },
    }),
    db.emailDeliveryEvent.findMany({
      where: { ...where, kind: "COMPLAINED" },
      orderBy: { occurredAt: "desc" },
      take: 10,
      select: {
        id: true,
        recipient: true,
        provider: true,
        reason: true,
        occurredAt: true,
      },
    }),
    db.emailDeliveryEvent.aggregate({
      where,
      _count: { _all: true },
    }),
  ]);

  // Compute % bounce, % complaint, % delivered over the active range.
  // We sum from byKind to avoid an extra query — already grouped in DB.
  let acceptedOrDelivered = 0;
  let bounced = 0;
  let complained = 0;
  let delivered = 0;
  for (const r of byKind) {
    const n = r._count?._all ?? 0;
    if (r.kind === "ACCEPTED") acceptedOrDelivered += n;
    if (r.kind === "DELIVERED") {
      acceptedOrDelivered += n;
      delivered += n;
    }
    if (r.kind === "BOUNCED") bounced += n;
    if (r.kind === "COMPLAINED") complained += n;
  }
  const denominator = Math.max(1, acceptedOrDelivered + bounced + complained);
  const pct = (n: number) => `${((n / denominator) * 100).toFixed(2)}%`;

  return (
    <AdminShell>
      <div className="container max-w-6xl py-10">
        <h1 className="text-dashboard text-emce-text">Delivery health</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Provider events captured at <code>/api/webhooks/delivery</code>. Configure SES
          SNS / Resend / MSG91 to POST there. Bounce &gt; 5% or Complaint &gt; 0.1%
          puts sender reputation at risk — investigate immediately.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <Link
                key={r.label}
                href={`/admin/delivery?range=${r.label}${channelFilter ? `&channel=${channelFilter}` : ""}`}
                aria-pressed={range.label === r.label}
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                  range.label === r.label
                    ? "bg-emce-dark text-emce-light"
                    : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </div>
          <span className="h-4 w-px bg-emce-border" aria-hidden />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by channel">
            {(["all", "EMAIL", "SMS", "WHATSAPP"] as const).map((c) => {
              const href =
                c === "all"
                  ? `/admin/delivery?range=${range.label}`
                  : `/admin/delivery?range=${range.label}&channel=${c}`;
              const active = (channelFilter ?? "all") === c;
              return (
                <Link
                  key={c}
                  href={href}
                  aria-pressed={active}
                  className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                    active ? "bg-emce-mid text-white" : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
                  }`}
                >
                  {c.toLowerCase()}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Tile label="Total events" value={(totals._count?._all ?? 0).toLocaleString()} />
          <Tile label="Delivered" value={delivered.toLocaleString()} sub={pct(delivered)} tone="success" />
          <Tile
            label="Bounced"
            value={bounced.toLocaleString()}
            sub={pct(bounced)}
            tone={bounced / denominator > 0.05 ? "danger" : "default"}
          />
          <Tile
            label="Complaints"
            value={complained.toLocaleString()}
            sub={pct(complained)}
            tone={complained / denominator > 0.001 ? "danger" : "default"}
          />
        </div>

        <Card className="mt-6 overflow-x-auto p-0">
          <h2 className="px-5 pt-5 text-section text-emce-text">By channel × kind × provider</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="bg-emce-light-soft text-left text-xs font-bold uppercase text-emce-text-sec">
              <tr>
                <th scope="col" className="p-3">Channel</th>
                <th scope="col" className="p-3">Provider</th>
                <th scope="col" className="p-3">Event</th>
                <th scope="col" className="p-3 text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emce-border">
              {byKind.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-emce-text-sec">
                    No events recorded. Provider webhooks need to POST to{" "}
                    <code>/api/webhooks/delivery</code>.
                  </td>
                </tr>
              ) : (
                byKind
                  .slice()
                  .sort((a, b) => (b._count?._all ?? 0) - (a._count?._all ?? 0))
                  .map((r) => (
                    <tr key={`${r.channel}/${r.provider}/${r.kind}`}>
                      <td className="p-3 font-bold text-emce-text">{r.channel}</td>
                      <td className="p-3 text-emce-text-sec">{r.provider}</td>
                      <td className="p-3">
                        <Badge variant={KIND_TONE[r.kind] ?? "outline"}>{r.kind}</Badge>
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {(r._count?._all ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </Card>

        {recentBounces.length > 0 && (
          <Card className="mt-6 p-5">
            <h2 className="text-section text-emce-text">Recent bounces</h2>
            <ul className="mt-3 space-y-2">
              {recentBounces.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emce-red/30 bg-emce-red-light/30 p-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-emce-text">{b.recipient}</span>
                    <span className="ml-2 text-hint text-emce-text-muted">
                      via {b.provider} · {b.channel}
                    </span>
                  </div>
                  {b.reason && <Badge variant="danger">{b.reason}</Badge>}
                  <span className="text-hint text-emce-text-muted">
                    {relativeTime(b.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {recentComplaints.length > 0 && (
          <Card className="mt-6 p-5">
            <h2 className="text-section text-emce-text">Recent complaints</h2>
            <p className="mt-1 text-hint text-emce-text-sec">
              Even one of these is concerning — sender reputation suffers
              immediately. Investigate the campaign that triggered them.
            </p>
            <ul className="mt-3 space-y-2">
              {recentComplaints.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emce-red bg-emce-red-light p-2 text-sm"
                >
                  <span className="font-bold text-emce-text">{c.recipient}</span>
                  <span className="text-hint text-emce-text-muted">
                    {c.provider} · {relativeTime(c.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}

function Tile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "danger";
}) {
  const ringClass =
    tone === "danger"
      ? "border-emce-red bg-emce-red-light/40"
      : tone === "success"
        ? "border-emce-mid"
        : "";
  return (
    <Card className={`p-5 ${ringClass}`}>
      <div className="text-xs uppercase tracking-wide text-emce-text-muted">{label}</div>
      <div className="mt-1 text-3xl font-extrabold text-emce-dark tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-hint text-emce-text-sec">{sub}</div>}
    </Card>
  );
}
