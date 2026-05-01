import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { relativeTime } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Webhooks" };
export const dynamic = "force-dynamic";

const STATUS_TONE = {
  PENDING: "warning",
  DELIVERED: "success",
  FAILED: "danger",
  INVALID: "danger",
} as const;

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ direction?: string; status?: string; source?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const direction = sp.direction === "INBOUND" || sp.direction === "OUTBOUND" ? sp.direction : null;
  const status =
    sp.status === "PENDING" || sp.status === "DELIVERED" || sp.status === "FAILED" || sp.status === "INVALID"
      ? sp.status
      : null;
  const source = sp.source || null;

  const where: Prisma.WebhookEventWhereInput = {
    ...(direction ? { direction } : {}),
    ...(status ? { status } : {}),
    ...(source ? { source } : {}),
  };

  const [events, sources, counts] = await Promise.all([
    db.webhookEvent.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: 100,
      include: { company: { select: { name: true, slug: true } } },
    }),
    db.webhookEvent.groupBy({
      by: ["source"],
      _count: true,
      orderBy: { _count: { source: "desc" } },
      take: 12,
    }),
    db.webhookEvent.groupBy({
      by: ["status"],
      _count: true,
    }),
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return (
    <AdminShell>
      <div className="container max-w-6xl py-10">
        <h1 className="text-dashboard text-emce-text">Webhook log</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Inbound from providers (Razorpay, SES, MSG91) + outbound to
          employer-configured endpoints. Latest 100 across the active filters.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase text-emce-text-muted">Direction:</span>
          {(["all", "INBOUND", "OUTBOUND"] as const).map((d) => {
            const active = (direction ?? "all") === d;
            const href =
              d === "all"
                ? "/admin/webhooks"
                : `/admin/webhooks?direction=${d}`;
            return (
              <Link
                key={d}
                href={href}
                aria-pressed={active}
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                  active ? "bg-emce-dark text-emce-light" : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
                }`}
              >
                {d.toLowerCase()}
              </Link>
            );
          })}
          <span className="ml-2 text-xs uppercase text-emce-text-muted">Status:</span>
          {(["all", "PENDING", "DELIVERED", "FAILED", "INVALID"] as const).map((s) => {
            const active = (status ?? "all") === s;
            const params = new URLSearchParams();
            if (direction) params.set("direction", direction);
            if (s !== "all") params.set("status", s);
            const href = `/admin/webhooks?${params}`;
            return (
              <Link
                key={s}
                href={href}
                aria-pressed={active}
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                  active ? "bg-emce-mid text-white" : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
                }`}
              >
                {s.toLowerCase()} {countMap[s] !== undefined ? `(${countMap[s]})` : ""}
              </Link>
            );
          })}
        </div>

        {sources.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase text-emce-text-muted">Source:</span>
            <Link
              href="/admin/webhooks"
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                !source ? "bg-emce-dark text-emce-light" : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
              }`}
            >
              all
            </Link>
            {sources.map((s) => (
              <Link
                key={s.source}
                href={`/admin/webhooks?source=${encodeURIComponent(s.source)}`}
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                  source === s.source
                    ? "bg-emce-dark text-emce-light"
                    : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
                }`}
              >
                {s.source} ({s._count})
              </Link>
            ))}
          </div>
        )}

        {events.length === 0 ? (
          <Card className="mt-6 p-10 text-center">
            <div className="text-4xl" aria-hidden>—</div>
            <p className="mt-3 text-section text-emce-text">No events yet.</p>
            <p className="mt-1 text-hint text-emce-text-sec">
              Provider webhooks haven't been wired to <code>recordWebhookEvent</code>{" "}
              yet, or there's been no inbound / outbound activity in the time
              window.
            </p>
          </Card>
        ) : (
          <ul className="mt-6 space-y-2">
            {events.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/admin/webhooks/${e.id}`}
                  className="block rounded-md border border-emce-border bg-white p-3 hover:border-emce-mid"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{e.direction}</Badge>
                    <Badge variant={STATUS_TONE[e.status]}>{e.status}</Badge>
                    <span className="font-bold text-emce-text">{e.topic}</span>
                    <code className="text-hint text-emce-text-muted">{e.source}</code>
                    {e.httpStatus && (
                      <Badge variant={e.httpStatus < 300 ? "success" : "danger"}>
                        HTTP {e.httpStatus}
                      </Badge>
                    )}
                    {e.attempts > 1 && (
                      <Badge variant="warning">{e.attempts} attempts</Badge>
                    )}
                    <span className="ml-auto text-hint text-emce-text-muted">
                      {relativeTime(e.receivedAt)}
                    </span>
                  </div>
                  {e.url && (
                    <p className="mt-1 truncate font-mono text-hint text-emce-text-muted">
                      {e.url}
                    </p>
                  )}
                  {e.company && (
                    <p className="mt-1 text-hint text-emce-text-sec">
                      via {e.company.name}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
