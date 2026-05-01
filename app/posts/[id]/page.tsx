import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PostCard, type FeedPostShape } from "@/components/social/PostCard";
import { CommentSection } from "@/components/social/CommentSection";
import { AnswersSection } from "@/components/social/AnswersSection";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getPost, getViewerPollVotes } from "@/server/social/queries";
import {
  qaPageJsonLd,
  articleJsonLd,
  discussionForumPostingJsonLd,
  breadcrumbJsonLd,
} from "@/lib/seo/schemas";
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
      kind: true,
      articleTitle: true,
      articleCoverUrl: true,
      embedThumbnailUrl: true,
      author: {
        select: {
          candidateProfile: { select: { firstName: true, lastName: true } },
        },
      },
      // First image attachment in carousel order — used as the OG hero
      // when this is an IMAGE post. Limit to 1 because LinkedIn / Twitter
      // only render a single image in the share card.
      attachments: {
        where: { type: "IMAGE" },
        orderBy: { order: "asc" },
        take: 1,
        select: { url: true },
      },
    },
  });
  if (!post || post.visibility !== "PUBLIC") {
    return { title: "Post", robots: { index: false, follow: false } };
  }
  const c = post.author.candidateProfile;
  const author = c ? `${c.firstName} ${c.lastName ?? ""}`.trim() : "Someone";
  const url = `${env.NEXT_PUBLIC_APP_URL}/posts/${id}`;
  // Pick the best per-post hero image so LinkedIn / X / WhatsApp render a
  // proper card when someone shares the URL. Priority: article cover →
  // first image attachment → embed thumbnail (YouTube). When none of
  // these exist we fall through to the site-wide /opengraph-image
  // inherited from app/layout.tsx, so there's always *some* image.
  const heroImage =
    (post.kind === "ARTICLE" && post.articleCoverUrl) ||
    post.attachments[0]?.url ||
    (post.kind === "EMBED" && post.embedThumbnailUrl) ||
    null;
  const title =
    post.kind === "ARTICLE" && post.articleTitle
      ? post.articleTitle
      : `${author}'s post`;
  const description = post.body.replace(/\s+/g, " ").slice(0, 200);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      siteName: "eMobility Careers",
      images: heroImage ? [{ url: heroImage }] : undefined,
    },
    twitter: {
      card: heroImage ? "summary_large_image" : "summary",
      title,
      description,
      images: heroImage ? [heroImage] : undefined,
    },
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

  // Article schema — only fire on ARTICLE-kind public posts. Eligible
  // for "Top stories" and gives AI engines a clean datePublished /
  // articleBody to cite.
  const authorSlug = askedByCp?.slug ?? null;
  const articleLd =
    post.kind === "ARTICLE" && post.visibility === "PUBLIC"
      ? articleJsonLd({
          postId: id,
          headline: post.articleTitle ?? post.body.split("\n")[0].slice(0, 110),
          body: post.body,
          coverImageUrl: post.articleCoverUrl ?? null,
          publishedAt: post.createdAt,
          updatedAt: post.updatedAt,
          author: { name: askedByName, slug: authorSlug },
        })
      : null;

  // DiscussionForumPosting — for plain TEXT/feed posts. This is the
  // schema Reddit uses; eligible for Google's "Discussions and forums"
  // SERP block. Skipping POLL/EMBED/IMAGE because they carry less
  // textual substance for AI extraction.
  let discussionComments: {
    id: string;
    text: string;
    createdAt: Date;
    authorName: string;
  }[] = [];
  if (post.kind === "TEXT" && post.visibility === "PUBLIC") {
    // Pull comments separately for the schema payload — mirrors
    // exactly what CommentSection renders so AI engines reading the
    // JSON-LD see the same context readers see.
    const rows = await db.postComment.findMany({
      where: { postId: id, hiddenAt: null, parentId: null },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: {
          select: {
            name: true,
            candidateProfile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    discussionComments = rows.map((c) => ({
      id: c.id,
      text: c.body,
      createdAt: c.createdAt,
      authorName: c.author.candidateProfile
        ? `${c.author.candidateProfile.firstName} ${c.author.candidateProfile.lastName ?? ""}`.trim()
        : c.author.name ?? "A community member",
    }));
  }
  const discussionLd =
    post.kind === "TEXT" && post.visibility === "PUBLIC"
      ? discussionForumPostingJsonLd({
          postId: id,
          headline: post.body.split("\n")[0].slice(0, 200),
          text: post.body,
          createdAt: post.createdAt,
          author: { name: askedByName, slug: authorSlug },
          upvoteCount: post.reactionsCount,
          commentCount: post.commentsCount,
          comments: discussionComments,
        })
      : null;

  // Breadcrumbs help crawlers understand the URL hierarchy and feed
  // Google's breadcrumb rich result. Same payload regardless of post
  // kind — points at /feed as the parent.
  const breadcrumbLd =
    post.visibility === "PUBLIC"
      ? breadcrumbJsonLd([
          { name: "Home", href: "/" },
          { name: "Feed", href: "/feed" },
          {
            name: post.kind === "QUESTION"
              ? "Question"
              : post.kind === "ARTICLE"
                ? "Article"
                : "Post",
            href: `/posts/${id}`,
          },
        ])
      : null;

  return (
    <>
      {qaJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(qaJsonLd) }}
        />
      )}
      {articleLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
        />
      )}
      {discussionLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(discussionLd) }}
        />
      )}
      {breadcrumbLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
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
