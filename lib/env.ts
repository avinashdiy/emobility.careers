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
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  S3_PUBLIC_URL: z.string().url(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("eMobility Careers <noreply@emobility.careers>"),

  // Amazon SES — preferred email transport in production. If both SES_* and
  // RESEND_API_KEY are set, SES wins (see lib/mail.ts). Region is required
  // because IAM-scoped keys are usually pinned to one region.
  AWS_SES_REGION: z.string().optional(),
  AWS_SES_ACCESS_KEY_ID: z.string().optional(),
  AWS_SES_SECRET_ACCESS_KEY: z.string().optional(),
  // Optional ARN for the configured SES sending identity used when sending
  // through a delegated configuration set (open-tracking, complaints, etc.).
  AWS_SES_CONFIGURATION_SET: z.string().optional(),

  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),
  MSG91_OTP_TEMPLATE_ID: z.string().optional(),
  MSG91_TXN_TEMPLATE_ID: z.string().optional(),

  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),

  SOKETI_APP_ID: z.string().default("emce"),
  SOKETI_APP_KEY: z.string().default("emce_pusher_key"),
  SOKETI_APP_SECRET: z.string().default("emce_pusher_secret"),
  NEXT_PUBLIC_SOKETI_HOST: z.string().default("localhost"),
  NEXT_PUBLIC_SOKETI_PORT: z.coerce.number().default(6001),
  NEXT_PUBLIC_SOKETI_KEY: z.string().default("emce_pusher_key"),

  DIYGURU_API_URL: z.string().url().default("https://campus.diyguru.com/api"),
  DIYGURU_API_KEY: z.string().optional(),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Sentry — optional. Wire @sentry/nextjs in instrumentation.ts to use this.
  // Until then, leaving it unset is fine — errors fall back to JSON logs.
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration. See .env.example.");
}

export const env = parsed.data;
export type Env = typeof env;
