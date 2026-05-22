"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings, User as UserIcon, Briefcase, GraduationCap, Trophy, Eye, BarChart3, Building2, ArrowLeftRight } from "lucide-react";
import type { Country } from "@prisma/client";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export interface UserMenuViewerData {
  name: string;
  email: string;
  role: "ADMIN" | "EMPLOYER" | "CANDIDATE";
  avatarUrl: string | null;
  publicSlug: string | null;
  isMentor: boolean;
  isVerified: boolean;
  /** Admin-grantable flag from `User.isPlacementOfficer`. When true, the
      "TPO" group is rendered with the /tpo dashboard link, even though
      the user's `role` is not ADMIN. */
  isPlacementOfficer: boolean;
  /** True when the user has a CandidateProfile row (signed up as a
      candidate, or an employer who got auto-seeded one). Drives the
      "Personal" half of the persona switcher. */
  hasCandidateProfile: boolean;
  /** True when the user has an EmployerProfile row. Drives the
      "Hiring" half of the switcher; when false a "Hire on eMobility"
      CTA is rendered instead. */
  hasEmployerProfile: boolean;
  /** Company shown next to the "Hiring" persona row. */
  employerCompany: { name: string; slug: string; logoUrl: string | null } | null;
  /** User's home country — drives the CountrySelector trigger flag
      in the header and (later) the default currency/time-zone for
      every personalised surface. Captured at signup; defaults to
      IN for legacy users. */
  country: Country;
}

/**
 * LinkedIn-style "Me" dropdown. Shows a profile preview, then segmented links
 * grouped by intent: profile, mentorship, competitions, applications, role-
 * specific (employer / admin), and account settings + sign out. The dropdown
 * is the primary entry point for the four pillars from any page in the app.
 */
