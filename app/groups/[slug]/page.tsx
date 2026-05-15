import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { PostCard, type FeedPostShape } from "@/components/social/PostCard";
import { joinGroup, leaveGroup } from "@/server/groups/actions";
import { getPostsByHashtag } from "@/server/social/queries";
import { env } from "@/lib/env";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const g = await db.group.findUnique({ where: { slug } });
  if (!g) return { title: "Group not found" };
  return {
    title: `${g.name} — EV community group`,
    description: g.tagline ?? `${g.memberCount} members discussing ${g.name} in the EV industry.`,
    alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/groups/${slug}` },
  };
}

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const group = await db.group.findUnique({ where: { slug } });
  if (!group || !group.isPublic) notFound();

  // Membership state for the join/leave button + the page's tone.
  const myMembership = session?.user
    ? await db.groupMembership.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
      })
    : null;

  // Group feed = recent posts tagged with the group's slug as a
  // hashtag. Use the existing helper so the post-author select
  // shape matches what PostCard expects everywhere else.
  const posts = await getPostsByHashtag(slug, 25);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        {/* Group banner */}
        {group.bannerUrl ? (
          <div
            className="h-40 w-full bg-cover bg-center sm:h-56"
            style={{ backgroundImage: `url(${group.bannerUrl})` }}
            role="img"
            aria-label={`${group.name} banner`}
          />
        ) : (
          <div className="emce-mesh-hero relative h-40 sm:h-56">
            <div
              aria-hidden
              className="emce-dot-grid pointer-events-none absolute inset-0 opacity-25"
            />
          </div>
        )}

        <div className="container max-w-3xl py-6">
          <Link
            href="/groups"
            className="text-hint font-bold text-emce-dark hover:underline"
          >
            ← All groups
          </Link>

          <Card variant="glow" animate className="mt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Badge variant="default">#{group.slug}</Badge>
                  {myMembership && <Badge variant="success">✓ Member</Badge>}
                </div>
                <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight text-emce-text md:text-[28px]">
                  {group.name}
                </h1>
                {group.tagline && (
                  <p className="mt-1 text-hint text-emce-text-sec">{group.tagline}</p>
                )}
                <p className="mt-2 text-hint text-emce-text-muted">
                  {group.memberCount} member{group.memberCount === 1 ? "" : "s"} · {group.postCount} post{group.postCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex-shrink-0">
                {!session?.user ? (
                  <Button asChild variant="glow">
                    <Link href={`/signin?next=/groups/${slug}`}>Sign in to join</Link>
                  </Button>
                ) : myMembership ? (
                  <form action={leaveGroup}>
                    <input type="hidden" name="slug" value={slug} />
                    <SubmitButton variant="outline" pendingLabel="Leaving…">
                      Leave group
                    </SubmitButton>
                  </form>
                ) : (
                  <form action={joinGroup}>
                    <input type="hidden" name="slug" value={slug} />
                    <SubmitButton variant="glow" pendingLabel="Joining…">
                      🤝 Join group
                    </SubmitButton>
                  </form>
                )}
              </div>
            </div>
            {group.description && (
              <p className="mt-4 text-body text-emce-text whitespace-pre-line">
                {group.description}
              </p>
            )}
            {group.rules && (
              <details className="mt-3">
                <summary className="cursor-pointer text-hint font-bold text-emce-dark hover:underline">
                  Group rules ▾
                </summary>
                <p className="mt-2 text-body text-emce-text-sec whitespace-pre-line">
                  {group.rules}
                </p>
              </details>
            )}
          </Card>

          {/* Group feed */}
          <h2 className="mt-6 text-section text-emce-text">Recent posts</h2>
          {posts.length === 0 ? (
            <Card className="mt-3 p-10 text-center">
              <p className="text-section text-emce-text">
                {myMembership ? "Be the first to post" : "No posts yet"}
              </p>
              <p className="mt-1 text-hint text-emce-text-sec">
                {myMembership ? (
                  <>
                    Use{" "}
                    <code className="rounded bg-emce-light-soft px-1 py-0.5">#{slug}</code>{" "}
                    in your next post — it&apos;ll show up here automatically.
                  </>
                ) : (
                  "Join the group and use the group's hashtag in your posts to seed the feed."
                )}
              </p>
              <Button asChild className="mt-4" variant="outline">
                <Link href="/feed">Open feed →</Link>
              </Button>
            </Card>
          ) : (
            <ul className="emce-stagger mt-3 space-y-3">
              {posts.map((p) => (
                <li key={p.id}>
                  <PostCard
                    post={p as unknown as FeedPostShape}
                    viewerId={session?.user?.id ?? null}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
