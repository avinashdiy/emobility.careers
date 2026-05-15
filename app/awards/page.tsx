import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Best EV Employers in India",
  description:
    "Annual ranking of the best EV-industry employers in India — computed from anonymous employee reviews on emobility.careers. Battery, charging, motors, software.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/awards` },
};

const CATEGORY_LABELS: Record<string, string> = {
  BEST_OVERALL: "Best Overall",
  BEST_FOR_BATTERY_ROLES: "Best for Battery Roles",
  BEST_FOR_CHARGING_ROLES: "Best for Charging Roles",
  BEST_FOR_MOTOR_ROLES: "Best for Motor Roles",
  BEST_FOR_SOFTWARE_ROLES: "Best for Software Roles",
  BEST_FOR_FRESHERS: "Best for Freshers",
  BEST_REMOTE_CULTURE: "Best Remote Culture",
  FASTEST_RESPONDER: "Fastest Responder",
  MOST_LOVED_BY_DIYGURU: "DIYguru Favourites",
};

export const dynamic = "force-dynamic";

export default async function AwardsPage() {
  const year = new Date().getFullYear();
  const awards = await db.employerAward.findMany({
    where: { year },
    orderBy: [{ category: "asc" }, { rank: "asc" }],
    include: {
      company: { select: { slug: true, name: true, logoUrl: true } },
    },
  });

  const grouped = new Map<string, typeof awards>();
  for (const a of awards) {
    const arr = grouped.get(a.category) ?? [];
    arr.push(a);
    grouped.set(a.category, arr);
  }

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <section className="emce-mesh-hero relative text-white">
          <span
            aria-hidden
            className="pointer-events-none absolute -left-10 top-10 hidden h-56 w-56 rounded-full bg-emce-mid/30 blur-3xl animate-float md:block"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 bottom-4 hidden h-60 w-60 rounded-full bg-emce-light/20 blur-3xl animate-float md:block"
            style={{ animationDelay: "1.8s" }}
          />
          <div
            aria-hidden
            className="emce-dot-grid pointer-events-none absolute inset-0 opacity-25"
          />
          <div className="container relative max-w-5xl py-14 md:py-20">
            <div className="emce-pill mb-3 animate-fade-up">
              <span aria-hidden>🏆</span>
              <span>Best EV Employers {year}</span>
            </div>
            <h1
              className="animate-fade-up text-3xl font-extrabold leading-tight tracking-tight md:text-5xl"
              style={{ animationDelay: "80ms" }}
            >
              The companies{" "}
              <span className="emce-text-gradient">India&apos;s EV talent loves.</span>
            </h1>
            <p
              className="animate-fade-up mt-4 max-w-2xl text-white/85 md:text-lg"
              style={{ animationDelay: "160ms" }}
            >
              Computed from anonymous reviews submitted by current + past
              employees on emobility.careers. Minimum {5} reviews per category
              to qualify; ranked by average overall rating.
            </p>
          </div>
        </section>

        <div className="container max-w-5xl space-y-10 py-10">
          {awards.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-section text-emce-text">Rankings publishing soon</p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Once enough reviews land in each category, the {year} rankings will appear here.
              </p>
              <Button asChild className="mt-4">
                <Link href="/companies">Review a company →</Link>
              </Button>
            </Card>
          ) : (
            Array.from(grouped.entries()).map(([cat, items]) => (
              <section key={cat}>
                <h2 className="text-section text-emce-text">
                  {CATEGORY_LABELS[cat] ?? cat}
                </h2>
                <ol className="emce-stagger mt-3 grid gap-3 sm:grid-cols-2">
                  {items.map((a) => (
                    <li key={a.id}>
                      <Card variant={a.rank === 1 ? "glow" : "interactive"} className="h-full">
                        <Link href={`/company/${a.company.slug}`} className="block">
                          <div className="flex items-center gap-3">
                            <span
                              className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-full text-lg font-extrabold tabular-nums ${
                                a.rank === 1 ? "bg-emce-verified-bg text-emce-verified-text"
                                : a.rank <= 3 ? "bg-emce-light-soft text-emce-dark"
                                : "bg-white text-emce-text-sec"
                              }`}
                            >
                              #{a.rank}
                            </span>
                            <Avatar src={a.company.logoUrl} name={a.company.name} size="md" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-section text-emce-text">{a.company.name}</p>
                              {a.rank === 1 && (
                                <Badge variant="glow" className="mt-1">🏆 #1 · {year}</Badge>
                              )}
                            </div>
                          </div>
                        </Link>
                      </Card>
                    </li>
                  ))}
                </ol>
              </section>
            ))
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
