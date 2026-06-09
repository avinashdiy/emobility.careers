# emobility.careers — Engineering Backlog

Generated from a full-codebase audit (8 parallel finders across security, bugs,
integrity, UX, perf, ops + recent-session regressions → 3-vote adversarial
verification → synthesis). 35 raw findings → **23 confirmed** after verification
(12 refuted as false positives).

**Audit date:** 2026-06-09
**Severity counts:** 3 critical · 10 major · 8 minor · 3 nit
**Status:** ✅ All 23 confirmed items triaged & closed — 18 fixed in code,
5 closed as working-as-intended / won't-fix (with reasoning below).

Status legend: `[x]` fixed · `[WAI]` working-as-intended / won't-fix (verified
at source, change would be wrong or not justified)

> Note: source-verification overturned **5** "confirmed" findings — the
> adversarial pass still let through items that dissolve (or invert into
> data-loss risks) once you read the surrounding code. Every fix below was
> read at the source before being applied or rejected.

---

## 🚨 Critical

- [x] **Fair-registration counter race condition** — `registrations.ts:154`
  Register create + `registeredCount` increment were two separate calls →
  desynced dashboard counter on crash. **Fixed** — both register + cancel paths
  wrapped in `db.$transaction`.

- [x] **Slot booking missing mode-compatibility audit trail** — `slots.ts:600`
  **Fixed** — audit meta now records `slotMode` + `candidateFairMode`.

- [WAI] **Resume `EMPLOYERS_ONLY` visible to all verified employers** —
  `lib/profile-visibility.ts:189`
  **Working as intended** (confirmed with product owner). The searchable-resume
  model is deliberate: `EMPLOYERS_ONLY` = any verified employer can download,
  matching the candidate-facing copy. The audit's fix would collapse the tier
  into `PRIVATE`. No change.

---

## ⚠️ Major

- [x] **Roster import counter atomicity** — `registrations.ts:625`
  **Fixed** — per-row create + increment wrapped in `db.$transaction`, same
  pattern as the critical counter fix.

- [x] **Webhook handler uses `console.warn/error`** — `app/api/v1/sync/academy/route.ts`
  **Fixed** — swapped all three `console.*` for `logger.warn/error` with
  `{ eventId, topic, subjectId }` context so failures surface in ops alerting.

- [x] **`updateCompany` silently fails validation** — `server/employer/actions.ts`
  **Fixed** — validation failure now `redirect(?error=…)` and success
  `redirect(?notice=…)`; the page's `<ToastFromSearchParams/>` pops the toast.

- [x] **Bare FormData actions return void without errors** — `server/employer/*`
  **Fixed for `updateCompany`.** `createStage` already redirected with `?error=`
  on failure — the audit listed it in error; no change needed there.

- [x] **`clearDriveImage`/`clearDriveBrochure` skip existence check** —
  `server/recruitment-drives/actions.ts`
  **Fixed** — added `findUnique` existence guard to both, matching
  `uploadDriveImage`. (Audit overstated this: `update` on a missing id already
  threw P2025 → caught → returned an error, not success. The fix just yields a
  clean "Drive not found." + quiets the error log.)

- [x] **Deleted candidates' résumé still downloadable in ATS** —
  `app/employer/applications/[id]/page.tsx`
  **Fixed** — the real gap: account deletion scrubs name/contact + flips
  visibility to PRIVATE but does NOT null `resumeUrl`, so a deleted candidate's
  résumé (full PII) was one click away. Now: when `user.status === "DELETED"`
  we suppress the résumé download + contact and show a "deleted account" banner;
  the historical application row stays (read-only) for the employer's records.

- [x] **Broadcasts silently truncate beyond 50k** — `workers/processors/broadcasts.ts`
  **Fixed** — `logger.warn` up front when audience > cap, `truncated` flag in
  the completion log + worker return value. (Schema status enum left unchanged
  to avoid a migration; recipientCount-vs-sentCount divergence + the log now
  make truncation visible.)

