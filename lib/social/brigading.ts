import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";

/**
 * Brigading-detection scan for the social feed. Run hourly by the
 * notification-maintenance worker tick. Flags posts (NOT auto-removes —
 * an admin still has to review on /admin/content?tab=suspicious) when:
 *
 *   1. SAME-AUTHOR LOYALTY — 3+ reactors on the same post who have
 *      ONLY ever reacted to this post's author.
 *
 *   2. SAME-IP-BLOCK — 3+ reactors on the same post whose signupIp
 *      shares a /24 prefix.
 *
 *   3. CO-CREATED — 3+ reactors on the same post whose User.createdAt
 *      timestamps cluster within 1 hour of each other.
 *
 * Each finding writes to AuditLog with action="post.suspected_brigading"
 * and meta describing which signal fired. The /admin/content?tab=suspicious
 * page reads these rows; admins decide whether to action.
 *
 * Cost: scans the last 7 days of reactions in batches. Cap of 200
 * posts per run keeps latency bounded — we run hourly so any genuine
 * brigading is caught within ~1 hour of starting.
 */

const SCAN_WINDOW_DAYS = 7;
const MIN_SUSPICIOUS_REACTORS = 3;
const COCREATION_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_POSTS_PER_RUN = 200;

export interface BrigadingFlag {
  postId: string;
  signal: "SAME_AUTHOR_LOYALTY" | "SAME_IP_BLOCK" | "COCREATED_ACCOUNTS";
  evidence: Record<string, unknown>;
}

/** Reduce an IP string like "203.0.113.45" or "2001:db8::abc" to its
    /24 (IPv4) or /48 (IPv6) prefix, used as a coarse "same network"
    bucket. Returns null for empty / unparseable input. */
function ipPrefix(ip: string | null | undefined): string | null {
  if (!ip) return null;
  if (ip.includes(":")) {
    // IPv6 — first 3 colon-separated groups (~/48).
    const parts = ip.split(":").slice(0, 3);
    return parts.length === 3 ? parts.join(":") : null;
  }
  // IPv4 — first 3 dot-separated octets (/24).
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  return parts.slice(0, 3).join(".");
}

