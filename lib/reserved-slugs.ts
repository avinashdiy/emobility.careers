/**
 * Reserved usernames — prevent candidate slugs from colliding with platform
 * routes, brand handles, or system-y names.
 *
 * Next's static segments take priority over `[username]`, so existing routes
 * like /jobs would win even if a candidate's slug was "jobs". But:
 *   - Reserving them prevents confusing URLs (a "jobs" candidate is unfindable)
 *   - Future routes shouldn't be silently shadowed by an old candidate slug
 *   - Some names (admin, support) shouldn't be claimable for trust reasons
 */

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // Platform routes (top-level)
  "jobs", "job", "companies", "company", "c", "admin", "employer", "employers",
  "me", "candidate", "candidates", "user", "users", "team", "teams", "pipeline",
  "fair", "fairs",
  "article", "articles",
  "signin", "signup", "signout", "login", "logout", "register",
  "forgot-password", "reset-password", "verify-email", "verify",
  "onboarding", "invite", "invites",
  "about", "diyguru", "contact", "privacy", "terms", "legal", "help", "support",
  "403", "404", "500", "error",

  // Special / system
  "api", "static", "assets", "public", "_next", "favicon.ico",
  "sitemap.xml", "sitemap", "robots.txt", "robots", "manifest.json", "manifest",
  "opengraph-image", "og", "twitter-image",

  // Reserved for future
  "billing", "settings", "search", "explore", "feed", "messages", "inbox",
  "notifications", "preferences", "account", "profile", "dashboard",
  "alerts", "saved", "applications", "interviews", "matches", "moderation",
  "reports", "analytics", "audit", "audit-log", "broadcasts", "skills",
  "campus", "campuses", "events", "blog", "news",

  // Trust / brand
  "root", "system", "official", "verified", "moderator", "mod", "staff",
  "emobility", "emobilitycareers", "diy", "diyguru-official",

  // Falsy / weird strings
  "null", "undefined", "true", "false", "nan", "void",
]);

export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

/** Lowercase, normalise dashes, strip non-allowed chars. */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export type SlugReason = "ok" | "too-short" | "too-long" | "format" | "reserved";

export function checkSlug(input: string): SlugReason {
  const s = input.trim().toLowerCase();
  if (s.length < 3) return "too-short";
  if (s.length > 40) return "too-long";
  if (!SLUG_REGEX.test(s)) return "format";
  if (RESERVED_SLUGS.has(s)) return "reserved";
  return "ok";
}
