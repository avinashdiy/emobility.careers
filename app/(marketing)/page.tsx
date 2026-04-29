import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { getPulseCounters, getFeaturedCandidates } from "@/lib/pulse";
import {
  getTopPayingRolesByTier,
  formatLakhs,
  type TopRoleByTier,
} from "@/lib/salary-compass";
import { Avatar } from "@/components/ui/avatar";

// Render the home page on every request so the live counters stay
// fresh and visitors see real momentum, not a stale snapshot.
export const dynamic = "force-dynamic";

const EV_DOMAINS = [
  { slug: "battery-tech", name: "Battery Tech", emoji: "🔋", count: "120+ jobs" },
  { slug: "charging-infra", name: "Charging Infra", emoji: "⚡", count: "85+ jobs" },
  { slug: "powertrain", name: "Powertrain", emoji: "⚙️", count: "70+ jobs" },
  { slug: "motor-control", name: "Motor & Control", emoji: "🌀", count: "60+ jobs" },
  { slug: "vehicle-engineering", name: "Vehicle Engineering", emoji: "🚗", count: "95+ jobs" },
  { slug: "fleet-mobility", name: "Fleet & Mobility", emoji: "🛵", count: "40+ jobs" },
];

export default async function HomePage() {
  const [locale, pulse, featured, engineerSalaries, technicianSalaries] = await Promise.all([
    getLocale(),
    getPulseCounters(),
    getFeaturedCandidates(5),
    getTopPayingRolesByTier("ENGINEER", 5),
    getTopPayingRolesByTier("TECHNICIAN", 5),
  ]);

  // Live counters replace the prior hard-coded "12,500+ / 650+ / …" set.
  // We fall back to a "—" when the DB returns zero so a brand-new
  // install doesn't show false zeros to the first visitor; once the
  // platform has a heartbeat, the real values surface.
  const STATS: { value: string; label: string }[] = [
    { value: pulse.openJobs > 0 ? `${pulse.openJobs.toLocaleString()}` : "—", label: t("stats.openRoles", locale) },
    { value: pulse.activeCompanies > 0 ? `${pulse.activeCompanies.toLocaleString()}` : "—", label: t("stats.companies", locale) },
    { value: pulse.verifiedPros > 0 ? `${pulse.verifiedPros.toLocaleString()}` : "—", label: t("stats.activeCandidates", locale) },
    { value: pulse.hiresLast7d > 0 ? `${pulse.hiresLast7d.toLocaleString()} / wk` : "DIYguru", label: pulse.hiresLast7d > 0 ? "Hires this week" : t("stats.diyguru", locale) },
  ];
  return (
    <>
      {/* ─── Hero ─── */}
      <section className="emce-hero-gradient text-white">
        <div className="container py-20 md:py-24">
          {/* Live "Pulse" pill — clickable, dynamic. Replaces the
              static hero pill with proof-of-life: "X jobs added today".
              Even when zero new today we still link out so visitors can
              see the broader heartbeat. */}
          <Link
            href="/pulse"
            className="emce-pill mb-6 transition hover:bg-white/15"
          >
            <span aria-hidden className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emce-mid opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emce-mid" />
            </span>
            <span>
              {pulse.jobsAddedToday > 0
                ? `Live · ${pulse.jobsAddedToday} EV ${pulse.jobsAddedToday === 1 ? "role" : "roles"} added today`
                : "Live · the EV industry pulse"}
            </span>
            <span aria-hidden>→</span>
          </Link>
          <h1 className="text-hero max-w-3xl text-white">
            {t("hero.title.lead", locale)}{" "}
            <span className="text-emce-mid">{t("hero.title.accent", locale)}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base text-white/85 md:text-lg">
            {t("hero.subtitle", locale)}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="accent">
              <Link href="/jobs">{t("cta.findJob", locale)}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white text-white hover:bg-white/10 hover:text-white">
              <Link href="/employer">{t("cta.hireTalent", locale)}</Link>
            </Button>
            {/* Free, no-signup viral hook. Sits next to the primary CTAs
                so curious visitors who aren't ready to commit have an
                action to take that builds platform value. */}
            <Button asChild size="lg" variant="outline" className="border-emce-mid bg-emce-mid/10 text-emce-mid hover:bg-emce-mid/20 hover:text-emce-mid">
              <Link href="/roast">🔥 Roast my resume — free</Link>
            </Button>
          </div>

          {/* Quick search */}
          <form action="/jobs" className="mt-10 flex flex-col gap-2 rounded-lg bg-white/10 p-2 backdrop-blur md:flex-row md:items-center">
            <input
              name="q"
              placeholder={t("search.placeholder.q", locale)}
              className="flex-1 rounded-md bg-white px-4 py-3 text-emce-text placeholder:text-emce-text-muted focus:outline-none"
            />
            <input
              name="location"
              placeholder={t("search.placeholder.location", locale)}
              className="w-full rounded-md bg-white px-4 py-3 text-emce-text placeholder:text-emce-text-muted focus:outline-none md:w-56"
            />
            <Button type="submit" size="lg" variant="accent">
              {t("search.button", locale)}
            </Button>
          </form>
        </div>
      </section>

      {/* ─── Stats strip ─── */}
      <section className="border-y border-emce-border bg-white">
        <div className="container grid grid-cols-2 gap-6 py-8 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center md:text-left">
              <div className="text-2xl font-extrabold text-emce-dark md:text-3xl">{s.value}</div>
              <div className="mt-1 text-xs uppercase tracking-wide text-emce-text-muted">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Featured This Week ─── */}
      {featured.length > 0 && (
        <section className="container py-16">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <Badge variant="success" className="mb-2">✨ Featured this week</Badge>
              <h2 className="text-dashboard text-emce-text md:text-3xl">
                EV pros worth watching
              </h2>
              <p className="mt-1 text-sm text-emce-text-sec">
                Editorial picks · open to work · DIYguru-verified bias.
              </p>
            </div>
            <Link href="/pulse" className="hidden text-sm font-bold text-emce-dark hover:underline md:block">
              See full Pulse →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {featured.map((c) => (
              <Link
                key={c.slug}
                href={`/${c.slug}`}
                className="group flex flex-col items-center rounded-lg border border-emce-border bg-white p-4 text-center transition hover:border-emce-mid hover:shadow-emce-hover"
              >
                <Avatar
                  src={c.profilePhotoUrl}
                  name={c.name}
                  size="lg"
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

      {/* ─── Salary Compass spotlight (levels.fyi-style) ─── */}
      {(engineerSalaries.length > 0 || technicianSalaries.length > 0) && (
        <section className="container py-16">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <Badge variant="default" className="mb-2">💰 Salary Compass · India</Badge>
              <h2 className="text-dashboard text-emce-text md:text-3xl">
                Top EV salaries · 2026 medians
              </h2>
              <p className="mt-1 max-w-xl text-sm text-emce-text-sec">
                Median CTC across verified, anonymous submissions —
                split into white-collar engineers and blue-collar
                technicians. Submit one to unlock the full database.
              </p>
            </div>
            <Link
              href="/salaries"
              className="hidden text-sm font-bold text-emce-dark hover:underline md:block"
            >
              See full Compass →
            </Link>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SalaryColumn
              tone="engineer"
              title="🧑‍💻 Engineers"
              subtitle="White-collar · degree-track"
              rows={engineerSalaries}
              emptyHint="More engineer submissions needed before public medians can show."
            />
            <SalaryColumn
              tone="technician"
              title="🔧 Technicians"
              subtitle="Blue-collar · ITI / diploma · DIYguru-trained"
              rows={technicianSalaries}
              emptyHint="More technician submissions needed before public medians can show."
            />
          </div>

          <div className="mt-6 flex justify-center md:hidden">
            <Link href="/salaries" className="text-sm font-bold text-emce-dark hover:underline">
              See full Compass →
            </Link>
          </div>
        </section>
      )}

      {/* ─── EV domains ─── */}
      <section className="container py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <Badge variant="default" className="mb-2">{t("domains.tag", locale)}</Badge>
            <h2 className="text-dashboard text-emce-text md:text-3xl">
              {t("domains.title", locale)}
            </h2>
          </div>
          <Link href="/jobs" className="hidden text-sm font-bold text-emce-dark hover:underline md:block">
            {t("domains.allCategories", locale)}
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {EV_DOMAINS.map((d) => (
            <Link key={d.slug} href={`/jobs?domain=${d.slug}`}>
              <Card className="h-full">
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-md bg-emce-light-soft text-2xl">
                  {d.emoji}
                </div>
                <div className="text-section text-emce-text">{d.name}</div>
                <div className="mt-1 text-hint text-emce-text-sec">{d.count}</div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── Two-column value prop ─── */}
      <section className="container grid gap-6 py-16 lg:grid-cols-2">
        <Card className="bg-gradient-to-br from-emce-light-soft to-white p-8">
          <Badge variant="success" className="mb-3">{t("value.candidates.tag", locale)}</Badge>
          <h3 className="text-section text-2xl text-emce-text">
            {t("value.candidates.title", locale)}
          </h3>
          <ul className="mt-4 space-y-2 text-body text-emce-text-sec">
            <li>✓ {t("value.candidates.bullet1", locale)}</li>
            <li>✓ {t("value.candidates.bullet2", locale)}</li>
            <li>✓ {t("value.candidates.bullet3", locale)}</li>
            <li>✓ {t("value.candidates.bullet4", locale)}</li>
          </ul>
          <Button asChild variant="default" className="mt-6">
            <Link href="/signup">{t("value.candidates.cta", locale)}</Link>
          </Button>
        </Card>

        <Card className="bg-emce-darkest p-8 text-white hover:shadow-emce-modal">
          <Badge variant="verified" className="mb-3">{t("value.employers.tag", locale)}</Badge>
          <h3 className="text-section text-2xl text-white">
            {t("value.employers.title", locale)}
          </h3>
          <ul className="mt-4 space-y-2 text-body text-white/85">
            <li>✓ {t("value.employers.bullet1", locale)}</li>
            <li>✓ {t("value.employers.bullet2", locale)}</li>
            <li>✓ {t("value.employers.bullet3", locale)}</li>
            <li>✓ {t("value.employers.bullet4", locale)}</li>
          </ul>
          <Button asChild variant="accent" className="mt-6">
            <Link href="/employer">{t("value.employers.cta", locale)}</Link>
          </Button>
        </Card>
      </section>

      {/* ─── DIYguru strip ─── */}
      <section className="border-y border-emce-border bg-emce-light-soft">
        <div className="container flex flex-col items-center gap-4 py-8 text-center md:flex-row md:justify-between md:text-left">
          <div className="flex items-center gap-3">
            <Badge variant="verified">⭐ {t("diyguru.verified", locale)}</Badge>
            <p className="text-sm text-emce-text">{t("diyguru.banner.tagline", locale)}</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/diyguru">{t("diyguru.banner.cta", locale)}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}

/**
 * One column of the home-page Salary Compass spotlight. Renders a
 * levels.fyi-style stack of role rows: title · top hiring company ·
 * 25-75 percentile band · sample-count chip. Engineers and technicians
 * each get their own column so the white-collar / blue-collar split
 * is unambiguous at a glance.
 */
function SalaryColumn({
  tone,
  title,
  subtitle,
  rows,
  emptyHint,
}: {
  tone: "engineer" | "technician";
  title: string;
  subtitle: string;
  rows: TopRoleByTier[];
  emptyHint: string;
}) {
  const headerBg = tone === "engineer" ? "bg-emce-darkest text-white" : "bg-emce-mid text-emce-darkest";
  return (
    <Card className="overflow-hidden p-0">
      <div className={`flex items-end justify-between px-5 py-4 ${headerBg}`}>
        <div>
          <div className="text-section font-extrabold">{title}</div>
          <div className="text-hint opacity-80">{subtitle}</div>
        </div>
        <Link
          href="/salaries"
          className="text-hint font-bold underline-offset-2 hover:underline"
        >
          See all →
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-emce-text-sec">
          {emptyHint}{" "}
          <Link href="/salaries/submit" className="font-bold text-emce-dark hover:underline">
            Submit yours →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-emce-border">
          {rows.map((row) => (
            <li
              key={row.jobTitle}
              className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 transition hover:bg-emce-light-soft/60"
            >
              <div className="min-w-0">
                <div className="line-clamp-1 text-sm font-bold text-emce-text">
                  {row.jobTitle}
                </div>
                {row.topCompanyName && (
                  <div className="line-clamp-1 text-hint text-emce-text-sec">
                    Top employer · {row.topCompanyName}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-base font-extrabold tabular-nums text-emce-darkest">
                  {formatLakhs(row.stat.medianLakhs)}
                </div>
                <div className="text-[11px] tabular-nums text-emce-text-muted">
                  {formatLakhs(row.stat.p25Lakhs)} – {formatLakhs(row.stat.p75Lakhs)} · n={row.stat.count}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
