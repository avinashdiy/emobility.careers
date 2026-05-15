import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { EmptyState } from "@/components/ui/empty-state";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "EV recruitment drives & job fairs",
  description:
    "Upcoming and ongoing EV-industry job fairs and recruitment drives across India. Meet hiring companies, apply on the spot, get shortlisted via on-site challenges.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/fairs` },
  openGraph: {
    type: "website",
    url: `${env.NEXT_PUBLIC_APP_URL}/fairs`,
    title: "EV job fairs · eMobility Careers",
    description:
      "Multi-company EV recruitment drives. Free for candidates, free for participating colleges.",
  },
};

/**
 * Public list of recruitment drives — landing page for the
 * "discover EV job fairs" surface. Three sections:
 *
 *   1. Live now (status = IN_PROGRESS) — biggest visual emphasis,
 *      orange "Live" badge, 1–N cards.
 *   2. Upcoming (status = OPEN, startsAt in the future)
 *   3. Recently closed (CLOSED, ended in last 30d) — collapsed
 *      so the page still feels alive between fairs but doesn't
 *      mislead candidates into clicking dead events.
 *
 * No personalisation in v1 — same page for every visitor. A "near
 * me" filter and a /fairs/[city] route are obvious follow-ups
 * once we have more than a handful of fairs.
 */
export default async function FairsListPage() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const drives = await db.recruitmentDrive.findMany({
    where: {
      OR: [
        { status: { in: ["OPEN", "IN_PROGRESS"] } },
        { status: "CLOSED", endsAt: { gte: thirtyDaysAgo } },
      ],
    },
    orderBy: [
      // Live now first, then upcoming by date, then closed.
      { status: "asc" },
      { startsAt: "asc" },
    ],
    select: {
      id: true,
      slug: true,
      title: true,
      tagline: true,
      bannerImageUrl: true,
      city: true,
      state: true,
      startsAt: true,
      endsAt: true,
      status: true,
      participatingCount: true,
      jobsCount: true,
    },
  });

  const live = drives.filter((d) => d.status === "IN_PROGRESS");
  const upcoming = drives.filter(
    (d) => d.status === "OPEN" && d.startsAt >= now,
  );
  const ongoingOpen = drives.filter(
    (d) => d.status === "OPEN" && d.startsAt < now && d.endsAt >= now,
  );
  const closed = drives.filter((d) => d.status === "CLOSED");

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
            className="pointer-events-none absolute -right-8 bottom-4 hidden h-64 w-64 rounded-full bg-emce-light/20 blur-3xl animate-float md:block"
            style={{ animationDelay: "1.6s" }}
          />
          <div
            aria-hidden
            className="emce-dot-grid pointer-events-none absolute inset-0 opacity-25"
          />
          <div className="container relative max-w-5xl py-10 md:py-14">
            <div className="emce-pill mb-3 animate-fade-up">
              <span aria-hidden>📍</span>
              <span>Recruitment drives · EV industry</span>
            </div>
            <h1
              className="animate-fade-up text-2xl font-extrabold leading-tight tracking-tight md:text-4xl"
              style={{ animationDelay: "80ms" }}
            >
              Where the <span className="emce-text-gradient">EV industry hires.</span>
            </h1>
            <p
              className="animate-fade-up mt-3 max-w-2xl text-white/85 md:text-lg"
              style={{ animationDelay: "160ms" }}
            >
              Multi-company job fairs across India. Apply once, get shortlisted
              via on-site challenges, interview at the booth.
            </p>
          </div>
        </section>

        <div className="container max-w-5xl space-y-8 py-8 md:py-10">
          {[...live, ...ongoingOpen].length > 0 && (
            <Section
              eyebrow="Right now"
              title="Live fairs"
              hint="Apply today — recruiters are actively reviewing."
            >
              <FairGrid drives={[...live, ...ongoingOpen]} live />
            </Section>
          )}

          <Section
            eyebrow="Coming up"
            title="Upcoming fairs"
            hint="Register early — companies start shortlisting before the doors open."
          >
            {upcoming.length === 0 ? (
              <EmptyState
                icon="🗓️"
                title="No fairs scheduled right now"
                body="Sign up for alerts and you'll be the first to know when a fair lands in your city."
              />
            ) : (
              <FairGrid drives={upcoming} />
            )}
          </Section>

          {closed.length > 0 && (
            <Section
              eyebrow="Recap"
              title="Recently closed"
              hint="Fairs from the last 30 days. Job postings remain live; the on-site funnel is over."
            >
              <FairGrid drives={closed} dimmed />
            </Section>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function Section({
  eyebrow,
  title,
  hint,
  children,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
          {eyebrow}
        </p>
        <h2 className="text-section text-emce-text">{title}</h2>
        {hint && <p className="text-hint text-emce-text-sec">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function FairGrid({
  drives,
  live,
  dimmed,
}: {
  drives: {
    id: string;
    slug: string;
    title: string;
    tagline: string | null;
    bannerImageUrl: string | null;
    city: string;
    state: string | null;
    startsAt: Date;
    endsAt: Date;
    status: string;
    participatingCount: number;
    jobsCount: number;
  }[];
  live?: boolean;
  dimmed?: boolean;
}) {
  return (
    <div className={`emce-stagger grid gap-3 sm:grid-cols-2 ${dimmed ? "opacity-80" : ""}`}>
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
                {live ? (
                  <Badge variant="warning" size="sm">
                    🔴 Live now
                  </Badge>
                ) : d.status === "CLOSED" ? (
                  <Badge variant="outline" size="sm">
                    Closed
                  </Badge>
                ) : (
                  <Badge variant="default" size="sm">
                    Upcoming
                  </Badge>
                )}
                <span className="text-hint text-emce-text-muted">
                  📍 {d.city}
                  {d.state ? `, ${d.state}` : ""}
                </span>
              </div>
              <h3 className="mt-2 font-bold text-emce-text">{d.title}</h3>
              {d.tagline && (
                <p className="text-hint text-emce-text-sec line-clamp-2">{d.tagline}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-hint text-emce-text-sec">
                <span>
                  📅 {formatDateRange(d.startsAt, d.endsAt)}
                </span>
                <span>
                  🏢 {d.participatingCount} {d.participatingCount === 1 ? "company" : "companies"}
                </span>
                <span>
                  💼 {d.jobsCount} {d.jobsCount === 1 ? "role" : "roles"}
                </span>
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function formatDateRange(start: Date, end: Date): string {
  const s = start.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  if (start.toDateString() === end.toDateString()) {
    return `${s}, ${start.getFullYear()}`;
  }
  const e = end.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  return `${s} — ${e}, ${end.getFullYear()}`;
}
