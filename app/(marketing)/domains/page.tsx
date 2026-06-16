import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Card } from "@/components/ui/card";

/**
 * /domains — browse hub for every EV engineering domain. Pure SEO
 * scaffold: it gives Google a single crawlable page that links to all
 * the /jobs/[domain] facet pages (battery, charging, motors, …), so
 * the long-tail domain pages get discovered + internal-link equity.
 * Targets "EV engineering domains", "EV job categories" and funnels
 * to each domain's high-intent listing.
 */
export const metadata: Metadata = {
  title: "EV job categories — battery, charging, motors, software & more",
  description:
    "Browse EV-industry jobs by domain: battery tech, charging infrastructure, powertrain, motor & power electronics, vehicle engineering, software, manufacturing and fleet. Open roles in each, updated daily.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/domains` },
};

export default async function DomainsHubPage() {
  const [domains, counts] = await Promise.all([
    db.eVDomain.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      select: { slug: true, name: true, description: true },
    }),
    db.jobEVDomain.groupBy({
      by: ["evDomainId"],
      where: { job: { status: "OPEN", company: { verificationStatus: { not: "REJECTED" } } } },
      _count: { _all: true },
    }),
  ]);
  // groupBy keys by evDomainId; map back to slug via a second tiny lookup.
  const idToSlug = new Map(
    (await db.eVDomain.findMany({ select: { id: true, slug: true } })).map((d) => [d.id, d.slug]),
  );
  const countBySlug = new Map<string, number>();
  for (const c of counts) {
    const slug = idToSlug.get(c.evDomainId);
    if (slug) countBySlug.set(slug, c._count._all);
  }

  return (
    <div className="container max-w-4xl py-8 md:py-12">
      <h1 className="text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
        EV jobs by domain
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-emce-text-sec md:text-base">
        Every corner of the electric-mobility stack is hiring. Pick a
        domain to see open roles, or browse the{" "}
        <Link href="/jobs" className="font-bold text-emce-dark hover:underline">
          full job board
        </Link>
        .
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {domains.map((d) => {
          const n = countBySlug.get(d.slug) ?? 0;
          return (
            <Link key={d.slug} href={`/jobs/${d.slug}`} className="block">
              <Card className="h-full p-5 transition hover:border-emce-mid hover:shadow-emce-hover">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-section text-emce-text">{d.name}</h2>
                  <span className="shrink-0 rounded-full bg-emce-light-soft px-2.5 py-0.5 text-xs font-extrabold text-emce-dark">
                    {n} open
                  </span>
                </div>
                {d.description && (
                  <p className="mt-2 text-sm text-emce-text-sec">{d.description}</p>
                )}
                <span className="mt-3 inline-block text-sm font-bold text-emce-dark">
                  View {d.name.toLowerCase()} jobs →
                </span>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
