"use server";

/**
 * Recruitathon inline-signup server actions.
 *
 * Replaces the binary choice between "registration form only (zero
 * platform sign-ups)" and "full profile wizard (high drop-off)" with
 * a progressive registration: ONE form that creates the platform
 * account AND the fair registration in a single transaction, then
 * nudges profile completion via the welcome screen + dashboard
 * banner.
 *
 * Two actions:
 *   • registerCandidateInline — creates User + CandidateProfile +
 *     Education shell + CandidateSkill rows + RecruitmentDriveRegistration.
 *   • registerEmployerInline — creates User + Company shell (or attaches
 *     to existing) + EmployerProfile + RecruitmentDriveCompany.
 *
 * Both reuse the anti-spam stack from server/auth/actions.ts (honeypot
 * + turnstile + per-email + per-IP rate-limit) so the Recruitathon
 * form is no easier to abuse than the regular signup form.
 *
 * Both auto-sign-in via NextAuth credentials provider on success so
 * the user lands on /fairs/[slug]/registered already authenticated —
 * the celebration screen + profile-completion banner work without
 * forcing another login step.
 */

import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth, hashPassword, signIn } from "@/lib/auth";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { withUniqueSlug } from "@/lib/slug";
import { audit } from "@/lib/audit";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { logger } from "@/lib/logger";
import { type FormState, zodErrorsToFieldErrors } from "@/lib/form-state";
import {
  QUALIFICATION_OPTIONS,
  RECRUITATHON_EV_DOMAIN_SLUGS,
  RECRUITATHON_EV_DOMAIN_LABEL,
  MAX_EV_DOMAINS,
} from "@/lib/recruitathon/registration-fields";
import {
  clientIp,
  clientUserAgent,
  honeypotTriggered,
  isDisposableEmail,
  looksLikeSpamName,
  tooFast,
  verifyTurnstile,
} from "@/lib/anti-spam";
import { Role } from "@prisma/client";

// ─── Check-in code minter ─────────────────────────────────────
// Mirrors mintCheckInCode in server/recruitment-drives/registrations.ts.
// Keeping a private copy here (instead of importing) keeps the
// dependency direction one-way — the Recruitathon flow shouldn't
// reach into the generic fair-registration internals.
const CHECK_IN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function mintCheckInCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CHECK_IN_ALPHABET[crypto.randomInt(0, CHECK_IN_ALPHABET.length)];
  }
  return out;
}

