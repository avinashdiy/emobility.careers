import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AdminShell } from "@/components/layout/admin-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Team verification queue" };
export const dynamic = "force-dynamic";

const TABS = [
  { value: "PENDING_REVIEW", label: "Pending review" },
  { value: "UNVERIFIED", label: "Unverified" },
  { value: "VERIFIED", label: "Verified" },
  { value: "REJECTED", label: "Rejected" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/**
 * Admin queue for verifying competition teams. Default tab is
 * PENDING_REVIEW because that's what admins act on; the others are
 * audit / search surfaces.
 */
export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: Tab }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const tab: Tab =
    sp.status && TABS.some((t) => t.value === sp.status) ? sp.status : "PENDING_REVIEW";

  const [teams, counts] = await Promise.all([
    db.competitionRegistration.findMany({
      where: { verificationStatus: tab },
      orderBy:
        tab === "PENDING_REVIEW"
          ? { registeredAt: "asc" } // oldest first — service the queue
          : { registeredAt: "desc" },
      take: 100,
      include: {
        competition: { select: { slug: true, title: true } },
        leader: {
          select: {
            email: true,
            name: true,
            candidateProfile: { select: { profilePhotoUrl: true } },
          },
        },
        _count: { select: { members: true } },
      },
    }),
    db.competitionRegistration.groupBy({
      by: ["verificationStatus"],
      _count: true,
    }),
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c.verificationStatus, c._count]));

  return (
    <AdminShell>
      <div className="container max-w-5xl py-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-dashboard text-emce-text">Team verification</h1>
          <p className="text-hint text-emce-text-sec">
            Review eBAJA / Formula Bharat / similar student teams before they
            go public + receive prize money.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={`/admin/teams?status=${t.value}`}
              aria-pressed={tab === t.value}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                tab === t.value
                  ? "bg-emce-dark text-emce-light"
                  : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
              }`}
            >
              {t.label} ({countMap[t.value] ?? 0})
            </Link>
          ))}
        </div>

        {teams.length === 0 ? (
          <EmptyState
            icon="🪪"
            title={`No teams in ${tab.toLowerCase().replace("_", " ")}`}
            body="Check the other tabs."
          />
        ) : (
          <ul className="mt-5 space-y-3">
            {teams.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/teams/${t.id}`} className="block">
                  <Card className="p-4 hover:border-emce-mid hover:shadow-emce-hover">
                    <div className="flex items-start gap-3">
                      <Avatar src={t.teamLogoUrl} name={t.teamName ?? "T"} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-bold text-emce-text">
                            {t.teamName ?? "(untitled)"}
                          </span>
                          {t.externalEvent && (
                            <Badge variant="default" size="sm">{t.externalEvent}</Badge>
                          )}
                          {t.externalTeamId && (
                            <span className="text-hint text-emce-text-muted">
                              #{t.externalTeamId}
                            </span>
                          )}
                        </div>
                        <p className="text-hint text-emce-text-sec">
                          {t.competition.title}
                          {t.institution && <> · {t.institution}</>}
                        </p>
                        <p className="text-hint text-emce-text-muted">
                          Captain: {t.leader.name ?? t.leader.email} · {t._count.members} member
                          {t._count.members === 1 ? "" : "s"} · registered {relativeTime(t.registeredAt)}
                        </p>
                        {t.facultyAdvisor && (
                          <p className="text-hint text-emce-text-muted">
                            Advisor: {t.facultyAdvisor}
                            {t.facultyEmail && <> ({t.facultyEmail})</>}
                          </p>
                        )}
                      </div>
                      <span className="text-hint text-emce-dark">Review →</span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
