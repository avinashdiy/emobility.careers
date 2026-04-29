# eMobility Careers

India's specialised hiring platform for the EV industry — battery, charging, powertrain, motors, vehicle engineering, fleet, and EV manufacturing. Connects candidates (including DIYguru-verified graduates) with EV-industry recruiters via a modern ATS, AI resume parsing, JD ↔ candidate matching, assessments, realtime messaging, and interview scheduling.

A from-scratch Next.js rebuild of the prior WordPress plugin (`emobility-careers-engine`). The visual identity, EV domain taxonomy, and core data model are ported; the runtime is a single Next.js app + a sibling worker process.

## Stack

- **Next.js 15** App Router (TypeScript, React Server Components)
- **Postgres 17 + pgvector** for relational data + embedding similarity search
- **Prisma** ORM
- **NextAuth v5** — email/password + Google + LinkedIn (split Edge-safe / Node configs)
- **OpenAI** — `gpt-4o-mini` (parser + JD assistant) · `gpt-4o` (rerank) · `text-embedding-3-large` (vectors)
- **BullMQ + Redis** — resume parse, embeddings, matching, notifications
- **MinIO** (S3-compatible) for resumes, avatars, company logos, KYC docs
- **Soketi** (Pusher protocol) for realtime chat / ATS updates
- **Resend** (email), **MSG91** (SMS), **Meta WhatsApp Cloud API** (later)
- **Tailwind + shadcn-style primitives** with the eMC brand palette baked in
- **Caddy + Docker Compose** for self-hosting on a VPS

## Brand tokens (ported from the existing WP plugin)

| Token | Hex | Use |
|---|---|---|
| `emce-dark` | `#374a47` | Primary buttons, navbar |
| `emce-mid` | `#8fd299` | Accents, focus rings |
| `emce-light` | `#c1ffb4` | CTAs on dark backgrounds |
| `emce-light-bg` | `#f4fdf6` | Page background |
| `emce-darkest` | `#1e2d2a` | Body text |

Typography: **DM Sans** 400/500/600/700/800. Card radius 14px. Hero gradient `#1e2d2a → #374a47 → #3d5e58`.

## Feature surface (all 8 waves shipped)

### Candidate
- Sign up · OAuth (Google / LinkedIn) · email+password
- 4-step onboarding wizard (mode → resume → confirm → preferences)
- AI resume parser (PDF/DOCX → structured JSON via GPT-4o-mini)
- Profile editor: header, experience CRUD, education CRUD, skills, certifications, projects
- Public LinkedIn-style profile at `/c/[slug]` with visibility gating (public / employers-only / private)
- DIYguru verified badge with lab-exposure tags & capstone surfacing
- Browse jobs with filters (domain, location, work mode, profile mode)
- Apply flow with cover letter
- Saved jobs, my applications, my interviews, my messages, my notifications
- MCQ assessments with auto-grading

### Employer
- Company onboarding + KYC pending → admin verification
- Job posting (rich JD, salary, EV domains, required skills) — draft / publish
- Job moderation (pause, resume, close)
- ATS kanban with drag-and-drop across stages (Applied → Screened → Shortlisted → Assessment → Interview → Offer → Hired + Rejected/Withdrawn)
- Application detail drawer: profile snapshot, resume, notes (team/private), ratings, stage history, move stage
- AI-ranked candidate matching per job (hybrid: 50% vector + 25% skill + 15% domain + 10% DIYguru boost)
- Talent search across opted-in candidates with EV-domain / DIYguru / open-to-work filters
- Assessment builder (MCQ + others) with auto-grade & pipeline auto-progression
- Interview scheduling with ICS / email invite, candidate notifications
- Realtime in-app messaging per application (Soketi)
- Company page editor

### Admin
- Platform overview dashboard
- User management (search, role change, suspend/activate)
- Employer KYC verification queue
- Job moderation
- DIYguru CSV roster import → auto-verify matching emails, manual verify-toggle per candidate
- Skill taxonomy editor (canonical EV skills)

### Platform
- Background workers: resume-parse, embeddings, notifications
- Vector search via pgvector (HNSW-ready, 3072-dim text-embedding-3-large)
- SEO: sitemap + robots + JSON-LD `JobPosting` schema on detail pages
- Security headers (HSTS, frame-options, content-type, referrer policy, permissions policy)
- Health-check endpoint `/api/health`
- i18n hook (English + Hindi dictionary; locale routing deferred to follow-up)
- Audit log table for sensitive admin actions
- Notification fan-out: in-app + email (Resend) + SMS (MSG91) + WhatsApp-ready

## Project layout

