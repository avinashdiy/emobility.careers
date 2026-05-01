import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Textarea } from "@/components/ui/textarea";
import { AdminShell } from "@/components/layout/admin-shell";
import { updateGrievance } from "@/server/grievance/actions";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Grievances" };
export const dynamic = "force-dynamic";

const TABS = ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "REJECTED"] as const;
type Tab = (typeof TABS)[number];

const TONE: Record<Tab, "warning" | "default" | "success" | "danger" | "outline"> = {
  OPEN: "warning",
  ACKNOWLEDGED: "default",
  IN_PROGRESS: "default",
  RESOLVED: "success",
  REJECTED: "outline",
};

export default async function GrievancesAdmin({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as Tab)
    : "OPEN";

  const [tickets, counts] = await Promise.all([
    db.grievanceTicket.findMany({
      where: { status: tab },
      orderBy: tab === "OPEN" ? { createdAt: "asc" } : { updatedAt: "desc" },
      take: 100,
      include: {
        filer: { select: { id: true, email: true, name: true } },
        assignee: { select: { id: true, email: true, name: true } },
      },
    }),
    db.grievanceTicket.groupBy({ by: ["status"], _count: true }),
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const now = new Date();

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <h1 className="text-dashboard text-emce-text">Grievances</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Public-filed grievances per Indian IT Rules 2021. Acknowledge
          within 24 hours; resolve within 15 days. Both deadlines are
          tracked here and visible per ticket.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link
              key={t}
              href={`/admin/grievances?status=${t}`}
              aria-pressed={tab === t}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                tab === t
                  ? "bg-emce-dark text-emce-light"
                  : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
              }`}
            >
              {t} ({countMap[t] ?? 0})
            </Link>
          ))}
        </div>

        {tickets.length === 0 ? (
          <Card className="mt-6 p-10 text-center">
            <div className="text-4xl" aria-hidden>📋</div>
            <p className="mt-3 text-section text-emce-text">No tickets in {tab.toLowerCase()}.</p>
          </Card>
        ) : (
          <ul className="mt-6 space-y-3">
            {tickets.map((t) => {
              const ackOverdue =
                tab === "OPEN" &&
                now.getTime() - t.createdAt.getTime() > 24 * 60 * 60 * 1000;
              const slaOverdue = t.slaDueAt < now && t.status !== "RESOLVED" && t.status !== "REJECTED";
              return (
                <li key={t.id}>
                  <Card>
                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-bold text-emce-text">{t.subject}</span>
                          <Badge variant={TONE[tab]}>{t.status}</Badge>
                          <code className="text-hint text-emce-text-muted">{t.id.slice(-8)}</code>
                          {ackOverdue && <Badge variant="danger">24h ack overdue</Badge>}
                          {slaOverdue && <Badge variant="danger">15-day SLA breached</Badge>}
                        </div>
                        <p className="mt-1 text-hint text-emce-text-sec">
                          From {t.filerName} ({t.filerEmail})
                          {t.filerPhone ? ` · ${t.filerPhone}` : ""}
                          {" · "}filed {relativeTime(t.createdAt)}
                        </p>
                        {t.category && (
                          <p className="text-hint text-emce-text-muted">
                            Category: {t.category}
                          </p>
                        )}
                        <p className="mt-2 whitespace-pre-line rounded-md bg-emce-light-soft p-2 text-sm text-emce-text-sec">
                          {t.body}
                        </p>
                        {t.resolution && (
                          <p className="mt-2 whitespace-pre-line rounded-md bg-emce-mid/10 p-2 text-sm text-emce-text-sec">
                            <strong>Resolution:</strong> {t.resolution}
                          </p>
                        )}
                        {t.assignee && (
                          <p className="mt-1 text-hint text-emce-text-muted">
                            Assigned to {t.assignee.name ?? t.assignee.email}
                          </p>
                        )}
                      </div>
                      {(t.status === "OPEN" ||
                        t.status === "ACKNOWLEDGED" ||
                        t.status === "IN_PROGRESS") && (
                        <div className="flex flex-col gap-2 sm:w-72">
                          {t.status === "OPEN" && (
                            <form action={updateGrievance}>
                              <input type="hidden" name="ticketId" value={t.id} />
                              <input type="hidden" name="action" value="claim" />
                              <Button size="sm" variant="outline" className="w-full" type="submit">
                                Claim &amp; acknowledge
                              </Button>
                            </form>
                          )}
                          {t.status !== "IN_PROGRESS" && (
                            <form action={updateGrievance}>
                              <input type="hidden" name="ticketId" value={t.id} />
                              <input type="hidden" name="action" value="in_progress" />
                              <Button size="sm" variant="ghost" className="w-full" type="submit">
                                Mark in progress
                              </Button>
                            </form>
                          )}
                          <form action={updateGrievance} className="space-y-2">
                            <input type="hidden" name="ticketId" value={t.id} />
                            <input type="hidden" name="action" value="resolve" />
                            <Textarea
                              name="resolution"
                              rows={3}
                              placeholder="Resolution notes (emailed to filer)"
                              maxLength={2000}
                            />
                            <ConfirmSubmit
                              size="sm"
                              variant="default"
                              className="w-full"
                              confirm="Mark resolved? Filer will be emailed."
                            >
                              Resolve
                            </ConfirmSubmit>
                          </form>
                          <form action={updateGrievance} className="space-y-2">
                            <input type="hidden" name="ticketId" value={t.id} />
                            <input type="hidden" name="action" value="reject" />
                            <Textarea
                              name="resolution"
                              rows={2}
                              placeholder="Reason for rejection"
                              maxLength={2000}
                            />
                            <ConfirmSubmit
                              size="sm"
                              variant="ghost"
                              className="w-full"
                              confirm="Reject? Filer will be emailed the reason."
                            >
                              Reject
                            </ConfirmSubmit>
                          </form>
                        </div>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
