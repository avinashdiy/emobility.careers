# Recruitathon Hybrid-Mode Audit — Pune (June 2026)

**Audit date**: 2026-05-24 · presenter: Avinash · audience: placement officers + company HRs

## Bottom line up front

The platform is **about 70% ready** for a hybrid Recruitathon. The data model is in place, the *registration* flow already asks candidates and employers whether they're attending OFFLINE / ONLINE / HYBRID, and the admin tooling for the event (live console, check-in scanner, broadcasts, CSV exports) is operational.

**But once a Delhi student registers as ONLINE, the rest of the flow doesn't know they exist as a remote participant.** They see the same fair page as a Pune attendee, can book any interview slot (all of which are currently modelled as physical "show up at the booth" slots with no video link), and the recruiter has no way to see "this candidate is online — here's their Meet link".

You can credibly pitch the **registration + pre-screening + applications-pipeline + post-fair tracking** as working end-to-end for online candidates *today*. You should NOT pitch live interviewing or day-of-event participation as working online — those gaps are real, and we have ~4 weeks to close them.

This report is the gap list + a phased build plan for those 4 weeks.

---

## What works today (safe to demo tomorrow)

### Registration

- `/fairs/[slug]/register` already collects `fairMode` as OFFLINE / ONLINE / HYBRID for both candidates AND employers.
- Inline-signup creates a User + CandidateProfile + RecruitmentDriveRegistration in one flow — a Delhi student can register without first signing up to the platform separately.
- The registration record carries `intendedRoles`, `willingLocations`, and a `formAnswers` JSON for any per-fair custom questions.
- TPO referral code captured (`viaTpoCellId`) so the Delhi-TPO sees which of their students registered.
- CSV roster import for bulk-inviting a college's batch — TPOs can hand over a spreadsheet and the platform mints invite emails + pre-creates registrations.

### Pre-event communications

- Per-registration reminder markers at `1 week / 3 days / 1 day / 1 hour` before — the `fair-reminders` worker fires each exactly once. Works for any registrant regardless of mode.
- Admin broadcast system can blast to "everyone registered for this fair" via email / WhatsApp / in-app.
- Candidate-facing fair page renders FAQ, primary contact, downloadable brochures, partner endorsements, speaker panel, floor map, hero stats.

### Discovery + applications

- Companies post jobs scoped to the fair via `RecruitmentDriveJob`.
- Per-fair industry tracks (Battery / Embedded / Sales & Service) drive filter chips on the public page.
- Candidates apply to roles the same way they would for any job; ATS pipeline handles the rest.
- Pre-screening via `Assessment.gateAdvance` — recruiters can require a challenge before advancing.
- Application attribution: `Application.recruitmentDriveId` set when applied via the fair flow, so post-event analytics segment fair-sourced applications.

### Day-of-event admin tooling

- `/admin/recruitathon/[slug]/live` — auto-refreshing dashboard with KPIs: registrations, check-ins, interview slot utilisation, booth status, recent signups feed.
- `/admin/fairs/[id]/check-in` — physical QR/code-scan check-in at venue.
- Broadcast targeting from the live console.
- Eligibility gate (60% profile, CV, phone, email) blocks under-prepared candidates from booking slots.

### Post-event

- CSV exports for `employers.csv` + `candidates.csv` with full registration metadata including `fairMode`.
- Audit trail of stage transitions, check-ins, slot bookings.
- `RecruitmentDriveAnalytics` library for outcome metrics.

---

## What's partial (gaps that are real but bounded)

These features have the data captured but the UI / downstream wiring doesn't act on it. Most are 1-3 days of work each.

### 1. `fairMode` is captured but ignored downstream

The registration form collects ONLINE/OFFLINE/HYBRID, but the field is referenced in only **two** places after that:
- `server/recruitathon/register-actions.ts` — writes it to the DB
- `app/admin/recruitathon/[slug]/page.tsx` — renders a small badge next to each registrant's name

It's NOT used for:
- Filtering which interview slots a candidate can book
- Branching the reminder email copy ("we'll see you at the venue" vs "your Meet link will arrive 15 min before your slot")
- Live-console KPI breakdown ("123 offline / 47 online / 12 hybrid registered today")
- Admin broadcast targeting ("blast a 'check your Meet link' reminder only to online candidates")
- Candidate's own pass page (`/me/fairs/[slug]/pass`)
- Eligibility evaluation (e.g. should an ONLINE candidate need to demonstrate bandwidth?)

### 2. Live console treats all attendance as physical

The KPI tiles count registrations / check-ins / slot bookings without segmenting by mode. On the morning of the event, the admin won't see "you have 47 online candidates waiting to start their interviews" — only the total.

### 3. Reminder copy is mode-agnostic

