"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Users, Briefcase, Building2, Flag, GraduationCap,
  Trophy, MessageSquare, Tag, Megaphone, ScrollText, BarChart3, Settings,
  School, FileText, ChevronDown, Menu, X, Download, BadgeCheck, Activity, Sparkles,
  Mail, Terminal, Hash, FileWarning, FlaskConical, CreditCard, Webhook, ShieldX,
  Newspaper, Wand2, FileDown, CalendarDays,
} from "lucide-react";

type Counts = {
  companies: number;
  institutions: number;
  jobs: number;
  reports: number;
  postReports: number;
  idVerifications: number;
  mentors: number;
  competitions: number;
  diyguru: number;
  colleges: number;
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
        // Candidate-specific list (cohort / verified / open-to-work
        // filters + per-candidate admin edit). Complements /admin/users
        // which is across all roles.
        { href: "/admin/candidates", label: "Candidates", icon: Users },
        { href: "/admin/employers", label: "Employers", icon: Briefcase, badge: counts.companies },
        // Web-fetched logo + Wikipedia proposals awaiting admin
        // approval (powered by scripts/queue-top-100-enrichment.ts +
        // the enrichment orchestrator). Badge-less for now — count
        // would require an extra groupBy in the layout that runs on
        // every admin page.
        { href: "/admin/companies/enrichment-queue", label: "Enrichment queue", icon: Briefcase },
        // Per-company country reclassification (PR 7). Used to
        // flip anchor employers off the IN backfill default into
        // their real markets — JLR → UK, Tesla → US, etc. Drives
        // per-country sitemaps + /[cc]/companies routes.
        { href: "/admin/companies", label: "Country tagging", icon: Briefcase },
        // Candidate-submitted Institution rows awaiting admin
        // verification. Mirrors the Employers KYC queue but for the
        // Institution entity (the page at /institutions/<slug>).
        // Distinct from /admin/colleges below, which gates TPO access.
        { href: "/admin/institutions", label: "Institutions", icon: GraduationCap, badge: counts.institutions },
        { href: "/admin/diyguru", label: "DIYguru roster", icon: School, badge: counts.diyguru },
        // Self-serve college placement-cell applications. Badge =
        // PENDING count; approving flips User.isPlacementOfficer so
        // /tpo opens up to the TPO.
        { href: "/admin/colleges", label: "Colleges (TPOs)", icon: School, badge: counts.colleges },
        { href: "/admin/identity-verifications", label: "ID verifications", icon: BadgeCheck, badge: counts.idVerifications },
        // Admin mirror of /tpo/cohorts — same data, reusable from
        // the admin shell. Drill-down funnels still at /tpo/cohorts/<slug>.
        { href: "/admin/cohorts", label: "Cohorts", icon: GraduationCap },
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
        // Cross-company ATS view — admin can audit / override stage
        // moves on any application via the same server actions
        // recruiters use.
        { href: "/admin/applications", label: "Applications (ATS)", icon: Briefcase },
        // Cross-company interview list — by status / mode / date.
        { href: "/admin/interviews", label: "Interviews", icon: CalendarDays },
        // Job fairs ("Recruitment drives" in the schema). Includes
        // per-fair check-in scanner + roster CSV import nested
        // under each fair's detail page.
        { href: "/admin/fairs", label: "Job fairs", icon: CalendarDays },
        // Recruitathon inline-signup registrations + CSV exports for
        // the placement team. Separate from /admin/fairs (which is
        // admin-side fair setup) — this is the conversion-funnel
        // dashboard for public self-registrations.
        { href: "/admin/recruitathon", label: "Recruitathon signups", icon: CalendarDays },
        { href: "/admin/recruitathon/banks", label: "Recruitathon test banks", icon: FileText },
        { href: "/admin/recruitathon/emails", label: "Recruitathon emails", icon: Mail },
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
      title: "Events",
      items: [
        // Webinars, demo days, meetups, workshops — posted by
        // companies via /employer/events/new. This is the central
        // moderation surface so admin can spot a misleading title /
        // spammy series before user reports come in.
        { href: "/admin/events", label: "Moderation", icon: CalendarDays },
      ],
    },
    {
      title: "Content & Taxonomy",
      items: [
        // CMS pages — hand-authored or WP-imported HTML, surfaced
        // at /<slug> via the [username] dispatcher.
        { href: "/admin/pages", label: "Pages (CMS)", icon: FileText },
        // Editorial articles — markdown/text, surfaced at /articles/<slug>.
        { href: "/admin/articles", label: "Articles (editorial)", icon: Newspaper },
        // JD library — 200+ EV-industry job-description templates
        // surfaced at /jd. The headline SEO + lead-gen surface
        // (full body gated behind sign-up).
        { href: "/admin/jd-templates", label: "JD templates", icon: FileText },
        // AI-tool generation guide — what to tell Claude when authoring
        // a new tool landing page so it integrates with /api/ai/proxy.
        { href: "/admin/pages/ai-tools-guide", label: "AI tools guide", icon: Wand2 },
        { href: "/admin/content", label: "Posts & comments", icon: MessageSquare },
        { href: "/admin/messages", label: "Messages (moderation)", icon: MessageSquare },
        { href: "/admin/skills", label: "Skills & domains", icon: Tag },
        { href: "/admin/hashtags", label: "Hashtags", icon: Hash },
        // Salary Compass moderation — anonymous submissions land
        // PENDING; admin approves/rejects to publish to /salaries.
        { href: "/admin/salaries", label: "Salary submissions", icon: Tag },
        // Wave C #26 — Best EV Employer yearly award computation.
        // Admin clicks "Compute YYYY rankings" to refresh; results
        // surface at the public /awards page.
        { href: "/admin/awards", label: "Best EV Employer", icon: Trophy },
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
        // Notification templates (admin-editable title/body/channels
        // overrides) + per-channel dispatch log. See
        // lib/notifications/dispatch.ts for the lookup rules.
        { href: "/admin/notifications/templates", label: "Notification templates", icon: Mail },
        { href: "/admin/notifications/logs", label: "Notification logs", icon: ScrollText },
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
        // Feature flags — distinct from settings (kill switches) and
        // experiments (sticky A/B variants). For incremental rollouts
        // (5% → 25% → 100%) + targeted beta enrolment.
        { href: "/admin/feature-flags", label: "Feature flags", icon: Sparkles },
        { href: "/admin/billing", label: "Billing (plans)", icon: CreditCard },
      ],
    },
    {
      title: "System",
      items: [
        // The legacy importer for users / companies / jobs (uses
        // wpLegacyId columns + magic-link claim emails). Distinct
        // from the content importer below which feeds the Page table.
        { href: "/admin/import", label: "WP import — users & jobs", icon: Download },
        // The content importer for WP pages + posts → Page table.
        { href: "/admin/import/content", label: "WP import — pages & posts", icon: FileDown },
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

  // Compute the deepest-matching href once. The naive
  // "pathname.startsWith(item.href)" highlights every ancestor in
  // the tree — so on /admin/pages/ai-tools-guide both "Pages (CMS)"
  // and "AI tools guide" would light up. Pick the longest match
  // and only that one wins.
  const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const activeHref = allHrefs
    .filter((h) => h === pathname || pathname.startsWith(h + "/") || (h === "/admin" && pathname === "/admin"))
    .sort((a, b) => b.length - a.length)[0] ?? "";

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
          <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5 text-emce-text-sec" />
          </button>
        </div>

        <nav className="p-2">
          {groups.map((g, gi) => (
            <Section key={gi} title={g.title}>
              {g.items.map((item) => (
                <NavItem key={item.href} item={item} activeHref={activeHref} />
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

function NavItem({ item, activeHref }: { item: Item; activeHref: string }) {
  // Single-source-of-truth active flag — the parent computed which
  // href is "the deepest match" for the current pathname; we just
  // compare. This prevents ancestor entries from also lighting up.
  const active = item.href === activeHref;
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
