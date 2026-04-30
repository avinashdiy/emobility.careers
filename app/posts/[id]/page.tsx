import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PostCard, type FeedPostShape } from "@/components/social/PostCard";
import { CommentSection } from "@/components/social/CommentSection";
import { AnswersSection } from "@/components/social/AnswersSection";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getPost, getViewerPollVotes } from "@/server/social/queries";
import { qaPageJsonLd } from "@/lib/seo/schemas";
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

  // Q&A — when this is a QUESTION post, fetch answers + the viewer's
  // helpful-vote set so the panel can show the right state per row.
  // Answers ranked by helpful-count (then recency) — matches the @@index
  // we added on Answer for cheap sorted reads. Inline await keeps the
  // include shape in the inferred type so `a.author.candidateProfile`
  // resolves without an extra typecast.
  const answers =
    post.kind === "QUESTION"
      ? await db.answer.findMany({
          where: { postId: id },
          orderBy: [{ helpfulCount: "desc" }, { createdAt: "asc" }],
          include: {
            author: {
              select: {
                id: true,
                name: true,
                candidateProfile: {
                  select: {
                    slug: true,
                    firstName: true,
                    lastName: true,
                    headline: true,
                    profilePhotoUrl: true,
                  },
                },
              },
            },
          },
        })
      : [];
  let viewerHelpfulIds = new Set<string>();
  if (post.kind === "QUESTION" && session?.user && answers.length > 0) {
    const votes = await db.answerHelpful.findMany({
      where: {
        userId: session.user.id,
        answerId: { in: answers.map((a) => a.id) },
      },
      select: { answerId: true },
    });
    viewerHelpfulIds = new Set(votes.map((v) => v.answerId));
  }

  // QAPage JSON-LD — only when the question is publicly visible.
  // Boosts eligibility for Google's "People also ask" rich result.
  const askedByCp = post.author?.candidateProfile;
  const askedByName = askedByCp
    ? `${askedByCp.firstName} ${askedByCp.lastName ?? ""}`.trim()
    : "A community member";
  const qaJsonLd =
    post.kind === "QUESTION" && post.visibility === "PUBLIC"
      ? qaPageJsonLd({
          url: `${env.NEXT_PUBLIC_APP_URL}/posts/${id}`,
          question: {
            text: post.body,
            askedAt: post.createdAt,
            askedByName,
            upvoteCount: post.reactionsCount,
            answerCount: answers.length,
          },
          answers: answers.map((a) => {
            const cp = a.author?.candidateProfile;
            const authorName = cp
              ? `${cp.firstName} ${cp.lastName ?? ""}`.trim()
              : a.author?.name ?? "Someone";
            return {
              text: a.body,
              answeredAt: a.createdAt,
              authorName,
              upvoteCount: a.helpfulCount,
              url: `${env.NEXT_PUBLIC_APP_URL}/posts/${id}#answer-${a.id}`,
            };
          }),
        })
      : null;

  return (
    <>
      {qaJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(qaJsonLd) }}
        />
      )}
      <SiteHeader />
      <div className="container max-w-3xl py-6">
        <PostCard
          post={{ ...(post as unknown as FeedPostShape), viewerPollVotes }}
          viewerId={session?.user?.id ?? null}
          showComments={false}
        />

        {post.kind === "QUESTION" && (
          <AnswersSection
            postId={id}
            questionAuthorId={post.authorId}
            answers={answers as unknown as Parameters<typeof AnswersSection>[0]["answers"]}
            viewerId={session?.user?.id ?? null}
            viewerHelpfulIds={viewerHelpfulIds}
          />
        )}

        <div className="mt-3 rounded-lg border border-emce-border bg-white p-4 shadow-emce">
          <h2 className="text-section text-emce-text">
            {post.kind === "QUESTION" ? "Comments on the question" : "Comments"}
          </h2>
          <div className="mt-4">
            <CommentSection postId={id} />
          </div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