The `fair-reminders` worker fires the same email to every registrant. An online candidate gets the venue address; an offline candidate gets nothing about "your Meet link is here". Same `1 week / 3 day / day-before / hour-before` cadence regardless.

### 4. Pre-screening doesn't surface mode preference

Recruiters viewing their applicant list don't see "candidate registered as ONLINE for this fair" inline — they have to drill into the registration record. So when they shortlist, they don't know to pre-set a Meet link for the online ones.

### 5. Broadcast can't segment by mode

The admin can blast all-fair-registrants. They can't say "to ONLINE registrants only: your Meet link is in your registration confirmation". Same content goes to everyone.

---

## What's missing entirely (the real lift)

These are the actual product gaps that block hybrid mode end-to-end.

### 1. `RecruitmentDriveInterviewSlot` has no mode + no meeting URL

Today's schema:
```
RecruitmentDriveInterviewSlot {
  startsAt, durationMinutes, status, candidateId, notes
  // NO mode, NO meetingUrl
}
```

Consequences:
- Every slot is implicitly physical. A recruiter creating "30-min Battery role interview, 11:00 AM" has no way to mark it as online + paste a Meet link.
- An ONLINE candidate from Delhi who books a slot... shows up where? The booking confirmation page doesn't know. The slot booking form has no eligibility check on fairMode. The candidate is told "your interview is confirmed for 11:00 AM at Booth B7" — which doesn't help when they're 1,500 km away.

**Compare to**: the `Interview` model (used for ATS-side scheduling outside fairs) DOES have `mode: VIDEO|PHONE|ONSITE` + `meetingUrl`. The MentorshipSession model also has `meetingUrl` with a "Join" button pattern in `components/mentorship/SessionRow.tsx`. The pattern exists; it just wasn't ported to fair slots.

### 2. No "Join interview" CTA for the candidate

When an online candidate's slot is 15 minutes away, they need a button to click. Today there's nothing — the slot record doesn't store a URL, the pass page doesn't show one, the reminder email can't include one.

### 3. No virtual booth experience

The `/fairs/[slug]` page renders identically for online and offline visitors. There's no "tour the virtual hall" mode, no live-recruiter-status pill ("Acme Motors · recruiter online — talk now"), no virtual queue ("3 people ahead of you").

For the v1 hybrid event you don't need this — scheduled slots are enough. But it's worth noting for post-June if you want to differentiate from competing online fair platforms.

### 4. No in-app video stack

There is zero integration with Daily / 100ms / Jitsi / Twilio Video / WebRTC anywhere in the codebase. All video flows (mentorship, events) rely on the recruiter pasting an external Meet/Zoom link.

For a June event, this is **fine** — we accept Meet/Zoom links and surface them to the candidate. For a v2 ambition (in-app video with recording, transcripts, integrated chat, no third-party dependency), this is a 2-3 week add.

### 5. No online check-in

The check-in scanner at `/admin/fairs/[id]/check-in` is QR-code-based, physical. An online candidate has no "I'm here and ready" signal:
- They can't tell the recruiter "I'm at my desk, here, ready for the 11:00 slot"
- The recruiter has no view of "X of my 5 online interviews have logged in"
- The live console can't surface "47 online candidates online right now"

### 6. No fallback for connection failures

If a candidate's Meet link breaks at 10:58 for their 11:00 slot, today they have no recourse on the platform. No "report a connection issue" button that pages the admin. No async fallback ("upload a 2-min video intro instead").

### 7. Recruiter has no day-of-event online queue view

When the offline recruiter wants to see who's at their booth, they look up. The online recruiter has no equivalent — no "your next 3 candidates" panel, no "Aman is in your virtual waiting room", no calendar view of their fair-day slots.

### 8. No camera / mic test for online candidates

Before an interview, a candidate needs to know their setup works. No `/me/fairs/[slug]/test-call` page exists.

---

## Phased build plan — what to ship before June

Today: **2026-05-24** · target fair: mid-to-late June · working window: **~4 weeks**.

These phases are sequenced so a partial rollout still works. Phase 1 is the must-have minimum for an honest hybrid claim. Phases 2 and 3 are nice-to-have additions that improve the experience without being blockers.

### Phase 1 — Schema + slot mode (week 1, ~5 days)

**Goal**: An online candidate can book an online slot, see the meeting link, click "Join" at the right time. Recruiter can create online slots with Meet/Zoom links.

- [ ] Add `mode: InterviewMode` + `meetingUrl: String?` to `RecruitmentDriveInterviewSlot`. Migration is additive (`prisma db push` safe).
- [ ] Update slot creation UI at `/employer/fairs/[id]/slots`: recruiter picks mode (ONSITE / VIDEO / PHONE); when VIDEO, supply a meeting URL.
- [ ] Bulk-slot generator: extend the "create N slots every 30 min" tool with a mode + meeting-URL-template field.
- [ ] Slot booking page (`/fairs/[slug]/booths/[boothId]/slots`): filter slots based on candidate's `fairMode`:
  - ONLINE candidate sees only VIDEO/PHONE slots
  - OFFLINE candidate sees only ONSITE slots
  - HYBRID candidate sees both, with mode badges
