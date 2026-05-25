import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_NAME: z.string().default("eMobility Careers"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url().optional(),
  AUTH_TRUST_HOST: z.coerce.boolean().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_LINKEDIN_ID: z.string().optional(),
  AUTH_LINKEDIN_SECRET: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL_PARSER: z.string().default("gpt-4o-mini"),
  OPENAI_MODEL_RERANK: z.string().default("gpt-4o"),
  OPENAI_MODEL_EMBEDDING: z.string().default("text-embedding-3-large"),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET_RESUMES: z.string().default("emce-resumes"),
  S3_BUCKET_AVATARS: z.string().default("emce-avatars"),
  S3_BUCKET_LOGOS: z.string().default("emce-logos"),
  S3_BUCKET_DOCS: z.string().default("emce-docs"),
  // Public bucket for post attachments + event covers + any other
  // <img src=...>-rendered media. Split out from `docs` because docs
  // also stores Aadhar uploads and GDPR exports — both of which MUST
  // stay private. Mixing public and private prefixes in one bucket
  // is fragile (one regex slip and you leak ID docs).
  S3_BUCKET_POSTS: z.string().default("emce-posts"),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  S3_PUBLIC_URL: z.string().url(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("eMobility Careers <noreply@emobility.careers>"),
  /// Bulk-mail "from" — used for digests, broadcasts, notification fan-outs.
  /// Separate identity so a complaint-rate suppression on the bulk lane
  /// can't kill the transactional lane (verification emails, magic-link
  /// sign-in, password reset). If unset, falls back to EMAIL_FROM (single
  /// identity — fine for dev / small deploys).
  EMAIL_FROM_BULK: z.string().default("eMobility Careers <digest@emobility.careers>"),

  // Amazon SES — preferred email transport in production. If both SES_* and
  // RESEND_API_KEY are set, SES wins (see lib/mail.ts). Region is required
  // because IAM-scoped keys are usually pinned to one region.
  AWS_SES_REGION: z.string().optional(),
  AWS_SES_ACCESS_KEY_ID: z.string().optional(),
  AWS_SES_SECRET_ACCESS_KEY: z.string().optional(),
  // Two SES configuration sets — one for transactional, one for bulk.
  // SES tracks bounce + complaint rates per configuration set, and the
  // bulk → suppression policy is set on its own set. Keeping them
  // separate stops a bad digest run (high complaint rate from a poorly
  // segmented broadcast) from suppressing the verification-email lane.
  // When neither is set, sends use SES "default" sender behaviour.
  AWS_SES_CONFIGURATION_SET: z.string().optional(),               // legacy / shared
  AWS_SES_CONFIGURATION_SET_TRANSACTIONAL: z.string().optional(),
  AWS_SES_CONFIGURATION_SET_BULK: z.string().optional(),

  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),
  MSG91_OTP_TEMPLATE_ID: z.string().optional(),
  MSG91_TXN_TEMPLATE_ID: z.string().optional(),

  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  // Pre-approved Meta Business "utility" template name for the daily
  // digest. Must be approved in WhatsApp Manager before the worker can
  // send (Cloud API rejects free-form messages outside the 24h customer-
  // care window). The template body should expose 5 placeholders for the
  // rendered job lines + an unsubscribe link.
  WHATSAPP_DIGEST_TEMPLATE: z.string().default("ev_jobs_daily_digest"),
  WHATSAPP_DIGEST_LANGUAGE: z.string().default("en"),

  SOKETI_APP_ID: z.string().default("emce"),
  SOKETI_APP_KEY: z.string().default("emce_pusher_key"),
  SOKETI_APP_SECRET: z.string().default("emce_pusher_secret"),
  NEXT_PUBLIC_SOKETI_HOST: z.string().default("localhost"),
  NEXT_PUBLIC_SOKETI_PORT: z.coerce.number().default(6001),
  NEXT_PUBLIC_SOKETI_KEY: z.string().default("emce_pusher_key"),
  // TLS (WSS) toggle for the BROWSER's Pusher connection. Defaults
  // false for local dev (Soketi runs on plain ws://localhost:6001),
  // production sets it to "true" so the page can dial wss://
  // realtime.emobility.careers:443 — must be true whenever the page
  // itself loads over HTTPS, otherwise Chrome blocks the mixed
  // ws:// upgrade. Coerced from a string because env vars are
  // strings; "true"/"1" → true, anything else → false.
  NEXT_PUBLIC_SOKETI_TLS: z
    .string()
    .default("false")
    .transform((s) => s === "true" || s === "1"),

  DIYGURU_API_URL: z.string().url().default("https://campus.diyguru.com/api"),
  DIYGURU_API_KEY: z.string().optional(),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Sentry — optional. Wire @sentry/nextjs in instrumentation.ts to use this.
  // Until then, leaving it unset is fine — errors fall back to JSON logs.
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  // ─── Wave C #16 Vernacular AI Calling Agent ─────────────────
  // Provider creds. Default provider is Exotel (India-focused CPaaS);
  // the noop provider takes over when these are unset, returning a
  // PROVIDER_NOT_CONFIGURED error from any dial attempt. Twilio
  // equivalents (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN) can be added
  // alongside once the provider abstraction is generalised.
  EXOTEL_SID: z.string().optional(),
  EXOTEL_TOKEN: z.string().optional(),
  EXOTEL_CALLER_ID: z.string().optional(),    // outbound number shown to candidate
  EXOTEL_WEBHOOK_BASE: z.string().url().optional(), // public URL Exotel posts to

  // ─── Logo.dev — company logo fetcher ─────────────────────────
  // Public token from logo.dev (free tier, requires attribution per
  // ToS). The token shapes the URL into:
  //   https://img.logo.dev/<domain>?token=<token>&size=400&format=png
  // Used by the company-enrichment worker. Without it, the worker
  // skips the logo fetch and the proposal is descriptions-only.
  LOGO_DEV_TOKEN: z.string().optional(),

  // ─── emobility.academy integration (Phase 1.x) ──────────────
  // Shared secrets + URLs for the cross-app integration. All 5 are
  // REQUIRED in production — the matching wire-up on the academy
  // side already ships with these values configured.
  //
  // HANDOFF_TOKEN_SECRET — HS256 secret for the cross-domain SSO
  // JWT (Phase 1.4). Must be byte-identical on both sides; rotate
  // on both at once with `openssl rand -base64 32`. Distinct from
  // AUTH_SECRET — that one stays scoped to careers' Auth.js session.
  HANDOFF_TOKEN_SECRET: z.string().min(32),
  // Public origin of the academy app for the issue-handoff redirect
  // target. After M3 the en. subdomain collapses to bare apex.
  ACADEMY_PUBLIC_URL: z.string().url(),
  // HMAC secret for the inbound POST /api/v1/sync/academy webhook
  // (Phase 1.10). Same byte value as ACADEMY_API_SECRET below —
  // two names, one rotation. See careers-patch/README.md.
  SYNC_WEBHOOK_SECRET: z.string().min(32),
  // HMAC secret for the outbound transcript fetcher (Phase 1.11) —
  // careers → academy. Byte-identical to SYNC_WEBHOOK_SECRET; kept
  // as a separate name purely for readability at call sites.
  ACADEMY_API_SECRET: z.string().min(32),
  // Internal URL for the transcript pull. Both apps live on the
  // same Hetzner box; production points at the localhost port.
  // NO default — matches the DATABASE_URL / REDIS_URL / S3_* pattern
  // for intra-cluster infrastructure URLs. Silently defaulting to
  // localhost on a production .env miss would mask config drift
  // (every transcript request would 404 against a non-existent
  // service and the profile section would just go missing).
  ACADEMY_API_URL: z.string().url(),
  // Shared secret for the inbound POST /api/webhooks/academy-placement
  // webhook (B5b placement integration). Byte-identical value lives in
  // academy's ecosystem.config.js as the same name. Required ≥32 chars
  // to keep the secret-search space large; `openssl rand -hex 32`
  // produces a 64-char hex string which satisfies it.
  ACADEMY_PLACEMENT_WEBHOOK_SECRET: z.string().min(32),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration. See .env.example.");
}

export const env = parsed.data;
export type Env = typeof env;
