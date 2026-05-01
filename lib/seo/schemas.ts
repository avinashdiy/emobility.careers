import { env } from "@/lib/env";

/**
 * Reusable schema.org JSON-LD builders used across pages. Each function
 * returns the raw object — wrap it in <script type="application/ld+json">
 * with `JSON.stringify` at the call site.
 *
 * Why a central file?
 *   - One place to keep `@id` URLs consistent (Google needs stable IDs to
 *     fold pages into a knowledge-graph entity).
 *   - One place to bump the spec when Google's docs change.
 */

const BASE = () => env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

/** Standard breadcrumb trail. Pass parts in display order (home → leaf). */
export function breadcrumbJsonLd(items: { name: string; href: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: it.name,
      item: `${BASE()}${it.href.startsWith("/") ? it.href : `/${it.href}`}`,
    })),
  };
}

/** Event schema for competitions. Use for LIVE / JUDGING / RESULTS. */
export function competitionEventJsonLd(c: {
  slug: string;
  title: string;
  description: string;
  bannerImageUrl: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  totalPrizePoolMinor: number;
  prizeCurrency: string;
  hostCompany: { name: string; slug: string; website: string | null; logoUrl: string | null };
}) {
  const url = `${BASE()}/competitions/${c.slug}`;
  const eventStatusMap: Record<string, string> = {
    LIVE: "https://schema.org/EventScheduled",
    JUDGING: "https://schema.org/EventScheduled",
    RESULTS: "https://schema.org/EventScheduled",
    CLOSED: "https://schema.org/EventCancelled",
    REJECTED: "https://schema.org/EventCancelled",
  };
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": url,
    name: c.title,
    description: c.description.slice(0, 5000),
    eventStatus: eventStatusMap[c.status] ?? "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    startDate: c.startsAt.toISOString(),
    endDate: c.endsAt.toISOString(),
    location: {
      "@type": "VirtualLocation",
      url,
    },
    organizer: {
      "@type": "Organization",
      name: c.hostCompany.name,
      url: c.hostCompany.website ?? `${BASE()}/companies/${c.hostCompany.slug}`,
      ...(c.hostCompany.logoUrl && { logo: c.hostCompany.logoUrl }),
    },
    url,
    ...(c.bannerImageUrl && { image: c.bannerImageUrl }),
  };
  if (c.totalPrizePoolMinor > 0) {
    // Schema.org doesn't have a first-class prize property on Event; we
    // surface the pool as `offers` with a free price (registration is free)
    // and stash the prize amount in description for now. Google will surface
    // it when it shows a knowledge panel.
    obj.offers = {
      "@type": "Offer",
      url,
      price: 0,
      priceCurrency: c.prizeCurrency,
      availability: "https://schema.org/InStock",
      validFrom: c.startsAt.toISOString(),
    };
  }
  return obj;
}

/** ItemList for a directory page (e.g. /jobs, /mentors, /competitions). */
export function itemListJsonLd<T>(opts: {
  items: T[];
  itemUrl: (item: T, idx: number) => string;
  itemName?: (item: T, idx: number) => string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: opts.items.length,
    itemListElement: opts.items.map((it, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      ...(opts.itemName && { name: opts.itemName(it, idx) }),
      url: opts.itemUrl(it, idx),
    })),
  };
}

