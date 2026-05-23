import Link from "next/link";
import type { FeaturedPartner } from "@/lib/featured-companies";

/**
 * Dark-section logo gallery rendered on the homepage.
 *
 * Visual treatment ported from the DIYguru footer "OEM Partners"
 * section (saved at footer.html for reference), reskinned in careers'
 * Tailwind tokens — dark green panel (`bg-emce-darkest`), white-tinted
 * tiles, emerald accent (`text-emce-mid`). Each tile is a link to the
 * company's careers profile when a matching `Company` row exists in
 * the DB; tiles without a match still render (so the visual stays
 * dense) but are non-interactive.
 *
 * Renders nothing when `partners` is empty, so the page flows on past
 * if the upstream query failed.
 *
 * Note: <img> is used (not Next/Image) because the logo URLs hotlink
 * `diyguru.org` and would need a `remotePatterns` entry in
 * next.config.* to go through the Next image optimiser. Trade speed-to-
 * ship for the optimiser pass; the assets are small PNGs and we set
 * `loading="lazy"` so off-fold cards don't block first paint.
 */
export function FeaturedCompaniesGallery({
  partners,
}: {
  partners: FeaturedPartner[];
}) {
  if (partners.length === 0) return null;

  return (
    <section className="border-y border-emce-border bg-emce-darkest text-white">
      <div className="container py-16">
        <div className="mb-10 text-center">
          <div
            className="mb-3 inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-emce-mid"
            aria-hidden
          >
            <span className="h-0.5 w-6 rounded-full bg-emce-mid" />
            Hiring partners
            <span className="h-0.5 w-6 rounded-full bg-emce-mid" />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
            EV companies hiring on emobility.careers
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-white/70">
            From global OEMs and Tier-1 suppliers to EV startups,
            charging networks, and battery makers. Click any logo to
            see open roles + the company page.
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {partners.map((p) => (
            <li key={p.name}>
              {p.slug ? (
                <Link
                  href={`/company/${p.slug}`}
                  className="group grid h-20 place-items-center rounded-xl border border-white/[0.12] bg-white/[0.07] p-3 transition hover:-translate-y-0.5 hover:border-emce-mid hover:bg-white/[0.12]"
                  title={`See open roles at ${p.name}`}
                >
                  <img
                    src={p.logoUrl}
                    alt={p.name}
                    loading="lazy"
                    className="h-auto max-h-10 w-auto max-w-[110px] object-contain opacity-90 transition group-hover:scale-105 group-hover:opacity-100"
                  />
                </Link>
              ) : (
                <div
                  className="grid h-20 place-items-center rounded-xl border border-white/[0.12] bg-white/[0.07] p-3"
                  title={p.name}
                >
                  <img
                    src={p.logoUrl}
                    alt={p.name}
                    loading="lazy"
                    className="h-auto max-h-10 w-auto max-w-[110px] object-contain opacity-75"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>

        <p className="mt-8 text-center text-xs text-white/60">
          Showing{" "}
          <strong className="text-emce-mid">{partners.length}</strong>{" "}
          hiring partners ·{" "}
          <Link
            href="/companies"
            className="font-bold text-white/80 underline-offset-2 hover:text-white hover:underline"
          >
            Browse all companies →
          </Link>
        </p>
      </div>
    </section>
  );
}
