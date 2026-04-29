import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  getPulseCounters,
  getTopHiringCompanies,
  getHottestSkills,
  getRecentHires,
  getSalaryTeasers,
  getFeaturedCandidates,
  formatLakhs,
} from "@/lib/pulse";
import { relativeTime } from "@/lib/utils";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "EV Industry Pulse — live hiring, salaries, and momentum",
  description:
    "The live heartbeat of India's EV industry. Open jobs, hires this week, hottest skills, salary medians, and rising professionals — all in one place.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/pulse` },
  openGraph: {
    type: "website",
    url: `${env.NEXT_PUBLIC_APP_URL}/pulse`,
    title: "EV Industry Pulse · emobility.careers",
    description: "The live heartbeat of India's EV industry.",
  },
};

/**
 * Industry Pulse — the platform's viral magnet. A public, no-auth,
 * dynamically-rendered page showing the EV industry's heartbeat in
 * real time. Every share, every Google search, every WhatsApp forward
 * is meant to land here. The funnel:
 *
 *   land → see proof of life → curiosity → sign up to act on it
 *
 * Sections, top to bottom:
 *   1. Hero with five live counters (open jobs, today, verified, hires, companies)
 *   2. Top-6 hiring companies (logo grid)
 *   3. Hottest skills tag cloud
 *   4. Recent hires anonymised feed
 *   5. Salary teasers ("Battery Engineer · ₹12-22L median, 47 listings")
 *   6. Rising professionals (featured)
 *   7. Conversion CTA
 *
 * Pulse is intentionally generous with public data because the bet is
 * "see something interesting → sign up to act on it". Personal surfaces
 * (matching, alerts, applying) still require auth.
 */
