import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { SiteSettingType } from "@prisma/client";

/**
 * Admin-editable platform settings. Keyed strings backed by the SiteSetting
 * table. Reads go through a tiny in-memory cache so that the hot path (every
 * page render that wants the site name) doesn't hit Postgres each time;
 * writes invalidate the cache (single process — multi-instance deployments
 * should set `SETTINGS_TTL_MS` short, ~30s, since cache invalidation isn't
 * cross-instance for now).
 *
 * Adding a new setting:
 *   1. Add a `SETTING_DEFINITIONS` entry below with key, default, type, etc.
 *   2. Read it via `getSetting("site.name")` from any server-side caller.
 *
 * That's it — no Prisma migration needed; the row is created on first save.
 */

export interface SettingDefinition {
  key: string;
  category:
    | "identity"
    | "email"
    | "seo"
    | "legal"
    | "feature"
    | "system"
    | "payments"
    | "social"
    | "auth";
  type: SiteSettingType;
  label: string;
  description?: string;
  default: string;
  /** Set to true to mark the value as sensitive (masked in the UI). */
  sensitive?: boolean;
}

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  // ─── Identity ───────────────────────────────────────────────
  { key: "site.name", category: "identity", type: "STRING", label: "Site name", default: "eMobility Careers", description: "Shown in browser tabs, emails, and OG metadata." },
  { key: "site.tagline", category: "identity", type: "STRING", label: "Tagline", default: "EV careers, supercharged.", description: "One-liner shown on the landing page hero and meta description." },
  { key: "site.support_email", category: "identity", type: "EMAIL", label: "Support email", default: "support@emobility.careers", description: "Public-facing email for help requests. Surfaced in the footer." },
  { key: "site.brand_color", category: "identity", type: "STRING", label: "Primary brand colour", default: "#374a47", description: "Hex colour used in dark theme accents and emails." },

  // ─── Email ──────────────────────────────────────────────────
  { key: "email.from_name", category: "email", type: "STRING", label: "Email \"from\" name", default: "eMobility Careers", description: "Sender name on transactional emails." },
  { key: "email.signature", category: "email", type: "TEXT", label: "Email signature", default: "—\nThe eMobility Careers team", description: "Appended to every transactional email body." },
  { key: "email.reply_to", category: "email", type: "EMAIL", label: "Reply-To address", default: "", description: "Where replies to platform emails are routed. Leave empty to use FROM." },

  // ─── SEO ────────────────────────────────────────────────────
  { key: "seo.meta_description", category: "seo", type: "TEXT", label: "Default meta description", default: "Find EV jobs, mentors, and competitions across India's electric mobility ecosystem.", description: "Used on every page that doesn't define its own description. Aim for 140–160 characters." },
  { key: "seo.keywords", category: "seo", type: "TEXT", label: "Meta keywords", default: "EV jobs India, electric vehicle careers, battery jobs, charging infrastructure jobs, EV technician, EV engineer, DIYguru", description: "Comma-separated. Google ignores these; Bing and some India-focused engines still parse them." },
  { key: "seo.default_og_image", category: "seo", type: "URL", label: "Default OG image URL", default: "", description: "Override the auto-generated home OG image. Leave empty to use the dynamic /opengraph-image." },
  { key: "seo.twitter_handle", category: "seo", type: "STRING", label: "Twitter / X handle", default: "", description: "Without the @. Used for the twitter:creator card metadata." },
  { key: "seo.robots_index", category: "seo", type: "BOOLEAN", label: "Allow search engine indexing", default: "true", description: "Turn OFF on staging or during a soft launch. Affects every page via the global robots meta." },
  { key: "seo.google_verification", category: "seo", type: "STRING", label: "Google Search Console verification token", default: "", description: "Optional — overrides the GOOGLE_SITE_VERIFICATION env var when set." },
  { key: "seo.bing_verification", category: "seo", type: "STRING", label: "Bing Webmaster verification token", default: "", description: "Optional — overrides the BING_SITE_VERIFICATION env var when set." },

  // ─── Legal ──────────────────────────────────────────────────
  { key: "legal.terms_url", category: "legal", type: "URL", label: "Terms of Service URL", default: "/terms" },
  { key: "legal.privacy_url", category: "legal", type: "URL", label: "Privacy Policy URL", default: "/privacy" },
  { key: "legal.cookies_url", category: "legal", type: "URL", label: "Cookie Policy URL", default: "/cookies" },

  // ─── Features (kill switches) ───────────────────────────────
  { key: "feature.social_enabled", category: "feature", type: "BOOLEAN", label: "Social feed", default: "true", description: "Hides /feed, posts UI, hashtags, and reactions when off." },
  { key: "feature.mentorship_enabled", category: "feature", type: "BOOLEAN", label: "Mentorship", default: "true", description: "Hides /mentors and disables booking + payouts when off." },
  { key: "feature.competitions_enabled", category: "feature", type: "BOOLEAN", label: "Competitions", default: "true", description: "Hides /competitions and disables registration when off." },
  { key: "feature.payments_enabled", category: "feature", type: "BOOLEAN", label: "Razorpay payments", default: "true", description: "Forces all paid mentorship sessions to free when off." },

  // ─── Payments ───────────────────────────────────────────────
  { key: "payments.platform_fee_bps", category: "payments", type: "NUMBER", label: "Platform fee (basis points)", default: "0", description: "0–10000. We charge 0 by default; flip when monetisation is on." },
  { key: "payments.currency_default", category: "payments", type: "STRING", label: "Default currency", default: "INR" },

  // ─── Social moderation ──────────────────────────────────────
  { key: "social.posts_per_user_per_day", category: "social", type: "NUMBER", label: "Max posts per user per day", default: "20" },
  { key: "social.min_post_length", category: "social", type: "NUMBER", label: "Minimum post length", default: "10" },

  // ─── System ─────────────────────────────────────────────────
  { key: "system.maintenance_mode", category: "system", type: "BOOLEAN", label: "Maintenance mode", default: "false", description: "Shows the maintenance page to non-admin visitors and blocks new sign-ups." },
  { key: "system.maintenance_message", category: "system", type: "TEXT", label: "Maintenance message", default: "We're doing some maintenance. We'll be back shortly." },
  { key: "system.welcome_banner", category: "system", type: "TEXT", label: "Welcome banner", default: "", description: "Optional banner shown at the top of the home page. Leave empty to hide." },
  { key: "system.welcome_banner_url", category: "system", type: "URL", label: "Welcome banner link", default: "" },

  // ─── Auth (OAuth provider credentials) ─────────────────────
  // These let an admin paste OAuth credentials in /admin/settings/auth
  // without redeploying. lib/auth.ts reads them at sign-in time and
  // falls back to the matching AUTH_GOOGLE_* / AUTH_LINKEDIN_*
  // environment variables when they're empty — so a fresh deploy
  // with env-only config keeps working until an admin overrides.
  { key: "auth.google.client_id", category: "auth", type: "STRING", label: "Google Client ID", default: "", description: "From Google Cloud Console → APIs & Services → Credentials. Looks like 1234-abc.apps.googleusercontent.com." },
  { key: "auth.google.client_secret", category: "auth", type: "STRING", label: "Google Client Secret", default: "", sensitive: true, description: "From the same OAuth client in Google Cloud Console. Treat as a password — never commit it." },
  { key: "auth.linkedin.client_id", category: "auth", type: "STRING", label: "LinkedIn Client ID", default: "", description: "From linkedin.com/developers → your app → Auth tab → Application credentials." },
  { key: "auth.linkedin.client_secret", category: "auth", type: "STRING", label: "LinkedIn Client Secret", default: "", sensitive: true, description: "From the same LinkedIn developer app. Rotates if exposed; copy carefully." },
];

