import Link from "next/link";
import { auth } from "@/lib/auth";
import { CompactFooter } from "@/components/layout/compact-footer";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { getLocale } from "@/lib/i18n-server";

/**
 * Session-aware footer wrapper.
 *
 * Logged-out visitors on marketing pages (/, /jobs, /companies, /diyguru,
 * /about, …) get the full marketing footer below — heavy on positioning +
 * benefits, intentional for SEO and conversion.
 *
 * Logged-in users get the compact, LinkedIn-style inline-link footer so
 * the bottom of every page reads as a slim navigation strip rather than
 * a marketing block. Profile pages opt out entirely (don't render the
 * footer at all — see app/[username]/page.tsx).
 *
 * Layout follows whatsapp.com's footer pattern:
 *
 *   [logo + brand panel  | What we do | Who we are | Use the platform | Need help? ]
 *   ─────────────────────────────────────────────────────────────────
 *   © + powered-by  ·  Terms · Privacy · Sitemap  ·  socials  ·  language
 *
 * The brand panel is wider than each nav column so the international
 * value-prop has room to breathe (tagline + description + 8-country
 * flag row + scale stats). Bottom bar is a horizontal rule + a centred-
 * on-mobile / spread-on-desktop legal + social + language strip.
 */
export async function SiteFooter() {
  // Resolve session + locale in parallel — the marketing footer
  // shows the active language in its bottom-right pill (read by the
  // <LanguageSwitcher> client component below). Anonymous visitors
  // default to "en" via getLocale's fallback.
  const [session, locale] = await Promise.all([auth(), getLocale()]);
  if (session?.user) {
    return <CompactFooter />;
  }

  return (
    <footer className="mt-24 border-t border-emce-border bg-emce-darkest text-emce-light-soft">
      <div className="container py-12 md:py-16">
        {/* 5-column grid on lg+: brand-panel + 4 nav columns. Uses
            an arbitrary CSS-Grid template `2fr 1fr 1fr 1fr 1fr` so
            the brand panel gets ~28% width (room for the value-prop
            block) and each nav column gets ~14.5%. Previous version
            used `lg:grid-cols-12` without col-span on the nav cols,
            which squashed each FooterCol to 1/12 (8% width) and
            wrapped even "Browse jobs" to two lines. Stacks to 1
            column on mobile, 2 cols on sm. */}
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:[grid-template-columns:2fr_1fr_1fr_1fr_1fr] lg:gap-x-8">
          {/* Brand panel — first cell of the arbitrary template (2fr
              ≈ 28% of the row width). No col-span needed since the
              template explicitly sizes each column. */}
          <div>
            {/* Logo PNG was designed for light backgrounds (dark teal
                type). The marketing footer is dark teal too, so we
                host it inside a white pill. */}
            <div className="inline-block rounded-md bg-white px-3 py-1.5">
              <Logo size="md" />
            </div>
            <p className="mt-5 text-base font-extrabold leading-snug text-emce-light md:text-lg">
              Where the EV industry hires, gets hired.
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-emce-light-soft">
              The specialised hiring platform for battery, charging,
              motors, vehicles and software careers — built for the
              global electric mobility industry. Verified profiles,
              AI matching, salary intelligence, and hybrid recruitathons
              in one place.
            </p>

            {/* International footprint — flag-emoji row signals reach
                at a glance. Renders via system colour-emoji on every
                modern OS; no SVG sprites. */}
            <p className="mt-6 text-[10px] font-extrabold uppercase tracking-[0.18em] text-emce-mid">
              Live in 8 countries
            </p>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-emce-light-soft/85">
              🇮🇳 India · 🇬🇧 UK · 🇺🇸 US · 🇦🇪 UAE · 🇦🇺 Australia · 🇲🇾 Malaysia · 🇧🇩 Bangladesh · 🇳🇵 Nepal
            </p>
            <p className="mt-3 text-xs leading-relaxed text-emce-light-soft/70">
              50,000+ EV professionals · 1,200+ companies · daily updates
            </p>

            {/* Primary CTA — mirrors whatsapp.com's Download button
                under the logo. For us this is the universal "sign up"
                door (employers + candidates share /signup). */}
            <Link
              href="/signup"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-emce-mid px-5 py-2.5 text-sm font-extrabold text-emce-darkest transition hover:bg-emce-light"
            >
              Join free
              <span aria-hidden>→</span>
            </Link>
          </div>

          {/* Candidates — top picks only. The 14 individual AI-tool
              links from the previous version are collapsed under one
              "AI tools" link that points to the full /ai-tools shelf;
              keeping each AI tool as its own footer link bloated the
              column to 18 items, breaking the layout's WhatsApp-style
              minimalism. */}
          <FooterCol
            title="Candidates"
            links={[
              { href: "/jobs", label: "Browse jobs" },
              { href: "/domains", label: "Jobs by domain" },
              { href: "/internships", label: "EV internships" },
              { href: "/signup", label: "Create profile" },
              { href: "/me/applications", label: "My applications" },
              { href: "/skills", label: "Verified skill badges" },
              { href: "/ai-tools", label: "AI tools" },
              { href: "/career-explorer", label: "EV Career Explorer" },
            ]}
          />

          {/* Employers — keep tight. The Recruitathon entry is new,
              tied to the Phase 1-3 hybrid mode work. */}
          <FooterCol
            title="Employers"
            links={[
              { href: "/employer", label: "Post a job" },
              { href: "/employer/candidates", label: "Search candidates" },
              { href: "/fairs", label: "Run a Recruitathon" },
              { href: "/awards", label: "Best EV Employers" },
              { href: "/pricing", label: "Pricing" },
            ]}
          />

          {/* Explore — new column scoping the data + community surfaces
              (Salaries, Pulse, Industry insights). Previously these
              lived nowhere reachable from the footer. */}
          <FooterCol
            title="Explore"
            links={[
              { href: "/salaries", label: "Salary Compass" },
              { href: "/pulse", label: "Daily Pulse" },
              { href: "/articles", label: "Industry insights" },
              { href: "/people", label: "EV professionals" },
              { href: "/companies", label: "All companies" },
              { href: "/institutions", label: "Colleges + ITIs" },
            ]}
          />

          {/* Company + Help merged into one column. WhatsApp keeps
              Help separate ("Need help?"); for us the link count
              doesn't justify two columns, and the help touchpoints
              are integral to the company panel anyway. */}
          <FooterCol
            title="Company"
            links={[
              { href: "/about", label: "About" },
              { href: "/contact", label: "Contact" },
              { href: "/grievance", label: "Grievance officer" },
              { href: "/privacy", label: "Privacy" },
              { href: "/terms", label: "Terms" },
              { href: "/accessibility", label: "Accessibility" },
            ]}
          />
        </div>

        {/* Bottom bar — horizontal rule, then a single row with
            copyright on the left, legal/sitemap links centred (or
            adjacent on lg+), social icons + language switcher on
            the right. Stacks vertically on mobile, spreads on lg+. */}
        <div className="mt-12 border-t border-white/10 pt-6">
          <div className="flex flex-col items-center gap-4 text-xs text-emce-light-soft/80 lg:flex-row lg:justify-between">
            <p>
              © {new Date().getFullYear()} eMobility Careers · Powered by{" "}
              <a
                href="https://diyguru.org"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-emce-light hover:underline"
              >
                DIYguru
              </a>
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 lg:gap-6">
              <Link href="/terms" className="hover:text-emce-light">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-emce-light">
                Privacy
              </Link>
              <Link href="/cookies" className="hover:text-emce-light">
                Cookies
              </Link>
              <Link href="/sitemap.xml" className="hover:text-emce-light">
                Sitemap
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <SocialIcons />
              {/* Language switcher — wired to the same emce_locale cookie
                  the rest of the app uses. Pill display mode adds the
                  active locale's display name next to the globe icon so
                  the footer chrome stays readable; clicking opens the
                  native <select> picker with all 10 locales (EN, HI,
                  TA, TE, MR, DE, AR, ZH, FR, JA). Selecting one writes
                  the cookie, kicks the Google Translate widget, and
                  reloads. */}
              <LanguageSwitcher current={locale} variant="dark" displayMode="pill" />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      {/* Heading level deliberately h2: footer columns are top-level
          navigation groups inside the <footer> landmark, peer to the
          page's section h2s. Visual styling is unchanged — `text-xs`
          + tracked uppercase + green accent matches whatsapp.com's
          column-heading rhythm. */}
      <h2 className="mb-4 text-xs font-extrabold uppercase tracking-[0.12em] text-emce-mid">
        {title}
      </h2>
      <ul className="space-y-2.5 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="whitespace-nowrap text-emce-light-soft/85 transition hover:text-emce-light"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Compact social-icon row, brand-coloured X / LinkedIn / YouTube /
 * Instagram. Mirrors the icon row in whatsapp.com's bottom bar.
 * Hrefs are placeholders until the marketing team confirms the
 * canonical accounts — `noopener noreferrer` everywhere because
 * external.
 */
function SocialIcons() {
  const ICONS = [
    {
      label: "LinkedIn",
      href: "https://www.linkedin.com/company/emobility-careers",
      svg: (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="currentColor"
        >
          <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zm-1.78 13.02h3.56V9H3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.99 0 1.78-.77 1.78-1.72V1.72C24 .77 23.21 0 22.22 0z" />
        </svg>
      ),
    },
    {
      label: "X",
      href: "https://x.com/emobilitycareer",
      svg: (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="currentColor"
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    },
    {
      label: "YouTube",
      href: "https://www.youtube.com/@emobilitycareers",
      svg: (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="currentColor"
        >
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      ),
    },
    {
      label: "Instagram",
      href: "https://www.instagram.com/emobilitycareers",
      svg: (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="currentColor"
        >
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex items-center gap-2">
      {ICONS.map((i) => (
        <a
          key={i.label}
          href={i.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={i.label}
          className="grid h-7 w-7 place-items-center rounded-full border border-white/20 text-emce-light-soft transition hover:border-emce-mid hover:text-emce-light"
        >
          {i.svg}
        </a>
      ))}
    </div>
  );
}