/** Organization schema — usable on company pages. */
export function organizationJsonLd(org: {
  name: string;
  slug: string;
  website: string | null;
  logoUrl: string | null;
  description: string | null;
  hqLocation: string | null;
  foundedYear: number | null;
}) {
  const url = `${BASE()}/companies/${org.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": url,
    name: org.name,
    url,
    sameAs: org.website ? [org.website] : undefined,
    ...(org.logoUrl && { logo: org.logoUrl }),
    ...(org.description && { description: org.description }),
    ...(org.hqLocation && {
      address: { "@type": "PostalAddress", addressLocality: org.hqLocation, addressCountry: "IN" },
    }),
    ...(org.foundedYear && { foundingDate: String(org.foundedYear) }),
  };
}

/** ProfessionalService schema for mentor profiles. */
export function mentorServiceJsonLd(m: {
  slug: string;
  fullName: string;
  headline: string;
  acceptingPaid: boolean;
  pricePerSessionMinor: number;
  currency: string;
  avgRating: number;
  totalRatings: number;
}) {
  const url = `${BASE()}/mentors/${m.slug}`;
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": url,
    name: `Mentorship — ${m.fullName}`,
    description: m.headline,
    url,
    provider: {
      "@type": "Person",
      name: m.fullName,
      url: `${BASE()}/${m.slug}`,
    },
  };
  if (m.acceptingPaid && m.pricePerSessionMinor > 0) {
    obj.offers = {
      "@type": "Offer",
      price: m.pricePerSessionMinor / 100,
      priceCurrency: m.currency,
      availability: "https://schema.org/InStock",
    };
  }
  if (m.totalRatings > 0) {
    obj.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: m.avgRating,
      reviewCount: m.totalRatings,
      bestRating: 5,
    };
  }
  return obj;
}

/** Helper for inline rendering: `<JsonLd data={...}/>`. */
export function jsonLdScriptTag(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

/**
 * QAPage schema for a Quora-style question post. Surfaces the
 * question text + accepted/top answers to Google so the page is
 * eligible for the "People also ask" rich result. We set the
 * highest-helpful-count answer as `acceptedAnswer` and include the
 * remaining as `suggestedAnswer`. Pass `null` for the upvote count
 * if you don't want to expose vote totals.
 *
 * Spec: https://developers.google.com/search/docs/appearance/structured-data/qapage
 */
export function qaPageJsonLd(input: {
  url: string;
  question: {
    text: string; // the question itself (no HTML)
    askedAt: Date;
    askedByName: string;
    upvoteCount?: number;
    answerCount: number;
  };
  answers: Array<{
    text: string;
    answeredAt: Date;
    authorName: string;
    upvoteCount: number;
    url: string;
  }>;
}) {
  const sorted = [...input.answers].sort((a, b) => b.upvoteCount - a.upvoteCount);
  const accepted = sorted[0];
  const suggested = sorted.slice(1);

  const answerObj = (a: typeof input.answers[number]) => ({
    "@type": "Answer",
    text: a.text,
    dateCreated: a.answeredAt.toISOString(),
    upvoteCount: a.upvoteCount,
    url: a.url,
    author: { "@type": "Person", name: a.authorName },
  });

  return {
    "@context": "https://schema.org",
    "@type": "QAPage",
    mainEntity: {
      "@type": "Question",
      name: input.question.text.split("\n")[0].slice(0, 240),
      text: input.question.text,
      dateCreated: input.question.askedAt.toISOString(),
      author: { "@type": "Person", name: input.question.askedByName },
      answerCount: input.question.answerCount,
      ...(input.question.upvoteCount !== undefined && {
        upvoteCount: input.question.upvoteCount,
      }),
      ...(accepted && { acceptedAnswer: answerObj(accepted) }),
      ...(suggested.length > 0 && { suggestedAnswer: suggested.map(answerObj) }),
    },
  };
}

/**
 * Person schema for /[username]. Lets Google + AI crawlers index a
 * candidate's profile as a structured entity (jobTitle, affiliation,
 * skills) rather than a thin "anonymous bio" page. Affiliation maps
 * to the candidate's current Experience row when available.
 */
export function personJsonLd(input: {
  slug: string;
  name: string;
  headline: string | null;
  summary: string | null;
  profilePhotoUrl: string | null;
  location: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  twitterUrl: string | null;
  skills: string[];
  currentEmployer: { name: string; title: string | null } | null;
}) {
  const url = `${BASE()}/${input.slug}`;
  const sameAs = [input.linkedinUrl, input.githubUrl, input.twitterUrl, input.websiteUrl]
    .filter((u): u is string => Boolean(u));
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${url}#person`,
    name: input.name,
    url,
    ...(input.headline && { jobTitle: input.headline }),
    ...(input.summary && { description: input.summary.slice(0, 500) }),
    ...(input.profilePhotoUrl && { image: input.profilePhotoUrl }),
    ...(input.location && {
      address: { "@type": "PostalAddress", addressLocality: input.location },
    }),
    ...(sameAs.length > 0 && { sameAs }),
    ...(input.skills.length > 0 && { knowsAbout: input.skills.slice(0, 30) }),
    ...(input.currentEmployer && {
      worksFor: {
        "@type": "Organization",
        name: input.currentEmployer.name,
        ...(input.currentEmployer.title && { roleName: input.currentEmployer.title }),
      },
    }),
  };
}