export default async function PulsePage() {
  const [counters, companies, skills, hires, salaries, candidates] = await Promise.all([
    getPulseCounters(),
    getTopHiringCompanies(),
    getHottestSkills(),
    getRecentHires(),
    getSalaryTeasers(),
    getFeaturedCandidates(),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        {/* ─── Hero with live counters ─── */}
        <section className="emce-hero-gradient text-white">
          <div className="container max-w-6xl py-12 md:py-16">
            <div className="emce-pill mb-4">
              <span aria-hidden>⚡</span>
              <span>Live · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}</span>
            </div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight md:text-4xl">
              The live heartbeat of India's EV industry.
            </h1>
            <p className="mt-3 max-w-2xl text-white/85 md:text-lg">
              Where the people building electric mobility hire, get hired, and trade notes. Updated every minute.
            </p>

            {/* Counter strip — large numbers + tiny labels in LinkedIn density */}
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Counter value={counters.openJobs} label="Open EV jobs" big />
              <Counter
                value={counters.jobsAddedToday}
                label="Added today"
                accent
              />
              <Counter value={counters.verifiedPros} label="Verified pros" />
              <Counter value={counters.hiresLast7d} label="Hires this week" accent />
              <Counter value={counters.activeCompanies} label="Companies hiring" />
            </div>
          </div>
        </section>

        <div className="container max-w-6xl space-y-8 py-10">
          {/* ─── Top hiring companies ─── */}
          <section>
            <SectionHeader
              eyebrow="Right now"
              title="Top hiring companies"
              hint="Most open EV roles, ranked by job count."
              link={{ href: "/companies", label: "All companies →" }}
            />
            {companies.length === 0 ? (
              <Skeleton text="No active employers right now — check back soon." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {companies.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/company/${c.slug}`}
                    className="group flex items-center gap-3 rounded-lg border border-emce-border bg-white p-4 transition hover:border-emce-mid hover:shadow-emce-hover"
                  >
                    <Avatar src={c.logoUrl} name={c.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-emce-text group-hover:text-emce-dark">
                        {c.name}
                      </p>
                      <p className="text-hint text-emce-text-sec">
                        {c.openCount} open {c.openCount === 1 ? "role" : "roles"}
                      </p>
                    </div>
                    <span className="rounded-full bg-emce-light-soft px-2 py-0.5 text-[10px] font-bold text-emce-darkest">
                      Hiring
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* ─── Hottest skills ─── */}
          <section>
            <SectionHeader
              eyebrow="In demand"
              title="Hottest EV skills this month"
              hint="Most-required across roles posted in the last 30 days."
            />
            {skills.length === 0 ? (
              <Skeleton text="Skill demand updates as new jobs land." />
            ) : (
              <div className="flex flex-wrap gap-2">
                {skills.map((s, i) => (
                  <Link
                    key={s.slug}
                    href={`/jobs?q=${encodeURIComponent(s.name)}`}
                    className="inline-flex items-center gap-2 rounded-full border border-emce-border bg-white px-3 py-1.5 text-sm font-bold text-emce-text transition hover:border-emce-mid hover:bg-emce-light-soft"
                  >
                    <span className="text-emce-text-sec">#{i + 1}</span>
                    <span>{s.name}</span>
                    <span className="rounded-full bg-emce-light-soft px-2 py-0.5 text-[10px] font-bold text-emce-mid-muted">
                      {s.jobCount} jobs
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* ─── Recent hires (anonymised) ─── */}
          <section>
            <SectionHeader
              eyebrow="Loop closed"
              title="Recent EV hires"
              hint="Anonymised — verified employers only."
            />
            {hires.length === 0 ? (
              <Skeleton text="Hires will appear here as recruiters mark their candidates HIRED." />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {hires.map((h, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-lg border border-emce-border bg-white p-3"
                  >
                    <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-emce-light text-sm font-extrabold text-emce-darkest">
                      {h.initial}
                    </div>
                    <p className="text-sm text-emce-text">
                      <strong>{h.initial}.</strong> just hired at{" "}
                      <strong className="text-emce-dark">{h.companyName}</strong>{" "}
                      for <strong>{h.jobTitle}</strong>
                      <span className="ml-1 text-hint text-emce-text-muted">
                        · {relativeTime(new Date(h.whenMs))}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ─── Salary teasers ─── */}
          {salaries.length > 0 && (
            <section>
              <SectionHeader
                eyebrow="Compensation"
                title="What EV roles pay right now"
                hint="Median bands across public listings, last 90 days. Sign in for company + experience breakdowns."
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {salaries.map((s) => (
                  <Card key={s.jobTitle} className="text-center">
                    <p className="line-clamp-2 text-sm font-bold text-emce-text">{s.jobTitle}</p>
                    <p className="mt-2 text-2xl font-extrabold text-emce-mid-muted">
                      {formatLakhs(s.medianMin, s.currency)}–{formatLakhs(s.medianMax, s.currency)}
                    </p>
                    <p className="mt-1 text-hint text-emce-text-sec">
                      median across {s.count} listings
                    </p>
                  </Card>
                ))}
              </div>
              <Card className="mt-3 border-dashed bg-emce-light-bg">
                <p className="text-sm text-emce-text">
                  🔓 <strong>Want company-specific salary bands?</strong>{" "}
                  <Link href="/signup?role=CANDIDATE" className="font-bold text-emce-dark hover:underline">
                    Sign up free
                  </Link>{" "}
                  — anonymous salary submissions unlock the full Compass.
                </p>
              </Card>
            </section>
          )}

          {/* ─── Featured candidates ─── */}
          {candidates.length > 0 && (
            <section>
              <SectionHeader
                eyebrow="On the rise"
                title="EV pros worth watching"
                hint="Verified, open to work, and ranked by recent profile activity."
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {candidates.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/${c.slug}`}
                    className="group flex flex-col items-center rounded-lg border border-emce-border bg-white p-4 text-center transition hover:border-emce-mid hover:shadow-emce-hover"
                  >
                    <Avatar
                      src={c.profilePhotoUrl}
                      name={c.name}
                      size="lg"
                      openToWork
                    />
                    <p className="mt-3 line-clamp-1 font-bold text-emce-text group-hover:text-emce-dark">
                      {c.name}
                    </p>
                    {c.headline && (
                      <p className="mt-0.5 line-clamp-2 text-hint text-emce-text-sec">
                        {c.headline}
                      </p>
                    )}
                    <p className="mt-2 text-hint text-emce-text-muted">
                      {c.totalExperienceYears} yrs experience
                    </p>
                    {c.isDIYguruVerified && (
                      <Badge variant="verified" className="mt-2 text-[10px]">
                        ⭐ DIYguru
                      </Badge>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ─── Conversion CTA ─── */}
          <section className="emce-hero-gradient overflow-hidden rounded-2xl text-white">
            <div className="grid gap-6 p-8 md:grid-cols-2 md:p-10">
              <div>
                <h2 className="text-2xl font-extrabold leading-tight md:text-3xl">
                  This is the EV industry's address.
                </h2>
                <p className="mt-2 text-white/85">
                  Build a verified profile in 3 minutes. Get matched with the {counters.openJobs.toLocaleString()} open roles, learn from mentors, and join the {counters.verifiedPros.toLocaleString()}-strong network.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 md:justify-end">
                <Button asChild size="lg" className="bg-emce-mid text-emce-darkest hover:bg-emce-mid-muted">
                  <Link href="/signup?role=CANDIDATE">Join as a candidate</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10">
                  <Link href="/signup?role=EMPLOYER">Hire EV talent</Link>
                </Button>
              </div>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

// ─── Local atoms ───────────────────────────────────────────

function Counter({
  value,
  label,
  big = false,
  accent = false,
}: {
  value: number;
  label: string;
  big?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={big ? "col-span-2 sm:col-span-1" : ""}>
      <p
        className={`font-extrabold leading-none ${
          big ? "text-4xl md:text-5xl" : "text-2xl md:text-3xl"
        } ${accent ? "text-emce-mid" : "text-white"}`}
      >
        {value.toLocaleString()}
      </p>
      <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-white/70">
        {label}
      </p>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  hint,
  link,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">
          {eyebrow}
        </p>
        <h2 className="mt-0.5 text-section text-emce-text">{title}</h2>
        {hint && <p className="mt-0.5 text-hint text-emce-text-sec">{hint}</p>}
      </div>
      {link && (
        <Link href={link.href} className="text-xs font-bold text-emce-dark hover:underline">
          {link.label}
        </Link>
      )}
    </div>
  );
}

function Skeleton({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-emce-border bg-white/60 p-6 text-center text-sm text-emce-text-sec">
      {text}
    </div>
  );
}