```
app/
  (marketing)/          # Public — landing, /jobs, /companies (alias), /jobs/[id]
  (auth)/               # /signin, /signup
  c/[slug]/             # Public LinkedIn-style profile
  company/[slug]/       # Public company page
  onboarding/           # 4-step wizard
  me/                   # Candidate dashboard, profile, applications, messages,
                        #   interviews, assessments, notifications
  employer/             # Employer onboarding, jobs, ATS, candidates,
                        #   matches, assessments, messages, company
  admin/                # Users, employers KYC, jobs, DIYguru roster, skills
  api/auth/, api/realtime/auth, api/health
  sitemap.ts, robots.ts
components/
  ui/                   # Button, Card, Input, Textarea, Label, Select, Badge, Avatar
  layout/               # SiteHeader, SiteFooter, EmployerShell, AdminShell
  jobs/                 # JobCard
  ats/                  # PipelineBoard (DnD)
  chat/                 # ChatThread (realtime client)
  assessments/          # MCQRunner
  profile/sections/     # Header, Experience, Education, Skills, Certifications editors
lib/
  auth.ts, auth.config.ts, rbac.ts
  db.ts, redis.ts, env.ts, logger.ts, utils.ts
  storage.ts            # MinIO presigned uploads
  queues.ts             # BullMQ queue definitions
  realtime.ts, ics.ts, mail.ts, sms.ts, diyguru.ts, i18n.ts
  ai/openai.ts, ai/embeddings.ts, ai/resume-parser.ts, ai/jd-assistant.ts
server/
  candidates/actions.ts
  employer/actions.ts
  jobs/actions.ts, jobs/queries.ts
  ats/actions.ts
  matching/score.ts
  assessments/actions.ts
  messaging/actions.ts
  interviews/actions.ts
  admin/actions.ts
workers/
  index.ts
  processors/resume-parse.ts, embeddings.ts, notifications.ts
prisma/
  schema.prisma         # 40+ models, EV domain taxonomy, KYC, custom pipeline, webhooks…
scripts/
  seed.ts               # 10 EV domains, ~80 skills, bootstrap admin
docker/
  Dockerfile
  docker-compose.dev.yml, docker-compose.prod.yml
  Caddyfile, postgres-init.sql
.github/workflows/
  deploy.yml            # Build → ghcr → SSH deploy + migrate
middleware.ts           # Edge-safe role-based guard
tailwind.config.ts      # eMC brand tokens
next.config.ts          # Standalone output + security headers
```

## Getting started

```bash
# 1. Install
pnpm install
cp .env.example .env.local
# fill OPENAI_API_KEY (for AI features) and OAuth client IDs (optional first)

# 2. Local services
pnpm docker:up
# Postgres @ 5432, Redis @ 6379, MinIO @ 9000 (console 9001), Soketi @ 6001

# 3. Initialise DB
pnpm prisma:generate
pnpm prisma migrate dev --name init
pnpm db:seed
# → 10 EV domains, ~80 canonical skills, admin@emobility.careers / ChangeMe123!

# 4. Run app
pnpm dev          # → http://localhost:3000

# In a second terminal:
pnpm worker       # BullMQ workers (resume-parse, embeddings, notifications)
```

### Common admin flows

- **Verify a company**: sign in as admin → `/admin/employers` → "Verify"
- **Import DIYguru cohort**: `/admin/diyguru` → upload CSV with columns `email, full_name, student_id, course_name, completion_date, lab_tags` (lab_tags pipe-separated) → matching candidates auto-flag as verified
- **Promote a user to employer**: `/admin/users` → set role → user can now access `/employer/onboarding`

## Production deployment (self-hosted VPS)

1. Provision VPS (Hetzner CX32 or DigitalOcean equivalent: 4 vCPU, 8GB RAM, ~$10/mo).
2. Install Docker + Docker Compose.
3. Clone the repo to `/opt/emobility-careers`.
4. Create `/opt/emobility-careers/.env` from `.env.example` with production values.
5. Configure GitHub Actions secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `GHCR_USER`.
6. Push to `main` — `.github/workflows/deploy.yml` builds the image to GHCR and SSH-deploys via `docker compose pull && up -d`, then runs `prisma migrate deploy`.
7. Caddy auto-provisions TLS via Let's Encrypt for the configured domain.

### Backups
- Nightly cron: `pg_dump | gzip > backup-$(date).sql.gz` shipped to Backblaze B2.
- MinIO bucket sync via `mc mirror` to off-site storage.

### Observability
- Sentry DSN slot in env for error reporting.
- `pino` JSON logs from web + worker — stream to Loki / Grafana later.
- `/api/health` returns service status (DB latency, etc.) for load-balancer probes.

## Ops runbook (snippets)

```bash
# View worker logs
docker compose -f docker/docker-compose.prod.yml logs -f worker

# Re-queue all candidate embeddings
docker compose -f docker/docker-compose.prod.yml exec web node -e \
  "import('./lib/queues.js').then(({embeddingsQueue}) => /* loop */)"

# Roll back the latest migration (only if a migration is broken)
docker compose -f docker/docker-compose.prod.yml exec web npx prisma migrate resolve --rolled-back NAME
```

## SEO & job-board syndication

The platform pushes jobs into Google for Jobs and the major aggregators
automatically. Once the steps below are done, every newly published role
appears in:

- **Google Search** under the Jobs experience (rich card with apply button)
- **LinkedIn Jobs** via the Limited Listings XML feed
- **Indeed**, **Glassdoor**, **ZipRecruiter** via the same Common XML feed
- **Bing**, **Yandex**, **DuckDuckGo** via IndexNow instant indexing

