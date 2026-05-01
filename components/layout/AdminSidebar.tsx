"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Users, Briefcase, Building2, Flag, GraduationCap,
  Trophy, MessageSquare, Tag, Megaphone, ScrollText, BarChart3, Settings,
  School, FileText, ChevronDown, Menu, X, Download, BadgeCheck, Activity, Sparkles,
  Mail, Terminal, Hash, FileWarning, FlaskConical, CreditCard, Webhook, ShieldX,
} from "lucide-react";

type Counts = {
  companies: number;
  jobs: number;
  reports: number;
  postReports: number;
  idVerifications: number;
  mentors: number;
  competitions: number;
  diyguru: number;
  total: number;
};

interface Item {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface Group {
  title: string;
  items: Item[];
}

function buildGroups(counts: Counts): Group[] {
  return [
    {
      title: "",
      items: [
        { href: "/admin", label: "Dashboard", icon: LayoutDashboard, badge: counts.total },
        { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
        { href: "/admin/operations", label: "Background work", icon: Activity },
        { href: "/admin/ai-ops", label: "AI ops & cost", icon: Sparkles },
      ],
    },
    {
      title: "People",
      items: [
        { href: "/admin/users", label: "All users", icon: Users },
        { href: "/admin/employers", label: "Employers", icon: Briefcase, badge: counts.companies },
        { href: "/admin/diyguru", label: "DIYguru roster", icon: School, badge: counts.diyguru },
        { href: "/admin/identity-verifications", label: "ID verifications", icon: BadgeCheck, badge: counts.idVerifications },
        // The full TPO console (cohorts, funnel, unplaced students) lives
        // at /tpo. ADMINs always have access; trusted DIYguru staff can
        // also reach it via the User.isPlacementOfficer flag granted on
        // /admin/users below.
        { href: "/tpo", label: "Placement (TPO)", icon: BarChart3 },
      ],
    },
    {
      title: "Recruitment",
      items: [
        { href: "/admin/jobs", label: "Jobs", icon: Briefcase, badge: counts.jobs },
        { href: "/admin/job-quality", label: "Job quality", icon: ShieldX },
        { href: "/admin/reports", label: "Job reports", icon: Flag, badge: counts.reports },
        { href: "/admin/post-reports", label: "Post reports", icon: Flag, badge: counts.postReports },
      ],
    },
    {
      title: "Mentorship",
      items: [
        { href: "/admin/mentors", label: "Mentor KYC", icon: GraduationCap, badge: counts.mentors },
      ],
    },
    {
      title: "Competitions",
      items: [
        { href: "/admin/competitions", label: "Moderation", icon: Trophy, badge: counts.competitions },
      ],
    },
    {
      title: "Content & Taxonomy",
      items: [
        { href: "/admin/content", label: "Posts & comments", icon: MessageSquare },
        { href: "/admin/messages", label: "Messages (moderation)", icon: MessageSquare },
        { href: "/admin/skills", label: "Skills & domains", icon: Tag },
        { href: "/admin/hashtags", label: "Hashtags", icon: Hash },
        // Salary Compass moderation — anonymous submissions land
        // PENDING; admin approves/rejects to publish to /salaries.
        { href: "/admin/salaries", label: "Salary submissions", icon: Tag },
      ],
    },
    {
      title: "Operations",
      items: [
        { href: "/admin/broadcasts", label: "Broadcasts", icon: Megaphone },
        { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
        // Featured This Week curation — five candidate spotlights surfaced
        // on the home + Pulse pages every week.
        { href: "/admin/featured", label: "Featured this week", icon: Megaphone },
        // WhatsApp digest console — manage subscribers, send test
        // messages, and trigger an on-demand digest tick.
        { href: "/admin/whatsapp", label: "WhatsApp digest", icon: MessageSquare },
        { href: "/admin/delivery", label: "Delivery health", icon: Mail },
        { href: "/admin/webhooks", label: "Webhook log", icon: Webhook },
        { href: "/admin/resume-failures", label: "Resume parse failures", icon: FileWarning },
        { href: "/admin/audit", label: "Audit log", icon: ScrollText },
      ],
    },
    {
      title: "Growth",
      items: [
        { href: "/admin/experiments", label: "A/B experiments", icon: FlaskConical },
        { href: "/admin/billing", label: "Billing (plans)", icon: CreditCard },
      ],
    },
    {
      title: "System",
      items: [
        { href: "/admin/import", label: "WordPress import", icon: Download },
        { href: "/admin/sql", label: "SQL console", icon: Terminal },
        { href: "/admin/settings", label: "Settings", icon: Settings },
      ],
    },
  ];
}

export function AdminSidebar({ pendingCounts }: { pendingCounts: Counts }) {
  const groups = buildGroups(pendingCounts);
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open admin menu"
        className="fixed bottom-4 right-4 z-30 grid h-12 w-12 place-items-center rounded-full bg-emce-darkest text-white shadow-emce-lg lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          role="presentation"
        />
      )}

      <aside
        className={`fixed left-0 top-12 z-40 h-[calc(100vh-3rem)] w-60 shrink-0 overflow-y-auto border-r border-emce-border bg-white transition-transform lg:sticky lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        aria-label="Admin sidebar"
      >
        <div className="flex h-12 items-center justify-between border-b border-emce-border px-3 lg:hidden">
          <span className="text-sm font-bold text-emce-text">Admin menu</span>
          <button onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5 text-emce-text-sec" />
          </button>
        </div>

        <nav className="p-2">
          {groups.map((g, gi) => (
            <Section key={gi} title={g.title}>
              {g.items.map((item) => (
                <NavItem key={item.href} item={item} pathname={pathname} />
              ))}
            </Section>
          ))}
        </nav>
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  // First group has no title — render flush
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      {title && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emce-text-sec hover:text-emce-text"
        >
          <span>{title}</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
      )}
      {open && <ul className="space-y-0.5">{children}</ul>}
    </div>
  );
}

function NavItem({ item, pathname }: { item: Item; pathname: string }) {
  const active = item.href === "/admin"
    ? pathname === "/admin"
    : pathname.startsWith(item.href);
  const Icon = item.icon ?? FileText;
  return (
    <li>
      <Link
        href={item.href}
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold ${
          active
            ? "bg-emce-light-soft text-emce-darkest"
            : "text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-emce-red px-1 text-[10px] font-bold text-white">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </Link>
    </li>
  );
}
