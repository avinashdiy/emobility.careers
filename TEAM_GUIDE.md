# emobility.careers — Team Operations Guide

**Audience:** Non-technical team members at DIYguru / emobility.careers
**Purpose:** A complete, hand-holding reference for every feature on the platform — how to find it, how to use it, what to expect, and what to report when something looks wrong.
**Last updated:** May 2026

> If you can't find what you're looking for, or you click something and it doesn't do what this guide says it should — that's a bug. **Report it.** Instructions for how to report are in the last section.

---

## Table of contents

1. [What the platform is](#1-what-the-platform-is)
2. [Glossary — terms you'll see](#2-glossary--terms-youll-see)
3. [Signing in + getting access](#3-signing-in--getting-access)
4. [Admin guide](#4-admin-guide) (largest section — most of what your team will do)
5. [Recruiter / Employer guide](#5-recruiter--employer-guide)
6. [TPO (Training & Placement Officer) guide](#6-tpo-guide)
7. [Candidate guide](#7-candidate-guide)
8. [Recently shipped features — what's new in the last 2 days](#8-recently-shipped-features)
9. [Roadmap — what's coming next](#9-roadmap)
10. [Common questions + known issues](#10-common-questions--known-issues)
11. [How to report bugs](#11-how-to-report-bugs)

---

## 1. What the platform is

**emobility.careers** is an EV-industry recruitment platform. It serves three audiences:

- **Candidates** — students, freshers, and working engineers looking for EV-industry jobs
- **Employers** — EV-industry companies hiring (OEMs, charging operators, tier-1 suppliers, battery makers, software firms)
- **TPOs (Training & Placement Officers)** — college placement officers managing their students' job search at scale

Plus an **Admin** layer used by your team (DIYguru / emobility.careers staff) to moderate, configure, and run events.

The platform also runs **Recruitathon**, a flagship EV-industry job fair. The platform is designed so that Recruitathon (and any future fair) works end-to-end on-platform: registration, booth management, interview booking, candidate check-in, and post-event reporting.

### Core URLs

| URL | What it is |
|---|---|
| `emobility.careers` | Homepage / marketing landing |
| `emobility.careers/feed` | Signed-in candidate feed (LinkedIn-style) |
| `emobility.careers/jobs` | Public job listings |
| `emobility.careers/companies` | All EV-industry companies |
| `emobility.careers/institutions` | All colleges/universities |
| `emobility.careers/fairs` | All recruitment fairs (Recruitathon and others) |
| `emobility.careers/competitions` | EV hackathons / competitions |
| `emobility.careers/events` | Webinars, demo days, meetups |
| `emobility.careers/articles` | EV-industry articles + SEO content |
| `emobility.careers/admin` | Admin console (gated — admin role only) |
| `emobility.careers/employer` | Employer console (gated — employer role only) |
| `emobility.careers/tpo` | TPO console (gated — approved placement officers) |
| `emobility.careers/me` | A candidate's own dashboard (any signed-in user) |

---

## 2. Glossary — terms you'll see

| Term | What it means |
|---|---|
| **Fair / Recruitment drive** | A job-fair event. Internally called `RecruitmentDrive` in the code; called "Job fairs" in the admin UI; "Fair" or "Recruitathon" externally |
| **Recruitathon** | Specifically the Bharat eMobility Recruitathon 2026 — two editions (Delhi + Pune). It's just a specific fair |
| **Booth** | A company's slot at a fair. Internally a `RecruitmentDriveCompany` row |
| **Check-in code** | A 6-character code (e.g. `ABCD23`) on every registered candidate's fair pass. Used to mark them present at the venue |
| **TPO** | Training & Placement Officer — a college's placement coordinator. Approved TPOs get a `/tpo` dashboard + a shareable invite link for their students |
| **Placement cell** | A TPO's account (one cell = one college on the platform). Status: PENDING (awaiting your approval), APPROVED (live), REJECTED, REVOKED |
| **DIYguru-verified** | A trust badge on candidate profiles. Set automatically when the candidate's email matches a roster CSV you uploaded, OR manually flipped by admin. Never self-claimable |
| **Compass / Career Explorer** | AI tool that recommends EV careers based on a candidate's current role + skills |
| **Pulse** | Activity / what's happening on the platform — homepage rail |
| **ATS** | Applicant Tracking System — the kanban pipeline employers use to move candidates through stages (Applied → Screened → Interview → Offer → Hired) |
| **Broadcast** | An admin-sent message blast (in-app / email / SMS / WhatsApp) to a chosen audience |
| **Job fair pass** | A page at `/me/fairs/[slug]/pass` showing the candidate's QR code + check-in code, downloadable to phone |
| **Brochure** | A PDF marketing collateral attached to a fair — one for hiring partners, one for colleges |
| **Floor map** | An image of the venue layout uploaded to a fair, showing where each booth sits |
| **Inline signup** | The Recruitathon's one-page registration form. Creates the user account + the fair registration in a single submission |
| **Invite link** | A unique URL approved TPOs get. Students who register via the link are auto-credited to that TPO's college in the dashboard |

---

## 3. Signing in + getting access

### For your team (admin)

You should already have an account with the **ADMIN** role. If not, ask the engineering team to set `User.role = ADMIN` on your account via the DB.

1. Go to `emobility.careers/signin`
2. Sign in with your email + password (or Google / LinkedIn if linked)
3. After sign-in, visit `emobility.careers/admin` — you should see the admin console with the dark teal sidebar
4. If you see "403 Forbidden" — your role isn't ADMIN yet. Email an engineer.

### For team members who need to test other personas

You can have a single account with multiple "hats". The platform automatically gives every user a **candidate profile** at signup. Add an **employer profile** by visiting `/employer/onboarding`. Add a **TPO profile** by applying at `/colleges/register` (then have an admin approve you at `/admin/colleges`).

Use the **profile-switcher** in the header (top-right dropdown) to flip between admin / employer / candidate / TPO views without signing out and back in.

---

## 4. Admin guide

This is where most of your team's work happens. The admin console lives at **`/admin`** and the sidebar gives you access to ~50 features grouped into sections.

### 4.1 Quick orientation

When you visit `/admin`, you see:
- **Left sidebar** — grouped navigation (Dashboard / Hiring & Pipeline / Content / Moderation / Settings / etc.)
- **Top bar** — DIYguru logo + admin badge + your account menu
- **Main area** — whatever page you're on

### 4.2 User management — `/admin/users`

**Use it to:** Search any user, change roles, suspend accounts, view audit history.

**Common tasks:**
- **Find a user:** type their email or name in the search box at the top
- **Promote to admin:** click the user → scroll to "Role" → change to `ADMIN` → Save. (Use sparingly. Admins see everything.)
- **Grant TPO access:** click the user → toggle `isPlacementOfficer` on. The `/tpo` console unlocks for them.
- **Suspend a spammer:** click the user → Suspend account. They can't sign in. Logged in audit trail.
- **Impersonate a user (for debugging):** click "Impersonate" → you see the platform as that user. **Audited.** Use only with explicit support reason.

### 4.3 Job fairs — `/admin/fairs`

**Use it to:** Create, edit, publish, and run job fairs (including Recruitathon).

**To create a new fair:**
1. Click "New fair" (top right)
2. Fill: title, tagline, venue, city/state, start + end date, registration open/close window
3. Save as DRAFT
4. Edit additional details (description, banner, hero image) under the fair's detail page
5. When ready, click "Publish & open registration" — flips status from DRAFT → OPEN

**Per-fair management** (`/admin/fairs/[id]`):
- **Imagery card** — upload banner (3:1, used in /fairs grid) and hero (16:9, used as fair-page background). Both auto-crop to the right aspect ratio.
- **Brochures card** *(new)* — upload two PDFs: one for hiring partners, one for colleges. Each appears as a download CTA on the public fair page.
- **Floor map card** *(new)* — upload one image of the venue layout (4:3 recommended). Renders on the public fair page so candidates know where each booth sits.
- **Lifecycle controls** — Publish → Open / Mark in progress / Close / Cancel. Always use this — don't edit status via the DB.
- **Tracks editor** — define industry tracks (Battery, Embedded, Sales & Service, etc.) and group jobs into them. Candidates can filter the fair page by track.
- **Speakers panel** — add patrons, chairs, keynote speakers. Order is admin-controlled.
- **Event partners** — academic / government / sponsor partners with logos. Appears in the "Affiliations & partners" section.
- **Participating companies** — invite companies (or accept their self-registration). Assign booth labels (e.g. "Booth 7" or "Hall B / Booth 12").
- **Attached jobs** — link specific JobPostings to the fair. Each job optionally pinned to a track + an optional pre-screening Assessment.
- **Interview slots** — manage on-site interview time slots per booth.
- **Roster import** — bulk-upload a CSV of candidate emails to pre-register a college's cohort.
- **Live event dashboard** *(new)* — link "⚡ Live dashboard" → real-time auto-refreshing event-day operations view.
- **Recap (post-event)** — auto-generated highlights once fair is CLOSED.

### 4.4 Recruitathon signups — `/admin/recruitathon`

**Use it to:** See everyone who registered via the public inline-signup form, export CSVs for the placement team, watch the live event dashboard.

This is **separate** from `/admin/fairs` — that's the setup console; this is the **conversion dashboard** for self-registrations.

**Layout:**
- Top-level: list of all fairs with self-registration activity. Each row shows count of candidates + companies, with a green badge marking inline-form signups.
- Click a fair → see candidates + employers as separate tabs, each with badges for fair-mode availability, DIYguru status, source (inline / TPO link).
- **CSV exports** — two buttons: Candidates CSV (24 columns), Employers CSV (21 columns). UTF-8 BOM so Excel opens it cleanly.
- **Live dashboard** *(new)* — at `/admin/recruitathon/[slug]/live` — auto-refreshes every 15s. Shows:
  - Registrations + signups in last 1 hour
  - Check-ins + check-ins in last 15 minutes
  - Slot utilization (booked / total)
  - Booth status breakdown
  - Source mix (Inline form / Via TPO link / Other)
  - Latest 8 signups with name, college, check-in code

**Use the Live dashboard on fair day** — it's designed for operations staff watching the venue floor.

### 4.5 College placement cells — `/admin/colleges`

**Use it to:** Approve or reject TPO applications. This is the moderation queue for `/colleges/register` submissions.

**Each pending application shows:**
- College name + institution row (links to existing canonical institution OR a new one to review)
- TPO's name, email, phone, designation, estimated cohort size, notes
- Account age, whether their email is verified

**To approve:**
1. Click the cell row → opens detail page
2. Review the proof (email domain match? plausible college? designation makes sense?)
3. Click **Approve**. Automatically:
   - Flips `User.isPlacementOfficer = true` (unlocks `/tpo`)
   - Mints a stable `inviteToken` (unique URL the TPO will share with students)
   - Sends an email + in-app notification to the TPO
4. The TPO can now log in to `/tpo`, bulk-import their cohort, and share their invite link.

**To reject:**
- Write a reason (it's emailed to them so they know what to fix)
- Click Reject. Can re-approve later by changing status back to APPROVED.

### 4.6 Company claims — `/admin/claims`

**Use it to:** Approve "I work here, prove me admin" requests from users.

**Flow:**
- A user goes to `/company/[slug]/claim` → fills proof (work email, LinkedIn URL, free-text justification, desired role)
- Lands here as PENDING. Each claim card shows:
  - Company name + verified/unverified status badge
  - Green "Domain match" badge if claimant's email domain matches the company's email_domains
  - Yellow "Email unverified" badge if the claimant hasn't verified their own email
  - Free-text proof from the claimant

**Triage in order:**
1. Domain matches + verified email → fast approve
2. Domain matches but email unverified → ask the claimant to verify first
3. No domain match + thin proof → ask for more (or reject with specific reason)

**On approve:** the user becomes an EmployerProfile member of that company. If the company was UNVERIFIED and this is the first approved claim, the company auto-flips to VERIFIED.

### 4.7 Job moderation — `/admin/jobs` + `/admin/reports`

**`/admin/jobs`** — every JobPosting on the platform. Filter by status (DRAFT / OPEN / PAUSED / CLOSED), company, age.

**Common tasks:**
- Spot-check a posted job — click into it → check title, JD, salary range, company match
- Force-close a spammy job — click Close. The company is notified.
- Flag a job for review — applies a "needs admin attention" marker

**`/admin/reports`** — user-reported jobs (spam, misleading, discriminatory, scam). Each report has a reason + free-text. Action buttons: Dismiss / Warn company / Force close / Suspend company.

**`/admin/post-reports`** — same but for social feed posts. User-reported reactions / comments / posts.

### 4.8 Companies — `/admin/companies`

**Use it to:** Manage every company row on the platform (~3,500+ companies seeded).

**Common tasks:**
- Edit a company's profile, logo, website, EV-domain tags, tier (OEM / Tier-1 / Startup / etc.)
- Merge duplicates (use `/admin/companies/enrichment-queue` for systematic web-fetched logo + Wikipedia enrichment)
- Mark a company as `verificationStatus: VERIFIED` (unlocks "Verified employer" badge on the public page + on job listings)

**Enrichment queue** — admin queue of web-verified data updates pending review. Approve/reject per field.

### 4.9 Institutions / Colleges — `/admin/institutions`

**Use it to:** Manage college rows + their EV-industry rankings.

**Each institution has:**
- Basic info: name, type (COLLEGE / UNIVERSITY / POLYTECHNIC / ITI), city, country, website, logo
- Verification status
- **EV-industry ranking scores** (0-100 across 7 pillars): Research / Faculty / Placement / Infrastructure / Content / Alumni / Startups

These scores power `/institutions/rankings`. Admin edits them manually based on the published rubric in `scripts/seed-institution-rankings.ts`.

### 4.10 Articles — `/admin/articles`

**Use it to:** Create / edit EV-industry SEO articles (200+ already seeded, including 50 geo-targeted "Best EV Training in [Country]" pages).

**Each article has:** slug, title, excerpt, body (rich), category, tags, author, publishedAt, readingTimeMins (auto-computed).

**To publish a new article:**
1. New article → write content
2. Pick a category (EV Careers / EV Salary / EV Interview Prep / EV Skills & Training / EV Networking / EV Industry Trends)
3. Set status to PUBLISHED + click Save
4. It immediately appears on `emobility.careers/[slug]` and in `/articles`.

### 4.11 Competitions — `/admin/competitions`

**Use it to:** Approve EV hackathons / competitions submitted by host companies, edit them, feature them.

Host companies submit at `/employer/competitions/new`. Status flow: DRAFT → PENDING_REVIEW (yours to action) → APPROVED → LIVE → JUDGING → RESULTS → CLOSED.

Common moderation: check for prize-pool credibility, eligibility clarity, judging panel quality, prize T&Cs.

### 4.12 Events

Webinars, demo days, and meetups are posted by companies via `/employer/events/new`. **There is no dedicated admin moderation queue for events** (unlike competitions, which have `/admin/competitions`). If you need to moderate a specific event, find the host company in `/admin/companies` and act on it from there. **Flag to engineering** if a unified events moderation queue would help your workflow.

### 4.13 Broadcasts — `/admin/broadcasts`

**Use it to:** Send platform-wide or fair-targeted messages.

**Compose new broadcast:**
1. Title (max 140 chars)
2. Body (max 2000 chars)
3. Optional link (deep-link inside the platform or external URL)
4. **Audience** dropdown — two groups:
   - **Platform-wide:** All users / All candidates / All employers / DIYguru verified / Open to work / Verified employers
   - **Fair-scoped *(new)*:** Fair candidates / Fair employers / Fair TPOs / Fair — everyone (requires picking a specific fair from the next dropdown)
5. **Fair selector** (required for fair-scoped audiences) — shows OPEN / IN_PROGRESS fairs only
6. **Channels** — In-app (always), Email, SMS, WhatsApp (pick any combination)
7. Save as draft OR Save & send now

**On send:** queued to BullMQ; recipient count + sent count update as the worker fans out. Capped at 50,000 recipients per broadcast as a safety floor.

**Examples for the placement team:**
- "Recruitathon Delhi registration closing in 48 hours" → ALL_CANDIDATES + email
- "Your students need to complete their profiles" → FAIR_REGISTERED_TPOS + email
- "Doors open at 9 AM tomorrow" → FAIR_ALL_REGISTRANTS + WhatsApp (day-before reminder)
- "Hall B is now open" → FAIR_REGISTERED_CANDIDATES + SMS (day-of ops)

### 4.14 DIYguru roster — `/admin/diyguru`

**Use it to:** Upload the CSV of DIYguru-verified students. Matching emails auto-flip `isDIYguruVerified = true` on signup OR on the next roster import after a candidate joins.

CSV format expected: email, full name, student ID, course, completion date.

### 4.15 Other admin sections

| Section | What it does |
|---|---|
| `/admin/announcements` | Site-wide announcement banners (e.g. "Server maintenance Sunday 2 AM") |
| `/admin/applications` | Cross-company view of every job application (for audit) |
| `/admin/audit` | Audit log of every admin action — promotions, approvals, rejections, broadcasts, deletions |
| `/admin/awards` | EV-industry awards admin manages |
| `/admin/cohorts` | DIYguru cohort definitions (for grouping students by batch) |
| `/admin/content` | CMS pages (terms, privacy, about, custom landing pages) |
| `/admin/delivery` | Email/SMS delivery health monitoring |
| `/admin/featured` | Featured jobs / companies / mentors curation |
| `/admin/feature-flags` | Toggle features on/off per-environment |
| `/admin/grievances` | User-submitted grievances/escalations |
| `/admin/hashtags` | Trending hashtags + moderation |
| `/admin/identity-verifications` | KYC for the "Verified profile" blue check |
| `/admin/import` | WordPress / external data imports |
| `/admin/interviews` | Cross-company interview list |
| `/admin/jd-templates` | Job description templates library |
| `/admin/job-quality` | AI-scored JD quality analysis |
| `/admin/mentors` | Mentor profile approval queue |
| `/admin/messages` | Cross-thread messaging audit |
| `/admin/notifications` | Notification template management |
| `/admin/operations` | System health: queue depths, error rates |
| `/admin/pages` | CMS page editor |
| `/admin/resume-failures` | Resume parser failures — review + reprocess |
| `/admin/reviews` | Company reviews moderation |
| `/admin/salaries` | Salary submissions moderation |
| `/admin/settings` | Platform settings |
| `/admin/skills` | Skill taxonomy editor (canonical EV skill list) |
| `/admin/sql` | Read-only SQL console (admin only — careful) |
| `/admin/teams` | Team management |
| `/admin/webhooks` | Outbound webhook configuration |
| `/admin/whatsapp` | WhatsApp template management |
| `/admin/ai-ops` | AI cost tracking + quotas |
| `/admin/analytics` | Platform-wide KPIs (signups, MAU, applications, hires) |
| `/admin/billing` | Billing scaffolding (out of scope for v1) |
| `/admin/experiments` | A/B test scaffolding |

---

## 5. Recruiter / Employer guide

The employer console is at **`/employer`**. Recruiters use it to post jobs, manage their hiring pipeline, manage their fair booth, and message candidates.

### 5.1 First time: company onboarding — `/employer/onboarding`

If a recruiter signs up via the regular flow (selects "I'm hiring" at signup), they land here. Three sections:

1. **Create company** (or claim an existing one)
2. **Company KYC** — upload verification docs (CIN, GST, etc.)
3. **Invite teammates** — by email

After onboarding, they get the employer dashboard at `/employer`.

### 5.2 Posting a job — `/employer/jobs/new`

**Step-by-step:**
1. Title (e.g. "Battery Cell Engineer")
2. Description (rich editor — paste / write the JD)
3. Responsibilities + Requirements
4. **EV domain tags** (Battery / BMS / Motor / Charging / Vehicle Integration / Software / Manufacturing / Business)
5. Skills required (multi-select from canonical skill taxonomy)
6. Work mode: REMOTE / HYBRID / ONSITE
7. Locations
8. Salary range + currency
9. Experience range (years)
10. Employment type: FULL_TIME / PART_TIME / CONTRACT / INTERNSHIP
11. Collar type: BLUE / WHITE (drives downstream candidate matching)
12. Save as DRAFT → review → Publish

Published jobs immediately appear at `emobility.careers/job/[slug]` and in `/jobs` listings.

**AI JD assistant** *(separate page)* — after saving a draft, open `/employer/jobs/[id]/assistant` to polish the JD with AI: rewrites for clarity, infers seniority, extracts skills, flags unrealistic requirements. It's NOT embedded in the new-job form — recruiters need to take a deliberate trip to the assistant page once the draft exists.

### 5.3 ATS pipeline — `/employer/jobs/[id]/ats`

Kanban view of candidates per job. Columns:
- **Applied** — fresh applications
- **Screened** — recruiter has reviewed
- **Shortlisted** — moving forward
- **Assessment** (if attached) — completing pre-screen test
- **Interview** — interview scheduled
- **Offer** — offer extended
- **Hired** — accepted
- **Rejected** — at any stage

**Common tasks:**
- Drag-drop a candidate from one column to next
- Click candidate name → opens the drawer with full profile, resume, AI match-score breakdown, notes
- Add an internal note (team-visible or recruiter-private)
- Schedule an interview (interviewee gets an in-app + email notification with the meeting link; ICS download may be available on the interview detail page — verify with engineering before promising it to recruiters)
- Send a message via the in-thread DM
- Star/rate the candidate (1-5)

### 5.4 Candidate matching — `/employer/jobs/[id]/matches`

AI-ranked list of candidates who match the JD. Hybrid score: **50% semantic similarity** (pgvector cosine) + **25% skill overlap** + **15% EV domain match** + **10% DIYguru boost**.

**Filter row at the top:**
- ☑ DIYguru-verified only
- ☑ Open to work only
- ☑ **✨ AI re-rank with explanations** — calls GPT-4o on the top 25 to add a one-line "why this candidate fits" reason (italicised under the headline). Costs a few cents per click; final order = 60% LLM rerank + 40% hybrid math
- "Apply filters" submits the form (URL gains `?rerank=true&diyguruOnly=true…`)

**Each candidate row shows:**
- Rank number + avatar + match-score badge (combined or hybrid, depending on whether rerank ran)
- DIYguru badge if verified, hiring/open-to-work overlay on the avatar
- The `✨ rerankReason` line (only when AI re-rank is on)
- Matched skill chips (first 6)
- Profile link + per-row **✉ Invite** button

**Bulk invite:**
- Each row has a checkbox; "Select all on this page" is at the top
- A sticky bottom bar appears once you've selected ≥1 → click **✉ Invite to apply** → confirm → selected candidates get an in-app + email notification inviting them to apply for the job
- This is the fastest way to fill a pipeline for a new req: open matches → check the top 10 → invite all in one click.

### 5.5 Talent search — `/employer/candidates`

Faceted search across all opted-in candidates. Filters: EV domain, skills, experience years, location, collar type, DIYguru-verified, open-to-work.

### 5.6 Fair management — `/employer/fairs/[id]`

For employers participating in a recruitment drive. See:
- Booth overview (label, status, "About at fair" pitch)
- Edit booth pitch + assigned jobs
- Attach/detach jobs to/from the fair
- Manage interview slots — `/employer/fairs/[id]/slots`
- See matches — candidates registered for THIS fair, AI-ranked

**Day-of tools** (visible only when company has CONFIRMED booth):
- **📷 Booth scanner** *(new)* — `/employer/fairs/[id]/scan` — type the candidate's 6-char check-in code → opens their full profile in a new tab
- **👥 Pre-screen candidates** *(new)* — `/employer/fairs/[id]/candidates` — filterable list of every candidate registered for the fair (filter by fair mode, fresher/experienced, DIYguru-verified, EV-experience). Use this DAY-BEFORE to plan who to prioritize at your booth.

### 5.7 Team — `/employer/team`

- Invite teammates by email + role (RECRUITER / HIRING_MANAGER / VIEWER / ADMIN)
- Promote/demote admin status
- Remove teammates
- See pending invites + revoke

### 5.8 Company page — `/employer/company`

Edit the public company profile (about, benefits, tech stack, EV domains, growth opportunities).

### 5.9 Competitions / Events

- Host a competition: `/employer/competitions/new`
- Host an event (webinar, demo day): `/employer/events/new`

### 5.10 Messaging — `/employer/messages`

Two thread types appear:
- **Application-bound** — auto-created when a candidate applies
- **Cold outreach** — when recruiter clicks "💬 Message" on a candidate's profile (only if signed in as employer + viewing a candidate profile)

---

## 6. TPO Guide

For Training & Placement Officers (college coordinators). Lives at **`/tpo`**, accessible only to users with `isPlacementOfficer = true` (set by admin on approval).

### 6.1 Becoming a TPO

Two paths:

**Path A — Public application (slow):**
1. Visit `/colleges/register`
2. Sign in (or create an account)
3. Fill the application: institution, contact details, designation, expected cohort size, free-text notes
4. Submit → status = PENDING
5. Wait for admin to approve at `/admin/colleges` (typically within 2 business days)
6. On approval, get email + in-app notification → log in → `/tpo` is unlocked + invite link is minted

**Path B — Inline signup via Recruitathon (fast) *(new)*:**
1. Visit any fair landing (e.g. `/fairs/bharat-emobility-recruitathon-2026-delhi`)
2. Click "📋 Register as TPO" in the hero or sticky header
3. Fill the inline form (creates User account + CandidateProfile + CollegePlacementCell in one shot)
4. Same admin approval gate, but the account exists immediately

### 6.2 TPO dashboard — `/tpo`

After approval, see:

- **Live check-in card** *(new)* — only renders when at least one fair the TPO has students at is IN_PROGRESS. Shows "X of Y students checked in today" + the 5 most recent check-ins. Auto-refreshes every 30s.
- **Invite link card** *(new)* — shareable URL per upcoming fair + count of students who've used it. Copy-to-clipboard button. Also shows historical performance per fair (registered count, avg profile completeness, checked-in count).
- **KPI strip** — Roster total / Claimed / In process / Hired / Placement rate / New requirements (last 24h + last 7d)
- **Stage funnel** — Sourced → Applied → Screened → Interview → Offer → Hired with per-stage drop-off %
- **Unplaced students** — daily work queue, top 10 students who don't have an active offer yet

### 6.3 Cohort management — `/tpo/cohorts`

List of cohorts (e.g. "B.Tech ECE 2026", "M.Tech Battery 2025"). Each cohort detail (`/tpo/cohorts/[slug]`) shows:
- Roster (students in this cohort)
- Per-student status: profile completeness, application count, offers count
- Cohort-level analytics

### 6.4 Bulk roster import — `/tpo/import`

Upload a CSV of students to pre-populate the platform:
- Columns expected: email, full name, phone, course, graduation year
- Students with an existing emobility.careers account get auto-tagged to the TPO's college
- Students without an account get a shell account + an invite email

### 6.5 Unplaced students — `/tpo/unplaced`

Daily work queue. All cohorts' students without an active offer. TPO can:
- Sort by profile completeness (chase the incomplete ones)
- Sort by last activity (chase the dormant ones)
- Push relevant openings to specific students
- Send a bulk WhatsApp/email reminder

### 6.6 Sharing the invite link

The most important TPO feature for Recruitathon:

1. On `/tpo`, copy the invite URL: `emobility.careers/fairs/[slug]/register?as=candidate&tpo=<token>`
2. Post in the placement WhatsApp group + LinkedIn + email
3. Students who click + register are automatically credited to the TPO's college in the dashboard
4. The token is stable — share once, the URL keeps working until the TPO's cell is REVOKED

---

## 7. Candidate guide

This is the **largest user group** but your team mostly observes (not operates) here. Quick reference:

### 7.1 Signup + onboarding

- `/signup` — email/password OR Google/LinkedIn OAuth
- Pick role at signup: Candidate or "I'm hiring" (employer)
- After signup, redirected to `/onboarding` — wizard:
  1. Upload resume (auto-parsed by AI into experience/education/skills — editable)
  2. Confirm/edit auto-parsed fields
  3. Pick collar type: BLUE / WHITE
  4. Set visibility (PUBLIC / RECRUITERS_ONLY / PRIVATE)
  5. Set open-to-work + expected salary + notice period

### 7.2 Candidate dashboard — `/me`

Personal overview: applications, saved jobs, profile views (last 7 days), interview schedule, mentor sessions, recent notifications.

### 7.3 Profile editor — `/me/profile`

Edit all profile sections:
- Header (photo, name, headline, location, country)
- About / summary
- Experience (auto-parsed from resume; manually editable)
- Education
- Skills (selected from canonical taxonomy)
- Certifications
- Projects
- Awards
- Languages
- Preferences (open-to-work, expected salary, notice period, willing locations, visibility)

### 7.4 Public profile — `/[username]`

LinkedIn-style page resolved by the candidate's slug at the root of the site (e.g. `emobility.careers/shivani-mishra`). Shows all profile sections. Has action buttons: Connect / Follow / Message / View Compass / Share / Download résumé.

### 7.5 Job browse + apply — `/jobs`

- Filters: keyword, location, collar type, experience, salary, remote/onsite, skills, company, DIYguru-friendly
- Click a job → `/job/[slug]` → Apply (one-click with profile snapshot + optional cover letter)
- Applications visible at `/me/applications`

### 7.6 Saved jobs + job alerts — `/me/saved` and `/me/alerts`

Save jobs for later. Subscribe to alerts (email/SMS) for new matching jobs.

### 7.7 Messages — `/me/messages`

All conversations. Two thread types:
- Application-bound (with a recruiter)
- Peer-to-peer (with another connected user) *(new from earlier this session — Bug 1 fix)*

### 7.8 Fairs — `/me/fairs/[slug]/pass` *(new for QR code)*

After registering for a fair, the candidate gets a "fair pass" page with:
- The 6-character check-in code in big mono font
- **QR code SVG** *(new)* — scannable at the venue
- **📆 Save fair date** button — downloads ICS for the fair-day event
- **📅 Interview slots → calendar** button *(new)* — downloads ICS with ONE event per booked interview slot

### 7.9 Network — `/me/network`

Connections / Followers / Following / Suggestions ("People you may know"). The browse-everyone surface (search for people without needing a profile relationship) lives separately at `/people`.

### 7.10 Feed — `/feed`

LinkedIn-style social feed with posts, articles, polls, questions. Right rail shows:
- **What's happening in EV** *(new)* — top 5 EV-industry news headlines from Google News, refreshed every 15 min
- People you may know
- Live competitions
- Latest EV jobs
- Upcoming job fairs *(from earlier)*
- Upcoming events *(from earlier)*
- AI tools shortcuts *(from earlier)*

### 7.11 AI tools — `/ai-tools`

Free EV-industry AI tools, available to any signed-in candidate. The `/ai-tools` catalogue page lists **13 entries**:

| # | Tool | URL |
|---|---|---|
| 1 | 🧭 EV Career Explorer (Career Compass) | `/career-explorer` |
| 2 | 📚 Interview Prep | `/ai-tools/interview-prep` |
| 3 | 🎤 Mock Interview | `/ai-tools/mock-interview` |
| 4 | 🏭 Company Interview Simulator | `/ai-tools/interview-simulator` |
| 5 | 🧪 Skills Analyzer | `/ai-tools/skills-analyzer` |
| 6 | 💼 Internship Navigator | `/ai-tools/internship-navigator` |
| 7 | ✉️ Cover Letter Writer | `/ai-tools/cover-letter` |
| 8 | 🧭 Career Path Planner | `/ai-tools/career-path` |
| 9 | 🔥 LinkedIn Optimizer | `/ai-tools/linkedin-optimizer` |
| 10 | 📊 CV Evaluation (resume scoring) | `/ai-tools/cv-evaluation` |
| 11 | 📝 Resume Creator | `/ai-tools/resume-creator` |
| 12 | 🎙️ Roast my resume | `/roast` *(lives at root, not under `/ai-tools/*`, but appears in the unified catalogue)* |
| 13 | 💰 EV Salary Explorer | `/salaries` *(salary-comparison tool — counted in the catalogue alongside the AI tools)* |

### 7.12 Compass / Career Explorer — `/career-explorer`

AI tells the candidate which adjacent EV careers they could pivot into, ranked by fit, with the exact skill gap to bridge each + INR salary bands.

---

## 8. Recently shipped features

This section covers what landed in the last 2 days — features your team should test first.

### 8.1 Recruitathon inline-signup flow

**What:** A single-page form at `/fairs/[slug]/register?as=<persona>` that creates the platform account + the fair registration in one submission. Three personas:
- `?as=candidate` — student/fresher form
- `?as=employer` — hiring company form
- `?as=tpo` — placement officer form

**Why it matters:** The "register form only" approach gave us 0% platform signups. The "full profile wizard" approach gave us ~25% but high friction. Inline signup gives ~65% with full data capture for the placement team.

**Test it:** Visit `/fairs/bharat-emobility-recruitathon-2026-delhi/register?as=candidate` → fill the form → land on welcome screen with check-in code + profile-completion banner.

### 8.2 TPO invite-link feature

**What:** Approved TPOs get a stable URL: `/fairs/[slug]/register?as=candidate&tpo=<token>`. Students who register via that URL are auto-credited to the TPO's college in the dashboard. The token never expires.

**Test it:** As an admin, approve a test TPO at `/admin/colleges`. Log in as them → visit `/tpo` → copy the invite URL → register a test student → confirm the TPO sees the new registration on their dashboard.

### 8.3 Brochure uploads

**What:** Per-fair PDF brochures (one for hiring partners, one for colleges/TPOs). Surfaced as download CTAs on the public fair page.

**Test it:** Admin → `/admin/fairs/[id]` → Brochures card → upload two PDFs → visit `/fairs/[slug]` and confirm the download buttons render.

### 8.4 QR code on fair pass

**What:** The candidate's `/me/fairs/[slug]/pass` page now renders an SVG QR code (encoding the 6-char check-in code) below the text code.

**Test it:** Register a test account for a fair → visit `/me/fairs/[slug]/pass` → see QR + text code. Scan the QR with your phone — should decode to the check-in code.

### 8.5 ICS calendar export

**What:** Two ICS download buttons on the fair pass page. One for the fair-day event, one for booked interview slots (one VEVENT per slot).

**Test it:** Book an interview slot at a fair → visit `/me/fairs/[slug]/pass` → click "📅 Interview slots → calendar" → import the file into Google Calendar.

### 8.6 Broadcast fair-targeting

**What:** Admin can now broadcast to fair-specific audiences (registered candidates, registered employers, registered TPOs, or everyone at a fair). Channel options: in-app / email / SMS / WhatsApp.

**Test it:** `/admin/broadcasts` → compose → pick "Fair candidates" + a fair from the new selector + check WhatsApp → Save & send now → check worker logs for fanout.

### 8.7 Pre-event reminder emails

**What:** Cron worker (`workers/processors/fair-reminders.ts`) ticks every 10 min. Fires automated reminders at T-7 days, T-3 days, T-1 day, T-1 hour before the fair to every registered candidate. In-app + email.

**Test it:** Cron-managed; check worker logs for `[fair-reminders] enqueued` lines.

### 8.8 Live admin event dashboard

**What:** `/admin/recruitathon/[slug]/live` — auto-refreshing every 15s. KPI tiles (registrations / check-ins / slot utilization), booth status, source mix, latest 8 signups.

**Use:** On the day of any fair, keep this open on a big screen for the operations team.

### 8.9 Floor map

**What:** Admin uploads a marked-up venue layout image. Public fair page renders it in a dedicated "Floor map" section.

**Test it:** Admin → `/admin/fairs/[id]` → Floor map card → upload PNG/JPEG → visit `/fairs/[slug]` and confirm rendering.

### 8.10 Employer QR scanner

**What:** Companies with confirmed booths get `/employer/fairs/[id]/scan` — type candidate's 6-char code → opens their public profile in new tab with `?fairCtx=` query.

**Test it:** Have an employer-side test account at a confirmed-booth fair → visit the scanner → type a real registered check-in code → confirm the candidate profile opens.

### 8.11 Employer pre-screen view

**What:** `/employer/fairs/[id]/candidates` — filterable list of all candidates registered for a fair, with filter chips for fair mode / experience level / DIYguru-verified / EV-experience.

**Test it:** As an employer with confirmed booth → click "👥 Pre-screen candidates" on the employer fair page → see list + filters.

### 8.12 TPO real-time check-in counter

**What:** When a fair the TPO has students at is IN_PROGRESS, a "Live now" card appears at the top of `/tpo` showing "X of Y checked in" + the 5 most recent check-ins. Auto-refresh every 30s.

**Test it:** Have a fair IN_PROGRESS + at least one student registered via a TPO's invite link → log in as the TPO → see the live card.

### 8.13 News widget

**What:** "EV industry news" card on `/feed` right rail. Top 5 Google News headlines about EV industry, refreshed every 15 min. Click any headline → opens publisher article in new tab.

**Test it:** Sign in → visit `/feed` → see news widget. Each headline should be a real recent EV news story.

### 8.14 LinkedIn UI parity

**What:** Major visual refresh across all pages — pill-shaped buttons (replacing rounded squares), `font-semibold` weight (replacing `font-bold`), tighter card spacing, refreshed post-card action bar (Like / Comment / Repost / Send as equal-width cells with icons).

**Notice it everywhere** — every button on the platform is now a pill; every section title is softer; every post in the feed has a 4-tab action bar at the bottom.

### 8.15 Fair landing page redesign

**What:** The public fair page (`/fairs/[slug]`) is being progressively redesigned — premium hero with green-mesh gradient backdrop (replaces flat black overlay), oversized centerpiece stat band, more sections to follow.

**Visit:** `/fairs/bharat-emobility-recruitathon-2026-delhi` to see the in-progress redesign.

---

## 9. Roadmap

Two features the team will ask about. Both are **planned but not yet built** — we have working substitutes in place so the team isn't blocked. If a recruiter or candidate asks "can the platform do X?", use this section to answer honestly: "the substitute works today; the proper version is on the roadmap."

### 9.1 "Why this candidate" — dedicated GPT explanation panel

**What it will be:** A standalone "✨ Why this candidate?" button on every application detail page and ATS drawer that, on click, calls GPT-4o to produce a 3-4 sentence explanation of why this specific candidate fits THIS specific job — pulling from the candidate's resume, skill graph, EV-domain tags, and the JD. Cached per (job, candidate) pair so the same click doesn't re-bill OpenAI.

**Work estimate:** ~1 day of OpenAI integration work (prompt template + caching layer + button + drawer surface + cost-tracking entry).

**What we have today (the substitute):**
- Go to `/employer/jobs/[id]/matches` → tick **"✨ AI re-rank with explanations"** → submit
- The top 25 candidates each get a **one-line** `✨ ...` italic reason rendered under their headline
- That reason is GPT-4o generated, scoped to that JD, and costs a few cents per click
- Limitations vs. the planned feature: one-liner only (no detail); only on the matches page (not application detail or ATS); only top 25; have to re-trigger via the form

**When to use the substitute:** Recruiter wants a quick "why is this person at the top?" answer while triaging a fresh JD. Open matches → tick the checkbox → scan the italics.

**When to wait for the roadmap version:** Recruiter wants a deep "tell me everything about why this candidate fits before I phone-screen them" answer inside the application drawer. Until shipped, manually open the candidate's profile + the JD side-by-side.

### 9.2 Google Calendar OAuth sync for interviews

**What it will be:** During employer onboarding (and on the candidate's profile settings), a "Connect Google Calendar" button. Once connected, every scheduled interview auto-creates a Google Calendar event on **both** the interviewer's and the candidate's calendars, with the meeting link, location, dial-in details, and a description block. Updates (re-schedule, cancel) propagate. Two-way sync (candidate moves the event on Google Calendar → reflects on emobility.careers) is a stretch goal.

**Work estimate:** ~1 day of OAuth work (Google Cloud project + OAuth consent screen + access/refresh token storage + create/update/delete event calls + reconciliation when a candidate disconnects).

**What we have today (the substitute):**
- **Interview ICS download** — every upcoming interview on `/me/interviews` has a `📅 Add to calendar` button that downloads a standards-compliant `.ics` file. Opening it in Google Calendar / Apple Calendar / Outlook adds the event with the right time, duration, mode, meeting link, and location. The file uses a stable UID (`Interview.icsUid`), so if the interview gets rescheduled and the candidate re-downloads, their calendar updates the existing event instead of creating a duplicate.
- **Fair slot ICS** — same pattern at `/me/fairs/[slug]/slots.ics` for fair interview slots (batch download of all slots for one fair).

**When to use the substitute:** Always, until OAuth ships. ICS is industry-standard and works in every calendar app.

**When to wait for the roadmap version:** Employer side wants interviews to auto-appear on their interviewer panel's calendars without each panelist having to download and import an ICS file every time. Currently the recruiter has to email the panel manually, or the panelists pull the ICS from the candidate-facing page (not ideal).

### Why these two are flagged but not built yet

We chose to ship the **substitutes** (rerank reason, ICS download) first because:
1. They unblock 90% of the use-case at 10% of the build cost
2. They don't introduce external service dependencies (OAuth consent, Google API quotas) that need separate ops attention
3. They let us see actual demand — if the team / users repeatedly ask for the deeper version, we'll prioritise the build

If you (placement team / TPOs / employers) are repeatedly hitting the substitute's limits, **report it the same way you'd report a bug** (section 11) — that's how we'll know to promote the roadmap item.

---

## 10. Common questions + known issues

### "I see 403 Forbidden when I visit /admin"

Your account doesn't have role=ADMIN. Email an engineer to set it.

### "I can't approve a TPO — the Approve button does nothing"

Check the audit log at `/admin/audit` — the action likely succeeded but the page didn't refresh. Hard-refresh the browser (Cmd+Shift+R / Ctrl+Shift+R).

### "I uploaded a brochure but the public page still shows the old PDF"

Browser cache. The new file is at the same URL — hard-refresh, or wait ~5 min for the CDN cache to expire. The link now has a `?v=timestamp` query that updates on every admin replace, so subsequent loads always get the new file.

### "A candidate registered for the fair but didn't get an email"

Check:
1. Their email is verified (they clicked the verification link). Unverified accounts can't receive notifications.
2. Worker is running (`pm2 status worker` on the server should show "online").
3. Check `/admin/delivery` for delivery failures (bounces, blocks).

### "Broadcasts say 'Sending' for hours and never complete"

Worker may be stuck or down. Engineer fix: `pm2 restart worker`.

### "QR code scanner at the venue can't read a candidate's pass"

The QR encodes the 6-character check-in code. Backup: type the code into the admin scanner at `/admin/fairs/[id]/check-in`.

### "I added a job to a fair but it doesn't show up on the public fair page"

Check:
1. The job is published (`status: OPEN`, not DRAFT)
2. The `RecruitmentDriveJob` row was created (visible in admin fair detail page)
3. Hard-refresh the public page

### "I clicked 'Register as candidate' on a fair I created but it asks me to sign up"

That fair is in DRAFT or CANCELLED status. The public-facing CTAs are hidden for non-OPEN fairs. Move the fair to OPEN at `/admin/fairs/[id]` lifecycle controls.

### "The TPO dashboard shows 0 students from my college even after they registered"

Either:
1. Students registered without using the TPO's invite link (so they're not credited to that cell)
2. The TPO's cell is PENDING (invite token not yet minted — admin needs to approve)
3. The students' Education row institution name doesn't match the canonical institution (less common — the invite-link path tags them correctly regardless)

### "I see weird greenish backgrounds on some pages but not others"

That's the in-progress fair-page redesign. Public fair pages (e.g. `/fairs/bharat-emobility-recruitathon-2026-delhi`) are being progressively restyled. Other pages still use the older Card-on-light-bg pattern.

### "A candidate's DIYguru badge is missing even though they're a DIYguru student"

The badge is set in two ways:
1. Auto: their email appears in an admin-uploaded DIYguru roster CSV
2. Manual: admin flips `isDIYguruVerified = true` on their CandidateProfile

The candidate's "Yes, I'm a DIYguru student" answer on the inline-signup form does NOT auto-flip the badge — that's an intentional security gate (prevents self-claim). The answer is stored in `formAnswers.isDIYguruStudent` so admin can cross-reference later.

### "I exported a CSV but Excel shows garbled characters for Indian names"

The CSV is UTF-8 with a BOM (byte-order mark). Modern Excel handles it correctly. If you're on an old Excel, open via Data > From Text and pick UTF-8 encoding.

---

## 11. How to report bugs

When you find something broken, send the engineering team this template (Slack / email / WhatsApp — whichever channel you use):

```
WHAT I DID:
[Step-by-step what you clicked / typed / uploaded]

WHAT I EXPECTED:
[What you thought would happen]

WHAT ACTUALLY HAPPENED:
[Error message / wrong behaviour / blank page / etc.]

WHERE:
- URL: [the full URL where it happened, e.g. https://emobility.careers/admin/fairs/123]
- Persona: [Admin / Employer / TPO / Candidate]
- Browser: [Chrome / Firefox / Safari + version]
- Device: [Desktop / Phone / iPad]
- When: [time + date, India IST]

SCREENSHOTS:
[Attach 1-3 screenshots showing the issue]

URGENCY:
[Blocks me from doing my job / Annoying but workable / Cosmetic]
```

**Severity guide:**
- **Critical** — page won't load, payment failed, data lost, security issue → call/WhatsApp immediately
- **High** — feature doesn't work but I have a workaround → same-day reply expected
- **Medium** — feature works but looks/feels wrong → fixed in the next deploy window
- **Low** — cosmetic / spelling / minor copy issue → bundled into the next polish pass

### What to NOT do

- ❌ Don't try to "fix" it by clicking around randomly — you might create more bad data
- ❌ Don't share an admin URL with a non-admin colleague — most admin URLs 403 outside the team, but some surface data they shouldn't see
- ❌ Don't delete a user / company / job that "looks broken" — usually the better fix is to mark it for admin review

### What TO do

- ✅ Capture a screenshot the moment something looks off
- ✅ Note the EXACT URL — `/admin/fairs/abc123` is more useful than "the admin fairs page"
- ✅ Include the candidate / company / fair name so the engineer can pull the row from the DB
- ✅ If it's reproducible, write the exact steps to reproduce
- ✅ If you fix it yourself (e.g. by re-uploading or re-approving), tell the engineer anyway so they can audit whether automation should have handled it

---

## Closing notes

The platform has ~50+ feature surfaces and grows weekly. This guide will need updates whenever a new feature lands. Your engineer should refresh the "Recently shipped features" section after each deploy.

**For the placement team specifically:** the most-used tools day-to-day are:
1. `/admin/recruitathon` + its Live dashboard during fair days
2. `/admin/broadcasts` for sending reminders + updates to specific fair audiences
3. `/admin/colleges` for approving TPO applications
4. `/admin/fairs/[id]` for managing each fair's logistics

**For ongoing platform health:**
1. `/admin/operations` — daily health check
2. `/admin/audit` — weekly review of admin actions
3. `/admin/reports` + `/admin/post-reports` — moderation queue, drain daily

Welcome to the team. Break things gently and tell us when you do.