// ─── Shared anti-spam preamble ────────────────────────────────
// Both actions run the same pre-flight: honeypot, timing, turnstile,
// disposable email, spammy name. Extracted so the two actions stay
// in sync if we tighten the gates later.
async function antiSpamPreamble(
  formData: FormData,
  name: string,
  email: string,
): Promise<{ ok: true } | { ok: false; state: FormState }> {
  if (honeypotTriggered(formData.get("website"))) {
    logger.info({ ip: await clientIp() }, "[recruitathon] honeypot triggered");
    return {
      ok: false,
      state: { ok: false, message: "We couldn't create your account. Please email hello@emobility.careers if this is a mistake." },
    };
  }
  if (tooFast(formData.get("startedAt"))) {
    logger.info({ ip: await clientIp() }, "[recruitathon] form too fast");
    return {
      ok: false,
      state: { ok: false, message: "We couldn't create your account. Please email hello@emobility.careers if this is a mistake." },
    };
  }
  const turnstileOk = await verifyTurnstile(formData.get("cf-turnstile-response") as string | null);
  if (!turnstileOk) {
    return {
      ok: false,
      state: { ok: false, message: "Please complete the verification challenge and try again." },
    };
  }
  if (isDisposableEmail(email)) {
    return {
      ok: false,
      state: {
        ok: false,
        message: "Please use a permanent email address.",
        fieldErrors: { email: "Disposable email addresses aren't allowed." },
      },
    };
  }
  if (looksLikeSpamName(name)) {
    return {
      ok: false,
      state: {
        ok: false,
        message: "That name doesn't look right.",
        fieldErrors: { name: "Use your real name (no URLs or random strings)." },
      },
    };
  }
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────
// CANDIDATE inline-signup
// ────────────────────────────────────────────────────────────────

const RecruitathonAvailabilityEnum = z.enum(["OFFLINE", "ONLINE", "HYBRID"]);

// Recruitathon-essential fields — present in BOTH the signed-out and
// signed-in form variants. Extracted as a base so the two schemas
// below stay DRY.
const candidateRecruitathonFields = {
  phone: z.string().trim().min(7, "Phone number is required").max(20),
  college: z.string().trim().min(2, "College / institute name is required").max(200),
  /// Optional FK posted by the EntityAutocomplete when the candidate
  /// picked an existing Institution from the dropdown. Server-side
  /// lookup prefers this over name-based dedupe — picking an existing
  /// row guarantees the canonical link instead of a fuzzy-match win.
  /// Empty string is normalised to null at the action layer.
  institutionId: z.string().trim().max(40).optional().or(z.literal("")),
  course: z.string().trim().min(2, "Course / specialization is required").max(200),
  yearOfStudy: z.enum(["1", "2", "3", "4", "5", "FRESHER", "EXPERIENCED"], {
    errorMap: () => ({ message: "Select your year of study" }),
  }),
  experienceLevel: z.enum(["FRESHER", "EXPERIENCED"], {
    errorMap: () => ({ message: "Pick fresher or experienced" }),
  }),
  intendedRoles: z.string().trim().min(2, "Tell us which roles you want").max(500),
  willingLocations: z.string().trim().min(2, "Tell us which cities work for you").max(500),
  technicalSkills: z.string().trim().min(2, "Add at least one skill").max(500),
  internshipSummary: z.string().trim().max(2000).optional().or(z.literal("")),
  hasEvExperience: z.enum(["yes", "no"]).default("no"),
  fairMode: RecruitathonAvailabilityEnum,
  isDIYguruStudent: z.enum(["yes", "no"]).default("no"),
  linkedinUrl: z.string().trim().url("Enter a valid LinkedIn URL").max(300).optional().or(z.literal("")),
  driveSlug: z.string().trim().min(1),
  tpoToken: z.string().trim().max(64).optional().or(z.literal("")),
  // ─── Added student-data fields (replacing the team's Google form) ──
  currentCityState: z.string().trim().min(2, "Enter your current city & state").max(160),
  qualification: z.enum(QUALIFICATION_OPTIONS, {
    errorMap: () => ({ message: "Select your highest qualification" }),
  }),
  // 4-digit year as a string from the <select>; coerced to Int for the
  // CandidateProfile.graduationYear column at write time.
  graduationYear: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Select your graduation year"),
  openToRelocation: z.enum(["yes", "no"], {
    errorMap: () => ({ message: "Let us know if you're open to relocating" }),
  }),
  // NOTE: preferred EV domains are a multi-checkbox field — Object
  // .fromEntries(formData) collapses repeated keys, so they're read via
  // formData.getAll("evDomains") in each action below, not here.
} as const;

const candidateSchema = z.object({
  // Auth — only present in the signed-out form
  name: z.string().trim().min(2, "Full name is required").max(120),
  email: z.string().trim().email("Enter a valid email").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters").max(120),
  acceptTerms: z.literal("on", { errorMap: () => ({ message: "Please agree to the Terms" }) }),
  // Recruitathon-essential — spread from the shared base
  ...candidateRecruitathonFields,
});

// Signed-in variant — the viewer already has a User + CandidateProfile,
// so auth + acceptTerms (accepted at original signup) are skipped.
// Only the Recruitathon-specific fields are required.
const candidateSignedInSchema = z.object(candidateRecruitathonFields);

/**
 * Preferred EV domains are a multi-checkbox field, so they arrive as
 * repeated form keys that Object.fromEntries() would collapse. Read
 * them with getAll, drop anything that isn't a known canonical slug,
 * dedupe, and cap at MAX_EV_DOMAINS.
 */
function parseEvDomains(formData: FormData): string[] {
  const raw = formData.getAll("evDomains").map((v) => String(v));
  const valid = raw.filter((s) => RECRUITATHON_EV_DOMAIN_SLUGS.includes(s));
  return Array.from(new Set(valid)).slice(0, MAX_EV_DOMAINS);
}

/** Map the Yes/No "open to relocation" answer onto RelocationPref. */
function relocationPrefFor(openToRelocation: "yes" | "no"): "ANYWHERE" | "HOMETOWN_ONLY" {
  return openToRelocation === "yes" ? "ANYWHERE" : "HOMETOWN_ONLY";
}

/**
 * Seed CandidateEVDomain links from the picked slugs (best-effort,
 * inside the caller's transaction). Mirrors the pattern in
 * server/candidates/actions.ts — looks up the canonical EVDomain rows
 * and links them. The CandidateEVDomain table was never populated at
 * signup before; this is the platform's EV-matching signal.
 */
async function seedCandidateEvDomains(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  candidateId: string,
  slugs: string[],
): Promise<void> {
  if (slugs.length === 0) return;
  const domains = await tx.eVDomain.findMany({
    where: { slug: { in: slugs } },
    select: { id: true },
  });
  for (const dom of domains) {
    try {
      await tx.candidateEVDomain.create({
        data: { candidateId, evDomainId: dom.id },
      });
    } catch {
      // Composite-PK conflict — already linked via another path. Ignore.
    }
  }
}

/** The extra answers stored in RecruitmentDriveRegistration.formAnswers. */
function recruitathonFormAnswers(
  d: {
    yearOfStudy: string;
    experienceLevel: string;
    internshipSummary?: string;
    hasEvExperience: "yes" | "no";
    isDIYguruStudent: "yes" | "no";
    currentCityState: string;
    qualification: string;
    graduationYear: string;
    openToRelocation: "yes" | "no";
  },
  evDomains: string[],
) {
  return {
    yearOfStudy: d.yearOfStudy,
    experienceLevel: d.experienceLevel,
    internshipSummary: d.internshipSummary ?? "",
    hasEvExperience: d.hasEvExperience === "yes",
    isDIYguruStudent: d.isDIYguruStudent === "yes",
    // New student-data fields (also mirrored onto dedicated columns
    // where available; kept here too so the CSV exports are complete
    // regardless of profile edits later).
    currentCityState: d.currentCityState,
    qualification: d.qualification,
    graduationYear: d.graduationYear,
    openToRelocation: d.openToRelocation,
    evDomains: evDomains.map((s) => RECRUITATHON_EV_DOMAIN_LABEL[s] ?? s),
    evDomainSlugs: evDomains,
  };
}

export async function registerCandidateInline(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Branch up-front on session — signed-in users skip account creation
  // entirely and route through registerCandidateForFair() below. This
  // is the OAuth path (Continue with Google / LinkedIn) + the "Sign in
  // and come back" path + the sticky-header-CTA-after-signin path.
  // Without this branch the action would short-circuit at the
  // existingUser check with "email already exists" and the user would
  // be stuck unable to complete the Recruitathon registration.
  const session = await auth();
  if (session?.user) {
    return registerCandidateForFair(session.user.id, formData);
  }

  const rawName = String(formData.get("name") ?? "").trim();
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const spam = await antiSpamPreamble(formData, rawName, rawEmail);
  if (!spam.ok) return spam.state;

  const parsed = candidateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the errors below.",
      fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()),
    };
  }
  const d = parsed.data;
  const evDomains = parseEvDomains(formData);
  if (evDomains.length === 0) {
    return {
      ok: false,
      message: "Please fix the errors below.",
      fieldErrors: { evDomains: "Pick at least one EV domain you're interested in" },
    };
  }

  // Rate-limit shared with regular signup so a determined abuser can't
  // burn through quota by alternating between forms.
  const ip = await clientIp();
  try {
    await rateLimitOrThrow(`signup:${d.email}`, "signup");
    if (ip) await rateLimitOrThrow(`signup-ip:${ip}`, "signupIp");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Too many attempts" };
  }

  // Drive must exist and be open for registration. We fetch this
  // early so we fail fast before creating a user account that would
  // then have nowhere to register.
  const drive = await db.recruitmentDrive.findUnique({
    where: { slug: d.driveSlug },
    select: { id: true, slug: true, status: true, title: true, endsAt: true },
  });
  if (!drive) {
    return { ok: false, message: "Fair not found." };
  }
  if (drive.status !== "OPEN" && drive.status !== "IN_PROGRESS") {
    return { ok: false, message: "Registration for this fair is closed." };
  }

  const existingUser = await db.user.findUnique({ where: { email: d.email }, select: { id: true, candidateProfile: { select: { id: true } } } });

  // Resolve the optional TPO invite token. We do this BEFORE the user-
  // creation transaction so the lookup doesn't add latency inside the
  // critical path. Token mismatch is a silent no-op (the registration
  // succeeds with viaTpoCellId=null) — better UX than a hard reject.
  let tpoCellId: string | null = null;
  if (d.tpoToken && d.tpoToken.length > 0) {
    const cell = await db.collegePlacementCell.findUnique({
      where: { inviteToken: d.tpoToken },
      select: { id: true, status: true },
    });
    if (cell && cell.status === "APPROVED") {
      tpoCellId = cell.id;
    }
  }

  let userId: string;
  let candidateProfileId: string;
  const userAgent = await clientUserAgent();

  if (existingUser) {
    // Email already on the platform → the smart UX is to register them
    // for the fair on top of their existing profile rather than blocking
    // with "email already exists". Their session isn't authenticated
    // here (this is a public form), so we redirect to sign in with a
    // post-signin hop that takes them straight to the inline-register
    // form with the fair fields pre-filled.
    return {
      ok: false,
      message: "You already have an account with this email. Sign in and we'll register you for the fair.",
      fieldErrors: { email: "Already registered — sign in instead." },
    };
  }

  const passwordHash = await hashPassword(d.password);
  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: d.name,
        email: d.email,
        passwordHash,
        role: Role.CANDIDATE,
        signupIp: ip,
        signupUserAgent: userAgent?.slice(0, 500) ?? null,
      },
    });
    const [firstName, ...rest] = d.name.split(" ");
    const profile = await withUniqueSlug(d.name, (slug) =>
      tx.candidateProfile.create({
        data: {
          userId: user.id,
          slug,
          firstName: firstName ?? d.name,
          lastName: rest.join(" ") || null,
          email: d.email,
          phone: d.phone,
          linkedinUrl: d.linkedinUrl && d.linkedinUrl.length > 0 ? d.linkedinUrl : null,
          // New structured fields — set on the profile so the rest of
          // the platform (recruiter search filters, "near me", relocation
          // matching) sees them, not just the fair CSV.
          city: d.currentCityState,
          graduationYear: Number(d.graduationYear),
          relocationPref: relocationPrefFor(d.openToRelocation),
          // NOTE: isDIYguruVerified is INTENTIONALLY NOT set from
          // d.isDIYguruStudent. That flag drives the platform-wide
          // ⭐ DIYguru trust badge and is only legitimate when the
          // user appears in the admin-imported DIYguru roster CSV
          // (or an admin manually verifies them). Letting candidates
          // self-claim during signup would dilute the badge's value.
          // The user's answer is captured in formAnswers below so
          // admin can cross-reference + flip the flag later.
        },
        select: { id: true },
      }),
    );
    // Seed Education shell with the Recruitathon answers — gives the
    // admin export real data and gives the candidate something to
    // edit (vs an empty section) when they complete their profile.
    await tx.education.create({
      data: {
        candidateId: profile.id,
        institution: d.college,
        // Picked-from-typeahead institution wins; otherwise leave the
        // FK null and let the entry stay as plain text (admin can
        // canonicalise later from the institutions queue).
        institutionId: d.institutionId && d.institutionId.length > 0 ? d.institutionId : null,
        // degree = the structured qualification (B.Tech / Diploma / …);
        // field = the branch / specialization free text. Previously both
        // were the same `course` string.
        degree: d.qualification,
        field: d.course,
        startYear: null,
        endYear: Number(d.graduationYear),
      },
    });
    // Seed preferred EV domains — populates CandidateEVDomain (the
    // platform's matching signal), which inline signup never did before.
    await seedCandidateEvDomains(tx, profile.id, evDomains);
    // Seed skills — split the free-text input by comma, dedupe, cap
    // at 15. The candidate's full skill graph (with proficiency +
    // years of experience) gets built in /me/profile; this is just
    // the seed so admin export has skills present from day 0.
    const skills = Array.from(
      new Set(
        d.technicalSkills
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s.length <= 80),
      ),
    ).slice(0, 15);
    if (skills.length > 0) {
      // Upsert canonical Skill rows then link via CandidateSkill.
      for (const name of skills) {
        const slugified = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        if (!slugified) continue;
        const skill = await tx.skill.upsert({
          where: { slug: slugified },
          create: { slug: slugified, name },
          update: {},
          select: { id: true },
        });
        try {
          await tx.candidateSkill.create({
            data: { candidateId: profile.id, skillId: skill.id },
          });
        } catch {
          // Unique (candidateId, skillId) conflict — ignore, the
          // candidate already had this skill via some other path.
        }
      }
    }
    // The headline registration row.
    let checkInCode: string;
    let attempt = 0;
    for (;;) {
      attempt++;
      const code = mintCheckInCode();
      try {
        await tx.recruitmentDriveRegistration.create({
          data: {
            driveId: drive.id,
            candidateId: profile.id,
            checkInCode: code,
            // Annotate source so the admin CSV + dashboards can
            // distinguish TPO-driven signups from straight self-
            // registrations. Both flow through this action; the
            // viaTpoCellId column is the canonical link, source is
            // a denormalised aid for filtering.
            source: tpoCellId ? "RECRUITATHON_TPO_LINK" : "RECRUITATHON_INLINE",
            viaTpoCellId: tpoCellId,
            fairMode: d.fairMode,
            intendedRoles: d.intendedRoles,
            willingLocations: d.willingLocations,
            formAnswers: recruitathonFormAnswers(d, evDomains),
          },
        });
        checkInCode = code;
        break;
      } catch (err) {
        const errCode = (err as { code?: string; meta?: { target?: string[] } })?.code;
        const target = (err as { meta?: { target?: string[] } })?.meta?.target ?? [];
        if (errCode === "P2002" && target.includes("checkInCode") && attempt < 6) {
          continue;
        }
        throw err;
      }
    }
    await tx.recruitmentDrive.update({
      where: { id: drive.id },
      data: { registeredCount: { increment: 1 } },
    });
    return { userId: user.id, profileId: profile.id, checkInCode };
  });
  userId = created.userId;
  candidateProfileId = created.profileId;

  // Best-effort audit + verification email — non-blocking.
  try {
    await audit({
      actorId: userId,
      action: "recruitathon.candidate_registered",
      entity: "RecruitmentDrive",
      entityId: drive.id,
      meta: { source: "RECRUITATHON_INLINE", profileId: candidateProfileId },
    });
  } catch (err) {
    logger.warn({ err }, "[recruitathon] audit failed");
  }
  // Confirmation notification — IN_APP + EMAIL. Groups by fair-reg-<id>
  // so re-registrations don't fan out duplicate emails. Mirrors the
  // pattern from the original registerForDrive action so users get
  // identical UX regardless of which path they entered through.
  try {
    await dispatchNotification({
      userId,
      type: "fair.registered",
      title: `You're registered for ${drive.title}`,
      body: `Check-in code ${created.checkInCode}. We'll remind you before fair day.`,
      link: `/me/fairs/${drive.slug}/pass`,
      channels: ["IN_APP", "EMAIL"],
      groupKey: `fair-reg-${drive.id}`,
    });
  } catch (err) {
    logger.warn({ err }, "[recruitathon] registration notification failed");
  }
  try {
    const { issueToken } = await import("@/lib/auth-tokens");
    const { emailVerificationEmail } = await import("@/lib/emails/templates");
    const { sendMail } = await import("@/lib/mail");
    const { token } = await issueToken("email-verify", d.email);
    const tpl = emailVerificationEmail(d.email, token);
    await sendMail({ to: d.email, ...tpl });
  } catch (err) {
    logger.warn({ err, userId }, "[recruitathon] verification email failed");
  }

  // Auto-sign-in + redirect. signIn throws a NEXT_REDIRECT, so the
  // function never returns past this line on success.
  await signIn("credentials", {
    email: d.email,
    password: d.password,
    redirectTo: `/fairs/${drive.slug}/registered?as=candidate&fresh=1`,
  });
  return { ok: true };
}

