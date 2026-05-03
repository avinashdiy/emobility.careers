import { db } from "@/lib/db";
import type { Prisma, PostVisibility } from "@prisma/client";

/**
 * Feed assembly. The feed ordering and visibility model:
 *
 *   - Author's own posts always visible to themselves.
 *   - Posts from accepted connections (1st degree) regardless of visibility (PUBLIC/CONNECTIONS).
 *   - Posts from people the viewer follows — PUBLIC only.
 *   - Posts from companies the viewer follows — PUBLIC only.
 *   - Recent PUBLIC posts when the viewer is logged out OR has no graph yet
 *     (cold start), capped to last 30 days.
 *
 * Ordered by createdAt desc with cursor-based pagination.
 */

export type FeedPost = Awaited<ReturnType<typeof feedPostInclude>>;

const POST_INCLUDE = {
  author: {
    select: {
      id: true,
      name: true,
      image: true,
      candidateProfile: {
        select: {
          slug: true,
          firstName: true,
          lastName: true,
          headline: true,
          profilePhotoUrl: true,
          isDIYguruVerified: true,
          // Twitter-style blue-checkmark surface — drives the verified
          // badge in PostCard's header. Plus country for the flag icon.
          idVerificationStatus: true,
          country: true,
          personType: true,
        },
      },
    },
  },
  asCompany: {
    select: { id: true, slug: true, name: true, logoUrl: true, verificationStatus: true },
  },
  attachedJob: {
    select: {
      id: true,
      slug: true,
      title: true,
      locations: true,
      workMode: true,
      profileMode: true,
      company: { select: { name: true, slug: true, logoUrl: true } },
    },
  },
  repostOf: {
    include: {
      author: {
        select: {
          id: true,
          name: true,
          candidateProfile: {
            select: { slug: true, firstName: true, lastName: true, profilePhotoUrl: true },
          },
        },
      },
    },
  },
  reactions: {
    select: { type: true, userId: true },
    take: 5, // for "Liked by X, Y, and 12 others" UI
  },
  attachments: {
    orderBy: { order: "asc" },
    select: {
      id: true,
      type: true,
      url: true,
      fileName: true,
      mime: true,
      byteSize: true,
      meta: true,
      order: true,
    },
  },
  poll: {
    include: {
      options: { orderBy: { order: "asc" } },
    },
  },
} as const;

/**
 * Given a list of feed posts and a viewer, return a map from pollId →
 * the optionIds the viewer has voted on. Kept out of POST_INCLUDE so we
 * don't pull every PollVote across every post — one batched query.
 */
export async function getViewerPollVotes(
  posts: { poll: { id: string } | null }[],
  viewerId: string | null,
): Promise<Record<string, string[]>> {
  if (!viewerId) return {};
  const pollIds = posts.map((p) => p.poll?.id).filter((x): x is string => !!x);
  if (pollIds.length === 0) return {};
  const rows = await db.pollVote.findMany({
    where: { pollId: { in: pollIds }, userId: viewerId },
    select: { pollId: true, optionId: true },
  });
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    if (!out[r.pollId]) out[r.pollId] = [];
    out[r.pollId].push(r.optionId);
  }
  return out;
}

function feedPostInclude() {
  return db.post.findFirst({ include: POST_INCLUDE });
}

export interface FeedOptions {
  viewerId?: string | null;
  cursor?: string | null;
  limit?: number;
}

export async function getFeed({ viewerId, cursor, limit = 20 }: FeedOptions) {
  if (!viewerId) {
    // Anonymous viewer — only public posts
    return db.post.findMany({
      where: { visibility: "PUBLIC" },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: POST_INCLUDE,
    });
  }

  // 1) Fetch the user's social graph (cheap; counts are bounded for v1)
  const [connections, follows] = await Promise.all([
    db.connection.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: viewerId }, { recipientId: viewerId }],
      },
      select: { requesterId: true, recipientId: true },
    }),
    db.follow.findMany({
      where: { followerId: viewerId },
      select: { followeeUserId: true, followeeCompanyId: true },
    }),
  ]);
  const connectionUserIds = new Set<string>();
  for (const c of connections) {
    connectionUserIds.add(c.requesterId === viewerId ? c.recipientId : c.requesterId);
  }
  const followedUserIds = new Set(follows.map((f) => f.followeeUserId).filter(Boolean) as string[]);
  const followedCompanyIds = new Set(follows.map((f) => f.followeeCompanyId).filter(Boolean) as string[]);

  // 2) Build the WHERE clause
  const orParts: Prisma.PostWhereInput[] = [
    // Own posts
    { authorId: viewerId },
    // Connections — both PUBLIC and CONNECTIONS
    ...(connectionUserIds.size > 0
      ? [{
          authorId: { in: [...connectionUserIds] },
          visibility: { in: ["PUBLIC", "CONNECTIONS"] as PostVisibility[] },
        }]
      : []),
    // Followed users — PUBLIC only
    ...(followedUserIds.size > 0
      ? [{
          authorId: { in: [...followedUserIds] },
          visibility: "PUBLIC" as const,
        }]
      : []),
    // Followed companies (any rep posting as that company)
    ...(followedCompanyIds.size > 0
      ? [{
          asCompanyId: { in: [...followedCompanyIds] },
          visibility: "PUBLIC" as const,
        }]
      : []),
  ];

  // Cold-start: if the user has no graph yet, fall back to recent PUBLIC posts
  if (connectionUserIds.size === 0 && followedUserIds.size === 0 && followedCompanyIds.size === 0) {
    orParts.push({
      visibility: "PUBLIC",
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    });
  }

  return db.post.findMany({
    where: { OR: orParts },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: POST_INCLUDE,
  });
}

