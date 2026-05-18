import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { auth } from "@/lib/auth";
import { getSlugRedirect } from "@/lib/slug-redirects";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import {
  DiscussionThreadView,
  type ThreadHero,
  type ReplyItem,
} from "@/components/discussions/DiscussionThreadView";
import { breadcrumbJsonLd, jsonLdScriptTag } from "@/lib/seo/schemas";

/**
 * Per-thread page for an Institution discussion.
 *
 * URL: /institutions/<slug>/discuss/<threadSlug>
 *
 * Emits DiscussionForumPosting JSON-LD so Google indexes these
 * threads for the "Discussions and forums" SERP rich result.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; threadSlug: string }>;
}): Promise<Metadata> {
  const { slug, threadSlug } = await params;
  const inst = await db.institution.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!inst) return { title: "Thread not found", robots: { index: false, follow: false } };
  const thread = await db.entityDiscussionThread.findFirst({
    where: {
      entityType: "INSTITUTION",
      entityId: inst.id,
      slug: threadSlug,
      status: "PUBLISHED",
    },
    select: { title: true, body: true },
  });
  if (!thread) return { title: "Thread not found", robots: { index: false, follow: false } };
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/institutions/${slug}/discuss/${threadSlug}`;
  const description = thread.body.slice(0, 160);
  return {
    title: `${thread.title} — ${inst.name} discussion`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: thread.title,
      description,
      siteName: "eMobility Careers",
    },
    twitter: { card: "summary", title: thread.title, description },
  };
}

export const dynamic = "force-dynamic";

export default async function InstitutionThreadPage({
  params,
}: {
  params: Promise<{ slug: string; threadSlug: string }>;
}) {
  const { slug, threadSlug } = await params;

  // Institution slug-redirect — keeps merged-DIYguru-style URLs alive
  // for inbound thread links.
  const redirectTo = await getSlugRedirect("INSTITUTION", slug);
  if (redirectTo && redirectTo !== slug) {
    permanentRedirect(`/institutions/${redirectTo}/discuss/${threadSlug}`);
  }

  const [session, inst] = await Promise.all([
    auth(),
    db.institution.findUnique({
      where: { slug },
      select: { id: true, name: true },
    }),
  ]);
  if (!inst) notFound();

  const thread = await db.entityDiscussionThread.findFirst({
    where: {
      entityType: "INSTITUTION",
      entityId: inst.id,
      slug: threadSlug,
      status: "PUBLISHED",
    },
    include: {
      authorUser: {
        select: {
          name: true,
          candidateProfile: { select: { slug: true } },
        },
      },
      replies: {
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "asc" },
        include: {
          authorUser: {
            select: {
              name: true,
              candidateProfile: { select: { slug: true } },
            },
          },
        },
      },
    },
  });
  if (!thread) notFound();

  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = `${baseUrl}/institutions/${slug}/discuss/${threadSlug}`;

  // DiscussionForumPosting JSON-LD — gets the SERP "Discussions
  // and forums" treatment when the rich result fires.
  const ld = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: thread.title,
    text: thread.body,
    url,
    datePublished: thread.createdAt.toISOString(),
    dateModified: thread.updatedAt.toISOString(),
    author: {
      "@type": "Person",
      name: thread.authorUser.name ?? "Anonymous",
    },
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/CommentAction",
      userInteractionCount: thread.replyCount,
    },
    comment: thread.replies.slice(0, 10).map((r) => ({
      "@type": "Comment",
      text: r.body,
      datePublished: r.createdAt.toISOString(),
      author: {
        "@type": "Person",
        name: r.authorUser.name ?? "Anonymous",
      },
    })),
  };
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "Institutions", href: "/institutions" },
    { name: inst.name, href: `/institutions/${slug}` },
    { name: "Discussion", href: `/institutions/${slug}?tab=discuss` },
    { name: thread.title, href: `/institutions/${slug}/discuss/${threadSlug}` },
  ]);

  const threadHero: ThreadHero = {
    id: thread.id,
    title: thread.title,
    body: thread.body,
    createdAt: thread.createdAt,
    upvoteCount: thread.upvoteCount,
    replyCount: thread.replyCount,
    authorName: thread.authorUser.name ?? "Anonymous",
    authorSlug: thread.authorUser.candidateProfile?.slug ?? null,
  };
  const replies: ReplyItem[] = thread.replies.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    upvoteCount: r.upvoteCount,
    parentReplyId: r.parentReplyId,
    authorName: r.authorUser.name ?? "Anonymous",
    authorSlug: r.authorUser.candidateProfile?.slug ?? null,
  }));

  return (
    <>
      <SiteHeader />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(ld) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: jsonLdScriptTag(breadcrumb) }}
      />
      <ToastFromSearchParams />
      <DiscussionThreadView
        entityHref={`/institutions/${inst.id ? slug : slug}`}
        entityName={inst.name}
        thread={threadHero}
        replies={replies}
        isSignedIn={!!session?.user}
      />
      <SiteFooter />
    </>
  );
}
