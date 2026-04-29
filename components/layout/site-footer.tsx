import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-emce-border bg-emce-darkest text-emce-light-soft">
      <div className="container grid gap-10 py-12 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-emce-mid font-extrabold text-emce-darkest">
              eM
            </span>
            <span className="text-base font-extrabold">
              eMobility<span className="text-emce-mid">.careers</span>
            </span>
          </div>
          <p className="mt-3 text-sm text-emce-light-soft/70">
            India&apos;s specialised hiring platform for the electric mobility industry.
          </p>
        </div>
        <FooterCol
          title="Candidates"
          links={[
            { href: "/jobs", label: "Browse jobs" },
            { href: "/signup", label: "Create profile" },
            { href: "/me", label: "My applications" },
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
          ]}
        />
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-emce-light-soft/50">
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
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-emce-mid">{title}</h4>
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
