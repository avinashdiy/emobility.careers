import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminShell } from "@/components/layout/admin-shell";
import { audit } from "@/lib/audit";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Message moderation", robots: { index: false, follow: false } };

/**
 * Admin-only message moderation index. Shows every MessageThread on the
 * platform with the latest preview, participant info, and last activity.
 *
 * Privacy: every page render is audit-logged so we have a paper trail of
 * which admin looked at messaging. The list view does NOT show the body of
 * any message — it shows participant + thread metadata only. Bodies are
 * gated behind the per-thread page (also audit-logged) so we minimise
 * incidental exposure during routine browsing.
 */
export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  await audit({
    actorId: session.user.id,
    action: "admin.messages.index_view",
    entity: "MessageThread",
    meta: { q: sp.q ?? null },
  });

  // Search by participant email or candidate name. Hits the User table
  // first to derive userIds, then filters threads. Unindexed contains-search
  // is fine here — admin volume is low and bounded.
  let participantFilter: { OR?: { id: { in: string[] } }[] } | undefined;
  if (sp.q && sp.q.trim().length > 1) {
    const matches = await db.user.findMany({
      where: {
        OR: [
          { email: { contains: sp.q, mode: "insensitive" } },
          { name: { contains: sp.q, mode: "insensitive" } },
          { candidateProfile: { firstName: { contains: sp.q, mode: "insensitive" } } },
          { candidateProfile: { lastName: { contains: sp.q, mode: "insensitive" } } },
        ],
      },
      select: { id: true },
      take: 200,
    });
    const ids = matches.map((m) => m.id);
    participantFilter = { OR: [{ id: { in: ids } }] };
    if (ids.length === 0) {
      // No participants match → render empty quickly
      return (
        <AdminShell>
          <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4">
            <PageHeader q={sp.q ?? ""} />
            <EmptyState icon="🔎" title="No conversations" body={`Nothing matches "${sp.q}".`} />
          </div>
        </AdminShell>
      );
    }
  }

  const threads = await db.messageThread.findMany({
    where: participantFilter
      ? {
          OR: [
            { candidateUserId: { in: (participantFilter.OR?.[0]?.id?.in ?? []) } },
            { employerUserId: { in: (participantFilter.OR?.[0]?.id?.in ?? []) } },
            {
              application: {
                candidate: { userId: { in: (participantFilter.OR?.[0]?.id?.in ?? []) } },
              },
            },
            {
              application: {
                job: { postedById: { in: (participantFilter.OR?.[0]?.id?.in ?? []) } },
              },
            },
          ],
        }
      : undefined,
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      application: {
        include: {
          job: { select: { title: true, company: { select: { name: true, logoUrl: true } } } },
          candidate: { select: { firstName: true, lastName: true, slug: true, profilePhotoUrl: true, user: { select: { email: true, id: true } } } },
        },
      },
      _count: { select: { messages: true } },
    },
  });

  // Resolve cold-outreach participants (no application). Pre-fetch all unique
  // user ids in a single query rather than N+1.
  const coldUserIds = new Set<string>();
  for (const t of threads) {
    if (!t.application) {
      if (t.candidateUserId) coldUserIds.add(t.candidateUserId);
      if (t.employerUserId) coldUserIds.add(t.employerUserId);
    }
  }
  const coldUsers = coldUserIds.size > 0
    ? await db.user.findMany({
        where: { id: { in: [...coldUserIds] } },
        select: {
          id: true, email: true,
          candidateProfile: { select: { firstName: true, lastName: true, profilePhotoUrl: true, slug: true } },
          employerProfile: { select: { company: { select: { name: true, logoUrl: true } } } },
        },
      })
    : [];
  const userById = new Map(coldUsers.map((u) => [u.id, u]));

  return (
    <AdminShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4">
        <PageHeader q={sp.q ?? ""} />

        <Card className="bg-emce-light-soft">
          <p className="text-sm text-emce-text">
            <strong>Privacy:</strong> Use this only for moderation, abuse review, and support cases. Every visit and every thread you open is recorded in the audit log.
          </p>
        </Card>

        {threads.length === 0 ? (
          <EmptyState icon="💬" title="No conversations on the platform yet" />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-emce-light-soft text-left text-xs font-bold uppercase text-emce-text-sec">
                <tr>
                  <th className="p-3">Thread</th>
                  <th className="p-3">Participants</th>
                  <th className="p-3">Messages</th>
                  <th className="p-3">Last activity</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emce-border">
                {threads.map((t) => {
                  const participants = renderParticipants(t, userById);
                  return (
                    <tr key={t.id}>
                      <td className="p-3">
                        {t.application ? (
                          <span className="font-bold text-emce-text">
                            {t.application.job.title}
                          </span>
                        ) : (
                          <span className="font-bold text-emce-text">Cold outreach</span>
                        )}
                        {t.application && (
                          <p className="text-hint text-emce-text-sec">{t.application.job.company.name}</p>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {participants.map((p, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5">
                              <Avatar src={p.avatar} name={p.name} size="sm" />
                              <span className="text-xs">
                                <span className="font-bold text-emce-text">{p.name}</span>
                                <span className="ml-1 text-emce-text-sec">{p.email ? `· ${p.email}` : ""}</span>
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-[10px]">{t._count.messages}</Badge>
                      </td>
                      <td className="p-3 text-hint text-emce-text-sec">
                        {t.lastMessageAt ? relativeTime(t.lastMessageAt) : "—"}
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/admin/messages/${t.id}`}
                          className="text-xs font-bold text-emce-dark hover:underline"
                        >
                          Open thread →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}

function PageHeader({ q }: { q: string }) {
  return (
    <header>
      <h1 className="text-dashboard text-emce-text md:text-3xl">Messages</h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        Read-only moderation view of every conversation on the platform. Audit-logged.
      </p>
      <form className="mt-3 flex gap-2 max-w-md">
        <Input name="q" defaultValue={q} placeholder="Search by participant name or email" />
        <Button type="submit">Search</Button>
      </form>
    </header>
  );
}

interface ParticipantInfo {
  name: string;
  avatar: string | null;
  email?: string;
}

function renderParticipants(
  t: {
    application: {
      candidate: {
        firstName: string;
        lastName: string | null;
        profilePhotoUrl: string | null;
        user: { email: string; id: string };
      };
      job: { company: { name: string; logoUrl: string | null } };
    } | null;
    candidateUserId: string | null;
    employerUserId: string | null;
  },
  userById: Map<string, {
    email: string;
    candidateProfile: { firstName: string; lastName: string | null; profilePhotoUrl: string | null } | null;
    employerProfile: { company: { name: string; logoUrl: string | null } } | null;
  }>,
): ParticipantInfo[] {
  if (t.application) {
    const cp = t.application.candidate;
    return [
      {
        name: `${cp.firstName} ${cp.lastName ?? ""}`.trim(),
        avatar: cp.profilePhotoUrl,
        email: cp.user.email,
      },
      {
        name: t.application.job.company.name,
        avatar: t.application.job.company.logoUrl,
      },
    ];
  }
  const out: ParticipantInfo[] = [];
  for (const id of [t.candidateUserId, t.employerUserId]) {
    if (!id) continue;
    const u = userById.get(id);
    if (!u) continue;
    const cp = u.candidateProfile;
    const co = u.employerProfile?.company;
    out.push({
      name: cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : (co?.name ?? u.email),
      avatar: cp?.profilePhotoUrl ?? co?.logoUrl ?? null,
      email: u.email,
    });
  }
  return out;
}