- [ ] Booking confirmation + candidate's pass page (`/me/fairs/[slug]/pass`): show mode + Join button (when VIDEO and within 30 min of start)
- [ ] Reminder worker: mode-aware copy — venue address for ONSITE, Meet link for VIDEO
- [ ] Live console: add KPI tiles for ONLINE / OFFLINE / HYBRID registration breakdown

**Exit criteria**: A Delhi student can register as ONLINE, book an online slot at a Pune booth, get reminders with the Meet link, click Join, and land in Meet at 11:00. Recruiter on the other side sees the booking in their slot board with the Meet link visible.

### Phase 2 — Day-of-event online polish (week 2, ~5 days)

**Goal**: Admin + recruiter have visibility into online attendees; online candidates have a clear "I'm here" signal.

- [ ] Online check-in: when an ONLINE candidate visits `/me/fairs/[slug]/pass` within the event window, mark them as `checkedInAt`. Surfaces them in the live console alongside physical check-ins.
- [ ] Recruiter slot board: split view of "ONSITE slots next 2h" vs "ONLINE slots next 2h" with Join buttons inline.
- [ ] Live console: "X online candidates currently active" tile (last-seen within 5 min).
- [ ] Broadcast targeting: filter by `fairMode` — "send to ONLINE only" / "send to OFFLINE only" / "send to everyone".
- [ ] Camera + mic test page at `/me/fairs/[slug]/test-call` — simple `getUserMedia` check page with a "ready" CTA that timestamps `interviewReadyAt`.
- [ ] Recruiter slot board: visibility on candidate's `interviewReadyAt` — green dot if they've tested their setup, red if not.

**Exit criteria**: On event day, the placement team can stand at the live console and see "73 of our 120 registered candidates are checked in (45 offline at the venue, 28 online and active)". A recruiter who's running a virtual booth sees their queue of next-3 online candidates and can tell who's tested their setup.

### Phase 3 — Hardening + fallbacks (week 3, ~5 days)

**Goal**: Gracefully handle connection failures and surface a recovery path so a bad-internet candidate doesn't lose their shot.

- [ ] "Report connection issue" button on the candidate's pass page — pages the admin (in-app + WhatsApp).
- [ ] Async fallback: candidate can upload a 2-min video intro if their slot gets cancelled; recruiter sees it as a non-blocking review item.
- [ ] Recruiter "mark as no-show" + "reschedule for later today" actions on the slot board.
- [ ] Candidate dropout recovery: if a candidate's Meet leaves a 5-min connection-failure trail, auto-bump them to a "waiting for re-slot" queue the recruiter sees.
- [ ] Post-event report: outcome breakdown by mode ("offline: 12 hires / 47 attended; online: 4 hires / 31 attended").

**Exit criteria**: A candidate whose internet drops mid-interview gets re-slotted within 30 minutes; a placement team running the event has end-to-end visibility on what's working and what isn't.

### Phase 4 — Out of scope for June (mention as roadmap)

These are real product investments worth pitching as "v2 / Q3 2026" but not realistic in 4 weeks:

- In-app video stack (Daily.co or 100ms integration) — replaces Meet/Zoom link-out with branded, recorded, transcribed sessions
- Virtual booth experience — live "recruiter available now" status, walk-in queue, branded company lobby
- Virtual networking — candidate↔candidate connections seeded at the event
- AI-mediated screening for online candidates (the existing `InterviewSession` mock-interview tool wired into the fair flow)

---

## Talking points for tomorrow's pitch

### What to lead with (works today)

- **"Delhi students can register for the Pune Recruitathon online RIGHT NOW. Two minutes, full profile capture, attendance mode selection."**
- **"Their TPO sees them register, attributed via the TPO's referral link. The TPO dashboard shows their college's funnel — registered / applied / shortlisted / interviewed."**
- **"They can apply to roles at any participating company; the company sees their application alongside Pune applicants in their pre-screening pipeline."**
- **"We auto-send reminders one week, 3 days, one day, and one hour before the event — fully automated, per-candidate."**
- **"The admin team has a live event-day dashboard that auto-refreshes — registrations, check-ins, slot bookings, recent activity — visible at a glance."**

### What to position as "shipping in the next 4 weeks before the fair"

