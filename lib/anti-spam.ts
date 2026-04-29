import { headers } from "next/headers";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

/**
 * Anti-spam helpers shared across signup, magic-link, password reset, and
 * any other public-facing form that creates state we don't want bots
 * polluting (job applications, mentor bookings, etc.).
 *
 * The helpers are deliberately small + composable — each one is one
 * defence in a stack. Anti-spam is a layered problem: any single check is
 * trivial to defeat, but a combination of disposable-email block +
 * IP rate-limit + honeypot + timing + Turnstile is enough that real bots
 * give up before they break in.
 */

// ─── Client IP / UA detection ──────────────────────────────

/**
 * Best-effort client IP. Reads x-forwarded-for first (Caddy / Cloudflare /
 * any HTTPS reverse proxy will set this), falls back to x-real-ip, and
 * finally returns null if neither is present (e.g. local dev without a
 * proxy). The first IP in x-forwarded-for is the original client; the
 * rest are intermediate proxies.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") || h.get("cf-connecting-ip") || null;
}

export async function clientUserAgent(): Promise<string | null> {
  const h = await headers();
  return h.get("user-agent") || null;
}

// ─── Disposable email blocklist ────────────────────────────

/**
 * Common disposable-email domains. Not exhaustive — there are thousands —
 * but covers the providers responsible for the vast majority of throwaway
 * signups. We keep this in code rather than the DB so it ships with
 * deploys; admins who want to extend it open a PR.
 *
 * Source: amalgamated from Unicode CLDR-style public lists (mailinator,
 * tempmail, 10minutemail, yopmail, guerrilla, trashmail, fake-mail-generator,
 * etc.) — last refresh 2025-Q1.
 */
const DISPOSABLE_DOMAINS = new Set([
  "0-mail.com", "0815.ru", "10mail.org", "10minutemail.com", "10minutemail.net",
  "20minutemail.com", "33mail.com", "anonbox.net", "anonymbox.com",
  "boximail.com", "burnermail.io", "byom.de",
  "deadaddress.com", "deadfake.com", "discardmail.com", "discardmail.de",
  "dispostable.com", "dropmail.me",
  "emailfake.com", "emailondeck.com", "emailtemporanea.com",
  "fakeinbox.com", "fakemail.fr", "fakeinformation.com", "fake-mail.net",
  "fakemailgenerator.com", "fastmail.fm",
  "getairmail.com", "getnada.com", "guerrillamail.biz", "guerrillamail.com",
  "guerrillamail.de", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com",
  "harakirimail.com",
  "incognitomail.com", "incognitomail.net",
  "jetable.org",
  "mailcatch.com", "maildrop.cc", "mailexpire.com", "mailfa.tk", "mailforspam.com",
  "mailinator.com", "mailinator.net", "mailinator.org", "mailinator2.com",
  "mailmetrash.com", "mailmoat.com", "mailnesia.com", "mailnull.com",
  "mailtothis.com", "mintemail.com", "moakt.com", "mvrht.net", "mytrashmail.com",
  "nada.email", "no-spam.ws", "noclickemail.com", "nomail.xl.cx",
  "objectmail.com", "obobbo.com", "onewaymail.com", "outmail.win",
  "pookmail.com",
  "rcpt.at", "rmqkr.net",
  "sharklasers.com", "shitmail.me", "smashmail.de", "spam.la", "spamavert.com",
  "spambob.com", "spambog.com", "spambog.de", "spambog.ru", "spambox.us",
  "spamfree24.org", "spamgourmet.com", "spamhereplease.com", "spaminator.de",
  "spamspot.com", "spamthis.co.uk", "spamthisplease.com",
  "tempemail.net", "tempinbox.com", "tempmail.io", "tempmail.net", "tempmail.org",
  "tempmaildemand.com", "tempmail-plus.com", "tempr.email", "throwam.com",
  "throwawaymail.com", "trashmail.com", "trashmail.de", "trashmail.io", "trashmail.me",
  "trashmail.net", "trashmail.ws",
  "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org",
  "yopmail.com", "yopmail.fr", "yopmail.net",
  "zehnminutenmail.de", "zoemail.org",
]);

/** Sub-string patterns to flag domains the explicit list might miss. */
const SUSPICIOUS_PATTERNS = [
  /^temp[a-z]*mail/i,
  /^trash[a-z]*mail/i,
  /^fake[a-z]*mail/i,
  /^throw[a-z]*mail/i,
  /^minute[a-z]*mail/i,
  /^discard/i,
  /^anonymous/i,
  /\.tk$/i,    // free TLDs heavily abused for throwaways
  /\.ml$/i,
  /\.ga$/i,
  /\.cf$/i,
];

