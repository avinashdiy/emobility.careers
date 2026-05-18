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
 * Per-thread page for a Company discussion. Mirrors the institution
 * counterpart at /institutions/<slug>/discuss/<threadSlug>.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; threadSlug: string }>;
}): Promise<Metadata> {
  const { slug, threadSlug } = await params;
  const company = await db.company.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!company) return { title: "Thread not found", robots: { index: false, follow: false } };
  const thread = await db.entityDiscussionThread.findFirst({
    where: {
      entityType: "COMPANY",
      entityId: company.id,
      slug: threadSlug,
      status: "PUBLISHED",
    },
    select: { title: true, body: true },
  });
  if (!thread) return { title: "Thread not found", robots: { index: false, follow: false } };
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/company/${slug}/discuss/${threadSlug}`;
  const description = thread.body.slice(0, 160);
  return {
    title: `${thread.title} — ${company.name} discussion`,
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

export default async function CompanyThreadPage({
  params,
}: {
  params: Promise<{ slug: string; threadSlug: string }>;
}) {
  const { slug, threadSlug } = await params;

  const redirectTo = await getSlugRedirect("COMPANY", slug);
  if (redirectTo && redirectTo !== slug) {
    permanentRedirect(`/company/${redirectTo}/discuss/${threadSlug}`);
  }

  const [session, company] = await Promise.all([
    auth(),
    db.company.findUnique({
      where: { slug },
      select: { id: true, name: true },
    }),
  ]);
  if (!company) notFound();

  const thread = await db.entityDiscussionThread.findFirst({
    where: {
      entityType: "COMPANY",
      entityId: company.id,
      slug: threadSlug,
      status: "PUBLISHED",
    },
    include: {
      authorUser: {
        select: { name: true, candidateProfile: { select: { slug: true } } },
      },
      replies: {
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "asc" },
        include: {
          authorUser: {
            select: { name: true, candidateProfile: { select: { slug: true } } },
          },
        },
      },
    },
  });
  if (!thread) notFound();

  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const url = `${baseUrl}/company/${slug}/discuss/${threadSlug}`;

  const ld = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: thread.title,
    text: thread.body,
    url,
    datePublished: thread.createdAt.toISOString(),
    dateModified: thread.updatedAt.toISOString(),
    author: { "@type": "Person", name: thread.authorUser.name ?? "Anonymous" },
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/CommentAction",
      userInteractionCount: thread.replyCount,
    },
    comment: thread.replies.slice(0, 10).map((r) => ({
      "@type": "Comment",
      text: r.body,
      datePublished: r.createdAt.toISOString(),
      author: { "@type": "Person", name: r.authorUser.name ?? "Anonymous" },
    })),
  };
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "Companies", href: "/companies" },
    { name: company.name, href: `/company/${slug}` },
    { name: "Discussion", href: `/company/${slug}?tab=discuss` },
    { name: thread.title, href: `/company/${slug}/discuss/${threadSlug}` },
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
        entityHref={`/company/${slug}`}
        entityName={company.name}
        thread={threadHero}
        replies={replies}
        isSignedIn={!!session?.user}
      />
      <SiteFooter />
    </>
  );
}