/**
 * Signed-in candidate path. Called by registerCandidateInline when
 * the viewer already has a session (OAuth, sign-in-then-back, or
 * sticky-header-CTA-after-signin).
 *
 * Skips: User creation, signIn, verification email.
 * Does: optional CandidateProfile field backfill (only fills empties,
 *       never overwrites), Education shell if user has none, Skills
 *       seed (additive), and the headline RecruitmentDriveRegistration.
 *
 * Already-registered candidates short-circuit to the welcome screen
 * — no error message, just transparent navigation. Same UX as if
 * they'd clicked "View pass" instead of "Register again".
 */
async function registerCandidateForFair(userId: string, formData: FormData): Promise<FormState> {
  const parsed = candidateSignedInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the errors below.",
      fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()),
    };
  }
  const d = parsed.data;
  const evDomains = parseEvDomains(formData);
  if (evDomains.length === 0) {
    return {
      ok: false,
      message: "Please fix the errors below.",
      fieldErrors: { evDomains: "Pick at least one EV domain you're interested in" },
    };
  }

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug: d.driveSlug },
    select: { id: true, slug: true, status: true, title: true },
  });
  if (!drive) return { ok: false, message: "Fair not found." };
  if (drive.status !== "OPEN" && drive.status !== "IN_PROGRESS") {
    return { ok: false, message: "Registration for this fair is closed." };
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId },
    select: { id: true, phone: true, linkedinUrl: true },
  });
  if (!profile) {
    // Edge case: signed-in user has no CandidateProfile. Shouldn't
    // normally happen (signup always creates one) — but if it did,
    // route to onboarding so they recover into a known state instead
    // of crashing here.
    redirect("/onboarding");
  }

  // Already registered → redirect to welcome screen. Idempotent — no
  // error message for the user.
  const existingReg = await db.recruitmentDriveRegistration.findUnique({
    where: { driveId_candidateId: { driveId: drive.id, candidateId: profile.id } },
    select: { id: true },
  });
  if (existingReg) {
    redirect(`/fairs/${drive.slug}/registered?as=candidate`);
  }

  // Resolve optional TPO referral the same way the signed-out path does.
  let tpoCellId: string | null = null;
  if (d.tpoToken && d.tpoToken.length > 0) {
    const cell = await db.collegePlacementCell.findUnique({
      where: { inviteToken: d.tpoToken },
      select: { id: true, status: true },
    });
    if (cell && cell.status === "APPROVED") {
      tpoCellId = cell.id;
    }
  }

  // Backfill profile fields that are empty — never overwrite existing
  // data (the user may have curated their phone / linkedin already
  // and the Recruitathon form value could be a different one).
  if (!profile.phone || !profile.linkedinUrl) {
    await db.candidateProfile.update({
      where: { id: profile.id },
      data: {
        phone: profile.phone ?? d.phone,
        linkedinUrl:
          profile.linkedinUrl ??
          (d.linkedinUrl && d.linkedinUrl.length > 0 ? d.linkedinUrl : null),
      },
    });
  }

  // Seed Education shell only if the candidate has no Education rows.
  // Existing entries are sacred — we don't overwrite or duplicate.
  const educationCount = await db.education.count({ where: { candidateId: profile.id } });
  if (educationCount === 0) {
    await db.education.create({
      data: {
        candidateId: profile.id,
        institution: d.college,
        institutionId: d.institutionId && d.institutionId.length > 0 ? d.institutionId : null,
        degree: d.qualification,
        field: d.course,
        endYear: Number(d.graduationYear),
      },
    });
  }

  // Seed preferred EV domains — additive (per-domain create catches the
  // composite-PK conflict if the candidate already had a domain), so a
  // signed-in user's existing picks aren't disturbed.
  await seedCandidateEvDomains(db, profile.id, evDomains);

  // Seed skills — additive. Catch unique-constraint errors so an
  // already-tagged skill doesn't blow up the request.
  const skills = Array.from(
    new Set(
      d.technicalSkills
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 80),
    ),
  ).slice(0, 15);
  for (const name of skills) {
    const slugified = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!slugified) continue;
    const skill = await db.skill.upsert({
      where: { slug: slugified },
      create: { slug: slugified, name },
      update: {},
      select: { id: true },
    });
    try {
      await db.candidateSkill.create({
        data: { candidateId: profile.id, skillId: skill.id },
      });
    } catch {
      // Unique (candidateId, skillId) conflict — already tagged.
    }
  }

  // Create the headline registration row with collision retry on the
  // 6-char check-in code (same loop pattern as the signed-out path).
  let attempt = 0;
  for (;;) {
    attempt++;
    const code = mintCheckInCode();
    try {
      await db.recruitmentDriveRegistration.create({
        data: {
          driveId: drive.id,
          candidateId: profile.id,
          checkInCode: code,
          source: tpoCellId ? "RECRUITATHON_TPO_LINK" : "RECRUITATHON_INLINE",
          viaTpoCellId: tpoCellId,
          fairMode: d.fairMode,
          intendedRoles: d.intendedRoles,
          willingLocations: d.willingLocations,
          formAnswers: recruitathonFormAnswers(d, evDomains),
        },
      });
      break;
    } catch (err) {
      const code = (err as { code?: string; meta?: { target?: string[] } })?.code;
      const target = (err as { meta?: { target?: string[] } })?.meta?.target ?? [];
      if (code === "P2002" && target.includes("checkInCode") && attempt < 6) continue;
      throw err;
    }
  }
  await db.recruitmentDrive.update({
    where: { id: drive.id },
    data: { registeredCount: { increment: 1 } },
  });

  try {
    await audit({
      actorId: userId,
      action: "recruitathon.candidate_registered",
      entity: "RecruitmentDrive",
      entityId: drive.id,
      meta: { source: tpoCellId ? "RECRUITATHON_TPO_LINK" : "RECRUITATHON_INLINE", signedIn: true },
    });
  } catch (err) {
    logger.warn({ err }, "[recruitathon] signed-in candidate audit failed");
  }
  try {
    await dispatchNotification({
      userId,
      type: "fair.registered",
      title: `You're registered for ${drive.title}`,
      body: `Your fair pass + check-in code are ready. We'll remind you before fair day.`,
      link: `/me/fairs/${drive.slug}/pass`,
      channels: ["IN_APP", "EMAIL"],
      groupKey: `fair-reg-${drive.id}`,
    });
  } catch (err) {
    logger.warn({ err }, "[recruitathon] signed-in registration notification failed");
  }

  // No signIn, no verification email — they're already signed in +
  // verified. Just navigate to the celebration screen.
  redirect(`/fairs/${drive.slug}/registered?as=candidate&fresh=1`);
}

