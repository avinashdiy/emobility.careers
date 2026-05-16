# What's New on emobility.careers — Last 48 Hours

A plain-English walkthrough of every feature shipped in the last two
days, who it's for, where to find it on the site, and how to use it.
No engineering jargon — you don't need to read a single line of code
to use this document.

---

## TL;DR — three sentences

1. **Candidates** got a much richer profile experience — Open-to-Work
   signals, an AI Career Explorer, free verified-skill badges, a
   "Top Applicant" tag on jobs they're a strong fit for, weekly
   profile-views analytics, and EV community groups they can join.
2. **Recruiters** got a long list of force-multipliers — an AI
   summary on every applicant, "Draft with AI" for outreach, bulk
   WhatsApp invites, multi-step outreach sequences (cadences),
   if-this-then-that pipeline automations, a vernacular AI calling
   agent that can phone-screen candidates in 10 Indian languages, an
   AI Hiring Assistant that ranks/drafts/chases on its own, and a
   completely re-designed ATS kanban that fits more candidates without
   cramming.
3. **Everyone** gets the polish — faster page loads (skeletons while
   things load), cleaner notifications (dismiss one or clear all), a
   slimmer site header, an "AI Tools" entry in the Discover menu, and
   a thumb-reachable mobile bottom nav for jobs / inbox / profile.

---

## Table of contents

