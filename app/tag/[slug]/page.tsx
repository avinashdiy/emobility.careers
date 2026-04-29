import Link from "next/link";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PostCard, type FeedPostShape } from "@/components/social/PostCard";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getPostsByHashtag } from "@/server/social/queries";
import type { Metadata } from "next";
import { env } from "@/lib/env";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tag = decodeURIComponent(slug).toLowerCase();
  return {
    title: `#${tag}`,
    description: `Posts tagged #${tag} on eMobility Careers — the EV-industry social network.`,
    alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/tag/${tag}` },
  };
}

export default async function HashtagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tag = decodeURIComponent(slug).toLowerCase();
  const session = await auth();
  const posts = await getPostsByHashtag(tag, 30);

  return (
    <>
      <SiteHeader />
      <div className="container max-w-3xl py-6">
        <div className="mb-4">
          <Badge variant="default">Hashtag</Badge>
          <h1 className="mt-2 text-2xl font-extrabold text-emce-text md:text-3xl">#{tag}</h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            {posts.length} public post{posts.length === 1 ? "" : "s"} tagged with this topic.
          </p>
        </div>

        {posts.length === 0 ? (
          <Card className="p-10 text-center">
            <div className="text-4xl">🏷️</div>
            <p className="mt-3 text-section text-emce-text">No posts here yet</p>
            <p className="mt-1 text-hint text-emce-text-sec">
              Be the first to post with <code>#{tag}</code> from the{" "}
              <Link href="/feed" className="font-bold text-emce-dark hover:underline">feed</Link>.
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id}>
                <PostCard post={p as unknown as FeedPostShape} viewerId={session?.user?.id ?? null} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <SiteFooter />
    </>
  );
}