// ────────────────────────────────────────────────────────────────
// EMPLOYER inline-signup
// ────────────────────────────────────────────────────────────────

// Recruitathon-essential employer fields — shared between signed-out
// + signed-in schemas. Company-level fields are still required in
// the signed-in path because we may need to create a new Company /
// CollegePlacementCell-style EmployerProfile for a signed-in viewer
// who hasn't claimed an employer hat yet.
const employerRecruitathonFields = {
  pocPhone: z.string().trim().min(7, "POC phone is required").max(20),
  pocDesignation: z.string().trim().min(2, "POC designation is required").max(120),
  companyName: z.string().trim().min(2, "Company name is required").max(200),
  /// Optional FK posted by the EntityAutocomplete when the recruiter
  /// picked an existing Company from the dropdown. Server-side lookup
  /// prefers this over the website / name dedupe path so the new
  /// EmployerProfile attaches to the EXACT row the user picked
  /// (avoids fuzzy-name collisions like "Tata Motors" vs "Tata EV").
  companyId: z.string().trim().max(40).optional().or(z.literal("")),
  companyWebsite: z.string().trim().url("Enter a valid website URL").max(300).optional().or(z.literal("")),
  industry: z.string().trim().min(2, "Industry is required").max(200),
  productsServices: z.string().trim().min(2, "Tell us what you build / sell").max(2000),
  hiringLocations: z.string().trim().min(2, "List hiring cities").max(500),
  openRoles: z.string().trim().min(2, "List open roles + headcount").max(2000),
  desiredSkills: z.string().trim().min(2, "List the skills you want").max(500),
  hiresFreshers: z.enum(["yes", "no"]).default("no"),
  providesTraining: z.enum(["yes", "no"]).default("no"),
  growthOpportunities: z.string().trim().max(2000).optional().or(z.literal("")),
  fairMode: RecruitathonAvailabilityEnum,
  driveSlug: z.string().trim().min(1),
} as const;

