import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PostCard, type FeedPostShape } from "@/components/social/PostCard";
import { CommentSection } from "@/components/social/CommentSection";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getPost, getViewerPollVotes } from "@/server/social/queries";
import type { Metadata } from "next";
import { env } from "@/lib/env";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await db.post.findUnique({
    where: { id },
    select: {
      body: true,
      visibility: true,
      author: {
        select: {
          candidateProfile: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!post || post.visibility !== "PUBLIC") {
    return { title: "Post", robots: { index: false, follow: false } };
  }
  const c = post.author.candidateProfile;
  const author = c ? `${c.firstName} ${c.lastName ?? ""}`.trim() : "Someone";
  return {
    title: `${author}'s post`,
    description: post.body.slice(0, 200),
    alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/posts/${id}` },
  };
}

export default async function PostDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const post = await getPost(id);
  if (!post) notFound();

  // Visibility gate
  if (post.visibility === "PRIVATE" && post.authorId !== session?.user?.id) notFound();
  if (post.visibility === "CONNECTIONS") {
    if (!session?.user) notFound();
    if (post.authorId !== session.user.id) {
      const conn = await db.connection.findFirst({
        where: {
          status: "ACCEPTED",
          OR: [
            { requesterId: session.user.id, recipientId: post.authorId },
            { requesterId: post.authorId, recipientId: session.user.id },
          ],
        },
      });
      if (!conn) notFound();
    }
  }

  const viewerVotes = await getViewerPollVotes([{ poll: post.poll ? { id: post.poll.id } : null }], session?.user?.id ?? null);
  const viewerPollVotes = post.poll ? viewerVotes[post.poll.id] ?? [] : [];

  return (
    <>
      <SiteHeader />
      <div className="container max-w-3xl py-6">
        <PostCard
          post={{ ...(post as unknown as FeedPostShape), viewerPollVotes }}
          viewerId={session?.user?.id ?? null}
          showComments={false}
        />
        <div className="mt-3 rounded-lg border border-emce-border bg-white p-4 shadow-emce">
          <h2 className="text-section text-emce-text">Comments</h2>
          <div className="mt-4">
            <CommentSection postId={id} />
          </div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