export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  return SUSPICIOUS_PATTERNS.some((re) => re.test(domain));
}

// ─── Spammy-name heuristic ─────────────────────────────────

/**
 * Detect names that are almost certainly spam. Real names can be unusual
 * — we're conservative here to avoid blocking legitimate signups. Only
 * flag patterns no human would type:
 *
 *   - 30+ chars with no spaces (random keyboard mash)
 *   - 4+ digits in the name
 *   - URLs / @ symbols (prefilled marketing junk)
 */
export function looksLikeSpamName(name: string): boolean {
  const n = name.trim();
  if (n.length === 0) return true;
  if (n.length >= 30 && !n.includes(" ")) return true;
  const digits = (n.match(/\d/g) ?? []).length;
  if (digits >= 4) return true;
  if (/https?:\/\/|www\.|\.(com|net|org|ru|biz)\b|@/i.test(n)) return true;
  return false;
}

// ─── Form-timing + honeypot ────────────────────────────────

/**
 * Honeypot field check. Forms include a hidden input that real users
 * never see (off-screen + tabIndex={-1} + autocomplete="off"). Bots that
 * blindly fill every field will set it; humans never will.
 *
 * The form passes the field value here; any non-empty string = bot.
 */
export function honeypotTriggered(value: FormDataEntryValue | null): boolean {
  if (typeof value !== "string") return false;
  return value.trim().length > 0;
}

/**
 * Form-fill timing check. Real users take at least ~1.2s between page
 * load and submit (just to read fields + tab through). Bots that script
 * a POST submit in milliseconds. The form embeds `startedAt` as a
 * hidden timestamp and we check the delta server-side.
 *
 * Returns true if the timing is suspiciously fast.
 */
export function tooFast(startedAt: FormDataEntryValue | null, minMs = 1200): boolean {
  if (typeof startedAt !== "string") return false; // missing field — fail open, other defences catch it
  const t = parseInt(startedAt, 10);
  if (!Number.isFinite(t)) return false;
  const elapsed = Date.now() - t;
  if (elapsed < 0) return true;        // timestamp in future — definitely tampered
  if (elapsed < minMs) return true;
  return false;
}

// ─── Cloudflare Turnstile (CAPTCHA) ────────────────────────

/**
 * Cloudflare Turnstile is a free, privacy-friendly CAPTCHA alternative.
 * Wire it in by setting TURNSTILE_SECRET_KEY (server) +
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY (client). When unset, this helper is a
 * no-op (returns true) so dev environments don't get blocked.
 *
 * Reference: https://developers.cloudflare.com/turnstile/
 */
export async function verifyTurnstile(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // Turnstile not configured — fail open
  if (!token || typeof token !== "string") return false;

  try {
    const ip = await clientIp();
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!r.ok) {
      logger.warn({ status: r.status }, "[anti-spam] Turnstile verify HTTP error");
      return false;
    }
    const json = (await r.json()) as { success: boolean; "error-codes"?: string[] };
    if (!json.success) {
      logger.warn({ codes: json["error-codes"] }, "[anti-spam] Turnstile verify rejected");
    }
    return !!json.success;
  } catch (err) {
    logger.warn({ err }, "[anti-spam] Turnstile verify threw");
    return false;
  }
}

/** True when Turnstile is configured. Used to render the widget client-side. */
export const turnstileEnabled = !!process.env.TURNSTILE_SECRET_KEY;
export const turnstilePublicKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null;

// ─── Email-verification gate ───────────────────────────────

/**
 * Throw a controlled error if the current user hasn't verified their email
 * yet. Use this on actions that we don't want unverified accounts to
 * perform — posting, messaging, connecting, applying — to slow down spam
 * signups even if every other defence above is bypassed.
 *
 * OAuth-created users (Google / LinkedIn) get emailVerifiedAt set by the
 * adapter automatically. Credentials + magic-link users have to click the
 * verification email first.
 */
export class EmailNotVerifiedError extends Error {
  code = "EMAIL_NOT_VERIFIED";
  constructor() {
    super("Verify your email before doing this. Check your inbox for the link.");
  }
}

export async function requireEmailVerified(userId: string): Promise<void> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true, role: true },
  });
  if (!u) throw new EmailNotVerifiedError();
  // Admins are exempt — they're vetted by us before the role flag flips.
  if (u.role === "ADMIN") return;
  if (!u.emailVerifiedAt) throw new EmailNotVerifiedError();
}

// Suppress unused-import error in build pipelines when env happens to be
// imported elsewhere first; keep the import for symmetry with other
// modules that read TURNSTILE_* in the future.
void env;