const employerSchema = z.object({
  // Auth (POC)
  name: z.string().trim().min(2, "POC name is required").max(120),
  email: z.string().trim().email("Enter a valid email").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters").max(120),
  acceptTerms: z.literal("on", { errorMap: () => ({ message: "Please agree to the Terms" }) }),
  ...employerRecruitathonFields,
});

const employerSignedInSchema = z.object(employerRecruitathonFields);

export async function registerEmployerInline(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (session?.user) {
    return registerEmployerForFair(session.user.id, session.user.name ?? null, formData);
  }

  const rawName = String(formData.get("name") ?? "").trim();
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const spam = await antiSpamPreamble(formData, rawName, rawEmail);
  if (!spam.ok) return spam.state;

  const parsed = employerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the errors below.",
      fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()),
    };
  }
  const d = parsed.data;

  const ip = await clientIp();
  try {
    await rateLimitOrThrow(`signup:${d.email}`, "signup");
    if (ip) await rateLimitOrThrow(`signup-ip:${ip}`, "signupIp");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Too many attempts" };
  }

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug: d.driveSlug },
    select: { id: true, slug: true, status: true, title: true },
  });
  if (!drive) return { ok: false, message: "Fair not found." };
  if (drive.status !== "OPEN" && drive.status !== "IN_PROGRESS") {
    return { ok: false, message: "Registration for this fair is closed." };
  }

  const existingUser = await db.user.findUnique({ where: { email: d.email }, select: { id: true } });
  if (existingUser) {
    return {
      ok: false,
      message: "You already have an account with this email. Sign in and we'll register your company for the fair.",
      fieldErrors: { email: "Already registered — sign in instead." },
    };
  }

  const passwordHash = await hashPassword(d.password);
  const userAgent = await clientUserAgent();

  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: d.name,
        email: d.email,
        passwordHash,
        role: Role.EMPLOYER,
        signupIp: ip,
        signupUserAgent: userAgent?.slice(0, 500) ?? null,
      },
    });
    // Always seed a CandidateProfile too — same LinkedIn pattern as the
    // regular signup flow (server/auth/actions.ts line 121). The user's
    // personal profile + the persona-switcher work day 0.
    const [firstName, ...rest] = d.name.split(" ");
    await withUniqueSlug(d.name, (slug) =>
      tx.candidateProfile.create({
        data: {
          userId: user.id,
          slug,
          firstName: firstName ?? d.name,
          lastName: rest.join(" ") || null,
          email: d.email,
          phone: d.pocPhone,
        },
      }),
    );

    // Find-or-create the Company.
    //
    // Order of resolution:
    //   1. If the form posted `companyId` (user picked an existing row
    //      from the EntityAutocomplete dropdown), look that up FIRST.
    //      The user explicitly chose this row, so we should attach to
    //      it even if their typed website matches a different company.
    //   2. Otherwise dedupe by website (most reliable for "same
    //      company, two recruiters signed up separately").
    //   3. Otherwise dedupe by lower-cased name.
    //   4. Otherwise create a fresh Company row.
    //
    // If a Company already exists, the new user gets added as a
    // non-admin EmployerProfile and the registration goes against
    // that company — admin can promote to company-admin later via
    // /admin/claims if needed.
    const websiteNorm = (d.companyWebsite ?? "").trim().toLowerCase().replace(/\/+$/, "");
    const pickedCompanyId = (d.companyId ?? "").trim();
    let company = pickedCompanyId
      ? await tx.company.findUnique({
          where: { id: pickedCompanyId },
          select: { id: true, slug: true, name: true },
        })
      : null;
    if (!company && websiteNorm) {
      company = await tx.company.findFirst({
        where: { website: { equals: websiteNorm, mode: "insensitive" } },
        select: { id: true, slug: true, name: true },
      });
    }
    if (!company) {
      company = await tx.company.findFirst({
        where: { name: { equals: d.companyName.trim(), mode: "insensitive" } },
        select: { id: true, slug: true, name: true },
      });
    }
    let isFreshCompany = false;
    if (!company) {
      isFreshCompany = true;
      const companyCreated = await withUniqueSlug(d.companyName, (slug) =>
        tx.company.create({
          data: {
            slug,
            name: d.companyName,
            website: websiteNorm.length > 0 ? websiteNorm : null,
            about: d.productsServices,
            ownerUserId: user.id,
            verificationStatus: "UNVERIFIED",
          },
          select: { id: true, slug: true, name: true },
        }),
      );
      company = companyCreated;
    }

    // EmployerProfile — user's seat at this company. Make them
    // company-admin only when they created the company fresh; existing
    // companies route through /admin/claims for safety.
    await tx.employerProfile.create({
      data: {
        userId: user.id,
        companyId: company.id,
        designation: d.pocDesignation,
        isCompanyAdmin: isFreshCompany,
        teamRole: isFreshCompany ? "ADMIN" : "RECRUITER",
      },
    });

    // The headline participation row. INVITED status because admin
    // hasn't reviewed it yet — keeps existing admin-side workflows
    // (booth assignment, JD attach, etc.) intact. Admin flips to
    // CONFIRMED from the Recruitathon admin queue.
    await tx.recruitmentDriveCompany.create({
      data: {
        driveId: drive.id,
        companyId: company.id,
        status: "INVITED",
        aboutAtFair: d.openRoles,
        fairMode: d.fairMode,
        hiresFreshers: d.hiresFreshers === "yes",
        providesTraining: d.providesTraining === "yes",
        growthOpportunities: d.growthOpportunities && d.growthOpportunities.length > 0 ? d.growthOpportunities : null,
        pocPhone: d.pocPhone,
        formAnswers: {
          industry: d.industry,
          productsServices: d.productsServices,
          hiringLocations: d.hiringLocations,
          openRoles: d.openRoles,
          desiredSkills: d.desiredSkills,
          isFreshCompany,
        },
      },
    });

    return { userId: user.id, companyId: company.id, companySlug: company.slug };
  });

  try {
    await audit({
      actorId: created.userId,
      action: "recruitathon.employer_registered",
      entity: "RecruitmentDrive",
      entityId: drive.id,
      meta: { source: "RECRUITATHON_INLINE", companyId: created.companyId },
    });
  } catch (err) {
    logger.warn({ err }, "[recruitathon] audit failed");
  }
  try {
    await dispatchNotification({
      userId: created.userId,
      type: "fair.employer_registered",
      title: `Your company is registered for ${drive.title}`,
      body: "Our placement team will review + assign you a booth within 2 business days. You'll get an email the moment it's confirmed.",
      link: `/fairs/${drive.slug}/registered?as=employer`,
      channels: ["IN_APP", "EMAIL"],
      groupKey: `fair-emp-${drive.id}-${created.companyId}`,
    });
  } catch (err) {
    logger.warn({ err }, "[recruitathon] employer registration notification failed");
  }
  try {
    const { issueToken } = await import("@/lib/auth-tokens");
    const { emailVerificationEmail } = await import("@/lib/emails/templates");
    const { sendMail } = await import("@/lib/mail");
    const { token } = await issueToken("email-verify", d.email);
    const tpl = emailVerificationEmail(d.email, token);
    await sendMail({ to: d.email, ...tpl });
  } catch (err) {
    logger.warn({ err, userId: created.userId }, "[recruitathon] verification email failed");
  }

  await signIn("credentials", {
    email: d.email,
    password: d.password,
    redirectTo: `/fairs/${drive.slug}/registered?as=employer&fresh=1`,
  });
  return { ok: true };
}

