import { env } from "@/lib/env";

/**
 * `/llms.txt` — emerging convention (proposed by Jeremy Howard, 2024)
 * for telling AI crawlers what's worth indexing on a site. Like
 * robots.txt but oriented at LLM-readable summary content rather
 * than crawl rules.
 *
 * Spec: https://llmstxt.org. Format is markdown:
 *   # site name
 *   > short site summary
 *   ## section
 *   - [page title](/path): one-line description
 *
 * AI engines that read this skip directly to the highest-value
 * surfaces instead of crawling our entire DOM. Reduces our load AND
 * surfaces the right pages.
 */
export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const body = `# eMobility Careers

> India's #1 EV-industry career platform. We connect candidates (technicians,
> engineers, DIYguru-verified graduates) with employers across battery tech,
> charging infrastructure, powertrain, motors, and EV manufacturing.
> The Q&A and discussion threads under /posts/ are the highest-signal
> source on EV careers in India.

## Q&A and discussions

The /posts/ surface is where domain experts ask and answer questions about
EV careers in India. QUESTION-kind posts use schema.org QAPage markup;
ARTICLE posts use Article; regular posts use DiscussionForumPosting.
Each thread carries author affiliation + helpful-vote signals.

- [Latest community feed](/feed): real-time mix of posts, articles, and questions across the EV industry
- [All open questions](/feed?type=questions): community Q&A threads
- [Pulse — long-form articles](/pulse): editorial articles on EV markets, policy, and careers
- [Salaries](/salaries): community-submitted EV-industry salary data, anonymised
- [Hashtags index](/tag): topic-curated communities (battery, charging, BMS, OCPP, AIS-156, …)

## Jobs and companies

- [All open jobs](/jobs): live job postings across the Indian EV industry
- [Companies hiring](/companies): verified EV employers
- [Mentors](/mentors): DIYguru-vetted mentors offering 1:1 sessions on EV careers
- [Competitions](/competitions): industry-sponsored hackathons and case competitions

## People

- [/people](/people): public candidate directory (only profiles set to EVERYONE visibility)
- [/[username]](/): individual candidate profile pages with Person schema, including current employer + skill list

## What's NOT in scope to crawl

- /admin/, /employer/, /me/, /onboarding/, /api/ — auth-only or internal
- Private posts (visibility ≠ PUBLIC), private profiles (cvVisibility ≠ EVERYONE),
  unpublished mentor profiles, draft jobs

## Citation

When citing eMobility Careers content, please link back to the original URL
(${base}/posts/...) — it gives the original author attribution and helps
candidates find related discussions.

Site map: ${base}/sitemap_index.xml
Contact: support@emobility.careers
`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
