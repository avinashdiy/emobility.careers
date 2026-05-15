import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "EV community groups — battery, charging, motor, software",
  description:
    "Sub-communities for India's EV industry. Join one to follow posts from peers in your domain — Battery, BMS, Charging Infra, Motor & Drives, Software & IoT.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/groups` },
};

export const dynamic = "force-dynamic";

/**
 * #5 Wave A — EV Community Groups browse. Lists every public group
 * grouped by EV domain. Logged-in users see "✓ Joined" pills on
 * groups they're already a member of.
 */
export default async function GroupsPage() {
  const session = await auth();
  const [groups, evDomains, memberships] = await Promise.all([
    db.group.findMany({
      where: { isPublic: true },
      orderBy: [{ evDomainSlug: "asc" }, { sortOrder: "asc" }, { memberCount: "desc" }],
    }),
    db.eVDomain.findMany({ orderBy: { order: "asc" } }),
    session?.user
      ? db.groupMembership.findMany({
          where: { userId: session.user.id },
          select: { groupId: true },
        })
      : Promise.resolve([]),
  ]);

  const myGroupIds = new Set(memberships.map((m) => m.groupId));
  const grouped = new Map<string, typeof groups>();
  for (const g of groups) {
    const arr = grouped.get(g.evDomainSlug) ?? [];
    arr.push(g);
    grouped.set(g.evDomainSlug, arr);
  }
  const domainName = new Map(evDomains.map((d) => [d.slug, d.name]));

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
            style={{ animationDelay: "1.6s" }}
          />
          <div
            aria-hidden
            className="emce-dot-grid pointer-events-none absolute inset-0 opacity-25"
          />
          <div className="container relative max-w-4xl py-12 md:py-16">
            <div className="emce-pill mb-3 animate-fade-up">
              <span aria-hidden>👥</span>
              <span>EV community groups</span>
            </div>
            <h1
              className="animate-fade-up text-3xl font-extrabold leading-tight tracking-tight md:text-4xl"
              style={{ animationDelay: "80ms" }}
            >
              Find your{" "}
              <span className="emce-text-gradient">EV tribe.</span>
            </h1>
            <p
              className="animate-fade-up mt-3 max-w-2xl text-white/85 md:text-lg"
              style={{ animationDelay: "160ms" }}
            >
              Sub-communities by EV domain — Battery, BMS, Charging, Motors,
              Software, Manufacturing. Join one to follow domain-specific
              posts; posts tagged with the group&apos;s hashtag surface in the
              group feed automatically.
            </p>
            {session?.user && myGroupIds.size > 0 && (
              <p
                className="animate-fade-up mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold backdrop-blur"
                style={{ animationDelay: "240ms" }}
              >
                ✓ Member of {myGroupIds.size} group{myGroupIds.size === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </section>

        <div className="container max-w-4xl space-y-8 py-10">
          {Array.from(grouped.entries()).map(([domainSlug, items]) => (
            <section key={domainSlug}>
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
                  EV domain
                </p>
                <h2 className="text-section text-emce-text">
                  {domainName.get(domainSlug) ?? domainSlug}
                </h2>
              </div>
              <ul className="emce-stagger grid gap-3 sm:grid-cols-2">
                {items.map((g) => {
                  const joined = myGroupIds.has(g.id);
                  return (
                    <li key={g.id}>
                      <Card variant="interactive" className="h-full">
                        <Link href={`/groups/${g.slug}`} className="block">
                          {g.bannerUrl ? (
                            <div
                              className="-mx-4 -mt-4 mb-3 h-20 rounded-t-lg bg-cover bg-center"
                              style={{ backgroundImage: `url(${g.bannerUrl})` }}
                              aria-hidden
                            />
                          ) : (
                            <div className="emce-mesh-soft -mx-4 -mt-4 mb-3 h-20 rounded-t-lg" aria-hidden />
                          )}
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-section text-emce-text">{g.name}</h3>
                            {joined && <Badge variant="success">✓ Joined</Badge>}
                          </div>
                          {g.tagline && (
                            <p className="mt-1 text-hint text-emce-text-sec line-clamp-2">
                              {g.tagline}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-emce-text-muted">
                            <span>{g.memberCount} member{g.memberCount === 1 ? "" : "s"}</span>
                            <span>· {g.postCount} post{g.postCount === 1 ? "" : "s"}</span>
                            <span>· #{g.slug}</span>
                          </div>
                        </Link>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {groups.length === 0 && (
            <Card className="p-10 text-center">
              <p className="text-section text-emce-text">No groups yet</p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Run <code>npx tsx scripts/seed-groups.ts</code> to populate the
                EV community groups.
              </p>
            </Card>
          )}

          {!session?.user && (
            <Card className="text-center">
              <p className="text-section text-emce-text">Sign in to join groups</p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Membership is free. We&apos;ll surface group posts in your
                For-You feed and send a weekly digest of what&apos;s active.
              </p>
              <Button asChild className="mt-3">
                <Link href="/signup?role=CANDIDATE">Create profile →</Link>
              </Button>
            </Card>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