export async function scanForBrigading(): Promise<{ flagged: number }> {
  const since = new Date(Date.now() - SCAN_WINDOW_DAYS * 86400_000);

  // Find candidate posts — any with ≥ MIN_SUSPICIOUS_REACTORS reactions
  // in the last week. Cheap on the existing index.
  const candidates = await db.$queryRaw<
    { post_id: string; n: bigint }[]
  >`
    SELECT "postId" AS post_id, COUNT(*)::bigint AS n
    FROM "PostReaction"
    WHERE "createdAt" >= ${since}
    GROUP BY "postId"
    HAVING COUNT(*) >= ${MIN_SUSPICIOUS_REACTORS}
    ORDER BY n DESC
    LIMIT ${MAX_POSTS_PER_RUN}
  `;
  if (candidates.length === 0) return { flagged: 0 };

  // Skip posts already flagged in the last 24h to avoid duplicate
  // entries cluttering the queue.
  const recentlyFlagged = await db.auditLog.findMany({
    where: {
      action: "post.suspected_brigading",
      entity: "Post",
      createdAt: { gte: new Date(Date.now() - 86400_000) },
    },
    select: { entityId: true },
  });
  const skipSet = new Set(recentlyFlagged.map((r) => r.entityId).filter(Boolean));

  let flagged = 0;
  for (const c of candidates) {
    if (skipSet.has(c.post_id)) continue;

    const post = await db.post.findUnique({
      where: { id: c.post_id },
      select: {
        id: true,
        authorId: true,
        reactions: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                createdAt: true,
                signupIp: true,
              },
            },
          },
        },
      },
    });
    if (!post) continue;

    const reactors = post.reactions
      .map((r) => r.user)
      .filter((u): u is NonNullable<typeof u> => Boolean(u));
    if (reactors.length < MIN_SUSPICIOUS_REACTORS) continue;

    const flags: BrigadingFlag[] = [];

    // 1. Same /24 IP block.
    const byPrefix = new Map<string, { userIds: string[] }>();
    for (const r of reactors) {
      const prefix = ipPrefix(r.signupIp);
      if (!prefix) continue;
      const bucket = byPrefix.get(prefix) ?? { userIds: [] };
      bucket.userIds.push(r.id);
      byPrefix.set(prefix, bucket);
    }
    for (const [prefix, bucket] of byPrefix) {
      if (bucket.userIds.length >= MIN_SUSPICIOUS_REACTORS) {
        flags.push({
          postId: post.id,
          signal: "SAME_IP_BLOCK",
          evidence: { prefix, count: bucket.userIds.length, userIds: bucket.userIds },
        });
        break;
      }
    }

    // 2. Co-created accounts (within 1h of each other).
    const sortedByCreation = reactors.slice().sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    let cocreatedCount = 1;
    let cocreatedStart = sortedByCreation[0]?.createdAt;
    let cocreatedIds: string[] = sortedByCreation[0] ? [sortedByCreation[0].id] : [];
    let bestCocreated = { count: 1, ids: [...cocreatedIds] };
    for (let i = 1; i < sortedByCreation.length; i++) {
      const cur = sortedByCreation[i];
      if (
        cocreatedStart &&
        cur.createdAt.getTime() - cocreatedStart.getTime() <= COCREATION_WINDOW_MS
      ) {
        cocreatedCount += 1;
        cocreatedIds.push(cur.id);
        if (cocreatedCount > bestCocreated.count) {
          bestCocreated = { count: cocreatedCount, ids: [...cocreatedIds] };
        }
      } else {
        cocreatedStart = cur.createdAt;
        cocreatedCount = 1;
        cocreatedIds = [cur.id];
      }
    }
    if (bestCocreated.count >= MIN_SUSPICIOUS_REACTORS) {
      flags.push({
        postId: post.id,
        signal: "COCREATED_ACCOUNTS",
        evidence: { count: bestCocreated.count, userIds: bestCocreated.ids },
      });
    }

    // 3. Same-author loyalty — reactors that have only ever reacted
    // to posts by THIS author. One COUNT-DISTINCT-author query per
    // reactor; we cap at 20 reactors per post to keep per-post cost
    // bounded. Real brigading rings have a small core loyal set anyway.
    const sample = reactors.slice(0, 20);
    const loyaltyChecks = await Promise.all(
      sample.map((r) =>
        db.postReaction
          .findMany({
            where: { userId: r.id },
            select: { post: { select: { authorId: true } } },
            distinct: ["postId"],
            take: 50,
          })
          .then((rows) => {
            const distinctAuthors = new Set(rows.map((rr) => rr.post.authorId));
            return {
              userId: r.id,
              loyalToOnlyOneAuthor:
                distinctAuthors.size === 1 && distinctAuthors.has(post.authorId),
            };
          }),
      ),
    );
    const loyalists = loyaltyChecks.filter((c) => c.loyalToOnlyOneAuthor);
    if (loyalists.length >= MIN_SUSPICIOUS_REACTORS) {
      flags.push({
        postId: post.id,
        signal: "SAME_AUTHOR_LOYALTY",
        evidence: { count: loyalists.length, userIds: loyalists.map((l) => l.userId) },
      });
    }

    // Write one audit row per signal fired. Admins reading the page
    // will see all signals on a single post in one place because the
    // page groups by entityId.
    for (const f of flags) {
      await audit({
        action: "post.suspected_brigading",
        entity: "Post",
        entityId: f.postId,
        meta: { signal: f.signal, ...f.evidence, status: "OPEN" },
      });
      flagged += 1;
    }
  }

  if (flagged > 0) {
    logger.info({ flagged }, "[brigading] flags written");
  }
  return { flagged };
}
