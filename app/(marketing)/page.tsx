import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import {
  getPulseCounters,
  getFeaturedCandidates,
  getTopHiringCompanies,
  getHottestSkills,
  getRecentHires,
} from "@/lib/pulse";
import {
  getTopPayingRolesByTier,
  formatLakhs,
  type TopRoleByTier,
} from "@/lib/salary-compass";
import { Avatar } from "@/components/ui/avatar";
import { FeaturedCompaniesGallery } from "@/components/marketing/FeaturedCompaniesGallery";
import { getFeaturedPartnersWithSlugs } from "@/lib/featured-companies";
import { getViewerCountry } from "@/lib/viewer-country";
import { pickHomeVariant, homeAlternates } from "@/lib/home-variants";

/**
 * Home page — framed as a daily snapshot of the EV industry rather
 * than a SaaS landing page. Every section is grounded in live data
 * (open roles, companies hiring, hot skills, recent hires, salary
 * medians, featured candidates) so a first-time visitor sees proof of
 * life, not marketing copy. The funnel still works — every lens
 * eventually leads to "post a job", "find a role", or "submit a
 * salary" — but the page reads first as a place worth being on.
 */

// Reverted from `revalidate = 300` back to `force-dynamic` after
// a privacy bug — ISR caches the FULL rendered HTML for N seconds,
// including the <SiteHeader /> which renders the signed-in user's
// avatar and persona switcher. With ISR enabled, the first
// visitor's session leaked into the cached HTML and every
// subsequent visit (within the 300 s window) rendered that
// stranger's identity on the page chrome. Same root cause as the
// Cloudflare cross-user cache hit we patched in middleware.ts —
// any auth-reading render needs to be per-request, not pre-baked.
//
// The Lighthouse perf budget that motivated the ISR switch was
// dominated by avatar weight + Google Translate JS, not the HTML
// TTFB. Both of those are now solved at the asset layer
// (sharp pipeline + Next/Image + lazy translate widget), so we
// can afford a fresh SSR on every homepage hit.
export const dynamic = "force-dynamic";

/**
 * Per-request metadata — varies by the visitor's resolved country so
 * the page title + meta description match the country variant shown
 * in the rendered body. hreflang `languages` alternates point at the
 * 5 canonical country pages (/in /au /ae /us /uk) for SEO; the
 * x-default points back at /.
 */
export async function generateMetadata(): Promise<Metadata> {
  const country = await getViewerCountry();
  const variant = pickHomeVariant(country);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://emobility.careers";
  return {
    title: variant.metaTitle,
    description: variant.metaDescription,
    alternates: {
      canonical: `${appUrl.replace(/\/$/, "")}/`,
      languages: homeAlternates(appUrl),
    },
    openGraph: {
      title: variant.hero.h1Lead.trim() + " " + variant.hero.h1Tail,
      description: variant.ogDescription,
      type: "website",
      siteName: "eMobility Careers",
    },
    twitter: {
      card: "summary_large_image",
      title: variant.hero.h1Lead.trim() + " " + variant.hero.h1Tail,
      description: variant.ogDescription,
    },
  };
}

const ACTION_PILLS: { href: string; emoji: string; label: string; tone: "primary" | "secondary" }[] = [
  { href: "/employer", emoji: "🎯", label: "I'm hiring", tone: "primary" },
  { href: "/jobs", emoji: "🔍", label: "I'm looking", tone: "primary" },
  { href: "/salaries", emoji: "💰", label: "Check a salary", tone: "secondary" },
  { href: "/pulse", emoji: "📊", label: "Read the pulse", tone: "secondary" },
  { href: "/roast", emoji: "🔥", label: "Roast my resume", tone: "secondary" },
  // Hub link — drives candidates to the full AI-tools shelf
  // (mock interview + simulator + roast + future tools). Lives at
  // the end of the row so the established primary CTAs stay in
  // the first-glance positions.
  { href: "/ai-tools", emoji: "🤖", label: "AI tools", tone: "secondary" },
];