/**
 * Signed-in employer path. Two sub-cases:
 *
 *   1. Viewer already has an EmployerProfile → use it. Check if that
 *      company already has a RecruitmentDriveCompany row for this
 *      drive; if so redirect to welcome screen (idempotent). Else
 *      create the participation row.
 *   2. Viewer has no EmployerProfile (regular candidate signing up
 *      a company for the fair) → run the full find-or-create company
 *      logic, create EmployerProfile, create participation.
 *
 * Skips: User creation, signIn, verification email, ToS gate.
 */
async function registerEmployerForFair(
  userId: string,
  userName: string | null,
  formData: FormData,
): Promise<FormState> {
  const parsed = employerSignedInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the errors below.",
      fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()),
    };
  }
  const d = parsed.data;

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug: d.driveSlug },
    select: { id: true, slug: true, status: true, title: true },
  });
  if (!drive) return { ok: false, message: "Fair not found." };
  if (drive.status !== "OPEN" && drive.status !== "IN_PROGRESS") {
    return { ok: false, message: "Registration for this fair is closed." };
  }

  // Find the viewer's existing EmployerProfile (if any). The
  // RecruitmentDriveCompany row is uniqued on (driveId, companyId),
  // so we just need to know which company they're acting on behalf of.
  const existingEmployer = await db.employerProfile.findUnique({
    where: { userId },
    select: { companyId: true, isCompanyAdmin: true, company: { select: { slug: true } } },
  });

  const result = await db.$transaction(async (tx) => {
    // ─── Resolve target company ──────────────────────────────
    let companyId: string;
    let companySlug: string;
    let isFreshCompany = false;
    if (existingEmployer) {
      companyId = existingEmployer.companyId;
      companySlug = existingEmployer.company.slug;
    } else {
      // No EmployerProfile yet — same find-or-create logic as the
      // signed-out path. Match by website first, then by case-
      // insensitive name.
      const websiteNorm = (d.companyWebsite ?? "").trim().toLowerCase().replace(/\/+$/, "");
      let company = websiteNorm
        ? await tx.company.findFirst({
            where: { website: { equals: websiteNorm, mode: "insensitive" } },
            select: { id: true, slug: true },
          })
        : null;
      if (!company) {
        company = await tx.company.findFirst({
          where: { name: { equals: d.companyName.trim(), mode: "insensitive" } },
          select: { id: true, slug: true },
        });
      }
      if (!company) {
        isFreshCompany = true;
        const created = await withUniqueSlug(d.companyName, (slug) =>
          tx.company.create({
            data: {
              slug,
              name: d.companyName,
              website: websiteNorm.length > 0 ? websiteNorm : null,
              about: d.productsServices,
              ownerUserId: userId,
              verificationStatus: "UNVERIFIED",
            },
            select: { id: true, slug: true },
          }),
        );
        company = created;
      }
      companyId = company.id;
      companySlug = company.slug;
      // Mint EmployerProfile so the viewer can manage the company
      // post-registration. Company-admin only when freshly created;
      // existing-company joiners route through /admin/claims later.
      await tx.employerProfile.create({
        data: {
          userId,
          companyId,
          designation: d.pocDesignation,
          isCompanyAdmin: isFreshCompany,
          teamRole: isFreshCompany ? "ADMIN" : "RECRUITER",
        },
      });
    }

    // ─── Find-or-create fair participation ─────────────────
    const existingParticipation = await tx.recruitmentDriveCompany.findUnique({
      where: { driveId_companyId: { driveId: drive.id, companyId } },
      select: { id: true },
    });
    if (existingParticipation) {
      return { alreadyParticipating: true, companySlug };
    }
    await tx.recruitmentDriveCompany.create({
      data: {
        driveId: drive.id,
        companyId,
        status: "INVITED",
        aboutAtFair: d.openRoles,
        fairMode: d.fairMode,
        hiresFreshers: d.hiresFreshers === "yes",
        providesTraining: d.providesTraining === "yes",
        growthOpportunities:
          d.growthOpportunities && d.growthOpportunities.length > 0
            ? d.growthOpportunities
            : null,
        pocPhone: d.pocPhone,
        formAnswers: {
          industry: d.industry,
          productsServices: d.productsServices,
          hiringLocations: d.hiringLocations,
          openRoles: d.openRoles,
          desiredSkills: d.desiredSkills,
          isFreshCompany,
          signedIn: true,
          pocName: userName ?? "",
        },
      },
    });
    return { alreadyParticipating: false, companySlug };
  });

  // Already participating → soft redirect to welcome screen rather
  // than throwing an error. Same idempotent UX as the candidate path.
  if (result.alreadyParticipating) {
    redirect(`/fairs/${drive.slug}/registered?as=employer`);
  }

  try {
    await audit({
      actorId: userId,
      action: "recruitathon.employer_registered",
      entity: "RecruitmentDrive",
      entityId: drive.id,
      meta: { companySlug: result.companySlug, signedIn: true },
    });
  } catch (err) {
    logger.warn({ err }, "[recruitathon] signed-in employer audit failed");
  }
  try {
    await dispatchNotification({
      userId,
      type: "fair.employer_registered",
      title: `Your company is registered for ${drive.title}`,
      body: "Our placement team will confirm booth assignment within 2 business days.",
      link: `/fairs/${drive.slug}/registered?as=employer`,
      channels: ["IN_APP", "EMAIL"],
      groupKey: `fair-emp-${drive.id}-${result.companySlug}`,
    });
  } catch (err) {
    logger.warn({ err }, "[recruitathon] signed-in employer notification failed");
  }

  redirect(`/fairs/${drive.slug}/registered?as=employer&fresh=1`);
}

