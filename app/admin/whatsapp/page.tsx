import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  adminPauseDigest,
  adminResumeDigest,
  adminUnsubscribeDigest,
  adminSendTestMessage,
  adminTriggerDigestTick,
} from "@/server/admin/whatsapp-actions";
import { relativeTime } from "@/lib/utils";
import { env } from "@/lib/env";
import type { Prisma, WhatsAppSubscriptionStatus } from "@prisma/client";

export const metadata = { title: "WhatsApp digest" };

/**
 * Admin console for the WhatsApp daily-digest. Three concerns:
 *   1. **Health** — counters per status, a "Send test" form, and a
 *      "Trigger tick now" button that fires the worker immediately.
 *   2. **Subscriber list** — filterable + per-row pause / resume /
 *      unsubscribe. Status filter defaults to ACTIVE because that's
 *      the cohort an operator usually wants to triage.
 *   3. **Configuration** — surfaces the env-driven template name +
 *      whether the API keys are present. Honest about what's wired.
 */
export default async function AdminWhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    error?: string;
    notice?: string;
  }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  // Counters per status — drives the four KPI tiles.
  const [active, paused, pending, unsubscribed] = await Promise.all([
    db.whatsAppDigestSubscription.count({ where: { status: "ACTIVE" } }),
    db.whatsAppDigestSubscription.count({ where: { status: "PAUSED" } }),
    db.whatsAppDigestSubscription.count({ where: { status: "PENDING" } }),
    db.whatsAppDigestSubscription.count({ where: { status: "UNSUBSCRIBED" } }),
  ]);

  const statusFilter = (
    ["ACTIVE", "PAUSED", "PENDING", "UNSUBSCRIBED"].includes(sp.status ?? "")
      ? sp.status
      : "ACTIVE"
  ) as WhatsAppSubscriptionStatus;

  const where: Prisma.WhatsAppDigestSubscriptionWhereInput = { status: statusFilter };
  if (sp.q) {
    where.OR = [
      { phone: { contains: sp.q } },
      { user: { email: { contains: sp.q, mode: "insensitive" } } },
    ];
  }

  const subs = await db.whatsAppDigestSubscription.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { email: true, name: true } },
    },
  });

  const wired = !!(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN);

  return (
    <AdminShell>
      <div className="container max-w-6xl space-y-6 py-10">
        <PageHeader
          eyebrow="Messaging"
          title="WhatsApp digest"
          subtitle="Manage subscribers, send test messages, and trigger an on-demand digest tick."
          actions={
            <Badge variant={wired ? "success" : "warning"}>
              {wired ? "✓ Cloud API wired" : "⚠️ Cloud API not configured"}
            </Badge>
          }
        />

        {sp.notice && (
          <div className="rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm text-emce-text">
            {sp.notice}
          </div>
        )}
        {sp.error && (
          <div className="rounded-md border border-emce-red bg-emce-red-light p-3 text-sm text-emce-red">
            ⚠️ {sp.error}
          </div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Active" value={active} tone="ok" />
          <Kpi label="Paused" value={paused} tone="warn" />
          <Kpi label="Pending" value={pending} />
          <Kpi label="Unsubscribed" value={unsubscribed} tone="muted" />
        </div>

        {/* Operator tools */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <SectionTitle
              title="Send test message"
              description="Verifies your WhatsApp Cloud API keys + the approved template render correctly. Goes only to the number you enter — never reaches subscribers."
            />
            <form action={adminSendTestMessage} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="test-phone">Phone (with country code)</Label>
                <Input
                  id="test-phone"
                  name="phone"
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  inputMode="tel"
                />
              </div>
              <Button type="submit">Send test →</Button>
            </form>
            <p className="mt-2 text-hint text-emce-text-muted">
              Template: <code className="rounded bg-emce-light-soft px-1 text-[12px]">{env.WHATSAPP_DIGEST_TEMPLATE}</code>{" "}
              · language <code className="rounded bg-emce-light-soft px-1 text-[12px]">{env.WHATSAPP_DIGEST_LANGUAGE}</code>
            </p>
          </Card>

          <Card>
            <SectionTitle
              title="Trigger digest tick"
              description="Fires the digest worker immediately instead of waiting for the next 30-minute scheduled run. Same dedupe rules — only ACTIVE subscribers whose last digest is older than today (IST) receive a message."
            />
            <form action={adminTriggerDigestTick} className="mt-3">
              <ConfirmSubmit
                confirm="Run the digest worker now? Each ACTIVE subscriber whose last digest was before today will receive a message immediately."
                size="default"
              >
                ⚡ Run digest tick now
              </ConfirmSubmit>
            </form>
          </Card>
        </div>

        {/* Subscriber list */}
        <Card>
          <SectionTitle
            title="Subscribers"
            description={`${subs.length} shown · status ${statusFilter}`}
          />
          <form className="mt-3 grid gap-2 sm:grid-cols-12">
            <div className="sm:col-span-7">
              <Input
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Search phone or email…"
              />
            </div>
            <div className="sm:col-span-3">
              <NativeSelect name="status" defaultValue={statusFilter}>
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
                <option value="PENDING">Pending</option>
                <option value="UNSUBSCRIBED">Unsubscribed</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full">Filter</Button>
            </div>
          </form>

          {subs.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon="📱"
                title={`No ${statusFilter.toLowerCase()} subscribers`}
                body="When visitors subscribe at /digest they'll appear here."
              />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-emce-light-soft text-left text-xs font-bold uppercase text-emce-text-sec">
                  <tr>
                    <th scope="col" className="p-3">Phone / User</th>
                    <th scope="col" className="p-3">Filters</th>
                    <th scope="col" className="p-3">Last sent</th>
                    <th scope="col" className="p-3">Failures</th>
                    <th scope="col" className="p-3">Joined</th>
                    <th scope="col" className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emce-border">
                  {subs.map((s) => (
                    <tr key={s.id}>
                      <td className="p-3">
                        <div className="font-mono text-emce-text">{s.phone}</div>
                        {s.user && (
                          <div className="text-hint text-emce-text-sec">
                            {s.user.email}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-hint text-emce-text-sec">
                        {s.evDomainSlugs.length > 0 ? s.evDomainSlugs.join(", ") : "—"}
                        {s.location ? ` · ${s.location}` : ""}
                        {s.profileMode ? ` · ${s.profileMode}` : ""}
                      </td>
                      <td className="p-3 text-hint text-emce-text-muted">
                        {s.lastSentAt ? relativeTime(s.lastSentAt) : "Never"}
                      </td>
                      <td className="p-3">
                        {s.failedSendsInARow > 0 ? (
                          <Badge variant="warning">{s.failedSendsInARow}× failed</Badge>
                        ) : (
                          <span className="text-emce-text-muted">0</span>
                        )}
                      </td>
                      <td className="p-3 text-hint text-emce-text-muted">
                        {relativeTime(s.createdAt)}
                      </td>
                      <td className="p-3 space-x-1.5">
                        {s.status === "ACTIVE" && (
                          <form action={adminPauseDigest} className="inline-flex">
                            <input type="hidden" name="id" value={s.id} />
                            <Button type="submit" size="sm" variant="ghost">Pause</Button>
                          </form>
                        )}
                        {s.status !== "ACTIVE" && s.status !== "UNSUBSCRIBED" && (
                          <form action={adminResumeDigest} className="inline-flex">
                            <input type="hidden" name="id" value={s.id} />
                            <Button type="submit" size="sm">Resume</Button>
                          </form>
                        )}
                        {s.status !== "UNSUBSCRIBED" && (
                          <form action={adminUnsubscribeDigest} className="inline-flex">
                            <input type="hidden" name="id" value={s.id} />
                            <ConfirmSubmit
                              confirm={`Unsubscribe ${s.phone}? They'll need to re-subscribe themselves.`}
                              size="sm"
                              variant="ghost"
                            >
                              Unsubscribe
                            </ConfirmSubmit>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

function Kpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "ok" | "warn" | "muted";
}) {
  const toneClass =
    tone === "ok" ? "text-emce-mid-muted"
    : tone === "warn" ? "text-emce-orange"
    : tone === "muted" ? "text-emce-text-muted"
    : "text-emce-text";
  return (
    <Card>
      <p className="text-[10px] font-bold uppercase tracking-wide text-emce-text-sec">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${toneClass}`}>{value.toLocaleString()}</p>
    </Card>
  );
}