/**
 * Article schema for ARTICLE-kind posts. Eligible for Google's
 * "Top stories" rich result and improves AI-overview citations
 * when the post answers an evergreen question.
 */
export function articleJsonLd(input: {
  postId: string;
  headline: string;
  body: string;
  coverImageUrl: string | null;
  publishedAt: Date;
  updatedAt: Date;
  author: { name: string; slug: string | null };
}) {
  const url = `${BASE()}/posts/${input.postId}`;
  const authorObj: Record<string, unknown> = {
    "@type": "Person",
    name: input.author.name,
  };
  if (input.author.slug) authorObj.url = `${BASE()}/${input.author.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: input.headline.slice(0, 110),
    articleBody: input.body.slice(0, 4000),
    datePublished: input.publishedAt.toISOString(),
    dateModified: input.updatedAt.toISOString(),
    author: authorObj,
    publisher: {
      "@type": "Organization",
      name: "eMobility Careers",
      logo: { "@type": "ImageObject", url: `${BASE()}/icon.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(input.coverImageUrl && { image: input.coverImageUrl }),
  };
}

/**
 * DiscussionForumPosting schema — what Reddit / Stack Overflow
 * regular posts use. Eligible for Google's "Discussions and forums"
 * SERP block. Comments serialise as `comment` array.
 */
export function discussionForumPostingJsonLd(input: {
  postId: string;
  headline: string;
  text: string;
  createdAt: Date;
  author: { name: string; slug: string | null };
  upvoteCount: number;
  commentCount: number;
  comments: {
    id: string;
    text: string;
    createdAt: Date;
    authorName: string;
  }[];
}) {
  const url = `${BASE()}/posts/${input.postId}`;
  const authorObj: Record<string, unknown> = {
    "@type": "Person",
    name: input.author.name,
  };
  if (input.author.slug) authorObj.url = `${BASE()}/${input.author.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    "@id": `${url}#discussion`,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    headline: input.headline.slice(0, 200),
    text: input.text.slice(0, 4000),
    datePublished: input.createdAt.toISOString(),
    author: authorObj,
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/LikeAction",
        userInteractionCount: input.upvoteCount,
      },
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/CommentAction",
        userInteractionCount: input.commentCount,
      },
    ],
    ...(input.comments.length > 0 && {
      comment: input.comments.slice(0, 50).map((c) => ({
        "@type": "Comment",
        "@id": `${url}#comment-${c.id}`,
        text: c.text.slice(0, 1500),
        dateCreated: c.createdAt.toISOString(),
        author: { "@type": "Person", name: c.authorName },
      })),
    }),
  };
}

/**
 * CollectionPage schema for /tag/[slug] community pages. Tells
 * crawlers "this URL is a curated collection of posts about X" so
 * the page slots into Google's "Topics" / Reddit-style discoverability.
 */
export function tagCollectionPageJsonLd(input: {
  tag: string;
  postCount: number;
  posts: { postId: string; headline: string; createdAt: Date }[];
}) {
  const url = `${BASE()}/tag/${encodeURIComponent(input.tag)}`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    name: `#${input.tag} on eMobility Careers`,
    description: `Posts and discussions tagged #${input.tag} — ${input.postCount.toLocaleString()} item${input.postCount === 1 ? "" : "s"}.`,
    url,
    isPartOf: { "@type": "WebSite", "@id": `${BASE()}#site` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.postCount,
      itemListElement: input.posts.slice(0, 20).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${BASE()}/posts/${p.postId}`,
        name: p.headline.slice(0, 200),
        datePublished: p.createdAt.toISOString(),
      })),
    },
  };
}