// Hand-curated topic tiles — kept as a small browse-by-domain shelf.
// Counts are intentionally illustrative (live data sits up in the
// pulse and salary sections); these tiles are about discovery, not
// claim-making.
const EV_DOMAINS = [
  { slug: "battery-tech", name: "Battery", emoji: "🔋" },
  { slug: "charging-infra", name: "Charging", emoji: "⚡" },
  { slug: "powertrain", name: "Powertrain", emoji: "⚙️" },
  { slug: "motor-control", name: "Motor & Power", emoji: "🌀" },
  { slug: "vehicle-engineering", name: "Vehicle", emoji: "🚗" },
  { slug: "fleet-mobility", name: "Fleet", emoji: "🛵" },
  { slug: "software-iot", name: "Software & IoT", emoji: "💻" },
  { slug: "manufacturing", name: "Manufacturing", emoji: "🏭" },
];

/**
 * IST-formatted human date (e.g. "Wednesday, April 29, 2026") for the
 * masthead. Anchors the page in time — implicit signal that the page
 * is updated daily.
 */
function todayInIST(): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}

function relativeWhen(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function HomePage() {
  // Resolve country → variant first; everything downstream reads
  // strings from `variant.*`. Anonymous IN visitors get India copy,
  // AU visitors get Sydney/BYD copy, etc. Falls through to IN for
  // any country not in the 5-variant list.
  const country = await getViewerCountry();
  const variant = pickHomeVariant(country);

  const [
    locale,
    pulse,
    featured,
    engineerSalaries,
    technicianSalaries,
    hiringCompanies,
    hotSkills,
    recentHires,
    wallCompanies,
    featuredPartners,
  ] = await Promise.all([
    getLocale(),
    getPulseCounters(),
    getFeaturedCandidates(5),
    getTopPayingRolesByTier("ENGINEER", 5),
    getTopPayingRolesByTier("TECHNICIAN", 5),
    getTopHiringCompanies(5),
    getHottestSkills(8),
    getRecentHires(5),
    // Same shape as top-hiring; we pull a wider slice for the logo
    // wall so the "everyone is here" feel scales with the platform.
    getTopHiringCompanies(40),
    // Hand-curated partner-logo gallery (footer.html → emobility.careers
    // port). Returns the static FEATURED_PARTNERS list with each entry's
    // careers Company.slug filled in where a name match exists, so the
    // gallery's logos link to /company/[slug] when possible.
    getFeaturedPartnersWithSlugs(),
  ]);

  const dateStr = todayInIST();

  return (
    <>
      {/* ─── Hero — photo-led editorial (WhatsApp.com pattern) ───
          Full-width rounded image. On desktop: text overlays the LEFT
          third (over the dark reception area in the photo, where the
          gradient gives WCAG-AA contrast for white type), and two
          floating product-UI cards float on the RIGHT (mimicking
          WhatsApp's chat-bubble overlays, but using real platform
          features instead). On mobile: overlay collapses to a stack
          (image on top, copy below) — floating cards hide. Secondary
          actions (4 chips) sit BELOW the image card so the hero stays
          focused on the two primary intents (hiring vs. looking). */}
      <section className="bg-emce-light-bg">
        {/* Wider-than-container gutters so the rounded photo card
            reaches near-edge-to-edge (matches WhatsApp.com's hero
            ~40-60px-gutter feel). The standard `container` class
            caps at 1280 px which left awkward whitespace on
            ≥1440 px viewports; this scales the gutter with the
            viewport instead. */}
        <div className="px-3 py-6 sm:px-6 md:py-8 lg:px-12 xl:px-16">
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl shadow-emce-lg sm:aspect-[3/2] md:aspect-[2/1] lg:aspect-[5/2] xl:aspect-[16/6]">
            {/* Background photo. unoptimized because the Next/Image
                optimizer on this Hetzner deploy returns null for
                local fetches (see Phase 4 backlog). 1672x941 source.
                Aspect ratio scales by viewport: tallish on mobile so
                the copy block has room above the photo's bright
                centre, gradually flattening to ~16:6 on xl — matches
                whatsapp.com's near-cinema-bar hero feel. The Image
                uses fill+cover so the source gets cropped to fit the
                container shape rather than the container growing to
                fit the source. */}
            <Image
              src="/home/hero-interview.jpg"
              alt="A successful candidate shaking hands across a wooden table with a recruiter, after receiving an offer from emobility.careers — branded reception counter, brand notebook + mug on the table, modern open office in the background"
              fill
              priority
              unoptimized
              sizes="100vw"
              className="object-cover object-[center_35%]"
            />

            {/* Left-side dark gradient — strong on the reception side
                where the text sits, fading to transparent over the
                candidate's smile + handshake (so the photo's emotional
                centre stays visible). */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/10 md:from-black/75 md:via-black/35 md:to-transparent"
            />

            {/* Content overlay — flex column so the live-ticker chip
                pins top-left and the copy block pins mid-left. The
                copy `max-w-md/lg` keeps it from creeping into the
                photo's bright centre even on wide viewports. */}
            <div className="absolute inset-0 flex flex-col p-5 sm:p-8 md:p-12 lg:p-16">
              <Link
                href="/pulse"
                className="emce-pill self-start max-w-full transition hover:bg-white/15"
              >
                <span aria-hidden className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emce-mid opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emce-mid" />
                </span>
                <span className="min-w-0 truncate tabular-nums">
                  <strong>LIVE</strong>
                  <span className="hidden md:inline">
                    <span className="mx-2 opacity-50">·</span>
                    {dateStr}
                  </span>
                  {pulse.openJobs > 0 && (
                    <>
                      <span className="mx-2 opacity-50">·</span>
                      {pulse.openJobs.toLocaleString()} open roles
                    </>
                  )}
                  {pulse.jobsAddedToday > 0 && (
                    <span className="hidden md:inline">
                      <span className="mx-2 opacity-50">·</span>
                      {pulse.jobsAddedToday} added today
                    </span>
                  )}
                </span>
                <span aria-hidden className="shrink-0">→</span>
              </Link>

              <div className="mt-auto max-w-md md:max-w-lg lg:max-w-xl">
                <div className="animate-fade-up text-[11px] font-extrabold uppercase tracking-[0.2em] text-emce-mid">
                  {variant.hero.eyebrow}
                </div>
                <h1
                  className="animate-fade-up mt-3 text-3xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl"
                  style={{ animationDelay: "80ms" }}
                >
                  {variant.hero.h1Lead}
                  <span className="emce-text-gradient">{variant.hero.h1Tail}</span>
                </h1>
                <p
                  className="animate-fade-up mt-4 max-w-md text-sm text-white/90 sm:text-base md:text-lg"
                  style={{ animationDelay: "160ms" }}
                >
                  {variant.hero.subtitle}
                </p>
                <div
                  className="animate-fade-up mt-5 flex flex-wrap gap-3 md:mt-6"
                  style={{ animationDelay: "240ms" }}
                >
                  <Button asChild size="lg" variant="glow">
                    <Link href="/employer">🎯 I&apos;m hiring</Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-white/50 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 hover:text-white"
                  >
                    <Link href="/jobs">🔍 I&apos;m looking</Link>
                  </Button>
                </div>
              </div>
            </div>

            {/* Floating product-UI cards — only on lg+ to avoid
                cluttering the photo on mid screens. Two cards stacked
                in the upper-right quadrant of the image, mimicking
                WhatsApp's "French Class" + chat-bubble overlay
                pattern but using real platform UI elements (live
                pulse counter + a match-found notification). */}
            <div className="pointer-events-none absolute right-8 top-8 hidden w-72 flex-col gap-3 lg:flex">
              {/* Card 1 — Live pulse mini stat */}
              <div className="rounded-2xl bg-white p-4 shadow-2xl">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emce-mid opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emce-mid" />
                  </span>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emce-mid-deep">
                    Live now
                  </span>
                </div>
                <p className="mt-2 text-2xl font-extrabold tabular-nums text-emce-darkest">
                  {pulse.openJobs > 0 ? pulse.openJobs.toLocaleString() : "1,200+"}
                </p>
                <p className="text-hint text-emce-text-sec">
                  open EV roles today
                </p>
                {pulse.jobsAddedToday > 0 && (
                  <p className="mt-1 text-hint font-bold text-emce-mid-deep">
                    +{pulse.jobsAddedToday} added in the last 24h
                  </p>
                )}
              </div>

              {/* Card 2 — Match-found notification (sample UI shape;
                  APAC example so the regional positioning of the
                  hero matches the body of the page). */}
              <div className="ml-8 rounded-2xl bg-white p-4 shadow-2xl">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="text-base">🎯</span>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emce-mid-deep">
                    Match found
                  </span>
                </div>
                <p className="mt-2 text-sm font-bold text-emce-text">
                  {variant.matchCard.title}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-emce-light-soft">
                    <div className="h-full w-[92%] rounded-full bg-emce-mid" />
                  </div>
                  <span className="text-xs font-extrabold tabular-nums text-emce-mid-deep">
                    92%
                  </span>
                </div>
                <p className="mt-2 text-hint text-emce-text-sec">
                  {variant.matchCard.meta}
                </p>
              </div>
            </div>
          </div>

          {/* Secondary actions below the image card. The 4 non-primary
              ACTION_PILLS land here as small chips so candidates still
              have one-tap access to Salaries / Pulse / Roast / AI tools
              without the hero competing with itself for attention. */}
          <div className="mt-5 flex flex-wrap justify-center gap-2 md:mt-6">
            {ACTION_PILLS.filter((p) => p.tone === "secondary").map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="inline-flex items-center gap-1.5 rounded-full border border-emce-border bg-white px-4 py-2 text-sm font-bold text-emce-text transition hover:border-emce-mid hover:bg-emce-light-soft"
              >
                <span aria-hidden>{p.emoji}</span>
                {p.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Editorial intro — image-led "what this place is" panel.
          Sits right after the hero so the page reads as a story
          (hero is text, this is image), borrowing the WhatsApp.com
          alternating-image-and-copy rhythm. Reception photo speaks
          to "this is a real platform with a real presence in the EV
          industry" rather than another job-board landing page. */}
      <section className="container py-12 md:py-16">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="relative aspect-[16/9] overflow-hidden rounded-2xl shadow-emce-lg lg:order-1">
            <Image
              src="/home/office-reception.jpg"
              alt="The emobility.careers office reception — wordmark on a dark counter, latest-jobs board behind, green wall and meeting room beyond"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
              priority
              unoptimized
            />
          </div>
          <div className="lg:order-2">
            <Badge variant="default" className="mb-3">{variant.editorialIntro.badge}</Badge>
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-emce-text md:text-4xl lg:text-5xl">
              {variant.editorialIntro.h2}
            </h2>
            <p className="mt-4 text-base text-emce-text-sec md:text-lg">
              {variant.editorialIntro.body}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="default">
                <Link href="/jobs">Browse jobs →</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/about">How it works →</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Featured hiring partners — dark-section logo gallery ───
          Ported from the DIYguru footer's OEM-partners treatment.
          Sits ABOVE the live-data text wall below: this one is the
          eye-catcher with actual logos; the text wall is the
          accurate "who's hiring this week" companion. */}
      <FeaturedCompaniesGallery partners={featuredPartners} />

      {/* ─── Logo wall — typography-first, "everyone is here" ─── */}
      {wallCompanies.length > 0 && (
        <section className="border-y border-emce-border bg-white">
          <div className="container py-14">
            <div className="text-center">
              <Badge variant="default" className="mb-3">⚡ The roster</Badge>
              <h2 className="text-2xl font-extrabold tracking-tight text-emce-darkest md:text-3xl">
                {pulse.activeCompanies > 0
                  ? `${pulse.activeCompanies.toLocaleString()} EV companies hiring on emobility.careers`
                  : "Companies hiring on emobility.careers"}
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-emce-text-sec">
                {variant.logoWallBody}
              </p>
            </div>

            <ul className="mx-auto mt-8 grid max-w-5xl grid-cols-2 gap-x-6 gap-y-3 text-center sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {wallCompanies.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/company/${c.slug}`}
                    className="block truncate text-sm font-bold text-emce-darkest transition hover:text-emce-dark"
                    title={`${c.name} · ${c.openCount} open ${c.openCount === 1 ? "role" : "roles"}`}
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-8 text-center">
              <Link
                href="/companies"
                className="text-sm font-bold text-emce-dark hover:underline"
              >
                Browse all companies →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── Today's pulse — three-column live snapshot ─── */}
      <section className="container py-16">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="success" className="mb-2">📊 Today&apos;s pulse</Badge>
            <h2 className="text-dashboard text-emce-text md:text-3xl">
              What&apos;s hiring, what&apos;s hot, who just landed.
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-emce-text-sec">
              Real signal across the platform — companies hiring most this
              week, the skills employers are leaning on, and a stream of
              recent hires (anonymised by candidate request).
            </p>
          </div>
          <Link href="/pulse" className="shrink-0 text-sm font-bold text-emce-dark hover:underline">
            See full Pulse →
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Hiring this week */}
          <Card className="overflow-hidden p-0">
            <div className="border-b border-emce-border bg-emce-darkest px-5 py-4 text-white">
              <div className="text-section font-extrabold">🏢 Hiring this week</div>
              <div className="text-hint opacity-80">Open roles right now</div>
            </div>
            {hiringCompanies.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-emce-text-sec">
                No open roles yet — be the first to post.
              </div>
            ) : (
              <ul className="divide-y divide-emce-border">
                {hiringCompanies.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/company/${c.slug}`}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 transition hover:bg-emce-light-soft/60"
                    >
                      <div className="line-clamp-1 text-sm font-bold text-emce-text">
                        {c.name}
                      </div>
                      <div className="text-xs font-bold tabular-nums text-emce-dark">
                        {c.openCount} open
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Hot skills */}
          <Card className="overflow-hidden p-0">
            <div className="border-b border-emce-border bg-emce-mid px-5 py-4 text-emce-darkest">
              <div className="text-section font-extrabold">🔥 Hot skills</div>
              <div className="text-hint opacity-80">Most-requested in the last 30 days</div>
            </div>
            {hotSkills.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-emce-text-sec">
                Skill leaderboard fills up as roles are posted.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 p-5">
                {hotSkills.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/jobs?q=${encodeURIComponent(s.name)}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emce-border bg-white px-3 py-1 text-xs font-bold text-emce-text transition hover:border-emce-mid hover:bg-emce-light-soft"
                  >
                    <span>{s.name}</span>
                    <span className="tabular-nums text-emce-text-muted">
                      · {s.jobCount}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Recent hires — proof the loop closes */}
          <Card className="overflow-hidden p-0">
            <div className="border-b border-emce-border bg-emce-light-soft px-5 py-4 text-emce-darkest">
              <div className="text-section font-extrabold">✨ Recent hires</div>
              <div className="text-hint opacity-80">Loop closed</div>
            </div>
            {recentHires.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-emce-text-sec">
                The first hires through the platform will surface here.
              </div>
            ) : (
              <ul className="divide-y divide-emce-border">
                {recentHires.map((h, i) => (
                  <li key={i} className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emce-mid text-xs font-extrabold text-emce-darkest">
                        {h.initial}
                      </div>
                      <div className="min-w-0">
                        <div className="line-clamp-1 text-sm font-bold text-emce-text">
                          {h.jobTitle}{" "}
                          <span className="font-normal text-emce-text-sec">
                            at {h.companyName}
                          </span>
                        </div>
                        <div className="text-hint text-emce-text-muted">
                          {relativeWhen(h.whenMs)}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      {/* ─── Salary Compass spotlight (levels.fyi-style) ─── */}
      {(engineerSalaries.length > 0 || technicianSalaries.length > 0) && (
        <section className="container py-16">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge variant="default" className="mb-2">💰 Salary Compass · India</Badge>
              <h2 className="text-dashboard text-emce-text md:text-3xl">
                What India&apos;s EV pays · 2026 medians
              </h2>
              <p className="mt-1 max-w-xl text-sm text-emce-text-sec">
                Median CTC across verified, anonymous submissions —
                split into white-collar engineers and blue-collar
                technicians. Submit one to unlock the full database.
              </p>
            </div>
            <Link href="/salaries" className="shrink-0 text-sm font-bold text-emce-dark hover:underline">
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
        </section>
      )}

      {/* ─── Hybrid hiring spotlight — image-led, dark section to
          contrast with the white pulse/compass above. Cross-promotes
          the Recruitathon hybrid mode (Phase 1-3 build) without
          burying it under data-table noise. Image deliberately reversed
          (left on desktop) so the page's image rhythm alternates
          right → left → right between editorial sections. */}
      <section className="border-y border-emce-border bg-emce-darkest text-white">
        <div className="container py-16 md:py-20">
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="relative aspect-[16/9] overflow-hidden rounded-2xl shadow-2xl lg:order-2">
              <Image
                src="/home/office-video-calls.jpg"
                alt="emobility.careers office with simultaneous in-person and online interviews — a candidate on a laptop video call in the lounge, a recruiter on a wall-mounted video call in the meeting room"
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
                unoptimized
              />
            </div>
            <div className="lg:order-1">
              <div className="mb-3 inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-emce-mid">
                <span className="h-0.5 w-6 rounded-full bg-emce-mid" />
                Recruitathon · hybrid mode
              </div>
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight md:text-4xl lg:text-5xl">
                Hire from anywhere.<br className="hidden md:block" /> Interview from anywhere.
              </h2>
              <p className="mt-4 text-base text-white/80 md:text-lg">
                {variant.hybrid.example} Our hybrid event mode brings
                online and offline candidates into the same pipeline —
                mode-aware slot booking, one-click Join buttons,
                presence tracking, and post-event analytics split by
                attendance mode.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg" variant="accent">
                  <Link href="/fairs">See upcoming fairs →</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/40 bg-white/5 text-white hover:bg-white/15 hover:text-white"
                >
                  <Link href="/employer">Host one for your company →</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Featured This Week ─── */}
      {featured.length > 0 && (
        <section className="border-y border-emce-border bg-emce-light-soft/30">
          <div className="container py-16">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <Badge variant="success" className="mb-2">✨ Featured this week</Badge>
                <h2 className="text-dashboard text-emce-text md:text-3xl">
                  EV pros worth watching
                </h2>
                <p className="mt-1 text-sm text-emce-text-sec">
                  Editorial picks · open to work · DIYguru-verified bias.
                </p>
              </div>
              <Link href="/pulse" className="shrink-0 text-sm font-bold text-emce-dark hover:underline">
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
                  {/* `priority` for the first 4 above-the-fold cards
                      so the LCP avatar disc isn't lazy-loaded.
                      Beyond the fold we let Next/Image's default
                      lazy load kick in. */}
                  <Avatar
                    src={c.profilePhotoUrl}
                    name={c.name}
                    size="lg"
                    priority={featured.indexOf(c) < 4}
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
          </div>
        </section>
      )}

      {/* ─── Job-fair editorial — image-led "in-person hiring at scale"
          panel. Image LEFT this time so the page's editorial rhythm
          stays right → left → right alternating, and the right-side
          copy can lead into the Recruitathon CTA naturally. */}
      <section className="container py-12 md:py-16">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="relative aspect-[16/9] overflow-hidden rounded-2xl shadow-emce-lg">
            <Image
              src="/home/job-fair.jpg"
              alt="A packed emobility.careers Recruitathon job fair — recruiters and candidates in conversation, branded booth with the 'Drive the future. Build your career.' tagline, an EV charging on the show floor"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
              unoptimized
            />
          </div>
          <div>
            <Badge variant="success" className="mb-3">{variant.jobFair.badge}</Badge>
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-emce-text md:text-4xl lg:text-5xl">
              Where careers happen, in person.
            </h2>
            <p className="mt-4 text-base text-emce-text-sec md:text-lg">
              {variant.jobFair.body}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="default">
                <Link href="/fairs">Browse upcoming fairs →</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/colleges/register">TPO? Bring your cohort →</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Browse by topic ─── */}
      <section className="container py-16">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="default" className="mb-2">{t("domains.tag", locale)}</Badge>
            <h2 className="text-dashboard text-emce-text md:text-3xl">
              Browse by topic
            </h2>
            <p className="mt-1 text-sm text-emce-text-sec">
              Eight slices that cover the full EV stack. Each opens a
              filtered view of jobs, companies and verified people.
            </p>
          </div>
          <Link href="/jobs" className="shrink-0 text-sm font-bold text-emce-dark hover:underline">
            {t("domains.allCategories", locale)}
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {EV_DOMAINS.map((d) => (
            <Link key={d.slug} href={`/jobs?domain=${d.slug}`}>
              <Card className="h-full transition hover:border-emce-mid hover:shadow-emce-hover">
                <div className="mb-3 grid h-10 w-10 place-items-center rounded-md bg-emce-light-soft text-xl">
                  {d.emoji}
                </div>
                <div className="text-section text-emce-text">{d.name}</div>
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
          {/* Bright emerald pill with dark text — `verified` variant
              renders a pale yellow that disappears against the
              dark-green card here. Explicit colour override matches
              the brand palette and gives proper WCAG contrast on
              the dark surface. */}
          <Badge
            variant="default"
            className="mb-3 border-transparent bg-emce-mid text-emce-darkest"
          >
            {t("value.employers.tag", locale)}
          </Badge>
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

      {/* ─── Final CTA strip ─── */}
      <section className="border-y border-emce-border bg-emce-darkest text-white">
        <div className="container py-12 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
            {variant.finalCta.h2}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-white/75">
            {variant.finalCta.subtitle}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="accent">
              <Link href="/signup">Join free</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/40 bg-white/5 text-white hover:bg-white/15 hover:text-white">
              <Link href="/employer">Post a role</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/40 bg-white/5 text-white hover:bg-white/15 hover:text-white">
              <Link href="/digest">📱 WhatsApp digest</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── DIYguru strip ─── */}
      <section className="border-b border-emce-border bg-emce-light-soft">
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
