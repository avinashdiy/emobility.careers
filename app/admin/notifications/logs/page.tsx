import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  NotificationTemplateChannel,
  NotificationLogStatus,
} from "@prisma/client";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Notification logs · Admin" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  NotificationLogStatus,
  "default" | "success" | "danger" | "outline" | "warning"
> = {
  QUEUED: "default",
  SENT: "success",
  DELIVERED: "success",
  FAILED: "danger",
  BOUNCED: "danger",
};

const PAGE_SIZE = 100;

/**
 * Per-channel dispatch log — every notification fan-out (IN_APP +
 * EMAIL + SMS + WHATSAPP + PUSH) lands here so admins can answer
 * "did the candidate get the rejection email?" without trawling
 * provider dashboards.
 *
 * Filters: channel, status, type, user (email/name search), date range.
 *
 * Note: IN_APP rows are written SENT immediately by the dispatcher.
 * Non-IN_APP rows are written QUEUED at enqueue time and the worker
 * should flip them to SENT/FAILED post-provider-call. Until that
 * worker change lands, expect QUEUED to be the dominant status for
 * EMAIL/SMS.
 */
export default async function NotificationLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    channel?: string;
    status?: string;
    type?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const channel =
    sp.channel && (Object.values(NotificationTemplateChannel) as string[]).includes(sp.channel)
      ? (sp.channel as NotificationTemplateChannel)
      : null;
  const status =
    sp.status && (Object.values(NotificationLogStatus) as string[]).includes(sp.status)
      ? (sp.status as NotificationLogStatus)
      : null;
  const type = sp.type?.trim() ?? "";
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where = {
    ...(channel ? { channel } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type: { contains: type, mode: "insensitive" as const } } : {}),
    ...(q
      ? {
          user: {
            OR: [
              { email: { contains: q, mode: "insensitive" as const } },
              { name: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [total, logs, totalSent, totalFailed, totalQueued] = await Promise.all([
    db.notificationLog.count({ where }),
    db.notificationLog.findMany({
      where,
      orderBy: { sentAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    db.notificationLog.count({ where: { status: "SENT" } }),
    db.notificationLog.count({ where: { status: { in: ["FAILED", "BOUNCED"] } } }),
    db.notificationLog.count({ where: { status: "QUEUED" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Distinct type list — capped at 50 to keep dropdown short. Used to
  // help admin discover which types are firing without typing keys.
  const typeAggregate = await db.notificationLog.groupBy({
    by: ["type"],
    orderBy: { _count: { type: "desc" } },
    take: 50,
    _count: { type: true },
  });

  return (
    <AdminShell>
      <div className="container max-w-7xl space-y-6 py-6 md:py-8">
        <PageHeader
          eyebrow="Notifications"
          title="Dispatch logs"
          subtitle={
            <>
              <strong>{total.toLocaleString("en-IN")}</strong> matching ·{" "}
              {totalSent.toLocaleString("en-IN")} sent · {totalFailed.toLocaleString("en-IN")} failed
              · {totalQueued.toLocaleString("en-IN")} queued
            </>
          }
        />

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/notifications/templates"
            className="text-hint font-bold text-emce-dark hover:underline"
          >
            ← Templates
          </Link>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <form
            action="/admin/notifications/logs"
            method="get"
            className="grid gap-3 sm:grid-cols-4"
          >
            <div>
              <Label htmlFor="channel">Channel</Label>
              <NativeSelect id="channel" name="channel" defaultValue={channel ?? ""}>
                <option value="">Any</option>
                {(Object.values(NotificationTemplateChannel) as NotificationTemplateChannel[]).map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ),
                )}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <NativeSelect id="status" name="status" defaultValue={status ?? ""}>
                <option value="">Any</option>
                {(Object.values(NotificationLogStatus) as NotificationLogStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {s.toLowerCase()}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="type">Type (key)</Label>
              <Input
                id="type"
                name="type"
                defaultValue={type}
                placeholder="application.stage_changed"
                list="type-options"
                maxLength={120}
              />
              <datalist id="type-options">
                {typeAggregate.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t._count.type} sends
                  </option>
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="q">User search</Label>
              <Input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Name or email"
                maxLength={120}
              />
            </div>
            <div className="sm:col-span-4 flex justify-end gap-3">
              {(channel || status || type || q) && (
                <Link
                  href="/admin/notifications/logs"
                  className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
                >
                  Clear
                </Link>
              )}
              <SubmitButton size="sm" variant="outline">
                Apply
              </SubmitButton>
            </div>
          </form>
        </Card>

        {/* Log list */}
        {logs.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-body text-emce-text-sec">
              No log entries match this filter.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <table className="min-w-full divide-y divide-emce-border text-sm">
              <thead className="bg-emce-light-soft text-left">
                <tr>
                  <th className="px-3 py-2 font-bold text-emce-text">When</th>
                  <th className="px-3 py-2 font-bold text-emce-text">User</th>
                  <th className="px-3 py-2 font-bold text-emce-text">Type</th>
                  <th className="px-3 py-2 font-bold text-emce-text">Channel</th>
                  <th className="px-3 py-2 font-bold text-emce-text">Status</th>
                  <th className="px-3 py-2 font-bold text-emce-text">Title</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emce-border">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 align-top text-hint text-emce-text-sec">
                      {relativeTime(l.sentAt)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Link
                        href={`/admin/users?q=${encodeURIComponent(l.user.email ?? "")}`}
                        className="text-emce-dark hover:underline"
                      >
                        {l.user.name ?? l.user.email}
                      </Link>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <code className="rounded bg-emce-light-soft px-1.5 py-0.5 text-[11px]">
                        {l.type}
                      </code>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Badge variant="default" size="sm">{l.channel}</Badge>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Badge variant={STATUS_TONE[l.status]} size="sm">
                        {l.status.toLowerCase()}
                      </Badge>
                      {l.errorMessage && (
                        <p className="mt-1 line-clamp-2 text-[10px] text-emce-red-deep">
                          {l.errorMessage}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <p className="line-clamp-1 font-bold text-emce-text">{l.title}</p>
                      {l.body && (
                        <p className="line-clamp-1 text-[11px] text-emce-text-sec">
                          {l.body}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-hint text-emce-text-sec">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={
                    "/admin/notifications/logs?page=" +
                    (page - 1) +
                    (channel ? `&channel=${channel}` : "") +
                    (status ? `&status=${status}` : "") +
                    (type ? `&type=${encodeURIComponent(type)}` : "") +
                    (q ? `&q=${encodeURIComponent(q)}` : "")
                  }
                  className="inline-flex h-9 items-center justify-center rounded-md border border-emce-border bg-white px-4 text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
                >
                  ← Prev
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={
                    "/admin/notifications/logs?page=" +
                    (page + 1) +
                    (channel ? `&channel=${channel}` : "") +
                    (status ? `&status=${status}` : "") +
                    (type ? `&type=${encodeURIComponent(type)}` : "") +
                    (q ? `&q=${encodeURIComponent(q)}` : "")
                  }
                  className="inline-flex h-9 items-center justify-center rounded-md border border-emce-border bg-white px-4 text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