const DEFINITIONS_BY_KEY = new Map(SETTING_DEFINITIONS.map((d) => [d.key, d]));

const TTL_MS = Number(process.env.SETTINGS_TTL_MS ?? 30_000);
let cache: { values: Map<string, string>; expires: number } | null = null;

async function loadAll(): Promise<Map<string, string>> {
  if (cache && cache.expires > Date.now()) return cache.values;
  const rows = await db.siteSetting.findMany({ select: { key: true, value: true } }).catch((err) => {
    logger.warn({ err }, "[settings] read failed; falling back to defaults");
    return [];
  });
  const map = new Map<string, string>();
  for (const def of SETTING_DEFINITIONS) map.set(def.key, def.default);
  for (const r of rows) map.set(r.key, r.value);
  cache = { values: map, expires: Date.now() + TTL_MS };
  return map;
}

export function invalidateSettingsCache() {
  cache = null;
}

export async function getSetting(key: string, fallback?: string): Promise<string> {
  const def = DEFINITIONS_BY_KEY.get(key);
  const map = await loadAll();
  return map.get(key) ?? fallback ?? def?.default ?? "";
}

export async function getBooleanSetting(key: string): Promise<boolean> {
  const v = await getSetting(key);
  return v === "true" || v === "1";
}

export async function getNumberSetting(key: string): Promise<number> {
  const v = await getSetting(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const map = await loadAll();
  return Object.fromEntries(map);
}

export async function setSettings(
  updates: Record<string, string>,
  adminUserId: string,
): Promise<void> {
  const operations = Object.entries(updates).map(([key, value]) => {
    const def = DEFINITIONS_BY_KEY.get(key);
    if (!def) return null;
    return db.siteSetting.upsert({
      where: { key },
      create: {
        key,
        value,
        type: def.type,
        category: def.category,
        label: def.label,
        description: def.description,
        updatedById: adminUserId,
      },
      update: {
        value,
        updatedById: adminUserId,
      },
    });
  });
  await db.$transaction(operations.filter((op): op is NonNullable<typeof op> => Boolean(op)));
  invalidateSettingsCache();
}

/** Convenience: load only a subset (useful for layout / metadata calls). */
export async function getSettings<K extends string>(...keys: K[]): Promise<Record<K, string>> {
  const map = await loadAll();
  return Object.fromEntries(keys.map((k) => [k, map.get(k) ?? ""])) as Record<K, string>;
}
