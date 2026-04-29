import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

const EV_DOMAINS = [
  { slug: "battery-tech", name: "Battery Tech", emoji: "🔋", count: "120+ jobs" },
  { slug: "charging-infra", name: "Charging Infra", emoji: "⚡", count: "85+ jobs" },
  { slug: "powertrain", name: "Powertrain", emoji: "⚙️", count: "70+ jobs" },
  { slug: "motor-control", name: "Motor & Control", emoji: "🌀", count: "60+ jobs" },
  { slug: "vehicle-engineering", name: "Vehicle Engineering", emoji: "🚗", count: "95+ jobs" },
  { slug: "fleet-mobility", name: "Fleet & Mobility", emoji: "🛵", count: "40+ jobs" },
];

export default async function HomePage() {
  const locale = await getLocale();
  const STATS = [
    { value: "12,500+", label: t("stats.activeCandidates", locale) },
    { value: "650+", label: t("stats.companies", locale) },
    { value: "3,800+", label: t("stats.openRoles", locale) },
    { value: "DIYguru", label: t("stats.diyguru", locale) },
  ];
  return (
    <>
      {/* ─── Hero ─── */}
      <section className="emce-hero-gradient text-white">
        <div className="container py-20 md:py-24">
          <div className="emce-pill mb-6">
            <span>⚡</span>
            {t("hero.pill", locale)}
          </div>
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
