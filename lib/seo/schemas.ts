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
