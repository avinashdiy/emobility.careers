"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings, User as UserIcon, Briefcase, GraduationCap, Trophy, Eye } from "lucide-react";
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
          className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-md border border-emce-border bg-white shadow-emce-lg"
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

          <Group title="Profile">
            <Item href="/me" icon={<UserIcon className="h-4 w-4" />} label="Dashboard" />
            <Item href="/me/profile" label="Edit profile" />
            <Item href="/me/applications" icon={<Briefcase className="h-4 w-4" />} label="My applications" />
            <Item href="/me/saved" label="Saved jobs" />
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

          {user.role === "EMPLOYER" && (
            <Group title="Hiring">
              <Item href="/employer" label="Employer dashboard" />
              <Item href="/employer/jobs" label="Jobs" />
              <Item href="/employer/competitions" label="Host a competition" />
            </Group>
          )}

          {user.role === "ADMIN" && (
            <Group title="Admin">
              <Item href="/admin" label="Admin dashboard" />
              <Item href="/admin/mentors" label="Mentor KYC" />
              <Item href="/admin/competitions" label="Competition moderation" />
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