- [WAI] **In-app notifications "bypass" user preferences** —
  `lib/notifications/dispatch.ts:134`
  **Working as intended.** `NotificationPreference` has only `*Email`/`*SMS`
  toggles — there is **no IN_APP preference** by design ("in-app + email
  default; SMS off"). The worker also always writes the in-app row. The bell/
  inbox always reflecting activity (email is what you mute) is the intended
  pattern, same as LinkedIn/GitHub. Suppressing in-app on email prefs would be
  the bug. No change.

---

## 🟡 Minor

- [x] **Broadcast cleanup swallows DB errors** — `broadcasts.ts`
  **Fixed** — `.catch(() => {})` → `.catch((err) => logger.warn(...))` so a
  failed FAILED-status write is no longer invisible.

- [x] **Resume-parse worker logs S3 key (PII-adjacent)** — `resume-parse.ts`
  **Fixed** — dropped `key` from the start log (filename often encodes the
  candidate's name); kept `jobId`, `candidateId`, `mimeType`.

- [x] **Signup country `<select>` missing focus ring** — `components/auth/SignUpForm.tsx`
  **Fixed** — now uses the same `focus-visible:ring-[3px] ring-emce-mid/15`
  treatment as the `Input` component.

- [x] **Footer language pill lost region context** — `components/layout/language-switcher.tsx`
  **Fixed** — descriptive tooltip ("Choose your language — translates the site")
  + clearer `aria-label`.

- [WAI] **Résumé not cleaned up on application withdrawal** — `server/jobs/actions.ts:296`
  **Won't fix — the suggested change would cause data loss.** `resumeSnapshotUrl`
  is set to `profile.resumeUrl` (line 234) — it's the SAME object as the
  candidate's live résumé, shared across their profile and every application.
  Deleting it on withdrawal would destroy the live résumé and break all other
  applications referencing it. There are no orphans (it's a frozen shared
  reference, intentional per `candidates/actions.ts:917`).

- [WAI] **FairConnectionIssue missing `driveId` index** — `prisma/schema.prisma`
  **Won't fix — already adequately indexed.** The admin queue query
  (`status: "OPEN" ORDER BY reportedAt`) is served by the existing
  `@@index([status, reportedAt])`; connection issues are a small, fast-resolved
  set. A denormalized `driveId` column (new column + backfill + write-path
  change) isn't justified for the negligible gain.

- [WAI] **RecruitmentDriveInterviewSlot double-booking index** — `prisma/schema.prisma`
  **Won't fix — already adequately indexed.** The conflict check filters
  `candidateId` + exact `startsAt` + status; the existing
  `@@index([candidateId, startsAt])` makes this an exact-timestamp seek
  returning ~0-1 rows, so adding `status` to the index is negligible and just
  adds write-time index maintenance.

- [WAI] **Hero floating cards hidden on tablet** — `app/(marketing)/page.tsx`
  **Accept as intentional.** At md (768px) the hero is ~360px tall; two stacked
  288px cards at top + the bottom-left text overlay would overlap. The lg-only
  gate is the correct call.

---

## ⚪ Nit

- [x] **Type-only server-only import** — `components/admin/SettingsForm.tsx`
  **Fixed** — added a comment explaining the `import type` from a `server-only`
  module is safe (erased at compile time, no Prisma in the browser bundle).

- [x] **Worker drain timeout vs supervisor grace** — `workers/index.ts`
  **Fixed** — drain timeout now reads `WORKER_DRAIN_TIMEOUT_MS` (default 25s)
  so it can be matched to PM2's `kill_timeout` / Docker stop-grace.

---

## 🔁 Cross-cutting themes (status)

1. **Counter-mutation race conditions** — ✅ all 3 sites (register, cancel,
   roster import) now transactional.
2. **Silent form-validation failures** — ✅ `updateCompany` fixed; `createStage`
   was already correct.
3. **Production logging bypassing pino** — ✅ webhook + broadcast cleanup +
   resume-parse PII all addressed.
4. **Missing audit trails** — ✅ slot booking mode recorded; broadcast
   truncation logged.
5. **Soft-delete not cascading** — ✅ deleted-candidate ATS guard added.
   (Résumé-on-withdrawal is intentionally a shared frozen reference — see WAI.)
6. **Silent error swallowing** — ✅ broadcast cleanup `.catch` now logs.

---

## 📋 Infra — scheduled for a maintenance window

- [ ] **PgBouncer** — transaction-pooling proxy for the shared Postgres
  (careers + academy + ev.care + healthandmedic share `max_connections=100`).
- [ ] **Next/Image optimizer broken server-side** — `/_next/image` returns null
  for local fetches on this Hetzner standalone deploy. Worked around with
  `unoptimized` on homepage hero + OG images. Fix → drop the `unoptimized` flags.