// ────────────────────────────────────────────────────────────────
// TPO inline-signup — Training & Placement Officer applying for a
// placement-cell account in the same one-shot pattern as the
// candidate + employer flows.
//
// Lifecycle:
//   1. This action creates User (role CANDIDATE — TPOs ARE candidates
//      under the hood, the TPO console layers on top of the regular
//      account) + CandidateProfile shell + CollegePlacementCell row
//      in PENDING status.
//   2. Admin reviews at /admin/colleges → on approve flips
//      User.isPlacementOfficer = true AND mints the invite token.
//   3. TPO sees their full dashboard at /tpo with the invite link.
//
// Until the admin approves, the TPO sees a "Pending review" welcome
// screen with no invite link yet — same pattern as the existing
// /colleges/register flow.
// ────────────────────────────────────────────────────────────────

// Recruitathon-essential TPO fields — shared between signed-out +
// signed-in schemas. College + contact details are required either
// way; designation + studentCount + notes are the placement-team's
// triage inputs.
const tpoRecruitathonFields = {
  contactPhone: z.string().trim().min(7, "Phone number is required").max(20),
  designation: z.string().trim().min(2, "Designation is required").max(120),
  collegeName: z.string().trim().min(2, "College / institute name is required").max(200),
  /// Optional FK posted by the EntityAutocomplete when the TPO picked
  /// an existing Institution. Server prefers this over the
  /// name-based dedupe so two TPOs at the same college both link to
  /// the canonical Institution row regardless of name spelling drift.
  institutionId: z.string().trim().max(40).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  studentCount: z.coerce.number().int().min(0).max(50_000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  driveSlug: z.string().trim().min(1),
} as const;

const tpoSchema = z.object({
  // Auth
  name: z.string().trim().min(2, "Full name is required").max(120),
  email: z.string().trim().email("Enter a valid email").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters").max(120),
  acceptTerms: z.literal("on", { errorMap: () => ({ message: "Please agree to the Terms" }) }),
  ...tpoRecruitathonFields,
});

const tpoSignedInSchema = z.object(tpoRecruitathonFields);

export async function registerTpoInline(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (session?.user) {
    return registerTpoForFair(
      session.user.id,
      session.user.email ?? "",
      session.user.name ?? "",
      formData,
    );
  }

  const rawName = String(formData.get("name") ?? "").trim();
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const spam = await antiSpamPreamble(formData, rawName, rawEmail);
  if (!spam.ok) return spam.state;

  const parsed = tpoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the errors below.",
      fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()),
    };
  }
  const d = parsed.data;

  const ip = await clientIp();
  try {
    await rateLimitOrThrow(`signup:${d.email}`, "signup");
    if (ip) await rateLimitOrThrow(`signup-ip:${ip}`, "signupIp");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Too many attempts" };
  }

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug: d.driveSlug },
    select: { id: true, slug: true, status: true, title: true },
  });
  if (!drive) return { ok: false, message: "Fair not found." };
  if (drive.status !== "OPEN" && drive.status !== "IN_PROGRESS") {
    return { ok: false, message: "Registration for this fair is closed." };
  }

  const existingUser = await db.user.findUnique({ where: { email: d.email }, select: { id: true } });
  if (existingUser) {
    return {
      ok: false,
      message: "You already have an account with this email. Sign in and apply for a placement-cell account from /colleges/register.",
      fieldErrors: { email: "Already registered — sign in instead." },
    };
  }

  const passwordHash = await hashPassword(d.password);
  const userAgent = await clientUserAgent();

  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: d.name,
        email: d.email,
        passwordHash,
        role: Role.CANDIDATE,
        signupIp: ip,
        signupUserAgent: userAgent?.slice(0, 500) ?? null,
      },
    });
    // Personal candidate profile — TPOs ALSO need this since
    // /tpo gates on User.isPlacementOfficer (set by admin on approval)
    // but the candidate profile is the user's identity on the platform.
    const [firstName, ...rest] = d.name.split(" ");
    await withUniqueSlug(d.name, (slug) =>
      tx.candidateProfile.create({
        data: {
          userId: user.id,
          slug,
          firstName: firstName ?? d.name,
          lastName: rest.join(" ") || null,
          email: d.email,
          phone: d.contactPhone,
        },
      }),
    );

    // Find-or-create the institution. Order:
    //   1. Picked from EntityAutocomplete (institutionId set) — wins,
    //      matches the canonical row the TPO explicitly chose.
    //   2. Case-insensitive name match (catches the "BMS College of
    //      Engineering" vs "B.M.S College of Engineering" variance).
    //   3. Fresh create.
    const pickedInstitutionId = (d.institutionId ?? "").trim();
    let institution = pickedInstitutionId
      ? await tx.institution.findUnique({
          where: { id: pickedInstitutionId },
          select: { id: true, slug: true, name: true },
        })
      : null;
    if (!institution) {
      institution = await tx.institution.findFirst({
        where: { name: { equals: d.collegeName.trim(), mode: "insensitive" } },
        select: { id: true, slug: true, name: true },
      });
    }
    if (!institution) {
      institution = await withUniqueSlug(d.collegeName, (slug) =>
        tx.institution.create({
          data: {
            slug,
            name: d.collegeName.trim(),
            city: d.city && d.city.length > 0 ? d.city : null,
            state: d.state && d.state.length > 0 ? d.state : null,
            country: "IN",
            verificationStatus: "UNVERIFIED",
            createdById: user.id,
          },
          select: { id: true, slug: true, name: true },
        }),
      );
    }

    // The placement-cell application — lands PENDING. Admin approves
    // at /admin/colleges, which flips isPlacementOfficer + mints the
    // invite token (see server/colleges/actions.ts).
    const cell = await tx.collegePlacementCell.create({
      data: {
        institutionId: institution.id,
        createdById: user.id,
        status: "PENDING",
        contactName: d.name,
        contactEmail: d.email,
        contactPhone: d.contactPhone,
        designation: d.designation,
        studentCount: d.studentCount ?? null,
        notes:
          (d.notes && d.notes.length > 0)
            ? `[Self-registered via ${drive.slug}] ${d.notes}`
            : `Self-registered via ${drive.slug}`,
      },
      select: { id: true, institutionId: true },
    });

    return { userId: user.id, cellId: cell.id, institutionId: cell.institutionId };
  });

  try {
    await audit({
      actorId: created.userId,
      action: "recruitathon.tpo_registered",
      entity: "CollegePlacementCell",
      entityId: created.cellId,
      meta: { driveId: drive.id, institutionId: created.institutionId },
    });
  } catch (err) {
    logger.warn({ err }, "[recruitathon] tpo audit failed");
  }
  try {
    await dispatchNotification({
      userId: created.userId,
      type: "recruitathon.tpo_pending",
      title: "Your TPO application is under review",
      body: `We received your placement-cell application for ${drive.title}. Admin review typically takes 2 business days.`,
      link: `/fairs/${drive.slug}/registered?as=tpo`,
      channels: ["IN_APP", "EMAIL"],
      groupKey: `tpo-pending-${created.cellId}`,
    });
  } catch (err) {
    logger.warn({ err }, "[recruitathon] audit failed");
  }
  try {
    const { issueToken } = await import("@/lib/auth-tokens");
    const { emailVerificationEmail } = await import("@/lib/emails/templates");
    const { sendMail } = await import("@/lib/mail");
    const { token } = await issueToken("email-verify", d.email);
    const tpl = emailVerificationEmail(d.email, token);
    await sendMail({ to: d.email, ...tpl });
  } catch (err) {
    logger.warn({ err, userId: created.userId }, "[recruitathon] verification email failed");
  }

  await signIn("credentials", {
    email: d.email,
    password: d.password,
    redirectTo: `/fairs/${drive.slug}/registered?as=tpo&fresh=1`,
  });
  return { ok: true };
}

