# eMobility Careers — Mobile App Plan (v1)

**Status**: planning · drafted 2026-05 · owner: Avinash + Claude pair

A focused plan for shipping the first native mobile app for emobility.careers — Android + iOS — built with Expo (React Native). LinkedIn-meets-Naukri positioning, candidate-side flows only in v1.

This document is the source of truth for the mobile build. Update it as decisions evolve; PRs that diverge from it should reference the section they're changing.

---

## 1. Context

The web app (this repo) is a Next.js 15 platform with ~50,000 users serving three audiences: candidates (blue-collar + white-collar EV workers), employers (recruiters, ATS users), and admins. Companies are giving feedback that the experience needs to extend to mobile. Existing mobile traffic is significant — Indian EV-industry blue-collar candidates predominantly use phones, often as their only device.

**Goal for v1**: Ship a candible job-search app that gives candidates a faster, native-feeling alternative to the responsive web experience for the core "find a job → apply → track applications" loop.

**Explicit non-goals for v1**:
- Employer / recruiter / ATS features (stay on web)
- AI tools (resume parser already on web; mock-interview etc. stay on web)
- Social feed, posts, comments, mentorship booking, competitions, TPO dashboards
- Full feature parity with web

---

## 2. Locked-in decisions

| Decision | Choice | Why |
|---|---|---|
| Architecture | Native Expo (React Native) screens | Real native UX, no App Store rejection risk under guideline 4.2 (no-WebView-wrapper rule), unlocks push notifications + native deep linking |
| MVP scope | Candidate-only | Focus the build, match the Naukri Job Search app pattern, employers stay on web for v1 |
| Build pipeline | EAS (Expo Application Services) | Standard for Expo apps, cloud iOS builds (no Mac runner needed), one-command store submission, OTA JS updates |
| Repo structure | Monorepo via Turborepo | `apps/web` (existing Next.js) + `apps/mobile` (new Expo) + `packages/shared` (Zod schemas, types, i18n). Shared code, atomic commits across web+mobile |
| Auth methods (v1) | Email/password + Google OAuth + LinkedIn OAuth | Mirrors web auth surface so users who signed up via one method can sign in via the same one on mobile |
| Routing | Expo Router (file-based) | App Router-style, minimises mental switching cost between web and mobile codebases |
| Styling | NativeWind (Tailwind for React Native) | Keeps the `emce-*` design token vocabulary; designers + devs don't context-switch |
| Data layer | TanStack Query (React Query) | Server state cache, refetch semantics align with web's `revalidatePath` model |
| Forms | react-hook-form + Zod | Same shape as web; share schemas via `packages/shared/validators` |
| State | React Context for auth; TanStack Query for everything else | No Redux, no Zustand |
| Errors | Sentry (already on web — add RN SDK) | Single dashboard for web + mobile crashes |
| Secure storage | expo-secure-store | Keychain (iOS), EncryptedSharedPreferences (Android). NEVER AsyncStorage for tokens |
| API versioning | All mobile endpoints under `/api/v1/mobile/*`; `X-App-Version` header on every request; server can 426 to force-upgrade | Lets us evolve mobile contract without breaking web |
| Bundle ID / Package | `com.emobility.careers` (both platforms) | Same identifier across stores keeps things simple |
| App display name | "eMobility Careers" | Same as web brand |

---

## 3. Wave-by-wave plan (~6–8 weeks total)

### Wave 0 — Foundations (week 1)

Scaffolding wave. Nothing user-visible ships; every later wave is downstream of getting this right.

**Deliverables:**
- [ ] Monorepo migration (see §4) — current Next.js app moves to `apps/web/`; mobile app initialized at `apps/mobile/`
- [ ] Expo project scaffold with TypeScript + Expo Router + NativeWind + ESLint/Prettier matching web conventions
- [ ] `packages/shared/` set up with the first cross-cutting code (Prisma types re-export, Zod schemas for jobs + applications + profile)
- [ ] Design system port: `emce-*` colour tokens published to NativeWind theme; primary typography sets (Manrope or whatever web uses)
- [ ] App icon (1024×1024 PNG master) + adaptive icon (Android foreground/background layers) + splash screen design
- [ ] EAS account linked: `eas init`, build profiles (`development` / `preview` / `production`), Apple/Google credentials uploaded
- [ ] Bundle ID `com.emobility.careers` registered in App Store Connect + Google Play Console (creates the app listing shells)
- [ ] Universal Links / App Links infrastructure: `/.well-known/apple-app-site-association` + `/.well-known/assetlinks.json` served from emobility.careers (one Next.js route each)
- [ ] CI/CD: GitHub Actions running `pnpm typecheck` + `pnpm lint` for both apps on PRs; EAS Build triggered on main-branch tag pushes