/** Single-post hydrator with the same shape as feed items. */
export function getPost(id: string) {
  return db.post.findUnique({
    where: { id },
    include: {
      ...POST_INCLUDE,
      comments: {
        where: { parentId: null },
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: {
              id: true,
              candidateProfile: {
                select: { slug: true, firstName: true, lastName: true, profilePhotoUrl: true, headline: true },
              },
            },
          },
          replies: {
            orderBy: { createdAt: "asc" },
            include: {
              author: {
                select: {
                  id: true,
                  candidateProfile: {
                    select: { slug: true, firstName: true, lastName: true, profilePhotoUrl: true, headline: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

/** Hashtag feed — only public posts. */
export function getPostsByHashtag(tag: string, limit = 30) {
  return db.post.findMany({
    where: { hashtags: { has: tag.toLowerCase() }, visibility: "PUBLIC" },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: POST_INCLUDE,
  });
}

/**
 * Topic-driven feed. Pulls posts whose `hashtags` array overlaps
 * with any tag the viewer is subscribed to.
 *
 *   - Visibility: PUBLIC only. (CONNECTIONS posts are surfaced via
 *     the main /feed graph; "For you" is the topic surface.)
 *   - Backed by the GIN index on Post.hashtags (see scripts/setup-fts.sql);
 *     the `&&` array-overlap operator is fast even at 100k+ posts.
 *   - Returns `{ posts, subscribedCount }` so the caller can decide
 *     whether to render an empty-state CTA pointing at /topics.
 */
export async function getForYouFeed({
  viewerId,
  cursor,
  limit = 20,
}: {
  viewerId: string;
  cursor?: string | null;
  limit?: number;
}) {
  const subs = await db.hashtagSubscription.findMany({
    where: { userId: viewerId },
    select: { tag: true },
  });
  const tags = subs.map((s) => s.tag);
  if (tags.length === 0) {
    return { posts: [] as Awaited<ReturnType<typeof getPostsByHashtag>>, subscribedCount: 0 };
  }
  const posts = await db.post.findMany({
    where: { visibility: "PUBLIC", hashtags: { hasSome: tags } },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: POST_INCLUDE,
  });
  return { posts, subscribedCount: tags.length };
}

/** Suggested people to connect with — same EV domain, not already connected. */
export async function suggestConnections(viewerId: string, limit = 10) {
  const me = await db.candidateProfile.findUnique({
    where: { userId: viewerId },
    include: { evDomains: { include: { evDomain: true } } },
  });
  if (!me) return [];

  const domainIds = me.evDomains.map((d) => d.evDomainId);

  const existing = await db.connection.findMany({
    where: {
      OR: [{ requesterId: viewerId }, { recipientId: viewerId }],
    },
    select: { requesterId: true, recipientId: true },
  });
  const exclude = new Set<string>([viewerId]);
  for (const c of existing) {
    exclude.add(c.requesterId);
    exclude.add(c.recipientId);
  }

  return db.candidateProfile.findMany({
    where: {
      userId: { notIn: [...exclude] },
      cvVisibility: { in: ["EVERYONE", "EMPLOYERS_ONLY"] },
      ...(domainIds.length > 0 && {
        evDomains: { some: { evDomainId: { in: domainIds } } },
      }),
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
    include: {
      evDomains: { include: { evDomain: true } },
      user: { select: { id: true } },
    },
  });
}

/** Whether viewer is currently following a user. */
export async function isFollowingUser(viewerId: string, otherUserId: string): Promise<boolean> {
  const f = await db.follow.findUnique({
    where: { followerId_followeeUserId: { followerId: viewerId, followeeUserId: otherUserId } },
    select: { id: true },
  });
  return !!f;
}

/** Connection status between viewer and another user. */
export async function getConnectionStatus(viewerId: string, otherUserId: string): Promise<{
  status: "NONE" | "PENDING_OUT" | "PENDING_IN" | "ACCEPTED";
  connectionId?: string;
}> {
  if (viewerId === otherUserId) return { status: "ACCEPTED" };
  const c = await db.connection.findFirst({
    where: {
      OR: [
        { requesterId: viewerId, recipientId: otherUserId },
        { requesterId: otherUserId, recipientId: viewerId },
      ],
    },
    select: { id: true, status: true, requesterId: true },
  });
  if (!c) return { status: "NONE" };
  if (c.status === "ACCEPTED") return { status: "ACCEPTED", connectionId: c.id };
  if (c.status === "PENDING") {
    return {
      status: c.requesterId === viewerId ? "PENDING_OUT" : "PENDING_IN",
      connectionId: c.id,
    };
  }
  return { status: "NONE" };
}
