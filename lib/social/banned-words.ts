import { getSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";

/**
 * Auto-moderation against an admin-maintained banned-word list. Used
 * by the post + comment server actions before insert: if any banned
 * substring is present, we still create the row (so the user doesn't
 * lose their work) but mark visibility=PRIVATE and audit-log the
 * incident as `post.flagged` so it shows up in /admin/post-reports.
 *
 * Substring matching is case-insensitive, deliberately greedy, and
 * doesn't try to handle leetspeak — the goal is fast triage of the
 * obvious 90%, not a perfect filter. Admins can tighten a flagged
 * post via the existing moderation queue.
 */

let cache: { words: string[]; loadedAt: number } = { words: [], loadedAt: 0 };
const CACHE_TTL_MS = 60_000;

async function getBannedWords(): Promise<string[]> {
  if (Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.words;
  const raw = await getSetting("social.banned_words", "");
  const words = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 1);
  cache = { words, loadedAt: Date.now() };
  return words;
}

/** Return the first matched banned word, or null if the body is clean. */
export async function findBannedWord(body: string): Promise<string | null> {
  const words = await getBannedWords();
  if (words.length === 0) return null;
  const lower = body.toLowerCase();
  for (const w of words) {
    if (lower.includes(w)) return w;
  }
  return null;
}

/**
 * Auto-flag a post or comment in the same shape the post-reports
 * queue expects. Logs an AuditLog row with action="post.flagged" and
 * meta.status=OPEN so /admin/post-reports surfaces it without any
 * extra wiring.
 */
export async function autoFlagContent(opts: {
  entity: "Post" | "Comment";
  entityId: string;
  authorId: string;
  matchedWord: string;
  body: string;
}): Promise<void> {
  await audit({
    action: "post.flagged",
    entity: opts.entity,
    entityId: opts.entityId,
    meta: {
      reason: "BANNED_WORD",
      details: `Auto-flagged: matched banned word "${opts.matchedWord}".`,
      authorId: opts.authorId,
      status: "OPEN",
      // Keep a snippet for the moderator's context — full body lives
      // on the row itself, but the snippet shows in the queue list
      // without an extra fetch.
      snippet: opts.body.slice(0, 160),
    },
  });
}

/** Bust the in-process cache. Call after admin updates the setting
    so the next request picks up the new list immediately rather
    than waiting up to 60s. */
export function invalidateBannedWordsCache() {
  cache = { words: [], loadedAt: 0 };
}