/**
 * Signed-in TPO path. The viewer is already a platform user — they
 * could be a fresh CANDIDATE who's signing up as TPO for the first
 * time, or an existing TPO returning to apply for another fair.
 *
 * Branches:
 *   • Already has a CollegePlacementCell (any status) → redirect to
 *     the welcome screen. Re-applying via the unique (institutionId,
 *     createdById) constraint would just error; admin can re-open
 *     REJECTED cells via /admin/colleges.
 *   • No cell yet → run the institution find-or-create + cell create
 *     in PENDING status, same as the signed-out path's transaction
 *     (just without the User / CandidateProfile creation steps).
 */
async function registerTpoForFair(
  userId: string,
  userEmail: string,
  userName: string,
  formData: FormData,
): Promise<FormState> {
  const parsed = tpoSignedInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the errors below.",
      fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()),
    };
  }
  const d = parsed.data;

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug: d.driveSlug },
    select: { id: true, slug: true, status: true, title: true },
  });
  if (!drive) return { ok: false, message: "Fair not found." };
  if (drive.status !== "OPEN" && drive.status !== "IN_PROGRESS") {
    return { ok: false, message: "Registration for this fair is closed." };
  }

  // Already applied → soft redirect to welcome screen (which handles
  // PENDING / APPROVED / REJECTED states gracefully).
  const existingCell = await db.collegePlacementCell.findFirst({
    where: { createdById: userId },
    select: { id: true },
  });
  if (existingCell) {
    redirect(`/fairs/${drive.slug}/registered?as=tpo`);
  }

  const created = await db.$transaction(async (tx) => {
    // Same picked-id-first ordering as the unsigned-in TPO branch
    // above. Centralised resolution would be nicer; pragmatic copy
    // here because the surrounding transaction shape differs.
    const pickedInstitutionId = (d.institutionId ?? "").trim();
    let institution = pickedInstitutionId
      ? await tx.institution.findUnique({
          where: { id: pickedInstitutionId },
          select: { id: true, slug: true, name: true },
        })
      : null;
    if (!institution) {
      institution = await tx.institution.findFirst({
        where: { name: { equals: d.collegeName.trim(), mode: "insensitive" } },
        select: { id: true, slug: true, name: true },
      });
    }
    if (!institution) {
      institution = await withUniqueSlug(d.collegeName, (slug) =>
        tx.institution.create({
          data: {
            slug,
            name: d.collegeName.trim(),
            city: d.city && d.city.length > 0 ? d.city : null,
            state: d.state && d.state.length > 0 ? d.state : null,
            country: "IN",
            verificationStatus: "UNVERIFIED",
            createdById: userId,
          },
          select: { id: true, slug: true, name: true },
        }),
      );
    }

    const cell = await tx.collegePlacementCell.create({
      data: {
        institutionId: institution.id,
        createdById: userId,
        status: "PENDING",
        contactName: userName || userEmail,
        contactEmail: userEmail,
        contactPhone: d.contactPhone,
        designation: d.designation,
        studentCount: d.studentCount ?? null,
        notes:
          (d.notes && d.notes.length > 0)
            ? `[Self-registered via ${drive.slug}] ${d.notes}`
            : `Self-registered via ${drive.slug}`,
      },
      select: { id: true, institutionId: true },
    });

    return { cellId: cell.id, institutionId: cell.institutionId };
  });

  try {
    await audit({
      actorId: userId,
      action: "recruitathon.tpo_registered",
      entity: "CollegePlacementCell",
      entityId: created.cellId,
      meta: {
        driveId: drive.id,
        institutionId: created.institutionId,
        signedIn: true,
      },
    });
  } catch (err) {
    logger.warn({ err }, "[recruitathon] signed-in TPO audit failed");
  }
  try {
    await dispatchNotification({
      userId,
      type: "recruitathon.tpo_pending",
      title: "Your TPO application is under review",
      body: `We received your placement-cell application for ${drive.title}. Admin review typically takes 2 business days.`,
      link: `/fairs/${drive.slug}/registered?as=tpo`,
      channels: ["IN_APP", "EMAIL"],
      groupKey: `tpo-pending-${created.cellId}`,
    });
  } catch (err) {
    logger.warn({ err }, "[recruitathon] signed-in TPO notification failed");
  }

  redirect(`/fairs/${drive.slug}/registered?as=tpo&fresh=1`);
}