export function HeaderUserMenu({ user }: { user: UserMenuViewerData }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  // The dropdown's persona switcher decides which view is "active"
  // from the current URL prefix — /employer/* means employer view,
  // anything else (including /me/*) is the candidate view. Cookie-
  // based state would be more correct in theory but the URL is
  // already authoritative and avoids a round-trip.
  const inEmployerView = pathname?.startsWith("/employer") ?? false;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      window.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-emce-light-soft"
        aria-label="Open account menu"
      >
        <Avatar src={user.avatarUrl} name={user.name} size="sm" />
        <ChevronDown className="h-3.5 w-3.5 text-emce-text-sec" />
      </button>

      {open && (
        <div
          role="menu"
          // `max-h-[calc(100vh-4rem)]` caps the dropdown so it never
          // extends past the viewport; `overflow-y-auto` makes the
          // inner content scroll when there are more groups than fit
          // (typical for dual-persona users — Profile + Mentorship +
          // Competitions + Hiring + Admin/TPO + Account easily
          // exceeds a laptop screen). `overflow-x-hidden` keeps the
          // rounded corners clean horizontally. Previously
          // `overflow-hidden` clipped the lower groups entirely on
          // ~13" laptops.
          className="absolute right-0 top-full z-50 mt-1 max-h-[calc(100vh-4rem)] w-72 overflow-y-auto overflow-x-hidden rounded-md border border-emce-border bg-white shadow-emce-lg"
          onClick={() => setOpen(false)}
        >
          <div className="border-b border-emce-border p-3">
            <div className="flex items-center gap-3">
              <Avatar src={user.avatarUrl} name={user.name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-emce-text">{user.name || user.email}</div>
                <div className="truncate text-xs text-emce-text-sec">{user.email}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[10px]">{user.role}</Badge>
                  {user.isVerified && <Badge variant="verified" className="text-[10px]">⭐ Verified</Badge>}
                </div>
              </div>
            </div>
            {user.publicSlug && (
              <Link
                href={`/${user.publicSlug}`}
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-emce-dark hover:underline"
              >
                <Eye className="h-3 w-3" /> View public profile
              </Link>
            )}
          </div>

          {/* Persona switcher — LinkedIn pattern. Renders only when both
              personas exist; otherwise shows a single-line "current view"
              indicator. The "Hire on eMobility" CTA below still appears
              for candidates who haven't adopted the employer persona. */}
          {user.hasCandidateProfile && user.hasEmployerProfile && (
            <div className="border-b border-emce-border bg-emce-light-soft p-2">
              <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-emce-text-sec">
                <ArrowLeftRight className="mr-1 inline h-3 w-3" /> Switch view
              </div>
              <ul className="space-y-0.5">
                <PersonaRow
                  href="/me"
                  active={!inEmployerView}
                  icon={<UserIcon className="h-4 w-4" />}
                  label="Personal"
                  sub="Your candidate profile + applications"
                />
                <PersonaRow
                  href="/employer"
                  active={inEmployerView}
                  icon={<Building2 className="h-4 w-4" />}
                  label={user.employerCompany?.name ?? "Hiring"}
                  sub={user.employerCompany ? "Recruiter dashboard" : "Employer dashboard"}
                />
              </ul>
            </div>
          )}

          <Group title="Profile">
            <Item href="/me" icon={<UserIcon className="h-4 w-4" />} label="Dashboard" />
            <Item href="/me/profile" label="Edit profile" />
            <Item href="/me/verify" label="Verify profile (blue checkmark)" />
            <Item href="/me/applications" icon={<Briefcase className="h-4 w-4" />} label="My applications" />
            <Item href="/me/saved" label="Saved jobs" />
            <Item href="/me/contact-shares" label="Contact share requests" />
            <Item href="/me/account" label="Account & data rights" />
          </Group>

          <Group title="Mentorship">
            <Item href="/me/sessions" icon={<GraduationCap className="h-4 w-4" />} label="My sessions" />
            <Item
              href={user.isMentor ? "/me/mentor/sessions" : "/me/mentor"}
              label={user.isMentor ? "Mentor inbox" : "Become a mentor"}
            />
          </Group>

          <Group title="Competitions">
            <Item href="/me/competitions" icon={<Trophy className="h-4 w-4" />} label="My competitions" />
            <Item href="/competitions" label="Browse competitions" />
          </Group>

          {/* Hiring group renders for anyone with an EmployerProfile
              (covers both EMPLOYER-role primary and dual-persona
              candidates who later opted in). Candidates without one
              get a "Hire on eMobility" CTA so they can adopt the
              employer persona without leaving the dropdown. */}
          {user.hasEmployerProfile ? (
            <Group title="Hiring">
              <Item href="/employer" label="Employer dashboard" />
              <Item href="/employer/jobs" label="Jobs" />
              <Item href="/employer/events" label="Events" />
              <Item href="/employer/competitions" label="Host a competition" />
            </Group>
          ) : (
            user.role !== "ADMIN" && (
              <Group title="Hiring">
                <Item
                  href="/employer/onboarding"
                  icon={<Building2 className="h-4 w-4" />}
                  label="Hire on eMobility →"
                />
              </Group>
            )
          )}

          {user.role === "ADMIN" && (
            <Group title="Admin">
              <Item href="/admin" label="Admin dashboard" />
              <Item href="/admin/mentors" label="Mentor KYC" />
              <Item href="/admin/competitions" label="Competition moderation" />
            </Group>
          )}

          {/* TPO group — visible to ADMINs and to candidates flagged as
              placement officers. The /tpo dashboard surfaces cohort
              funnels, drop-offs, and unplaced students for DIYguru
              placement coordinators. */}
          {(user.role === "ADMIN" || user.isPlacementOfficer) && (
            <Group title="Placement (TPO)">
              <Item href="/tpo" icon={<BarChart3 className="h-4 w-4" />} label="Placement dashboard" />
              <Item href="/tpo/cohorts" label="Cohorts" />
              <Item href="/tpo/unplaced" label="Unplaced students" />
            </Group>
          )}

          <Group title="Account">
            <Item href="/me/preferences" icon={<Settings className="h-4 w-4" />} label="Notification preferences" />
            <Item href="/api/auth/signout" icon={<LogOut className="h-4 w-4" />} label="Sign out" />
          </Group>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-emce-border last:border-0">
      <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-emce-text-sec">{title}</div>
      <ul className="pb-1">{children}</ul>
    </div>
  );
}

function Item({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-emce-text hover:bg-emce-light-soft"
      >
        {icon && <span className="text-emce-text-sec">{icon}</span>}
        <span>{label}</span>
      </Link>
    </li>
  );
}

/**
 * One row of the persona switcher. The active row gets a checkmark and
 * a darker background; the inactive row is the link the user clicks to
 * flip views. Two-line layout: persona label on top, short caption
 * below describing what the view contains.
 */
function PersonaRow({
  href,
  active,
  icon,
  label,
  sub,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "true" : undefined}
        className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${
          active
            ? "bg-white shadow-emce ring-1 ring-emce-mid/40"
            : "hover:bg-white"
        }`}
      >
        <span
          className={`mt-0.5 ${active ? "text-emce-darkest" : "text-emce-text-sec"}`}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-emce-text">
            {label}
            {active && (
              <span className="ml-1 text-[10px] font-extrabold text-emce-mid">
                ✓ Current
              </span>
            )}
          </span>
          <span className="block truncate text-[11px] text-emce-text-sec">{sub}</span>
        </span>
      </Link>
    </li>
  );
}