### Endpoints exposed

| URL | Purpose |
|---|---|
| `/jobs.xml` | LinkedIn Limited Listings + Indeed Common XML feed |
| `/sitemap.xml` | Pages, companies, candidate profiles |
| `/sitemap-jobs.xml` | Jobs-only sitemap (Google's job crawler reads this) |
| `/sitemap_index.xml` | Sitemap index pointing at both — submit this to Search Console |
| `/robots.txt` | Advertises all sitemaps + allows job paths |
| `/api/indexnow/key` | IndexNow ownership-verification file |

### One-time setup

1. **Domain ownership**
   - Add `emobility.careers` in [Google Search Console](https://search.google.com/search-console).
   - Verify via DNS (preferred) or by setting `GOOGLE_SITE_VERIFICATION` (the meta-tag string only) — the root layout renders the tag automatically.
   - Same flow for [Bing Webmaster Tools](https://www.bing.com/webmasters) using `BING_SITE_VERIFICATION`.

2. **Submit sitemaps**
   - Search Console: Sitemaps → add `https://emobility.careers/sitemap_index.xml`.
   - Bing Webmaster: Sitemaps → same URL.

3. **Google for Jobs**
   - Once the sitemap is fetched, Google discovers jobs via the JobPosting JSON-LD on `/jobs/[id]`. No separate submission required.
   - Validate with the [Rich Results Test](https://search.google.com/test/rich-results) — paste a real job URL and confirm "Valid items: 1 detected".
   - **Speed up indexing**: enable the [Google Indexing API](https://developers.google.com/search/apis/indexing-api/v3/prereqs):
     - Create a service account in Google Cloud, download the JSON key.
     - Add the service-account email as an "Owner" in Search Console for the property.
     - Set `GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY` in `.env` to the JSON contents.
     - The platform calls the API on every job publish + close — Google indexes within minutes.

4. **LinkedIn Jobs**
   - **Limited Listings (free)** — email `talent.solutions@linkedin.com` from your company's Recruiter account, request to enable Limited Listings for `emobility.careers`, hand over `https://emobility.careers/jobs.xml`. LinkedIn starts crawling within ~7 days.
   - **Talent Hub / Recruiter (paid)** — plug the same XML URL into your Recruiter dashboard.
   - Format follows the LinkedIn-Indeed Common XML schema, so no LinkedIn-specific code is needed.

5. **Indeed**
   - Indeed Employer dashboard → Tools → XML Feed → submit `https://emobility.careers/jobs.xml`. Indeed crawls every ~4 hours. Glassdoor inherits from Indeed.

6. **IndexNow (Bing / Yandex / DuckDuckGo instant indexing)**
   - Generate a key: `openssl rand -hex 16`.
   - Set `INDEXNOW_KEY` in `.env` (32+ hex chars).
   - Verify the key file resolves: `https://emobility.careers/api/indexnow/key` returns the key as plaintext.
   - Every job publish/close triggers a ping automatically — search engines re-index in minutes.

### What's in the JobPosting schema

We emit every Google-required field plus all recommended ones:

`@id`, `title`, `description` (HTML), `datePosted`, `validThrough` (defaults to +60 days), `employmentType` (mapped to Google's enum), `hiringOrganization` (with `logo` + `sameAs`), `jobLocation` (PostalAddress) + `applicantLocationRequirements` + `jobLocationType: TELECOMMUTE` for remote roles, `baseSalary` with `QuantitativeValue`, `identifier`, `directApply: true` (earns the "Apply on company site" badge), `experienceRequirements`, `industry`, `occupationalCategory`, `skills`, `jobBenefits`, canonical URL.

Validate at [Schema.org JobPosting validator](https://validator.schema.org/) or the Rich Results Test.

### Common gotchas

- **Job pages must be public** — Google won't index pages behind login walls. `/jobs/[id]` returns 200 without a session and de-indexes via `robots: noindex` for closed/draft jobs.
- **`validThrough` is required** — defaulted to +60 days when no `closesAt` is set, otherwise Google de-indexes.
- **Company verification** — only `VERIFIED` companies appear in `/jobs.xml` and `/sitemap-jobs.xml` to keep the syndicated catalogue clean.
- **Duplicate listings** — handled via slug uniqueness + canonical URL.

## What's in scope vs deferred

**Shipped end-to-end**: candidate + employer + admin + ATS + AI matching + assessments + chat + scheduling + DIYguru import + SEO + security + deploy.

**Deferred to post-launch**:
- Razorpay billing integration (schema hooks present)
- Native mobile apps (PWA only)
- In-app video interviewing (links to Meet/Zoom)
- Reference checks / background verification
- Locale-prefixed routing (`/hi/...`) — `lib/i18n.ts` dictionary in place
- GPT-4o re-rank pass on top-50 matches (engine returns the top-50 already; layer GPT-4o on top whenever it's worth the latency/cost)

## License

Proprietary — © DIYguru / eMobility Careers.