- "We're adding online interview slots so a Delhi student can book a 30-min video slot with a Pune company — the Meet link is in the candidate's pass, one-click to join."
- "Reminder emails will branch by mode — venue address for Pune attendees, Meet link for Delhi attendees."
- "The live console will split online vs offline attendance so the placement team sees both streams in real time."
- "We'll have a setup-test page so Delhi students can verify their camera + mic before their interview."

### What to defer to v2 (don't over-promise)

- "Branded in-app video without the Meet/Zoom dependency — Q3 2026."
- "Virtual booth networking — Q3 2026."

### Honest caveat if asked

- "For this June event, online interviews route to Google Meet links the recruiter sets up. The candidate's join experience is one-click from our platform, but the actual video happens in Meet. We'll integrate in-app video in v2."

---

## Phase 1 — concrete implementation outline (for engineering)

So we don't waste a day arguing about scope when we start building, here's the precise change list for the must-ship phase:

### Schema migration (1 line of Prisma)

```prisma
model RecruitmentDriveInterviewSlot {
  // ... existing fields ...
  mode       InterviewMode @default(ONSITE)  // NEW
  meetingUrl String?                          // NEW
}
```

`InterviewMode` enum already exists (`VIDEO|PHONE|ONSITE`). No new enum needed. Migration is additive — every existing slot defaults to ONSITE, no data backfill required.

### Files to touch (estimated)

| File | Change | Lines |
|---|---|---|
| `prisma/schema.prisma` | Add 2 fields to `RecruitmentDriveInterviewSlot` | +2 |
| `server/recruitment-drives/slots.ts` | Accept `mode` + `meetingUrl` in createInterviewSlot + bulk-generator | ~30 |
| `app/employer/fairs/[id]/slots/page.tsx` | Mode dropdown + meeting URL input | ~40 |
| `app/fairs/[slug]/booths/[boothId]/slots/page.tsx` | Filter slots by candidate's `fairMode` | ~20 |
| `app/me/fairs/[slug]/pass/page.tsx` | Show mode + Join CTA | ~30 |
| `workers/processors/fair-reminders.ts` | Branch email template by mode | ~25 |
| `app/admin/recruitathon/[slug]/live/page.tsx` | Add OFFLINE / ONLINE / HYBRID KPI tiles | ~40 |
| `lib/emails/fair-reminder.ts` | New template for online mode | ~50 |

Total: ~240 lines of code change across 8 files. **Feasible in 5 days for one focused engineer.**

### Testing checklist for Phase 1

- [ ] Create a test fair, add a company booth, create 1 ONSITE + 1 VIDEO slot
- [ ] Register a test candidate as OFFLINE → can see ONSITE slot, cannot see VIDEO slot
- [ ] Register a test candidate as ONLINE → can see VIDEO slot, cannot see ONSITE slot
- [ ] Register a test candidate as HYBRID → sees both with mode badges
- [ ] Book a VIDEO slot → confirmation shows mode + meeting URL
- [ ] Candidate's `/me/fairs/[slug]/pass` → Meet link is visible, Join button shows up within 30 min of slot start
- [ ] Fire reminder worker manually → OFFLINE candidate gets venue copy, ONLINE candidate gets meet-link copy
- [ ] Live console → KPI tiles show correct breakdown

---

## Risk + mitigation summary

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Phase 1 slips past 2 weeks → Phase 2 won't ship | Medium | High | Cut Phase 1 scope further — the absolute minimum is `slot.mode + meetingUrl + Join button`. Reminder template can fall back to a manual one-time admin broadcast. |
| Meet links fail at event day | Low-medium | High | Phase 3 fallback handles this. Even without Phase 3, "report connection issue" via WhatsApp to the admin works as a manual fallback. |
| Online candidates dominate inbox; recruiter overwhelmed | Medium | Medium | Limit each recruiter to N online slots; cap at N=5-10 for v1. Cap is enforced at slot creation, not at booking — recruiter must intentionally open more. |
| Pune-only narrative breaks; Delhi attendees feel second-class | Medium | High | Lead with online-first messaging in pitch: "Delhi students are not 'remote attendees' — they have the same booking, reminder, and interview pipeline as Pune attendees." |
| Live console can't keep up at fair-day load | Low | Medium | Existing console auto-refreshes every 15s with a small query batch. Should hold for 1k-5k concurrent users. Load-test with a sampled run if expected attendance > 1k. |

---

## What I need from you to start Phase 1

- Confirmation to proceed (Phase 1 scope locked)
- Confirmation that DIYguru is OK with Meet/Zoom dependency for June (vs waiting for in-app video v2)
- One placement officer to dry-run the online-candidate flow next week (~Tuesday) so we catch UX bugs before companies see it
- Decision on whether to gate ONLINE-mode registration behind an eligibility check (camera test pass? minimum bandwidth attestation?) — recommend NO for v1; add in Phase 3

Reply with the go-ahead and I'll start building Phase 1 tomorrow.