**Exit criteria:** A blank Expo app installs on a physical Android phone via Expo Go AND iOS via TestFlight, with the new monorepo deploying the existing web app successfully on Hetzner.

### Wave 1 — Auth + profile (weeks 2–3)

**Deliverables:**
- [ ] API contract audit: list every existing `/api/*` route that returns JSON vs every Server Component that doesn't. For each candidate-side feature, identify whether we need a new `/api/v1/mobile/*` endpoint or can reuse what's there.
- [ ] **New endpoint** `POST /api/v1/mobile/auth/exchange`: takes `{ email, password }` or `{ provider, oauthToken }`, returns `{ accessToken, refreshToken, user }`. Access token is a long-lived JWT (90 days) with the same `sub`/`role` claims as the existing Auth.js JWT so server-side authorization helpers work unchanged.
- [ ] **New endpoint** `POST /api/v1/mobile/auth/refresh`: rotates the refresh token, returns a fresh access token.
- [ ] **New endpoint** `POST /api/v1/mobile/auth/revoke`: invalidates a refresh token (sign-out + "sign out all devices").
- [ ] Schema addition: `MobileRefreshToken` model (hashed token, userId, deviceId, expiresAt, revokedAt, lastUsedAt).
- [ ] Mobile sign-in / sign-up screens with email + password.
- [ ] Google OAuth via `expo-auth-session` + system browser. Existing careers Google client works; just add the iOS/Android redirect URIs.
- [ ] LinkedIn OAuth via `expo-auth-session`. LinkedIn's mobile OAuth has more quirks than Google — see Risks §7.
- [ ] Forgot-password flow (reuses existing web endpoint).
- [ ] Email verification flow (Universal Link from the verify email opens the app).
- [ ] Profile view (read-only first): name, headline, photo, location, skills, experience, education.
- [ ] Profile edit: same fields, plus profile photo upload (Expo ImagePicker → existing S3 upload endpoint).
- [ ] Resume upload (Expo DocumentPicker → existing upload-and-parse endpoint).
- [ ] Settings screen: sign out, "delete my account" (mandatory for Apple — see Risks §7).

**Exit criteria:** A candidate can install the app, sign in with email/password OR Google OR LinkedIn, view + edit their profile, upload a resume, and sign out.

### Wave 2 — Jobs + apply (weeks 3–4)

The core loop. What makes this a job-search app.

**Deliverables:**
- [ ] **New endpoint** `GET /api/v1/mobile/jobs`: paginated list with the same filter shape as the web `/jobs` page (location, role, salary, experience, remote/onsite, skills, country).
- [ ] **New endpoint** `GET /api/v1/mobile/jobs/[slug]`: full job detail.
- [ ] **New endpoint** `POST /api/v1/mobile/applications`: apply to a job (uses existing application machinery server-side).
- [ ] **New endpoint** `GET /api/v1/mobile/me/applications`: list of own applications with stage badges.
- [ ] **New endpoint** `GET /api/v1/mobile/me/saved-jobs` + `POST` / `DELETE` for save/unsave.
- [ ] **New endpoint** `GET /api/v1/mobile/me/recommended-jobs`: top-N from existing `server/matching/score.ts` matcher.
- [ ] Jobs list screen: infinite scroll, search input (300ms debounce), pull-to-refresh.
- [ ] Filters bottom sheet.
- [ ] Job detail screen: description, requirements, company card, Apply CTA, Save toggle, "View on web" fallback for fields not yet ported.
- [ ] Apply flow: pre-filled from profile, optional cover letter, confirms.
- [ ] Saved jobs screen.
- [ ] My applications screen: stage-grouped (Applied → Screened → Shortlisted → Interview → Offer → Hired → Rejected).