- [For candidates (job-seekers)](#for-candidates-job-seekers)
- [For recruiters (employers)](#for-recruiters-employers)
- [For admins](#for-admins)
- [Site-wide UI improvements](#site-wide-ui-improvements)
- [Quick "where do I find things" cheatsheet](#quick-where-do-i-find-things-cheatsheet)
- [Known issues & heads-up](#known-issues--heads-up)
- [Questions](#questions)

---

# For candidates (job-seekers)

## 1. Open-to-Work + Hiring-Now rings on profile pictures

**What it does.** A candidate can switch on "Open to Work" from their
profile settings. Their avatar gets a soft green ring on every public
surface (their profile page, the kanban, search results) so recruiters
spot active candidates at a glance. Engineers can equivalently mark
themselves "Hiring now" to surface the other side of the marketplace.

**Where to find it.** Sign in → `/me/profile` → Open the "Visibility &
preferences" section → toggle "Open to Work" or "Hiring now". Both can
be on at the same time; "Hiring now" wins visually if both are set.

**How recruiters see it.** On the recruiter's candidate search page
(`/employer/candidates`) every avatar with the ring is highlighted.
Candidates with the ring also rank slightly higher in search.

> Note: we intentionally do NOT show the green ring on the ATS kanban
> cards (where the recruiter is already looking at applicants — every
> one of them applied, so an "I'm open to work" badge would be
> redundant noise). It shows up everywhere else.

## 2. "Top Applicant" badge

**What it does.** When a candidate applies to a job and our matching
system thinks they're in the top ~15% by fit, their application card
gets a glowing "Top Applicant" tag visible to the recruiter. For the
candidate it shows up on their `/me/applications` page so they know
their application has been algorithmically flagged as strong.

**How to use it.** Candidates don't have to do anything — it's
automatic. Recruiters see it on the kanban + the application detail
page.

## 3. WhatsApp share-a-job

**What it does.** Every job posting now has a "Share on WhatsApp"
button that opens WhatsApp with a pre-filled message containing the
job title, company, and a link back to the listing.

**Where to find it.** Any job page (e.g. `/jobs/<id>`) → look for the
green WhatsApp icon next to the apply button.

**Why it matters.** ~80% of our blue-collar candidate traffic comes
from WhatsApp shares; this is now one tap instead of "copy URL → open
WhatsApp → paste".

## 4. Profile Quality Score

**What it does.** A 0–100 score on the candidate's profile dashboard
that grades how complete their profile is across five axes — basics
(name, photo, headline), experience, skills, education, and
preferences (location, salary, availability). Each axis gets a
breakdown so the candidate knows exactly what's missing.

**Where to find it.** Sign in → `/me/profile` → the score sits at the
top of the profile sidebar.

**How to use it.**
1. Click each section with a "Needs attention" mark.
2. Fill in the missing fields (resume parse will pre-fill most).
3. The score updates immediately; recruiters favour ≥80 profiles in
   search ranking.

**Recruiter-visibility hint.** Profiles below 50 are gently
de-prioritised in search rankings; this is shown to the candidate as
a soft "Recruiters are more likely to find you at 80+" copy so they
know why it matters.

## 5. Profile Performance — weekly search-appearance tracker

**What it does.** Tells the candidate how many recruiter searches
they appeared in this week, with a week-over-week comparison. Shows
trend over the last 4 weeks.

**Where to find it.** `/me` → the "Profile performance" card on the
dashboard.

**Why it matters.** Candidates see real momentum data — "+18 searches
vs last week" — which keeps them engaged and motivates them to fill
gaps in their profile.

## 6. Curated, tiered job feed

**What it does.** The candidate's `/feed` and the `/me/jobs` view
groups recommended jobs into three tiers:

- **Exact match** — every must-have skill is a hit; jobs the candidate
  could realistically interview for tomorrow.
- **Strong match** — most skills hit, missing 1–2 secondary ones.
- **Adjacent** — career-stretch suggestions; jobs the candidate could
  grow into.

Each tier shows a short "why this job" explanation generated by AI.

**Where to find it.** `/feed` for the candidate's home feed, or
`/jobs` for the full search experience with the same tier badges.

## 7. EV Community Groups

**What it does.** Topic-based community spaces (Battery, BMS, Motor,
Charging, Powertrain, EV Software, Manufacturing, etc.) where
candidates can join, follow updates, see members, and watch curated
posts. A group's content surfaces in the candidate's main feed.

**Where to find it.** Top nav → "Groups" (signed-in candidates), or
directly at `/groups`.

**How to use it.**
1. Browse `/groups`.
2. Click a group of interest.
3. Hit "Join". You'll see new posts from the group in your feed.

## 8. EV Career Explorer

**What it does.** A no-auth public AI tool. The candidate types in
their current role + a few skills, and AI maps 6–8 adjacent EV career
paths with a fit-percentage, salary band, skill gap, and 2–3 prep
links per suggestion.

**Where to find it.** Top nav → Discover → "Career Explorer", or
directly at `/career-explorer`.

**How to use it.**
1. Type your current role (e.g. "Battery Cell Engineer").
2. Paste 8–12 comma-separated skills.
3. Optionally pick your primary EV domain.
4. Click "✨ Show me my next moves".
5. Get a ranked list of 6–8 adjacent roles with skill-gap analysis
   and prep links. There's a copy-share-link button so the result can
   be shared on LinkedIn / WhatsApp.

**Note.** Results are cached for 30 days — running with the same
inputs comes back instantly from cache instead of burning OpenAI
tokens.

## 9. Verified EV Skill Badges (free)

**What it does.** Free 30-minute MCQ assessments candidates can take
to earn a "Verified in <skill>" badge that shows up on their public
profile and lets recruiters filter for verified candidates.

**Where to find it.** Top nav → Discover → "Verified skill badges",
or directly at `/skills`.

**How to use it.**
1. Pick a skill domain (Battery, BMS, Charging, Powertrain, Safety).
2. Click "Start assessment" on the one you want.
3. Answer ~10 multiple-choice questions (~30 min, no time limit
   beyond a friendly timer).
4. Submit → instant grade. ≥70% earns the verified badge.
5. The badge sticks to your profile permanently and is filterable by
   recruiters in `/employer/candidates`.

> **Status:** the skill library is currently empty pending the
> EV-domain question banks the user will populate. Once questions are
> added (via the admin tools), candidates can take assessments and
> earn badges normally.

## 10. Best EV Employers (annual rankings)

**What it does.** A leaderboard of EV companies in India based on
anonymous employee reviews submitted on the platform. Categories
include Best Overall, Best for Battery, Best for Charging, Best for
Freshers, Best Remote Culture, and more. Re-computed yearly.

**Where to find it.** Top nav → Discover → "Best EV Employers", or
directly at `/awards`.

**How candidates can contribute.** Click "Write a review" on any
company page (`/companies/<slug>`). Reviews are anonymous, moderated
by admins, and published within 24 hours.

---

# For recruiters (employers)

## 1. AI Applicant Summary on every applicant

**What it does.** Every application card in the ATS now carries a
short, plain-English AI summary explaining why this candidate is or
isn't a fit for the role. Generated automatically the first time the
recruiter opens the application detail page, cached after that, and
refreshable on demand.

**Where to find it.** ATS → click any candidate → top of the
application detail page (`/employer/applications/<id>`).

**How to use it.**
1. Open any applicant in the ATS.
2. The "✨ AI summary" card sits near the top.
3. Read the one-paragraph fit explanation.
4. Click "Refresh" if the candidate's profile has materially changed
   since the summary was generated.
5. While it's regenerating you'll see a soft "Reading profile →
   Synthesising → Writing" progress indicator.

**Cost guardrails.** Uses gpt-4o-mini (cheap), cached per application,
and re-generation is a manual button, not an auto-loop.

## 2. "Draft with AI" for outreach messages

**What it does.** In any messaging thread (`/employer/messages/<id>`)
the recruiter can click "✨ Draft with AI" and the message composer
will fill with a personalised first-touch message — the AI uses the
candidate's profile + the job context to write a warm, role-specific
outreach the recruiter then reviews + tweaks + sends.

**Where to find it.** Open any messaging thread → look for the "Draft
with AI" button next to the Send button.

**How to use it.**
1. Click "✨ Draft with AI".
2. If you'd already started typing, you'll get a confirm before AI
   overwrites your draft.
3. AI fills the composer in ~3 seconds.
4. Edit anything you want.
5. Hit Send.

## 3. Verified-trust signals + last-active pill on ATS cards

**What it does.** Every applicant card now shows tiny inline glyphs
next to the name:

- ✓ — ID-verified
- 🏅 N — count of verified EV-skill badges earned
- ⭐ — DIYguru graduate
- ✨ — invited by AI
- A coloured dot + short text — last active (green = today, amber =
  this week, grey = older)
- A bold percentage — match score (e.g. `92%`)

**Where to find it.** ATS view (`/employer/jobs/<id>/ats`) — every
card has this signal cluster.

**How to use it.** Pure visual — scan the column for the strongest
signals. Hover any glyph to see what it means in a tooltip.

## 4. Bulk WhatsApp Invite

**What it does.** Multi-select candidates in the ATS kanban and send
each of them a personalised WhatsApp message in one batch. Useful for
shortlisting flows like "tell these 12 candidates to schedule an
interview slot".

**Where to find it.** ATS → tick the checkbox on each candidate you
want → the "Selection bar" appears at the top of the page → click
"WhatsApp selected".

**How to use it.**
1. Tick checkboxes on the candidates you want to message.
2. In the selection bar that appears, click "WhatsApp selected".
3. A dialog opens with a message template you can edit.
4. Tokens like `{{candidateFirstName}}` are replaced per recipient.
5. Hit Send — each candidate gets a separate, personalised WhatsApp.

**Note.** Cold-spam gates apply — the recruiter can only WhatsApp
candidates who've applied to a company role OR who the recruiter has
explicitly saved.

## 5. Sequenced outreach (Cadences)

**What it does.** Build a multi-step automated outreach sequence —
e.g. Day 0 → first message, Day 4 → follow-up, Day 10 → final
nudge — and enrol candidates into it. The engine sends each step at
the right time, on the recruiter's behalf, and auto-stops if the
candidate replies.

**Where to find it.** Employer nav → "Cadences", or directly at
`/employer/cadences`.

**How to use it.**
1. Click "Create cadence".
2. Name it (e.g. "Senior BMS — slow-burn").
3. Optionally scope it to one job, or leave it company-wide.
4. Add steps. Each step has a delay in days + message body.
5. Use tokens like `{{candidateFirstName}}`, `{{jobTitle}}` in the
   message body — they get replaced per recipient at send time.
6. Save.
7. From any ATS card OR candidate-search row → "Enrol in cadence" →
   pick one of your cadences.
8. The engine fires every hour (cron tick) and sends steps that are
   due. If the candidate replies on the thread, status flips to
   RESPONDED and the cadence stops automatically.

## 6. Pipeline Automations (if-this-then-that)

**What it does.** Set rules that fire when applications land or move
stages, and have them auto-move the candidate, ping the team, or send
a templated reply.

**Examples.**
- "If an applicant has match ≥ 80% AND holds ARAI certification →
  auto-move to Shortlisted."
- "If an applicant has < 3 years experience on a senior role →
  reject with a kind note."
- "If anyone with the DIYguru badge applies → notify the team in
  Slack via webhook."

**Where to find it.** Employer nav → "Automations", or directly at
`/employer/automations`. Per-job rules live at
`/employer/jobs/<id>/automations`.

**How to use it.**
1. Click "Create rule".
2. Pick a trigger: `Application received` or `Stage changed`.
3. Set conditions — match score, must-have skills, must-have verified
   badge, location, EV domain, experience, etc.
4. Pick an action — `Auto-move stage`, `Notify team`, `Send template`,
   or `Reject with reason`.
5. Save → it fires on every matching event from then on.

Every firing is logged so the recruiter can see "this rule fired 14
times this week".

## 7. AI Hiring Assistant

**What it does.** A per-job agentic loop. When enabled, every 24
hours the assistant:

1. **Ranks** the new applications by match score.
2. **Drafts** personalised first-touch outreach for the top N
   candidates the recruiter hasn't messaged yet.
3. **Chases** non-responders after a configurable delay.

After each run, the recruiter gets an in-app notification with a
plain-English summary — "I drafted 5 outreach messages and chased 3
non-responders. Top candidate this round: Asha Singh (94% match,
verified BMS, 4 yrs Ola)."

**Where to find it.** ATS → click "🤖 AI assistant" at the top of the
job → or directly at `/employer/jobs/<id>/assistant`.

**How to use it.**
1. Click "Enable assistant".
2. Tune the settings: draft batch size (default 5/run), follow-up
   delay (default 4 days, set to null = no chase), tone (FORMAL /
   WARM / CASUAL), max outreach per tick (cost cap).
3. Hit Save.
4. The daily cron picks it up. Or click "⚡ Run now" to fire
   immediately — you'll see a 3-step progress indicator while it runs
   ("Ranking applications → Drafting outreach → Sending").

**Why this is special.** Drafts are written in the recruiter's own
voice/tone settings, NOT generic. Each one references the candidate's
real profile data ("I noticed you led the BMS team at Tata Motors
2021-2023…"). The assistant never sends without a recruiter's
explicit setup; the recruiter can review every drafted message in the
audit log.

## 8. Vernacular AI Calling Agent

**What it does.** Phone-screens candidates in their preferred Indian
language (English-IN, Hindi, Tamil, Telugu, Kannada, Marathi, Bengali,
Gujarati, Punjabi, Malayalam). Takes a 3–7 question script the
recruiter provides (or auto-derives from the job description), calls
the candidate, transcribes the answers, scores fit 0–100 with a
recruiter-facing summary, strengths, and concerns. Status lands back
in the ATS.

**Where to find it.** Application detail page → "Call this candidate"
button → or browse all call sessions at `/employer/calling`.

**How to use it.**
1. Open any application.
2. Click "Call this candidate".
3. Pick the language.
4. Optionally paste a custom 3–7 question script (or leave blank to
   use the default 5-question screen).
5. Click "Queue call".
6. The system translates the script into the candidate's language,
   dials them via our calling provider (Exotel), runs the script,
   transcribes, scores, and posts the summary back to the ATS.
7. The recruiter gets a notification when the call completes.

**Status caveats.** The webhook handler for production providers is
wired but the EXOTEL credentials need to be set in production env
vars before live dialing works. Without provider credentials, the
"Queue call" button shows a friendly "Calling provider not configured
— ask your admin" message.

## 9. Active-profile filter (last-active pill)

**What it does.** Candidate-search and the ATS now show how recently
each candidate logged in (green dot today / amber this week / grey
older). Recruiters can filter searches to "active in the last 7 days"
to focus on candidates who'll actually reply.

**Where to find it.** Visible on every ATS card automatically. On
`/employer/candidates` there's a new "Active in last 7 days" filter
toggle.

## 10. Cleaner ATS pipeline view (V2 + V3 redesign)

**What it does.** The kanban board has been rebuilt twice in this
sprint:

**V2 changes:**
- Trust signals (✓ ID, 🏅 N) now sit inline next to the candidate's
  name — they used to take their own wrap row.
- Match score, last-active, and DIYguru sit on one tight meta line.
- The AI summary preview moved off the card (the detail page has
  more room).
- Open-to-Work green rings removed (the kanban was reading 100% green
  because every applicant has the ring).

**V3 density pass:**
- Column min-width bumped from 220px → 240px.
- Avatar shrunk from 32px → 28px.
- Checkbox shrunk from 14px → 12px.
- Headlines now wrap to 2 lines instead of truncating after 20 chars
  — "EV Diagnostics & Field Support | MATLAB-Simulink" now shows in
  full instead of "EV Diagnostics & F…".
- Names that genuinely don't fit get a hover-tooltip with the full
  name.
- Column headers slim — a thin coloured top bar + stage name + count,
  no more chip-style background.
- Empty columns are quiet at rest, light up green only when you're
  dragging onto them.
- Rejected + Withdrawn collapsed into a single "Show archived ▸"
  accordion under the active kanban.

**Where to find it.** Any job's ATS view —
`/employer/jobs/<id>/ats`.

## 11. EV facet filters on candidate search

**What it does.** New first-class filters on candidate + job search:

- **Powertrain area** — Battery / BMS / Motor / Charging / Power
  Electronics / Vehicle Integration / Software / Manufacturing.
- **Pack size (kWh)** — numeric facet ("roles working with packs over
  50 kWh").
- **Charger output (kW)** — same pattern for charging-infra roles.
- **Diversity tags** — "Diversity hire preferred",
  "Veteran-friendly", "Women-returner programme".
- **Company tier** — OEM / Tier 1 supplier / Tier 2 / Startup /
  Charging operator / Research / Consulting.

**Where to find it.** `/employer/candidates` (and `/jobs` for the
candidate side) → filter panel on the left.

---

# For admins

## 1. Best EV Employer review moderation

**What it does.** A new moderation queue for company reviews
submitted by anonymous candidates / verified employees. Each review
needs admin approval before publishing.

**Where to find it.** Admin sidebar → "Reviews", or directly at
`/admin/reviews`.

**How to use it.**
1. Open the moderation queue.
2. Read the review.
3. Click "Publish" or "Reject" (Rejected reviews are kept in the DB
   for audit but never shown to candidates).
4. Optionally add a moderation note.

## 2. Yearly Employer Awards computation

**What it does.** Admin tool that computes the year's "Best EV
Employers" categories from review data and writes the leaderboard.

**Where to find it.** Admin sidebar → "Awards", or directly at
`/admin/awards`. Click "Recompute" to refresh.

## 3. Skill assessment library admin

**What it does.** Admin can browse, edit, and toggle the public/private
flag on every skill assessment in the library.

**Where to find it.** Admin sidebar → "Skills", or directly at
`/admin/skills`.

**How to populate the library with real EV questions.** Two ways:

1. Run our seed script on the server (gives you 5 ready-made
   assessments: Battery Fundamentals, BMS Architecture, EV Powertrain
   Basics, Charging Infrastructure, EV Safety & Standards). Ask the
   eng team to run `npx tsx scripts/seed-wave-c.ts` on the server.
2. Add your own through the admin panel.

## 4. AI Ops cost dashboard

**What it does.** Tracks every OpenAI call made by the platform, who
made it, what feature it powered, how many tokens used, and what it
cost. Lets admins watch AI spend in real time and catch runaway loops.

**Where to find it.** Admin sidebar → "AI Ops", or directly at
`/admin/ai-ops`.

---

# Site-wide UI improvements

## 1. Faster page loads (loading skeletons)

**What it changed.** Eight pages that previously showed a blank screen
during data-fetch now show a skeleton placeholder (faint grey
silhouette of the layout) within ~50ms. Pages: Career Explorer,
Skills library, Skill detail, Awards, Cadences, Automations, Calling,
AI Assistant.

**Why it matters.** Pages feel ~3× faster perceptually even though
the data-fetch time hasn't changed — the eye lands on stable layout
shapes immediately instead of an empty white screen.

## 2. Cleaner notifications

**What changed.** The notifications page (`/me/notifications`) now
has:

- An **× button on every notification** — dismisses just that one.
- A **"Clear all" button** in the header — removes every notification
  in one go, with a confirm prompt before deletion.
- "Mark all read" stays (does what it did before, but only shows when
  there's at least one unread).

**How to use it.**
- Click × on any row to dismiss it.
- Click "Clear all" to wipe everything (confirm prompt first).

## 3. Slimmer language switcher

**What changed.** The "EN · ENGLISH" pill in the header is gone.
Replaced by a single 36×36 globe icon. Clicking opens the language
picker (HI, EN, etc.) with full language names inside the dropdown.

## 4. "AI Tools" in the Discover menu

**What changed.** The Discover dropdown (top nav) now has an "AI
Tools" entry next to Jobs, surfacing the existing AI-tools hub
(`/ai-tools`) which links to: resume creator, interview prep, mock
interview, interview simulator, cover-letter generator, career-path
advisor, LinkedIn optimiser, expert CV evaluation, skills analyser,
internship navigator, and resume roast.

## 5. Mobile bottom-bar nav

**What changed.** On phones (under 768px), there's now a thumb-
reachable bottom bar with 4 tabs: Feed / Jobs / Inbox / Me. Hidden
on desktop and on admin / employer pages where the existing side
nav serves the same role.

**Where to find it.** Visible automatically when you open the site on
your phone.

## 6. AI streaming/progress indicator

**What changed.** Slow AI operations (Career Explorer, AI Hiring
Assistant run, AI Summary refresh, JD writer) now show a 3-step
progress pill ("Reading → Thinking → Writing") instead of a silent
spinner. Users know the system is working and roughly how far
through it is.

## 7. Theme toggle removed

**What changed.** The dark/light/system theme toggle that briefly
appeared in the header has been removed. The site is light-mode
only. The CSS for the unused dark mode has been fully stripped.

---

# Quick "where do I find things" cheatsheet

| What                          | Where (top nav → submenu)      | Direct URL                              |
| ----------------------------- | ------------------------------ | --------------------------------------- |
| Browse jobs                   | top: Jobs                      | `/jobs`                                 |
| AI Career Explorer            | Discover → Career Explorer     | `/career-explorer`                      |
| Verified Skill Badges         | Discover → Verified skill…     | `/skills`                               |
| Best EV Employers             | Discover → Best EV Employers   | `/awards`                               |
| AI Tools hub                  | Discover → AI Tools            | `/ai-tools`                             |
| Community Groups              | top: Groups                    | `/groups`                               |
| Feed                          | top: Feed                      | `/feed`                                 |
| My profile                    | top-right: Me                  | `/me/profile`                           |
| My applications               | top-right: Me → Applications   | `/me/applications`                      |
| Notifications                 | bell icon                      | `/me/notifications`                     |
| Inbox / messages              | top-right: Me → Messages       | `/me/messages`                          |
| Recruiter dashboard           | top-right (employers): Dashboard | `/employer`                           |
| Post a job                    | top-right (employers): + Post a job | `/employer/jobs/new`               |
| Active jobs                   | (employer nav) Jobs            | `/employer/jobs`                        |
| All applicants for a job (ATS)| job page → "Pipeline" tab      | `/employer/jobs/<id>/ats`               |
| Candidate search              | (employer nav) Candidates      | `/employer/candidates`                  |
| Cadences (sequenced outreach) | (employer nav) Cadences        | `/employer/cadences`                    |
| Pipeline Automations          | (employer nav) Automations     | `/employer/automations`                 |
| Calling sessions              | (employer nav) Calling         | `/employer/calling`                     |
| AI Hiring Assistant (per job) | from any job: 🤖 AI assistant  | `/employer/jobs/<id>/assistant`         |
| Admin: review moderation      | admin sidebar: Reviews         | `/admin/reviews`                        |
| Admin: yearly awards          | admin sidebar: Awards          | `/admin/awards`                         |
| Admin: skill assessments      | admin sidebar: Skills          | `/admin/skills`                         |
| Admin: AI cost dashboard      | admin sidebar: AI Ops          | `/admin/ai-ops`                         |

---

# Known issues & heads-up

## 1. The Skills page is empty until questions are added

`/skills` currently shows nothing because the EV skill-assessment
question banks haven't been populated yet. Two options:

- Eng can run our pre-built seed (`scripts/seed-wave-c.ts`) which
  gives you 5 ready-made assessments — handy for testing but not the
  expert-grade questions you'd want for production launch.
- Or populate questions through the admin Skills page yourself once
  the EV-expert panel finalises them.

## 2. The Calling agent needs a provider credential

`/employer/calling` is wired end-to-end but won't actually dial out
until we set Exotel credentials in the production environment.
Showing the recruiter a clear "Calling provider not configured — ask
your admin" message in the meantime.

## 3. WhatsApp send uses deep-link fallback by default

Bulk WhatsApp uses `wa.me` deep-links unless WhatsApp Business Cloud
API credentials are set in production. With credentials, it sends
templated messages directly through the official API.

## 4. ATS view scrolls horizontally on laptops < 1700px wide

With 7 active stages × 240px each, the kanban exceeds laptop widths
under ~1700px. This is intentional — the alternative is squeezing
each column under 200px which puts the truncation problem right back.
On a typical recruiter desk monitor (1920px+) all 7 stages are
visible without scrolling.

## 5. Dark mode is gone

If anyone asks "where did the theme toggle go" — we removed it. The
site is light-only. The CSS underneath has been fully stripped so
this won't come back without a deliberate re-introduction.

---

# Questions

- Anything UI-related, ping the eng channel.
- For "how do I do X as a recruiter", this doc + the in-app empty
  states should cover it. If a flow is genuinely unclear, that's a
  bug — please file it as a screenshot in the team channel.
- For deploy timing (when does each of these go live on the
  production site), see `DEPLOY.md` at the repo root.

---

_Last updated: 2026-05-16 — covers everything shipped since 2026-05-14._
