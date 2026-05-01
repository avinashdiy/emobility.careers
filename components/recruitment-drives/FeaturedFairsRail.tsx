import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Server component that renders the "Featured fairs" rail used
 * on /pulse and the homepage. Self-contained query — caller just
 * drops `<FeaturedFairsRail />` and gets a styled section.
 *
 * Returns null when there's nothing to show (no featured fairs in
 * OPEN/IN_PROGRESS), so the caller's layout doesn't get a blank
 * card. The /pulse "Live numbers" section already keeps the page
 * looking alive without a stub here.
 *
 * Cap of 4 fairs — beyond that the rail wraps awkwardly on tablet
 * widths and dilutes the "featured" signal. If we ever have 5+
 * concurrent featured fairs, swap to a horizontal-scroll snap rail
 * (one good follow-up; not needed for v1).
 */
export async function FeaturedFairsRail() {
  const drives = await db.recruitmentDrive.findMany({
    where: {
      featuredAt: { not: null },
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
    orderBy: [{ featuredAt: "desc" }, { startsAt: "asc" }],
    take: 4,
    select: {
      id: true,
      slug: true,
      title: true,
      tagline: true,
      bannerImageUrl: true,
      city: true,
      startsAt: true,
      endsAt: true,
      status: true,
      participatingCount: true,
      jobsCount: true,
    },
  });

  if (drives.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Featured
          </p>
          <h2 className="text-section text-emce-text">EV recruitment drives</h2>
        </div>
        <Link
          href="/fairs"
          className="text-hint font-bold text-emce-dark hover:underline"
        >
          All fairs →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {drives.map((d) => (
          <Link key={d.id} href={`/fairs/${d.slug}`} className="block">
            <Card className="h-full overflow-hidden p-0 transition hover:border-emce-mid hover:shadow-emce-hover">
              {d.bannerImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={d.bannerImageUrl}
                  alt=""
                  className="aspect-[3/1] w-full object-cover"
                />
              ) : (
                <div className="emce-hero-gradient aspect-[3/1]" />
              )}
              <div className="p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  {d.status === "IN_PROGRESS" ? (
                    <Badge variant="warning" size="sm">🔴 Live now</Badge>
                  ) : (
                    <Badge variant="default" size="sm">Upcoming</Badge>
                  )}
                  <span className="text-hint text-emce-text-muted">📍 {d.city}</span>
                </div>
                <h3 className="mt-2 font-bold text-emce-text line-clamp-1">{d.title}</h3>
                {d.tagline && (
                  <p className="text-hint text-emce-text-sec line-clamp-2">{d.tagline}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-3 text-hint text-emce-text-sec">
                  <span>📅 {formatShortDateRange(d.startsAt, d.endsAt)}</span>
                  <span>🏢 {d.participatingCount} {d.participatingCount === 1 ? "company" : "companies"}</span>
                  <span>💼 {d.jobsCount}</span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

function formatShortDateRange(start: Date, end: Date): string {
  const s = start.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  if (start.toDateString() === end.toDateString()) return s;
  const e = end.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  return `${s}–${e}`;
}