**Exit criteria:** A candidate can sign in, search for jobs, filter, view detail, save, apply, and see their applications progress through stages.

### Wave 3 — Push notifications + polish (week 5)

**Deliverables:**
- [ ] Expo Push setup: `expo-notifications` installed; FCM project created in Firebase Console for Android; APNs key uploaded to EAS for iOS.
- [ ] Schema addition: `MobileDevice` model (`userId`, `expoPushToken`, `platform`, `appVersion`, `lastSeenAt`, `revokedAt`).
- [ ] **New endpoint** `POST /api/v1/mobile/devices`: register a device's Expo Push token.
- [ ] **New endpoint** `DELETE /api/v1/mobile/devices/[id]`: revoke a token (sign-out flow).
- [ ] Extend `lib/notifications/dispatch.ts` to send via Expo Push alongside existing in-app/email/SMS channels (gated by user's `NotificationPreference`).
- [ ] Notification permission prompt on first sign-in (with rationale screen — iOS auto-deny rate goes from ~40% to ~15% with a rationale screen first).
- [ ] Deep linking: notifications open the right screen (new application stage → that application; new job match → that job).
- [ ] In-app notifications screen (list, mark read).
- [ ] Settings: notification preferences per event type (mirrors web `NotificationPreference` model).
- [ ] Loading states, error states, empty states everywhere.
- [ ] Offline detection (NetInfo) — show a banner, queue actions to retry.
- [ ] Accessibility pass: VoiceOver / TalkBack labels, sufficient contrast, large-text support.

**Exit criteria:** A candidate gets a push notification when their application moves stages, taps it, and lands on the correct application detail screen — within 5 seconds end-to-end on a 4G connection.

### Wave 4 — QA + store submission (weeks 6–8)

**Deliverables:**
- [ ] Internal testing distribution:
  - iOS: TestFlight, 25 internal testers + invite up to 10k external testers (no review required for internal)
  - Android: Google Play Internal Test (100 testers via email allowlist, no review)
- [ ] Bug bash with 5–10 internal testers per platform.
- [ ] App store assets:
  - [ ] App icon (1024×1024 PNG master + adaptive Android variant)
  - [ ] Screenshots (iOS: 6.5" iPhone + 5.5" iPhone; Android: phone + 7" tablet + 10" tablet)
  - [ ] App preview video (optional, ~30 seconds, boosts conversion 10–15%)
  - [ ] Listing copy: title (30 char Apple / 50 Google), subtitle, full description (4000 char Apple / 4000 char Google), keywords (100 char Apple)
  - [ ] Privacy policy URL → `https://emobility.careers/privacy`
  - [ ] Support URL → `https://emobility.careers/contact`
  - [ ] Marketing URL → `https://emobility.careers`
  - [ ] **Apple App Privacy "nutrition labels"** — declare every data type collected (email, name, photos, resume content, location if used, device ID, push token)
  - [ ] **Google Data Safety form** — same exercise, different UI; declare every SDK including Sentry, Expo Push, FCM
- [ ] Submission: `eas submit -p ios` and `eas submit -p android`.
- [ ] Review iteration: Apple typically takes 1–3 days for first review, 4–24 hours for updates. Budget 1–2 rounds of feedback.
- [ ] **Account deletion endpoint** + in-app UI (mandatory for Apple under guideline 5.1.1(v)). If web doesn't already expose this via JSON, build it.
- [ ] Launch: promote builds from internal test → production rollout.
  - Android: staged rollout (10% → 50% → 100% over 1 week)
  - iOS: phased release (1% → 100% over 7 days, auto-pause if crash rate spikes)

**Exit criteria:** App is live in both stores, downloadable from production listings, and accepting real users.

---

## 4. Monorepo migration plan

The existing repo is a Next.js app at the root. The monorepo restructure turns this into `apps/web/` (Next.js) + `apps/mobile/` (Expo) + `packages/shared/`. This is a one-time cost in Wave 0.

**⚠️ The Hetzner deploy chain currently expects the Next.js app to be at the repo root (`~/htdocs/emobility.careers/`). Restructuring breaks the existing deploy command.** Plan the migration with a parallel-deploy window so we can roll back.

**Pre-migration:**
1. Snapshot the existing build chain command in a runbook (already documented in earlier sessions).
2. Take a `git tag` of the last pre-monorepo commit so rollback is trivial.

**Migration steps:**
1. Install Turborepo at repo root: `pnpm add -Dw turbo`
2. Create `pnpm-workspace.yaml` declaring `apps/*` and `packages/*` as workspaces.
3. Create `apps/web/`, move everything Next.js-specific into it (`app/`, `components/`, `lib/`, `server/`, `prisma/`, `public/`, `next.config.*`, `tailwind.config.*`, `tsconfig.json`).
4. Update `package.json` paths and scripts; root `package.json` becomes a workspace root with `turbo run build` etc.
5. Update the Hetzner deploy chain to `cd apps/web && pnpm build` and adjust the `.next/standalone` copy paths.
6. Test the deploy on Hetzner with the restructured layout BEFORE adding the mobile app — isolate the variable.
7. Once web deploys cleanly under the new layout, add `apps/mobile/` and `packages/shared/`.

**Rollback plan if Hetzner deploy breaks:**
- `git reset --hard <pre-migration-tag>` on Hetzner
- `pnpm install --frozen-lockfile && pnpm build && pm2 reload`

**What packages/shared/ contains at the end of Wave 0:**
- `validators/` — Zod schemas for sign-in, sign-up, profile, job application
- `types/` — re-exports of Prisma types relevant to mobile
- `i18n/` — string catalogs (en + hi)
- `constants/` — collar types, EV domains, country list

---

## 5. API contract — endpoints needed

Most of the existing careers app is Server Components rendering HTML, not JSON APIs. The mobile app needs JSON endpoints. Conservative list for Waves 1–3:

| Endpoint | Method | Wave | Notes |
|---|---|---|---|
| `/api/v1/mobile/auth/exchange` | POST | 1 | Credentials/OAuth → JWT + refresh token |
| `/api/v1/mobile/auth/refresh` | POST | 1 | Rotate refresh, return fresh access |
| `/api/v1/mobile/auth/revoke` | POST | 1 | Sign out (single device or all) |
| `/api/v1/mobile/me` | GET | 1 | Current user + profile |
| `/api/v1/mobile/me` | PATCH | 1 | Update profile fields |
| `/api/v1/mobile/me/photo` | POST | 1 | Multipart upload, returns new URL |
| `/api/v1/mobile/me/resume` | POST | 1 | Multipart upload + parse |
| `/api/v1/mobile/me/account` | DELETE | 1 | Account deletion (Apple requirement) |
| `/api/v1/mobile/jobs` | GET | 2 | Paginated, filtered, searched |
| `/api/v1/mobile/jobs/[slug]` | GET | 2 | Full detail |
| `/api/v1/mobile/applications` | POST | 2 | Apply to a job |
| `/api/v1/mobile/me/applications` | GET | 2 | Own applications |
| `/api/v1/mobile/me/saved-jobs` | GET | 2 | Saved list |
| `/api/v1/mobile/me/saved-jobs/[jobId]` | POST/DELETE | 2 | Save / unsave |
| `/api/v1/mobile/me/recommended-jobs` | GET | 2 | Matching engine output |
| `/api/v1/mobile/devices` | POST | 3 | Register push token |
| `/api/v1/mobile/devices/[id]` | DELETE | 3 | Revoke push token |
| `/api/v1/mobile/me/notifications` | GET | 3 | Own notifications |
| `/api/v1/mobile/me/notifications/[id]/read` | POST | 3 | Mark read |
| `/api/v1/mobile/me/notification-prefs` | GET/PATCH | 3 | Channel preferences |

All endpoints accept `Authorization: Bearer <accessToken>` (or `Authorization: Bearer none` for sign-in endpoints).
All endpoints accept `X-App-Version: <semver>` header; server can return 426 Upgrade Required to force-update old clients.
All endpoints return `{ data, meta }` envelope (`meta` carries pagination + rate limit info).

---

## 6. Cross-cutting concerns

**Versioning & force-upgrade**
- Mobile sends `X-App-Version: 1.0.3` on every request.
- Server reads a `MIN_SUPPORTED_MOBILE_VERSION` setting (admin-configurable via `SiteSetting`).
- If client version < min, server returns `HTTP 426 Upgrade Required` with `{ minVersion, updateUrl }` body.
- Mobile shows a blocking "Update required" screen with a deep link to the App Store / Play Store listing.

**Over-the-air JS updates (EAS Update)**
- JS-only changes (no native module changes) can ship without re-review via `eas update`.
- Reserve OTA for hotfixes; major changes go through normal store review so users get release notes.
- Pin OTA channels per build profile (`preview` and `production` are separate channels).

**Token storage + refresh**
- Access token: 24-hour JWT signed with `AUTH_SECRET` (same as web; reuses Auth.js verification on the server).
- Refresh token: 90-day opaque string, hashed in DB. Stored only in `expo-secure-store`.
- On every request: if access token is expired or expires in <5 minutes, intercept and refresh first. Single in-flight refresh promise so concurrent requests don't all trigger separate refreshes.
- 401 from any API → assume token revoked → clear secure storage → redirect to sign-in.

**Deep linking**
- Universal Links (iOS) + App Links (Android) configured via `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` served from emobility.careers.
- Pattern: `https://emobility.careers/jobs/[slug]` opens the app's job detail screen if installed, falls back to web otherwise.
- Verified deep linking only — no custom URL scheme (`emce://`) since those can be hijacked by other apps.

**Analytics**
- PostHog (self-hosted or cloud) for product analytics. Same project as web so funnels span platforms.
- No Google Analytics on iOS — triggers App Tracking Transparency prompt.

**Crash reporting**
- Sentry React Native SDK. Same DSN as web.
- Source maps uploaded automatically on every EAS Build via `sentry-expo`.

**Performance budgets**
- Cold start: < 2.5s to interactive on mid-range Android (Snapdragon 6-series).
- API responses: p95 < 800ms for jobs list, < 1.5s for job detail.
- Bundle size: keep .ipa + .apk under 50MB (don't ship the web app's design assets unless reused).

---

## 7. Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Apple rejects under "minimum functionality" (4.2) | LOW | High | Native screens, not WebView wrapper. Real features on day 1. |
| Apple rejects for missing account deletion (5.1.1(v)) | HIGH if we forget | High | Build account-deletion endpoint + UI in Wave 1, not Wave 4. |
| LinkedIn mobile OAuth quirks (no in-app browser support, requires custom claim handling) | MEDIUM | Medium | Allow extra 3 days in Wave 1. Fall back: defer LinkedIn to v1.1 if Wave 1 slips. |
| Monorepo migration breaks Hetzner deploy | MEDIUM | High (50k users) | Pre-migration tag for rollback. Test web deploy under new layout BEFORE adding mobile. Document the new deploy chain. |
| Push notification opt-in rate <20% on iOS | HIGH | Medium | Show rationale screen before triggering the OS permission prompt. Don't ask on first launch — ask after they've completed sign-in + one meaningful action. |
| Google Play Data Safety form is incomplete → policy violation suspension | MEDIUM | Critical | Audit every SDK before submission; declare conservatively (over-declare > under-declare). |
| App Store screenshots look amateurish → low conversion | HIGH if rushed | Medium | Budget 2 days in Wave 4 for screenshot design. Don't ship Figma defaults. |
| Token refresh logic has a race condition → users randomly signed out | MEDIUM | Medium | Single in-flight refresh promise pattern; integration test in Wave 1 |
| OTA update bricks the app (bad JS deploys to all users instantly) | LOW | Critical | Use EAS Update's staged rollout (10% → 50% → 100% with auto-rollback if crash rate > threshold). |
| Universal Links don't open the app reliably on first install (iOS quirk) | MEDIUM | Low | Document fallback: user can long-press the link → "Open in eMobility Careers". |
| First-submission review takes 5-7 days, blocking launch date | MEDIUM | Medium | Submit Wave 4 production build a full week before any external launch comms. |

---

## 8. App store submission checklist

### Apple App Store

- [ ] App icon (1024×1024 PNG, no transparency, no rounded corners)
- [ ] Screenshots: 6.5" iPhone (1284×2778) — at least 3, up to 10
- [ ] Screenshots: 5.5" iPhone (1242×2208) — at least 3
- [ ] App preview video (optional, 15–30 seconds)
- [ ] App name (30 char)
- [ ] Subtitle (30 char)
- [ ] Promotional text (170 char, editable without resubmit)
- [ ] Description (4000 char)
- [ ] Keywords (100 char total, comma-separated)
- [ ] Support URL (`https://emobility.careers/contact`)
- [ ] Marketing URL (`https://emobility.careers`)
- [ ] Privacy policy URL (`https://emobility.careers/privacy`)
- [ ] Copyright (e.g., `© 2026 eMobility Careers`)
- [ ] Primary category: `Business` or `Jobs` (latter not always available — verify)
- [ ] Age rating questionnaire
- [ ] **App Privacy "nutrition labels"** — declare collected data:
  - Contact Info: email, name, phone (linked to user)
  - User Content: photos, documents (resume)
  - Identifiers: user ID, device ID
  - Usage Data: product interaction, analytics
  - Diagnostics: crash data, performance data
- [ ] App Review Information: demo account credentials, contact info, notes
- [ ] Build uploaded via `eas submit -p ios` or Transporter

### Google Play

- [ ] App icon (512×512 PNG)
- [ ] Feature graphic (1024×500 JPG/PNG)
- [ ] Screenshots: phone (min 320px, max 3840px on long side) — 2–8 images
- [ ] Screenshots: 7" tablet (optional)
- [ ] Screenshots: 10" tablet (optional)
- [ ] App title (30 char)
- [ ] Short description (80 char)
- [ ] Full description (4000 char)
- [ ] App category: `Business` or `Jobs`
- [ ] Tags (5 max)
- [ ] Content rating questionnaire
- [ ] Target audience (age groups)
- [ ] Privacy policy URL
- [ ] **Data Safety form** — declare every data type + SDK:
  - Account info, app activity, app info and performance, device or other IDs
  - Sentry, Expo Push, FCM declared
  - Encryption in transit (yes), can users request data deletion (yes — via in-app account deletion + support email)
- [ ] AAB (Android App Bundle) uploaded via `eas submit -p android`

---

## 9. What's needed from Avinash to start Wave 0

| Item | Why | Default if missing |
|---|---|---|
| Apple Team ID + App Store Connect access | EAS needs this to set up iOS credentials | Blocks Wave 0 |
| Google Play Console access + service account JSON | EAS needs this to submit + run Play API | Blocks Wave 0 |
| App icon source file (Figma / Sketch / 1024×1024 PNG) | Generate adaptive Android icon + iOS variants | Use emce wordmark as placeholder; replace before Wave 4 |
| Splash screen design intent | Configure expo-splash-screen | Solid `emce-darkest` bg + centered logo |
| Brand fonts (license file for any non-Google fonts) | Bundle in app | Use Manrope (Google Fonts, already in web) |
| Confirmation to proceed with monorepo migration | First file change of Wave 0 | None — migration is blocking |
| GitHub repo write access for EAS CI integration | Auto-build on tag push | EAS Build runs locally instead |

---

## 10. Open questions

- [ ] Should `apps/web` keep its current path (so the Hetzner deploy chain only needs a single-line `cd apps/web` change), or should we move it to `apps/careers-web` to be more descriptive?
- [ ] Do we want app.emobility.careers as a dedicated subdomain for mobile-specific responses (eg short links from push notifications), or reuse the apex?
- [ ] Apple has been requesting AI-generated content disclosures since 2024 — we use AI for resume parsing + matching. Worth pre-disclosing in App Review Information to avoid rejection.
- [ ] Hindi UI parity: web supports en + hi. Do we ship mobile with both at launch, or English-only for v1 and add Hindi in v1.1?
- [ ] Biometric auth (Face ID / Touch ID / fingerprint) for sign-in after first login? Adds 1 day in Wave 1. Recommended.
- [ ] Apple Sign In: Apple requires it on apps that offer other social logins (LinkedIn + Google count). Adding 1–2 days to Wave 1 to avoid rejection.

---

## Changelog

| Date | Change | By |
|---|---|---|
| 2026-05 | Initial plan drafted; decisions: native Expo, candidate-only, EAS, monorepo, email+Google+LinkedIn auth | Avinash + Claude |
