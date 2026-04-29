import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import {
  getCompassCounters,
  getTopPayingRoles,
  getTopPayingCompanies,
  isUnlocked,
  formatLakhs,
  PUBLIC_MIN_SAMPLES,
} from "@/lib/salary-compass";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "EV Salary Compass — what India's EV industry pays, by company + role",
  description:
    "Anonymous, crowd-sourced India EV salary database. Submit one to unlock medians by company, role, and experience tier — Battery, Charging, Motors, Powertrain, Software.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/salaries` },
  openGraph: {
    type: "website",
    title: "EV Salary Compass · emobility.careers",
    description: "Anonymous India EV salary database. Submit one to unlock the rest.",
    url: `${env.NEXT_PUBLIC_APP_URL}/salaries`,
  },
};

/**
 * Salary Compass landing — Levels.fyi for India's EV industry.
 *
 * Two states:
 *   • Locked (default visitor) — sees the headline counters + top-3
 *     roles/companies + a big "🔓 Submit anonymously to unlock" pill.
 *     The teaser data is public so the page ranks on Google for queries
 *     like "EV battery engineer salary India".
 *   • Unlocked (visitor has submitted, cookie set) — sees the full
 *     top-6 lists + per-company + per-role tier breakdowns.
 */
export default async function SalariesPage({
  searchParams,
}: {
  searchParams: Promise<{ just_submitted?: string }>;
}) {
  const sp = await searchParams;
  const [unlocked, counters, topRoles, topCompanies] = await Promise.all([
    isUnlocked(),
    getCompassCounters(),
    getTopPayingRoles(unlockedRows()),
    getTopPayingCompanies(unlockedRows()),
  ]);
  function unlockedRows() {
    // Recompute after the unlock check — locked visitors see top 3 only,
    // unlocked viewers see top 6. The first call resolves before the
    // second so this works either way.
    return 6; // we cap downstream when locked
  }

  // Locked visitors see top-3 only (teaser); unlocked see top-6 (full).
  const limitedRoles = unlocked ? topRoles : topRoles.slice(0, 3);
  const limitedCompanies = unlocked ? topCompanies : topCompanies.slice(0, 3);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <section className="emce-hero-gradient text-white">
          <div className="container max-w-5xl py-12 md:py-16">
            <div className="emce-pill mb-4">
              <span aria-hidden>💰</span>
              <span>Anonymous · India-only · EV-only</span>
            </div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
              What India's EV industry actually pays.
            </h1>
            <p className="mt-3 max-w-2xl text-white/85 md:text-lg">
              Crowd-sourced from {counters.totalApproved.toLocaleString()} verified submissions across{" "}
              {counters.companiesCovered.toLocaleString()} companies and {counters.rolesCovered.toLocaleString()} roles. Submit yours anonymously to unlock the database for 30 days.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroCounter value={counters.totalApproved} label="Verified salaries" />
              <HeroCounter value={counters.companiesCovered} label="Companies" />
              <HeroCounter value={counters.rolesCovered} label="Roles" />
              <HeroCounter value={counters.newThisWeek} label="New this week" accent />
            </div>
          </div>
        </section>

        <div className="container max-w-5xl space-y-8 py-10">
          {sp.just_submitted && (
            <Card className="border-emce-mid bg-emce-light-soft">
              <p className="text-section text-emce-text">
                ✅ Thanks — your salary is in moderation.
              </p>
              <p className="mt-1 text-hint text-emce-text-sec">
                It typically goes live in 24 hours. Meanwhile, the database is unlocked for your browser for 30 days. Browse below.
              </p>
            </Card>
          )}

          {/* Unlock CTA (locked state) */}
          {!unlocked && (
            <Card className="border-emce-mid bg-emce-light-soft">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-section text-emce-text">
                    🔓 Unlock the full database
                  </p>
                  <p className="mt-1 text-hint text-emce-text-sec">
                    Anonymous, takes 60 seconds. We never see your name unless you opt in. Unlocks the full database for 30 days.
                  </p>
                </div>
                <Button asChild size="lg">
                  <Link href="/salaries/submit">Submit my salary →</Link>
                </Button>
              </div>
            </Card>
          )}

          {/* Top-paying roles */}
          <section>
            <SectionHeader
              eyebrow="Top-paying"
              title="EV roles by median CTC"
              hint={`Across the last 24 months · ≥${PUBLIC_MIN_SAMPLES} submissions per role`}
              link={{ href: "/salaries/submit", label: "Add yours →" }}
            />
            {limitedRoles.length === 0 ? (
              <Card className="text-center text-emce-text-sec">
                Not enough submissions yet to compute role medians. Be the first — submit yours.
              </Card>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {limitedRoles.map((r) => (
                  <li key={r.jobTitle}>
                    <Card>
                      <p className="line-clamp-2 text-sm font-bold text-emce-text">{r.jobTitle}</p>
                      <p className="mt-2 text-2xl font-extrabold text-emce-mid-muted">
                        {formatLakhs(r.stat.medianLakhs)}
                      </p>
                      <p className="mt-1 text-hint text-emce-text-sec">
                        median · {formatLakhs(r.stat.p25Lakhs)} – {formatLakhs(r.stat.p75Lakhs)} (p25-p75)
                      </p>
                      <p className="mt-1 text-hint text-emce-text-muted">
                        {r.stat.count} submissions
                      </p>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
            {!unlocked && topRoles.length > 3 && (
              <p className="mt-3 text-center text-sm text-emce-text-sec">
                +{topRoles.length - 3} more roles · <Link href="/salaries/submit" className="font-bold text-emce-dark hover:underline">unlock</Link>
              </p>
            )}
          </section>

          {/* Top-paying companies */}
          <section>
            <SectionHeader
              eyebrow="By company"
              title="Top-paying EV employers"
              hint="Median total CTC across approved submissions. Verified companies linked through to their pages."
            />
            {limitedCompanies.length === 0 ? (
              <Card className="text-center text-emce-text-sec">
                Need a few more company submissions before we can rank.
              </Card>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {limitedCompanies.map((c) => (
                  <li key={`${c.companyId ?? c.companyName}`}>
                    <Card>
                      <div className="flex items-center gap-3">
                        <Avatar src={c.logoUrl} name={c.companyName} size="md" />
                        <div className="min-w-0">
                          {c.companySlug ? (
                            <Link href={`/company/${c.companySlug}`} className="block truncate font-bold text-emce-text hover:underline">
                              {c.companyName}
                            </Link>
                          ) : (
                            <p className="truncate font-bold text-emce-text">{c.companyName}</p>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 text-2xl font-extrabold text-emce-mid-muted">
                        {formatLakhs(c.stat.medianLakhs)}
                      </p>
                      <p className="mt-1 text-hint text-emce-text-sec">
                        median · {c.stat.count} submission{c.stat.count === 1 ? "" : "s"}
                      </p>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
            {!unlocked && topCompanies.length > 3 && (
              <p className="mt-3 text-center text-sm text-emce-text-sec">
                +{topCompanies.length - 3} more companies · <Link href="/salaries/submit" className="font-bold text-emce-dark hover:underline">unlock</Link>
              </p>
            )}
          </section>

          <Card className="border-dashed bg-emce-light-bg">
            <p className="text-section text-emce-text">
              🔒 How we protect your privacy
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-hint text-emce-text-sec">
              <li>Submissions are anonymous unless you explicitly opt in.</li>
              <li>We only ever show aggregates — never individual submissions.</li>
              <li>Each metric requires ≥{PUBLIC_MIN_SAMPLES} submissions; small samples never display.</li>
              <li>Admin-moderated before going live; spam never reaches the public view.</li>
            </ul>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function HeroCounter({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div>
      <p className={`text-3xl font-extrabold leading-none md:text-4xl ${accent ? "text-emce-mid" : "text-white"}`}>
        {value.toLocaleString()}
      </p>
      <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-white/70">{label}</p>
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
        <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">{eyebrow}</p>
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
