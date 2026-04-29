import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Users, Briefcase, FileCheck, Flag, GraduationCap, Trophy, Building2,
  TrendingUp, MessageSquare, Bell,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminShell } from "@/components/layout/admin-shell";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Admin dashboard" };

export default async function AdminOverview() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [
    users, candidates, employers, companies, openJobs, applications,
    pendingCompanies, pendingJobs, openReports, pendingMentors, pendingCompetitions,
    publishedMentors, liveCompetitions, mentorshipPaid, competitionPrizesPending,
    newUsers7d, newJobs7d, newApplications7d, recentAudit,
  ] = await Promise.all([
    db.user.count(),
    db.candidateProfile.count(),
    db.employerProfile.count(),
    db.company.count(),
    db.jobPosting.count({ where: { status: "OPEN" } }),
    db.application.count(),
    db.company.count({ where: { verificationStatus: "PENDING" } }),
    db.jobPosting.count({ where: { status: "PENDING_REVIEW" } }),
    db.jobReport.count({ where: { status: "OPEN" } }),
    db.mentorProfile.count({ where: { kycStatus: "PENDING" } }),
    db.competition.count({ where: { status: "PENDING_REVIEW" } }),
    db.mentorProfile.count({ where: { isPublished: true } }),
    db.competition.count({ where: { status: { in: ["LIVE", "JUDGING"] } } }),
    db.mentorshipSession.count({ where: { paymentStatus: "PAID", status: "COMPLETED" } }),
    db.competitionPrize.count({ where: { payoutStatus: "PENDING", awardedRegistrationId: { not: null } } }),
    db.user.count({ where: { createdAt: { gte: since7d } } }),
    db.jobPosting.count({ where: { publishedAt: { gte: since7d } } }),
    db.application.count({ where: { appliedAt: { gte: since7d } } }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { actor: { select: { email: true } } },
    }),
  ]);

  const queues: { label: string; count: number; href: string; tone: "warning" | "default" }[] = [
    { label: "Jobs awaiting review", count: pendingJobs, href: "/admin/jobs?status=PENDING_REVIEW", tone: "warning" },
    { label: "Companies awaiting KYC", count: pendingCompanies, href: "/admin/employers", tone: "warning" },
    { label: "Job reports open", count: openReports, href: "/admin/reports", tone: "warning" },
    { label: "Mentor KYC pending", count: pendingMentors, href: "/admin/mentors", tone: "warning" },
    { label: "Competitions to review", count: pendingCompetitions, href: "/admin/competitions", tone: "warning" },
    { label: "Prize payouts pending", count: competitionPrizesPending, href: "/admin/competitions", tone: "default" },
  ];
  const activeQueues = queues.filter((q) => q.count > 0);

  return (
    <AdminShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8">
        <header className="mb-6">
          <h1 className="text-dashboard text-emce-text md:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            Platform health at a glance · {newUsers7d} new users · {newJobs7d} new jobs · {newApplications7d} applications this week.
          </p>
        </header>

        <Card className="mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-section text-emce-text">Awaiting your review</h2>
            <Badge variant={activeQueues.length > 0 ? "warning" : "verified"}>
              {activeQueues.reduce((acc, q) => acc + q.count, 0)} item{activeQueues.length === 1 ? "" : "s"}
            </Badge>
          </div>
          {activeQueues.length === 0 ? (
            <EmptyState
              className="border-0 p-6"
              icon="✅"
              title="Everything's reviewed"
              body="No pending KYC, moderation, or prize payouts right now."
            />
          ) : (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {activeQueues.map((q) => (
                <li key={q.href}>
                  <Link
                    href={q.href}
                    className="flex items-center justify-between rounded-md border border-emce-border bg-white p-3 hover:border-emce-mid"
                  >
                    <span className="text-sm font-bold text-emce-text">{q.label}</span>
                    <Badge variant={q.tone}>{q.count}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI icon={<Users className="h-4 w-4" />} label="Total users" value={users} delta={newUsers7d} deltaLabel="this week" href="/admin/users" />
          <KPI icon={<Briefcase className="h-4 w-4" />} label="Open jobs" value={openJobs} delta={newJobs7d} deltaLabel="published 7d" href="/admin/jobs" />
          <KPI icon={<FileCheck className="h-4 w-4" />} label="Applications" value={applications} delta={newApplications7d} deltaLabel="this week" href="/admin/jobs" />
          <KPI icon={<Building2 className="h-4 w-4" />} label="Companies" value={companies} href="/admin/employers" />
          <KPI icon={<GraduationCap className="h-4 w-4" />} label="Active mentors" value={publishedMentors} sub={`${mentorshipPaid} sessions paid`} href="/admin/mentors" />
          <KPI icon={<Trophy className="h-4 w-4" />} label="Live competitions" value={liveCompetitions} href="/admin/competitions" />
          <KPI icon={<Users className="h-4 w-4" />} label="Candidate profiles" value={candidates} href="/admin/users?role=CANDIDATE" />
          <KPI icon={<Briefcase className="h-4 w-4" />} label="Employer profiles" value={employers} href="/admin/users?role=EMPLOYER" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-section text-emce-text">Recent admin actions</h2>
              <Link href="/admin/audit" className="text-xs font-bold text-emce-dark hover:underline">Audit log →</Link>
            </div>
            {recentAudit.length === 0 ? (
              <EmptyState className="border-0 p-6" icon="🪶" title="No actions yet" />
            ) : (
              <ul className="mt-3 divide-y divide-emce-border">
                {recentAudit.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                    <div>
                      <p className="font-bold text-emce-text">{a.action.replace(/[._]/g, " ")}</p>
                      <p className="text-hint text-emce-text-sec">
                        {a.actor?.email ?? "system"} · {a.entity}{a.entityId ? ` #${a.entityId.slice(0, 6)}` : ""}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase text-emce-text-sec">{relativeTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="text-section text-emce-text">Quick actions</h2>
            <div className="mt-3 space-y-2 text-sm">
              <QuickAction href="/admin/broadcasts" icon={<Bell className="h-4 w-4" />} label="Send a broadcast" desc="Announce something to all users" />
              <QuickAction href="/admin/skills" icon={<TrendingUp className="h-4 w-4" />} label="Manage taxonomy" desc="Skills + EV domain catalog" />
              <QuickAction href="/admin/diyguru" icon={<FileCheck className="h-4 w-4" />} label="Import DIYguru roster" desc="CSV upload + verify cohort" />
              <QuickAction href="/admin/content" icon={<MessageSquare className="h-4 w-4" />} label="Moderate posts" desc="Review reported social content" />
              <QuickAction href="/admin/settings" icon={<Flag className="h-4 w-4" />} label="System settings" desc="Integrations + feature flags" />
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function KPI({
  icon, label, value, delta, deltaLabel, sub, href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  delta?: number;
  deltaLabel?: string;
  sub?: string;
  href: string;
}) {
  return (
    <Link href={href} className="block rounded-lg border border-emce-border bg-white p-4 hover:border-emce-mid">
      <div className="flex items-center gap-2 text-emce-text-sec">
        {icon}<span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold text-emce-text">{value.toLocaleString()}</span>
        {delta !== undefined && delta > 0 && (
          <span className="text-xs font-bold text-emce-mid">+{delta} {deltaLabel}</span>
        )}
      </div>
      {sub && <p className="mt-1 text-hint text-emce-text-sec">{sub}</p>}
    </Link>
  );
}

function QuickAction({ href, icon, label, desc }: { href: string; icon: React.ReactNode; label: string; desc: string }) {
  return (
    <Link href={href} className="flex items-start gap-3 rounded-md border border-emce-border bg-white p-2.5 hover:border-emce-mid">
      <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-md bg-emce-light-soft text-emce-darkest">{icon}</span>
      <span className="flex-1">
        <span className="block font-bold text-emce-text">{label}</span>
        <span className="block text-hint text-emce-text-sec">{desc}</span>
      </span>
    </Link>
  );
}
