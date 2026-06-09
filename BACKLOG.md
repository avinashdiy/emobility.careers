# emobility.careers — Engineering Backlog

Generated from a full-codebase audit (8 parallel finders across security, bugs,
integrity, UX, perf, ops + recent-session regressions → 3-vote adversarial
verification → synthesis). 35 raw findings → **23 confirmed** after verification
(12 refuted as false positives).

**Audit date:** 2026-06-09
**Severity counts:** 3 critical · 10 major · 8 minor · 3 nit

Status legend: `[ ]` open · `[x]` done · `[~]` decision needed (product call)

---

## 🚨 Critical

- [x] **Fair-registration counter race condition** — `server/recruitment-drives/registrations.ts:154`
  Registration create + `registeredCount` increment were two separate DB calls.
  A crash/connection-drop between them desynced the admin dashboard counter from
  the true row count, permanently. **Fixed 2026-06-09** — both writes wrapped in
  `db.$transaction` (register path + cancellation path both patched).

- [x] **Slot booking missing mode-compatibility audit trail** — `server/recruitment-drives/slots.ts:600`
  The hybrid-mode compatibility gate (ONLINE/OFFLINE vs slot mode) validated
  correctly but the audit log omitted both modes, making disputes ("the system
  let me book an in-person slot when I registered online") unresolvable from the
  log. **Fixed 2026-06-09** — audit meta now records `slotMode` + `candidateFairMode`.

- [~] **Resume `EMPLOYERS_ONLY` visible to all verified employers** — `lib/profile-visibility.ts:189`
  The audit flagged this as a bypass because `canSeeResume()` for `EMPLOYERS_ONLY`
  returns `ctx.role === "EMPLOYER"` (any employer), while the parallel
  `canSeeContact()` requires an application relationship.
  **DECISION NEEDED — likely a false positive.** The resume tier model is a
  coherent 3-level design that matches its candidate-facing copy:
  - `PRIVATE` → "Employers see it only when you apply to a job" (applied-only)
  - `EMPLOYERS_ONLY` → "Verified employers can download your resume from your
    profile" (any verified employer — the standard searchable-resume model)
  - `EVERYONE` → "Anyone with your profile link can download"

  Applying the audit's suggested fix (`&& ctx.hasApplicationRelationship`) would
  make `EMPLOYERS_ONLY` **identical to `PRIVATE`**, collapsing two tiers and
  silently breaking the promise to candidates who opted into recruiter discovery.
  Only call site is the public profile page (`app/[username]/page.tsx:644`) — not
  the employer sourcing flow. **If** the platform wants to tighten resume privacy
  to match the 2026-05 contact-info tightening, that's a deliberate product change
  that also needs the `RESUME_VISIBILITY_DESCRIPTIONS` copy updated. Left as-is
  pending product decision.

---

## ⚠️ Major

- [ ] **In-app notifications bypass user preferences** — `lib/notifications/dispatch.ts:134`
  `IN_APP` notifications are written inline without checking the user's
  `NotificationPreference`, so users who disabled all channels still get in-app
  alerts (consent violation). The worker path checks prefs; the inline path
  doesn't. **Fix:** fetch `user.notificationPrefs` before the inline create and
  apply the same gate the worker uses.

- [ ] **`updateCompany` silently fails validation** — `server/employer/actions.ts:328`
  Zod validation failures return `void` with no UI feedback — the user's edits
  appear to vanish with no error. **Fix:** return `FormState { ok: false,
  fieldErrors, message }` and bind to `useActionState`.

- [ ] **Bare FormData actions return void without surfacing errors** — `server/employer/actions.ts` (multiple: `updateCompany`, `createStage`)
  Same root cause as above across several actions — validation failures are
  invisible. **Fix:** convert all bare FormData actions to the `FormState`
  pattern in `lib/form-state.ts` (`fieldErrors` from `Zod.error.flatten()`).

- [ ] **Roster import increments counter per row (non-atomic)** — `server/recruitment-drives/registrations.ts:625`
  Bulk CSV import increments `registeredCount` for each row individually. A crash
  at row 47/100 leaves the counter ahead of actual registrations; restart
  re-increments, climbing beyond reality. **Fix:** collect all creations and apply
  a single counter update after success, or wrap the loop in `$transaction` with a
  final `count()`-based set instead of inline increments. (Same family as the
  critical counter fix — do it the same way.)

- [ ] **Webhook handler uses `console.warn/error`** — `app/api/v1/sync/academy/route.ts:125`
  The academy-sync webhook logs via `console.*` instead of the pino logger, so
  failures (unknown topics, handler errors) are invisible to ops dashboards +
  alerting. **Fix:** use `logger.warn/error` with context (`event.id`,
  `event.topic`, `event.subjectId`).

- [ ] **`clearDriveImage`/`clearDriveBrochure` skip existence check** — `server/recruitment-drives/actions.ts:941`
  These skip the `findUnique` existence check that `uploadDriveImage` performs, so
  clearing an image on a non-existent drive returns success despite the DB error.
  **Fix:** add a `findUnique` guard + return `{ ok: false, message: "Drive not
  found." }`.

- [ ] **Deleted candidates still visible in ATS** — `app/employer/applications/[id]/page.tsx:78`
  Soft-deleted candidates (`User.status === "DELETED"`) remain visible to
  employers with scrubbed names (`deleted-X`), defeating the intent of account
  deletion. **Fix:** check `application.candidate.user.status === "DELETED"` and
  render a read-only "from deleted account" view, or redirect.

- [ ] **Broadcasts silently truncate beyond 50k recipients** — `workers/processors/broadcasts.ts:123`
  Broadcasts cap at 50k recipients with no signal that delivery was truncated —
  an admin targeting ALL_USERS reaches only the first 50k. **Fix:** log on cap,
  set broadcast `status = "CAPPED"` (or add a `truncated` flag), and add a
  pre-send UI warning when recipients > 50k.

---

## 🟡 Minor

- [ ] **Broadcast cleanup swallows DB errors** — `workers/processors/broadcasts.ts:174`
  `.catch(() => {})` on the status=FAILED cleanup hides DB errors, leaving status
  stuck in limbo with no incident record. **Fix:** `.catch(err => logger.warn({
  err, broadcastId }, '[broadcasts] failed to update status'))`.

- [ ] **Resume-parse worker logs S3 key (PII-adjacent)** — `workers/processors/resume-parse.ts:24`
  The S3 key (may encode candidate identity) is logged alongside `candidateId`,
  creating a persistent audit trail of resume uploads. **Fix:** omit the key or
  hash/truncate it.

- [ ] **Resume file not cleaned up on application withdrawal** — `server/jobs/actions.ts:296`
  Withdrawn applications leave `resumeSnapshotUrl` files orphaned in MinIO/S3.
  **Fix:** delete the object (fire-and-forget) before setting `status=WITHDRAWN`.

- [ ] **`FairConnectionIssue` missing driveId index** — `prisma/schema.prisma` (FairConnectionIssue model)
  Admin console queries issues by drive but the model has no denormalized
  `driveId` / index, forcing a multi-table join through registration→drive.
  **Fix:** add a denormalized `driveId` field + `@@index([driveId, status,
  reportedAt])`. (Additive — safe `prisma db push`.)

- [ ] **`RecruitmentDriveInterviewSlot` missing double-booking index** — `prisma/schema.prisma` (slot model)
  The conflict check filters `(candidateId, status, startsAt)` but no composite
  index covers all three. **Fix:** add `@@index([candidateId, status, startsAt])`.
  (Additive — safe `prisma db push`.)

- [ ] **Hero floating cards hidden on tablet** — `app/(marketing)/page.tsx:286`
  Floating product cards appear only at `lg+` (1024px) but the hero is visible at
  `md` (768px), leaving tablets with an unbalanced hero. **Fix:** show at `md+`
  with adjusted width, or accept as intentional.

- [ ] **Signup country `<select>` missing focus ring** — `components/auth/SignUpForm.tsx:219`
  The country picker lacks the `focus-visible:ring` treatment other inputs have,
  hurting keyboard-nav discoverability. **Fix:** add `focus-visible:ring-[3px]
  focus-visible:ring-emce-mid/15` to match the `Input` component.

- [ ] **Footer language pill lost region context** — `components/layout/site-footer.tsx:206`
  Pill now shows "English" instead of "English (India)" — may read as ambiguous
  to non-India visitors. **Fix (polish):** add a tooltip ("Choose site language")
  or restore a region suffix. (Intentional change this session — low priority.)

---

## ⚪ Nit

- [ ] **Type-only server-only import** — `components/admin/SettingsForm.tsx:12`
  Type-only import from a `server-only` module is safe but worth a clarifying
  comment for the next reader. No functional change.

- [ ] **Worker drain timeout vs Docker grace** — `workers/index.ts:48`
  25s drain timeout is hardcoded but Docker's default grace is 10s. **Fix:** read
  from env, or document `stop_grace_period: 35s` in compose.

---

## 🔁 Cross-cutting themes

Patterns that recurred across findings — fixing at the coordination layer beats
whack-a-mole:

1. **Untracked race conditions on counter mutations.** Fair registrations (fixed),
   roster import, and (historically) interview slots updated counters/state
   without transactions. _Suggested sweep:_ grep every `{ increment: 1 }` /
   `{ decrement: 1 }` adjacent to a related create/delete and confirm it's inside
   a `$transaction`.

2. **Silent form-validation failures.** Several server-action FormData handlers
   return `void` on Zod failure instead of `FormState`. _Suggested:_ a lint rule
   "FormData server actions must return FormState".

3. **Production logging bypassing pino.** `console.warn/error` in API routes +
   workers makes failures invisible to ops alerting.

4. **Missing audit trails for compliance disputes.** Slot booking mode (fixed) and
   broadcast truncation execute business logic without recording decision context.

5. **Soft-delete not cascading.** Deleted candidates remain visible in ATS;
   withdrawn applications keep dangling resume files.

6. **Silent error swallowing in cleanup paths.** `.catch(() => {})` patterns leave
   operators blind when state machines get stuck.

---

## 📋 Separately tracked (infra — maintenance window)

These predate this audit and are tracked for a planned maintenance window:

- [ ] **PgBouncer** — transaction-pooling proxy in front of the shared Postgres
  (careers + academy + ev.care + healthandmedic all share `max_connections=100`).
- [ ] **Next/Image optimizer broken server-side** — `/_next/image` returns null for
  local-image fetches on this Hetzner standalone deploy. Currently worked around
  with `unoptimized` on homepage hero photos; avatars mask it via initials
  fallback. Root cause likely the standalone server's loopback fetch not reaching
  its own port. Fix → drop the `unoptimized` flags.
