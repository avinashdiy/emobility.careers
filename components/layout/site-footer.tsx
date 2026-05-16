import Link from "next/link";
import { auth } from "@/lib/auth";
import { CompactFooter } from "@/components/layout/compact-footer";
import { Logo } from "@/components/brand/Logo";

/**
 * Session-aware footer wrapper.
 *
 * Logged-out visitors on marketing pages (/, /jobs, /companies, /diyguru,
 * /about, …) get the full four-column marketing footer below — heavy on
 * positioning + benefits, intentional for SEO and conversion.
 *
 * Logged-in users get the compact, LinkedIn-style inline-link footer so
 * the bottom of every page reads as a slim navigation strip rather than
 * a marketing block. Profile pages opt out entirely (don't render the
 * footer at all — see app/[username]/page.tsx).
 */
export async function SiteFooter() {
  const session = await auth();
  if (session?.user) {
    return <CompactFooter />;
  }

  return (
    <footer className="mt-24 border-t border-emce-border bg-emce-darkest text-emce-light-soft">
      <div className="container grid gap-10 py-12 md:grid-cols-4">
        <div>
          {/* Logo PNG was designed for light backgrounds (dark teal type).
              The marketing footer is dark teal too, so we host it inside a
              white pill — same pattern LinkedIn uses on its dark promo
              surfaces. No separate light variant needed. */}
          <div className="inline-block rounded-md bg-white px-3 py-1.5">
            <Logo size="md" />
          </div>
          {/* Bumped from /70 → full opacity. Lighthouse flagged
              the half-faded variant for failing AA on the dark-teal
              footer surface; the full token (#eef2eb) hits ~12:1
              contrast against bg-emce-darkest. */}
          <p className="mt-3 text-sm text-emce-light-soft">
            India&apos;s specialised hiring platform for the electric mobility industry.
          </p>
        </div>
        <FooterCol
          title="Candidates"
          links={[
            { href: "/jobs", label: "Browse jobs" },
            { href: "/signup", label: "Create profile" },
            { href: "/me", label: "My applications" },
            { href: "/skills", label: "Verified skill badges" },
            { href: "/career-explorer", label: "EV Career Explorer" },
            { href: "/awards", label: "Best EV Employers" },
            { href: "/ai-tools", label: "AI tools" },
            { href: "/ai-tools/interview-prep", label: "Interview prep" },
            { href: "/ai-tools/mock-interview", label: "Mock interview" },
            { href: "/ai-tools/interview-simulator", label: "Interview simulator" },
            { href: "/ai-tools/cover-letter", label: "Cover letter generator" },
            { href: "/ai-tools/career-path", label: "Career path advisor" },
            { href: "/ai-tools/linkedin-optimizer", label: "LinkedIn optimizer" },
            { href: "/ai-tools/cv-evaluation", label: "Expert CV evaluation" },
            { href: "/ai-tools/resume-creator", label: "Resume creator" },
            { href: "/ai-tools/skills-analyzer", label: "Analyze EV skills" },
            { href: "/ai-tools/internship-navigator", label: "Internship navigator" },
            { href: "/roast", label: "Roast my resume" },
          ]}
        />
        <FooterCol
          title="Employers"
          links={[
            { href: "/employer", label: "Post a job" },
            { href: "/employer/candidates", label: "Search candidates" },
            { href: "/pricing", label: "Pricing" },
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            { href: "/about", label: "About" },
            { href: "/contact", label: "Contact" },
            { href: "/privacy", label: "Privacy" },
            { href: "/terms", label: "Terms" },
            { href: "/accessibility", label: "Accessibility" },
          ]}
        />
      </div>
      {/* Bumped from /50 → /80. At /50 the rendered color
          composited only ~4.1:1 against bg-emce-darkest (below the
          4.5:1 normal-text threshold). /80 lands at ~7.4:1 — still
          reads as "fine print" but clears WCAG AA. */}
      <div className="border-t border-white/10 py-5 text-center text-xs text-emce-light-soft/80">
        © {new Date().getFullYear()} eMobility Careers. Powered by DIYguru.
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
      {/* Heading level deliberately h2: footer columns are top-
          level navigation groups inside the <footer> landmark, peer
          to the page's section h2s. The previous <h4> skipped levels
          (no h3 on the page), failing Lighthouse's "heading-order"
          audit. Visual styling is unchanged — `text-sm` keeps the
          rendered size identical. */}
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-emce-mid">{title}</h2>
      <ul className="space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-emce-light-soft/80 hover:text-emce-light">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
