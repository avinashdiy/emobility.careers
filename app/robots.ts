import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  // Public surfaces every crawler is welcome to walk. Listing
  // explicitly (rather than just relying on the implicit Allow that
  // comes from omission) means the AI bot allowlist below has a
  // stable referent for what we actually want indexed.
  const PUBLIC_ALLOW = [
    "/",
    "/jobs",
    "/jobs/",
    "/job/",
    "/companies",
    "/company/",
    "/posts/",
    "/tag/",
    "/feed",
    "/people",
    "/mentors",
    "/mentor/",
    "/competitions",
    "/pulse",
    "/salaries",
    "/about",
    "/privacy",
    "/terms",
  ];
  // Non-public — under no circumstances do we want these crawled.
  // Includes auth-only surfaces, admin tooling, internal API.
  const PRIVATE_DISALLOW = [
    "/api/",
    "/admin/",
    "/employer/",
    "/me/",
    "/onboarding/",
    "/tpo",
    "/403",
  ];

  return {
    rules: [
      // Default crawlers (Googlebot, Bingbot, DuckDuckBot, etc.).
      {
        userAgent: "*",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      // ─── AI / LLM crawlers — explicit allowlist ───────────────
      // Each major AI product runs a distinct user-agent. We allow
      // the same public surface as Googlebot so our Q&A threads can
      // surface in ChatGPT / Claude / Perplexity answers and Google
      // AI Overviews. The expectation is symmetric: they index our
      // content, users following the citation come back here.
      //
      // To opt out of any specific bot later, change `allow` to an
      // empty array and disallow `/`.
      {
        // OpenAI search-result discovery (powers ChatGPT browsing
        // citations). Does NOT train on the content — that's GPTBot.
        userAgent: "OAI-SearchBot",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        // OpenAI training data crawler. We allow it on public surfaces
        // so our copy contributes to the next-gen models' answer
        // quality on EV-careers questions.
        userAgent: "GPTBot",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        // Older OpenAI ChatGPT plug-in user-agent — still seen.
        userAgent: "ChatGPT-User",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        // Anthropic's web-fetch user-agent (used by Claude when a user
        // asks it to read a URL). Powers our citations inside Claude.
        userAgent: "Claude-Web",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        // Anthropic's training-data crawler.
        userAgent: "ClaudeBot",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        // Anthropic's user-agent search crawler (Claude in browse mode).
        userAgent: "anthropic-ai",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        // Perplexity's main web crawler — surfaces our threads in
        // perplexity.ai answers with citations.
        userAgent: "PerplexityBot",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        // Google's separate opt-in for Gemini / AI Overviews. Distinct
        // from regular Googlebot — sites can allow indexing in classic
        // search but block AI features (or vice versa).
        userAgent: "Google-Extended",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        // Common Crawl — the open dataset many open-source models
        // train on. Allowing helps EV-careers content show up across
        // the broader AI ecosystem.
        userAgent: "CCBot",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        // Apple's web crawler (powers Apple Intelligence + Siri
        // suggestions). Increasingly important on iOS.
        userAgent: "Applebot-Extended",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        // Bytedance's training crawler — relevant for the Indian /
        // SEA market and TikTok-adjacent search surfaces.
        userAgent: "Bytespider",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
      {
        // Meta's AI crawler (powers Meta AI on Instagram/WhatsApp).
        userAgent: "Meta-ExternalAgent",
        allow: PUBLIC_ALLOW,
        disallow: PRIVATE_DISALLOW,
      },
    ],
    sitemap: [
      `${base}/sitemap_index.xml`,
      `${base}/sitemap.xml`,
      `${base}/sitemap-jobs.xml`,
    ],
    host: base,
  };
}
