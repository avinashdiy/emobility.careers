import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Logo } from "@/components/brand/Logo";

const NAV = [
  { href: "/employer", label: "Dashboard" },
  { href: "/employer/jobs", label: "Jobs" },
  { href: "/employer/candidates", label: "Candidates" },
  { href: "/employer/drives", label: "Drives" },
  { href: "/employer/competitions", label: "Competitions" },
  { href: "/employer/events", label: "Events" },
  { href: "/employer/verifications", label: "Verify" },
  { href: "/employer/saved", label: "Saved" },
  { href: "/employer/messages", label: "Messages" },
  { href: "/employer/contact-requests", label: "Contact requests" },
  { href: "/employer/team", label: "Team" },
  { href: "/employer/company", label: "Company" },
];

export function EmployerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-emce-light-bg">
      <header className="border-b border-emce-border bg-white">
        <div className="container flex h-14 items-center justify-between gap-3">
          {/* Brand wordmark + a small "Employer" suffix so the chrome
              still reads as the employer console. */}
          <Link href="/employer" className="flex items-center gap-2 font-extrabold text-emce-text" aria-label="Employer console home">
            <Logo size="md" priority />
            <span className="hidden text-emce-text-sec sm:inline">·</span>
            <span className="hidden sm:inline">Employer</span>
          </Link>
          <nav className="hidden gap-1 lg:flex">
            {NAV.slice(0, 6).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-1.5 text-sm font-bold text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-dark"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="default" size="sm" className="hidden sm:inline-flex">
              <Link href="/employer/jobs/new">+ Post a job</Link>
            </Button>
            <MobileNav items={NAV} variant="light" />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
