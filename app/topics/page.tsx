import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { FollowTagButton } from "@/components/social/FollowTagButton";
import { prettifyHashtag } from "@/lib/social/hashtag";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Topics — eMobility Careers",
  description:
    "Discover topics on eMobility Careers — from #battery-engineering to #charging-infrastructure. Follow what you care about and your For-you feed fills up automatically.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/topics` },
};

/**
 * Topic discovery — the landing surface that fixes the cold-start
 * problem caused by our explicit-subscription model.
 *
 *   • "Trending right now" — top hashtags by post count in the last
 *     14 days. Cheap (one groupBy on Post.hashtags via raw SQL since
 *     Prisma can't groupBy a string[] column).
 *   • "Suggested by domain" — the user's EV domains drive a couple
 *     of suggestion rails (e.g. Battery Tech → battery / bms / lfp).
 *     Skipped for logged-out viewers.
 *   • "All topics A–Z" — every tag with at least one post,
 *     alphabetical, scrollable.
 *
 * Each row uses the same FollowTagButton as /tag/[slug] for one-
 * click subscribe.
 */
export const dynamic = "force-dynamic";

interface TagRow {
  tag: string;
  count: number;
}

// Curated "popular topics" rail — surfaces a hand-picked set even
// when the platform's organic post count is still low. Acts as a
// safety net for the trending query at zero-data weeks.
const SEED_TOPICS = [
  "battery-engineering",
  "bms",
  "charging-infrastructure",
  "lfp",
  "electric-mobility",
  "evindia",
  "thermal-management",
  "motor-design",
  "fleet-electrification",
  "two-wheelers",
  "three-wheelers",
  "hydrogen-fuel-cell",
] as const;

export default async function TopicsDiscoveryPage() {
  const session = await auth();
  const viewerId = session?.user?.id ?? null;

  // 14-day trending — UNNEST + GROUP BY against Post.hashtags. The
  // GIN index on `hashtags` makes the visibility-filter scan cheap;
  // the groupBy is unindexed but bounded by the 14-day window.
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const trending = await db.$queryRaw<TagRow[]>`
    SELECT lower(tag) AS tag, COUNT(*)::int AS count
    FROM "Post", unnest("hashtags") AS tag
    WHERE "visibility" = 'PUBLIC'
      AND "createdAt" >= ${since}
    GROUP BY lower(tag)
    ORDER BY count DESC, tag ASC
    LIMIT 12;
  `;

  // Domain-driven rails. Pull the viewer's domains; for each, take
  // the top 6 skills as suggested topics (skill slugs share the
  // hashtag namespace by convention).
  let domainRails: { domainName: string; tags: string[] }[] = [];
  if (viewerId) {
    const myDomains = await db.candidateEVDomain.findMany({
      where: { candidate: { userId: viewerId } },
      select: {
        evDomain: {
          select: {
            name: true,
            skills: {
              select: { slug: true },
              take: 8,
              orderBy: { name: "asc" },
            },
          },
        },
      },
      take: 4,
    });
    domainRails = myDomains
      .filter((d) => d.evDomain.skills.length > 0)
      .map((d) => ({
        domainName: d.evDomain.name,
        tags: d.evDomain.skills.map((s) => s.slug),
      }));
  }

  // Viewer's existing subscriptions — used to render the right
  // chip state (Following vs +Follow) on every row.
  const mySubs = viewerId
    ? await db.hashtagSubscription.findMany({
        where: { userId: viewerId },
        select: { tag: true },
      })
    : [];
  const followedSet = new Set(mySubs.map((s) => s.tag));

  // Trending fallback — if the live query is empty (early days or
  // a quiet fortnight), use the seed list so the page never feels
  // dead. We deliberately don't merge: the moment trending has
  // even one tag, we trust live data.
  const trendingRows: TagRow[] =
    trending.length > 0
      ? trending
      : SEED_TOPICS.map((tag) => ({ tag, count: 0 }));

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-4xl py-8">
          <div className="mb-6">
            <Badge variant="default">Topics</Badge>
            <h1 className="mt-2 text-3xl font-extrabold text-emce-text md:text-4xl">
              Discover topics
            </h1>
            <p className="mt-2 max-w-2xl text-base text-emce-text-sec">
              Follow the hashtags you care about and they&apos;ll surface in your{" "}
              <Link href="/feed?tab=for-you" className="font-bold text-emce-dark hover:underline">
                For-you feed
              </Link>
              . Posts on eMobility Careers are tagged the same way — the same{" "}
              <code>#battery-engineering</code> on a post matches the topic you follow here.
            </p>
            {viewerId && mySubs.length > 0 && (
              <div className="mt-3">
                <Button asChild variant="outline" size="sm">
                  <Link href="/me/topics">Manage your {mySubs.length} topic{mySubs.length === 1 ? "" : "s"} →</Link>
                </Button>
              </div>
            )}
          </div>

          {/* Trending */}
          <Card className="p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-section text-emce-text">
                {trending.length > 0 ? "Trending in the last 14 days" : "Popular topics"}
              </h2>
              {trending.length > 0 && (
                <span className="text-hint text-emce-text-sec">live count</span>
              )}
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {trendingRows.map((row) => (
                <TagListItem
                  key={row.tag}
                  tag={row.tag}
                  count={row.count}
                  signedIn={viewerId !== null}
                  following={followedSet.has(row.tag)}
                />
              ))}
            </ul>
          </Card>

          {/* Domain rails */}
          {domainRails.map((rail) => (
            <Card key={rail.domainName} className="mt-4 p-4">
              <h2 className="text-section text-emce-text">
                Suggested for you · {rail.domainName}
              </h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                Based on the EV domains in your profile.
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {rail.tags.map((tag) => (
                  <TagListItem
                    key={tag}
                    tag={tag}
                    signedIn
                    following={followedSet.has(tag)}
                  />
                ))}
              </ul>
            </Card>
          ))}

          {/* Help / footer */}
          <div className="mt-6 rounded-md border border-emce-border bg-white p-4 text-sm text-emce-text-sec">
            Don&apos;t see what you want?{" "}
            <Link href="/me/topics" className="font-bold text-emce-dark hover:underline">
              Add any tag
            </Link>{" "}
            from the manage page — every public post tagged with it will start showing up.
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function TagListItem({
  tag,
  count,
  signedIn,
  following,
}: {
  tag: string;
  count?: number;
  signedIn: boolean;
  following: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-emce-border bg-white p-3 hover:border-emce-mid">
      <Link href={`/tag/${tag}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-emce-dark">#{tag}</p>
        <p className="text-hint text-emce-text-sec">
          {prettifyHashtag(tag)}
          {typeof count === "number" && count > 0 && (
            <> · {count} post{count === 1 ? "" : "s"}</>
          )}
        </p>
      </Link>
      <FollowTagButton
        tag={tag}
        initialFollowing={following}
        signedIn={signedIn}
        size="sm"
      />
    </li>
  );
}
