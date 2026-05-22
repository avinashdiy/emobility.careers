"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { isRouterControlError } from "@/lib/server-action-errors";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CompanyVerification, Country, Role, AccountStatus } from "@prisma/client";
import { logger } from "@/lib/logger";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

/**
 * Like `requireAdmin` but also lets approved placement officers (TPOs)
 * through. Used by tools where we've already extended the trust
 * boundary at approval time — e.g. roster CSV import: a TPO whose
 * placement cell was approved at /admin/colleges can run the same
 * import their admin would have to run for them otherwise.
 *
 * Returns the session plus a discriminator the caller uses to
 * narrow what's allowed (e.g. only admins grant DIYguru badges).
 */
async function requireAdminOrTpo() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isPlacementOfficer: true },
  });
  if (!user) redirect("/signin");
  const isAdmin = user.role === "ADMIN";
  if (!isAdmin && !user.isPlacementOfficer) redirect("/403");
  return { session, isAdmin };
}

// ─── Users ───────────────────────────────────────────────────

export async function setUserRole(formData: FormData) {
  const session = await requireAdmin();
  const userId = z.string().parse(formData.get("userId"));
  const role = z.nativeEnum(Role).parse(formData.get("role"));
  const before = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  await db.user.update({ where: { id: userId }, data: { role } });
  await audit({
    actorId: session.user.id,
    action: "user.role_change",
    entity: "User",
    entityId: userId,
    meta: { from: before?.role, to: role },
  });
  revalidatePath("/admin/users");
}

/**
 * Toggle the `User.isPlacementOfficer` flag — grants /tpo dashboard
 * access without making the user an ADMIN. Reserved for trusted DIYguru
 * placement coordinators.
 */
export async function togglePlacementOfficer(formData: FormData) {
  const session = await requireAdmin();
  const userId = z.string().parse(formData.get("userId"));
  const before = await db.user.findUnique({
    where: { id: userId },
    select: { isPlacementOfficer: true },
  });
  if (!before) return;
  const next = !before.isPlacementOfficer;
  await db.user.update({ where: { id: userId }, data: { isPlacementOfficer: next } });
  await audit({
    actorId: session.user.id,
    action: next ? "user.tpo_granted" : "user.tpo_revoked",
    entity: "User",
    entityId: userId,
  });
  revalidatePath("/admin/users");
}

export async function setUserStatus(formData: FormData) {
  const session = await requireAdmin();
  const userId = z.string().parse(formData.get("userId"));
  const status = z.nativeEnum(AccountStatus).parse(formData.get("status"));
  const before = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
  await db.user.update({ where: { id: userId }, data: { status } });
  await audit({
    actorId: session.user.id,
    action: "user.status_change",
    entity: "User",
    entityId: userId,
    meta: { from: before?.status, to: status },
  });
  revalidatePath("/admin/users");
}

// ─── Identity edits ──────────────────────────────────────────
//
// Lets an admin fix sign-up typos (wrong email captured at signup,
// misspelt name, etc.). These touch the `User` row directly — the
// authoritative identity surface used for sign-in + email delivery.
// Candidate-profile edits live in candidate-actions.ts and target
// the public-profile fields (firstName, lastName, headline, etc.),
// which are separate copies.

const setEmailSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email("Enter a valid email address").toLowerCase().max(254),
});

export async function setUserEmail(formData: FormData) {
  const session = await requireAdmin();
  const parsed = setEmailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      "/admin/users?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid email"),
    );
  }
  const { userId, email } = parsed.data;
  const before = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });
  if (!before) {
    redirect("/admin/users?error=" + encodeURIComponent("User not found."));
  }
  // Self-guard: changing your own email out from under your own
  // session would invalidate every magic-link / sign-in the admin
  // might rely on. Force them to do it from /me/settings instead.
  if (userId === session.user.id) {
    redirect(
      `/admin/users/${userId}?error=` +
        encodeURIComponent("Use /me/settings to change your own email."),
    );
  }
  // Uniqueness check — Prisma will throw a P2002 anyway but the
  // generic toast is unhelpful. Catch early with a specific message.
  const collision = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (collision && collision.id !== userId) {
    redirect(
      `/admin/users/${userId}?error=` +
        encodeURIComponent(`Another user already has ${email}. Resolve the duplicate first.`),
    );
  }
  // Email change resets verification — they need to re-prove
  // ownership of the new address. Same pattern as the self-serve
  // /me/settings email-change flow.
  await db.user.update({
    where: { id: userId },
    data: { email, emailVerifiedAt: null },
  });
  await audit({
    actorId: session.user.id,
    action: "user.email_change",
    entity: "User",
    entityId: userId,
    meta: { from: before!.email, to: email, byRole: before!.role },
  });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  redirect(
    `/admin/users/${userId}?notice=` +
      encodeURIComponent("Email updated. Verification cleared — user needs to re-verify."),
  );
}

const setNameSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
});

export async function setUserName(formData: FormData) {
  const session = await requireAdmin();
  const parsed = setNameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      "/admin/users?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid name"),
    );
  }
  const { userId, name } = parsed.data;
  const before = await db.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  if (!before) redirect("/admin/users?error=" + encodeURIComponent("User not found."));
  await db.user.update({ where: { id: userId }, data: { name } });
  await audit({
    actorId: session.user.id,
    action: "user.name_change",
    entity: "User",
    entityId: userId,
    meta: { from: before!.name, to: name },
  });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  redirect(
    `/admin/users/${userId}?notice=` + encodeURIComponent("Display name updated."),
  );
}

/**
 * Force-verify email — flips `emailVerifiedAt` to now() for a user
 * whose verification link expired or got lost in spam. The user is
 * told via email so they know admin acted on their behalf.
 *
 * Refuses to re-verify an already-verified email (no-op) — keeps
 * the audit log clean.
 */
export async function forceVerifyEmail(formData: FormData) {
  const session = await requireAdmin();
  const userId = z.string().parse(formData.get("userId"));
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true, name: true },
  });
  if (!user) redirect("/admin/users?error=" + encodeURIComponent("User not found."));
  if (user!.emailVerifiedAt) {
    redirect(
      `/admin/users/${userId}?error=` +
        encodeURIComponent("Email is already verified — nothing to do."),
    );
  }
  await db.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
  });
  await audit({
    actorId: session.user.id,
    action: "user.email_force_verified",
    entity: "User",
    entityId: userId,
    meta: { email: user!.email },
  });
  revalidatePath(`/admin/users/${userId}`);
  redirect(
    `/admin/users/${userId}?notice=` +
      encodeURIComponent(`Marked ${user!.email} as verified.`),
  );
}

/**
 * Send a password-reset email to a user as the admin. The user
 * receives the same one-time link the self-serve "forgot password"
 * flow generates and can set a password from there — works for
 * accounts created via OAuth too (sets a password if none exists).
 *
 * The admin doesn't get to set the password directly — that'd be a
 * trust-boundary violation. They trigger the flow, the user owns
 * the actual change.
 */
export async function sendUserPasswordReset(formData: FormData) {
  const session = await requireAdmin();
  const userId = z.string().parse(formData.get("userId"));
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, status: true, name: true },
  });
  if (!user) redirect("/admin/users?error=" + encodeURIComponent("User not found."));
  if (user!.status !== "ACTIVE") {
    redirect(
      `/admin/users/${userId}?error=` +
        encodeURIComponent("Reactivate the account before sending a password reset — the link won't work for a SUSPENDED/DELETED account."),
    );
  }
  try {
    const { issueToken } = await import("@/lib/auth-tokens");
    const { passwordResetEmail } = await import("@/lib/emails/templates");
    const { sendMail } = await import("@/lib/mail");
    const { token } = await issueToken("password-reset", user!.email);
    const tpl = passwordResetEmail(user!.email, token);
    await sendMail({ to: user!.email, ...tpl });
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    const { logger } = await import("@/lib/logger");
    logger.error({ err, userId }, "[admin] password reset email send failed");
    redirect(
      `/admin/users/${userId}?error=` +
        encodeURIComponent("Couldn't send the reset email — check /admin/settings?tab=email for delivery issues."),
    );
  }
  await audit({
    actorId: session.user.id,
    action: "user.password_reset_sent",
    entity: "User",
    entityId: userId,
    meta: { email: user!.email },
  });
  redirect(
    `/admin/users/${userId}?notice=` +
      encodeURIComponent(`Password reset link emailed to ${user!.email}. Link expires in 1 hour.`),
  );
}

/**
 * Soft-delete a user — scrubs PII, blocks sign-in, kills active
 * sessions, and marks the row as DELETED while preserving the User
 * id so foreign keys (Applications, Posts, Messages, audit log)
 * remain intact.
 *
 * Why soft-delete instead of hard-delete:
 *   • Hard-cascade would erase application history (interviews,
 *     stage moves, notes) that other parties still need to see.
 *     Employers don't lose their pipeline because a candidate's
 *     account was removed.
 *   • Posts/comments authored by a deleted user become "Deleted
 *     user" placeholders rather than disappearing — preserves the
 *     replies/threads other users participated in.
 *   • Audit log integrity — the actor reference on `auditEntries`
 *     remains valid, so historical actions stay attributable.
 *
 * What this DOES:
 *   • `User.status = "DELETED"`, `passwordHash = null`, `name`,
 *     `phone`, `image`, `phoneVerifiedAt`, `emailVerifiedAt` cleared.
 *   • `User.email` renamed to `deleted-{id}@deleted.local` — keeps
 *     the unique constraint satisfied, blocks any sign-in / reset.
 *   • Active `Session` rows deleted (immediate logout everywhere).
 *   • Linked OAuth `Account` rows deleted (no "Sign in with Google"
 *     resurrection path).
 *   • If a CandidateProfile exists: PII fields scrubbed (firstName,
 *     lastName, headline, summary, phone, email, resume/photo/banner
 *     URLs, custom CTA, location/city). Slug renamed to
 *     `deleted-{id}` so the public profile URL 404s.
 *
 * Guards (refuses with helpful error):
 *   • Can't soft-delete yourself (no self-destruct).
 *   • Can't soft-delete another ADMIN (must demote first).
 *   • Can't soft-delete an EMPLOYER who owns a Company with active
 *     jobs that have applications — mirrors deleteCompany guard so
 *     candidate application history is never silently destroyed.
 */
export async function softDeleteUser(formData: FormData) {
  const session = await requireAdmin();
  const userId = z.string().parse(formData.get("userId"));

  if (userId === session.user.id) {
    redirect(
      `/admin/users/${userId}?error=` +
        encodeURIComponent("You can't delete your own account from here — ask another admin."),
    );
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      candidateProfile: { select: { id: true, slug: true } },
      ownedCompanies: { select: { id: true, name: true } },
    },
  });
  if (!user) redirect("/admin/users?error=" + encodeURIComponent("User not found."));
  if (user!.role === "ADMIN") {
    redirect(
      `/admin/users/${userId}?error=` +
        encodeURIComponent("Demote this admin to CANDIDATE/EMPLOYER first — admins can't be deleted directly."),
    );
  }
  if (user!.status === "DELETED") {
    redirect(
      `/admin/users/${userId}?error=` +
        encodeURIComponent("Already deleted."),
    );
  }

  // Block delete if they own any company with applications attached
  // to its jobs. Same guardrail as `deleteCompany` — we never
  // silently erase pipeline history. Admin must address the company
  // first (delete it, transfer ownership, or move applications).
  if (user!.ownedCompanies.length > 0) {
    const ownedIds = user!.ownedCompanies.map((c) => c.id);
    const blockingApps = await db.application.count({
      where: { job: { companyId: { in: ownedIds } } },
    });
    if (blockingApps > 0) {
      redirect(
        `/admin/users/${userId}?error=` +
          encodeURIComponent(
            `Can't delete — this user owns ${user!.ownedCompanies.length} company/companies with ${blockingApps} application(s) attached. Transfer ownership or delete the companies first.`,
          ),
      );
    }
  }

  const scrubbedEmail = `deleted-${user!.id}@deleted.local`;
  const scrubbedSlug = `deleted-${user!.candidateProfile?.id ?? user!.id}`;

  // All-or-nothing inside one transaction. If any step fails we
  // don't want a half-scrubbed user lingering (logged out everywhere
  // but with their real name + resume still public).
  await db.$transaction(async (tx) => {
    // Kill auth surfaces first — invalidates sessions even if the
    // later steps fail. Cascade-deletes on Account/Session would
    // fire on a hard delete; for soft-delete we issue the deletes
    // explicitly.
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    // Any outstanding verification tokens are now meaningless.
    await tx.verificationToken.deleteMany({
      where: {
        OR: [
          { identifier: `email-verify:${user!.email.toLowerCase()}` },
          { identifier: `password-reset:${user!.email.toLowerCase()}` },
        ],
      },
    });

    if (user!.candidateProfile) {
      await tx.candidateProfile.update({
        where: { id: user!.candidateProfile.id },
        data: {
          slug: scrubbedSlug,
          firstName: "Deleted",
          lastName: null,
          headline: null,
          summary: null,
          phone: null,
          email: null,
          location: null,
          city: null,
          country: null,
          profilePhotoUrl: null,
          bannerUrl: null,
          resumeUrl: null,
          portfolioUrl: null,
          linkedinUrl: null,
          githubUrl: null,
          twitterUrl: null,
          websiteUrl: null,
          customCta: null,
          // Keep `isDIYguruVerified` / experience counts intact — they
          // power aggregates we'd lose if we zeroed them out. None of
          // those are PII.
        },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        status: "DELETED",
        email: scrubbedEmail,
        name: null,
        image: null,
        phone: null,
        passwordHash: null,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        // Clear shadow-ban state too — DELETED supersedes it.
        shadowBannedAt: null,
        shadowBanReason: null,
        // Disable any TPO flag — a deleted user shouldn't keep /tpo
        // access if reactivated under a new admin's hand.
        isPlacementOfficer: false,
      },
    });
  });

  await audit({
    actorId: session.user.id,
    action: "user.soft_deleted",
    entity: "User",
    entityId: userId,
    meta: {
      originalEmail: user!.email,
      originalName: user!.name,
      role: user!.role,
      hadCandidateProfile: !!user!.candidateProfile,
      ownedCompaniesCount: user!.ownedCompanies.length,
    },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  // Public profile (now 404) — bust any cached layouts.
  revalidatePath("/[username]", "page");
  redirect(
    "/admin/users?notice=" +
      encodeURIComponent(`Deleted ${user!.email}. PII scrubbed, sessions killed, sign-in disabled.`),
  );
}

// ─── Employer / company verification ────────────────────────

/**
 * Admin reclassification — flip a company's `hqCountry`. Used by
 * /admin/companies (PR 7) to fix the IN-default for seeded
 * companies that genuinely belong to another market (JLR → GB,
 * Tesla → US, Bee'ah → AE, etc.).
 *
 * Side effects beyond the column update:
 *   • Revalidates the per-country routes that include this company
 *     (/[old-cc]/companies, /[new-cc]/companies) so the directory
 *     surfaces refresh.
 *   • Revalidates the public company page so its JSON-LD
 *     `areaServed` reflects the new country immediately.
 *   • Audit-logs the change with both old + new values so the team
 *     can trace bulk reclassifications.
 *
 * Note: does NOT touch any of the company's jobs — those have
 * their own `country` and stay where the recruiter put them. A
 * company HQ'd in UK can post India jobs and vice versa; PR 3
 * decoupled the two dimensions deliberately.
 */
const setCompanyCountrySchema = z.object({
  companyId: z.string().min(1),
  country: z.nativeEnum(Country),
  /**
   * Comma-separated list of additional countries the company
   * OPERATES in (PR 8). Drives `Company.operatesInCountries[]`.
   * Empty / missing → empty array (single-country employer —
   * the common case). Invalid codes silently drop after parse.
   * Filtered to exclude `hqCountry` so the array is genuinely
   * "ADDITIONAL markets only" — the listing queries + JSON-LD
   * already union (hqCountry ∪ operatesInCountries), so we want
   * a single source of truth per country.
   */
  operatesInRaw: z.string().max(120).optional(),
});

/**
 * Parse the comma-separated operatesIn input. Validates each
 * code is in the Country enum + excludes the HQ (implicit) +
 * dedupes within the array. Returns an empty array for empty /
 * missing input — that's "single-country employer", the default.
 */
function parseOperatesIn(raw: string | undefined, exclude: Country): Country[] {
  if (!raw) return [];
  const seen = new Set<Country>();
  const out: Country[] = [];
  for (const code of raw.split(",").map((s) => s.trim().toUpperCase())) {
    if (code === exclude) continue;
    if (!(code in Country)) continue;
    const c = code as Country;
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/**
 * Bulk reclassify companies from a CSV upload. PR 9 polish — the
 * per-row form at /admin/companies handles ~528 companies one at
 * a time, but onboarding a new market (UK launch: 200 anchor
 * employers in one sweep) is friction-heavy that way. CSV upload
 * gives the team a 30-second batch path.
 *
 * Expected CSV columns (header row required, case-insensitive):
 *   slug          — Company.slug, the unique identifier
 *   hqCountry     — ISO 3166-1 alpha-2 (IN, GB, AE, …) — required
 *   operatesIn    — pipe-separated additional countries (`GB|US`) — optional
 *
 * Example:
 *   slug,hqCountry,operatesIn
 *   jaguar-land-rover,GB,IN
 *   tesla,US,GB|AU
 *   bee-ah,AE,
 *
 * Failure modes (each surfaces in the result summary, no row
 * blocks the others):
 *   • slug not found              → "row 4: slug 'foo' not in DB"
 *   • hqCountry not in enum       → "row 7: 'XX' not a supported country"
 *   • operatesIn contains invalid → silently drops the bad codes
 *
 * Returns a FormState the client renders as a summary table.
 * The whole import runs in ONE transaction so a mid-CSV crash
 * doesn't leave the DB half-reclassified.
 */
const bulkCsvSchema = z.object({
  csv: z.string().min(1, "Upload a CSV file."),
});

export interface BulkCompanyCountryRow {
  rowNum: number;
  slug: string;
  status: "ok" | "skipped" | "failed";
  message: string;
  /// Set on `ok` rows so the UI can show "GB → US" etc.
  from?: string;
  to?: string;
}

export interface BulkCompanyCountryResult {
  ok: boolean;
  message?: string;
  /// Per-row results — rendered as a table by the admin page.
  rows?: BulkCompanyCountryRow[];
}

export async function adminBulkReclassifyCompanies(
  _prev: BulkCompanyCountryResult,
  formData: FormData,
): Promise<BulkCompanyCountryResult> {
  try {
    const session = await requireAdmin();
    // We accept the CSV TEXT as a form field rather than a File
    // upload — keeps the action signature simple (no multipart
    // body parsing) and matches how the existing CSV import
    // surfaces in `/admin/diyguru` pass their payload. The page-
    // side wrapper reads the File object client-side and shoves
    // its text into a hidden input before submit.
    const parsed = bulkCsvSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, message: "Upload a CSV file before submitting." };
    }

    const parseResult = Papa.parse<Record<string, string>>(parsed.data.csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });
    if (parseResult.errors.length > 0) {
      return {
        ok: false,
        message: `CSV parse error on row ${parseResult.errors[0].row}: ${parseResult.errors[0].message}`,
      };
    }
    const rows = parseResult.data;
    if (rows.length === 0) {
      return { ok: false, message: "CSV had a header but no data rows." };
    }
    if (rows.length > 1000) {
      return {
        ok: false,
        message: `Cap is 1000 rows per upload (got ${rows.length}). Split the CSV and try again.`,
      };
    }

    // Pre-fetch every referenced slug in one query so we avoid N+1
    // DB hits during the per-row loop.
    const slugs = Array.from(
      new Set(rows.map((r) => (r.slug ?? "").trim()).filter(Boolean)),
    );
    const existingCompanies = await db.company.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true, name: true, hqCountry: true, operatesInCountries: true },
    });
    const bySlug = new Map(existingCompanies.map((c) => [c.slug, c]));

    const results: BulkCompanyCountryRow[] = [];

    // One transaction — if any individual update throws (rare,
    // would be a Prisma-level error), the whole batch rolls back.
    // Per-row VALIDATION failures don't throw, they just record a
    // "failed" row in the results array.
    await db.$transaction(async (tx) => {
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        // CSV rows are 1-indexed in user-speak with the header at
        // row 1, so data starts at row 2 — match that for error
        // messages so the admin can find the right line in Excel.
        const rowNum = i + 2;
        const slug = (row.slug ?? "").trim();
        const hqCountryRaw = (row.hqcountry ?? "").trim().toUpperCase();
        const operatesInRaw = (row.operatesin ?? "").trim();

        if (!slug) {
          results.push({
            rowNum,
            slug: "(empty)",
            status: "failed",
            message: "Missing slug column.",
          });
          continue;
        }
        const existing = bySlug.get(slug);
        if (!existing) {
          results.push({
            rowNum,
            slug,
            status: "failed",
            message: "Company slug not found.",
          });
          continue;
        }
        if (!hqCountryRaw) {
          results.push({
            rowNum,
            slug,
            status: "failed",
            message: "Missing hqCountry column.",
          });
          continue;
        }
        if (!(hqCountryRaw in Country)) {
          results.push({
            rowNum,
            slug,
            status: "failed",
            message: `"${hqCountryRaw}" is not a supported country (IN/AE/AU/US/GB/MY/BD/NP).`,
          });
          continue;
        }
        const newHq = hqCountryRaw as Country;
        // operatesIn uses `|` instead of `,` because the CSV itself
        // is comma-separated — a column containing commas would
        // need quoting. Pipe is unambiguous + readable.
        const newOperatesIn = parseOperatesIn(
          operatesInRaw.replace(/\|/g, ","),
          newHq,
        );

        const sameOperates =
          existing.operatesInCountries.length === newOperatesIn.length &&
          newOperatesIn.every((c) => existing.operatesInCountries.includes(c));
        if (existing.hqCountry === newHq && sameOperates) {
          results.push({
            rowNum,
            slug,
            status: "skipped",
            message: "Already in target state.",
            from: existing.hqCountry,
            to: newHq,
          });
          continue;
        }

        await tx.company.update({
          where: { id: existing.id },
          data: { hqCountry: newHq, operatesInCountries: newOperatesIn },
        });
        results.push({
          rowNum,
          slug,
          status: "ok",
          message:
            newOperatesIn.length > 0
              ? `${existing.hqCountry} → ${newHq}, also operates in ${newOperatesIn.join("+")}`
              : `${existing.hqCountry} → ${newHq}`,
          from: existing.hqCountry,
          to: newHq,
        });
      }
    });

    try {
      await audit({
        actorId: session.user.id,
        action: "company.country.bulk_reclassify",
        entity: "User",
        entityId: session.user.id,
        meta: {
          total: rows.length,
          ok: results.filter((r) => r.status === "ok").length,
          skipped: results.filter((r) => r.status === "skipped").length,
          failed: results.filter((r) => r.status === "failed").length,
        },
      });
    } catch (err) {
      logger.warn({ err }, "[adminBulkReclassifyCompanies] audit-log write failed");
    }

    // Revalidate sweepingly — bulk updates touch many countries.
    // Cheaper to invalidate every supported country's listing
    // than to compute the touched set per-row.
    revalidatePath("/admin/companies");
    revalidatePath("/companies");
    for (const meta of Object.values(Country)) {
      revalidatePath(`/${meta.toLowerCase()}/companies`);
    }

    const okCount = results.filter((r) => r.status === "ok").length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    return {
      ok: true,
      message: `Reclassified ${okCount}, skipped ${skippedCount} (already in target state), failed ${failedCount}.`,
      rows: results,
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[adminBulkReclassifyCompanies] failed");
    return {
      ok: false,
      message:
        "Bulk reclassify failed — no rows were updated (rolled back). Check the CSV format and try again.",
    };
  }
}

export async function adminSetCompanyCountry(formData: FormData) {
  try {
    const session = await requireAdmin();
    const parsed = setCompanyCountrySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect(
        "/admin/companies?error=" +
          encodeURIComponent("Pick a supported country (IN, AE, AU, US, GB, MY, BD, or NP)."),
      );
    }
    const { companyId, country: newCountry, operatesInRaw } = parsed.data;
    const newOperatesIn = parseOperatesIn(operatesInRaw, newCountry);

    const existing = await db.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true, hqCountry: true, operatesInCountries: true },
    });
    if (!existing) {
      redirect("/admin/companies?error=" + encodeURIComponent("Company not found."));
    }
    // Same-value short-circuit covers BOTH dimensions — same HQ
    // AND same operatesIn array (order-independent comparison) =
    // no-op, just toast and bounce.
    const sameOperatesIn =
      existing.operatesInCountries.length === newOperatesIn.length &&
      newOperatesIn.every((c) => existing.operatesInCountries.includes(c));
    if (existing.hqCountry === newCountry && sameOperatesIn) {
      redirect(
        "/admin/companies?notice=" +
          encodeURIComponent(`${existing.name} unchanged.`),
      );
    }

    await db.company.update({
      where: { id: companyId },
      data: {
        hqCountry: newCountry,
        operatesInCountries: newOperatesIn,
      },
    });

    try {
      await audit({
        actorId: session.user.id,
        action: "company.country.reclassify",
        entity: "Company",
        entityId: companyId,
        meta: {
          from: existing.hqCountry,
          to: newCountry,
          slug: existing.slug,
          operatesInBefore: existing.operatesInCountries,
          operatesInAfter: newOperatesIn,
        },
      });
    } catch (err) {
      logger.warn({ err, companyId }, "[adminSetCompanyCountry] audit-log write failed");
    }

    // Revalidate every surface that filters / lists by country —
    // both the OLD country (this company leaves it) AND the NEW
    // country (this company joins it). Plus every country in the
    // OLD + NEW operatesIn arrays so multi-region transitions
    // refresh cleanly (e.g. flipping JLR from GB-only to GB+IN
    // needs /in/companies + /gb/companies to both re-render).
    revalidatePath("/admin/companies");
    revalidatePath("/companies");
    revalidatePath(`/company/${existing.slug}`);
    const allTouchedCountries = new Set<string>([
      existing.hqCountry,
      newCountry,
      ...existing.operatesInCountries,
      ...newOperatesIn,
    ]);
    for (const cc of allTouchedCountries) {
      revalidatePath(`/${cc.toLowerCase()}/companies`);
    }
    revalidatePath(`/${newCountry.toLowerCase()}/companies`);
    redirect(
      "/admin/companies?notice=" +
        encodeURIComponent(`${existing.name} reclassified ${existing.hqCountry} → ${newCountry}.`),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[adminSetCompanyCountry] failed");
    redirect("/admin/companies?error=" + encodeURIComponent("Reclassification failed — try again."));
  }
}

export async function setCompanyVerification(formData: FormData) {
  const session = await requireAdmin();
  const companyId = z.string().parse(formData.get("companyId"));
  const status = z.nativeEnum(CompanyVerification).parse(formData.get("status"));
  const reasonInput = (formData.get("reason") as string | null)?.trim() ?? "";

  // For REJECTED status, require a reason — without one the email to
  // the owner would just say "no reason given" which is the exact
  // capricious behaviour we're trying to avoid. For other statuses,
  // any incoming reason is ignored and any prior reason is cleared.
  if (status === CompanyVerification.REJECTED && reasonInput.length < 10) {
    redirect(
      "/admin/employers?error=" +
        encodeURIComponent(
          "Provide a reason (at least 10 chars) when rejecting — it's emailed to the company owner so they know what to fix.",
        ),
    );
  }

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      slug: true,
      owner: { select: { email: true, name: true } },
    },
  });
  if (!company) {
    redirect("/admin/employers?error=" + encodeURIComponent("Company not found."));
  }

  await db.company.update({
    where: { id: companyId },
    data: {
      verificationStatus: status,
      // Persist or clear the reason in lockstep with the status flip
      // so a company that was rejected then re-approved doesn't
      // carry around a stale rejection note.
      rejectionReason: status === CompanyVerification.REJECTED ? reasonInput : null,
      rejectionAt: status === CompanyVerification.REJECTED ? new Date() : null,
    },
  });

  await audit({
    actorId: session.user.id,
    action: "company.verification",
    entity: "Company",
    entityId: companyId,
    meta: {
      status,
      ...(status === CompanyVerification.REJECTED && { reason: reasonInput }),
    },
  });

  // Email the owner on REJECTED specifically. We don't email on
  // VERIFIED (a quiet success is fine — the page just goes live)
  // unless we want to add that later. Wrapped so a transient mail
  // outage doesn't roll back the verification flip.
  if (status === CompanyVerification.REJECTED && company!.owner?.email) {
    try {
      const { companyRejectedEmail } = await import("@/lib/emails/templates");
      const { sendMail } = await import("@/lib/mail");
      const tpl = companyRejectedEmail({
        ownerName: company!.owner.name ?? null,
        companyName: company!.name,
        reason: reasonInput,
      });
      await sendMail({ to: company!.owner.email, ...tpl });
    } catch (err) {
      const { logger } = await import("@/lib/logger");
      logger.warn({ err, companyId }, "[company.verification] reject email failed");
    }
  }

  revalidatePath("/admin/employers");
  revalidatePath("/companies");
  // Slug isn't known here; revalidate the dynamic prefix so any
  // recently-cached /company/[slug] pages drop their cache and
  // re-render with the new visibility gate.
  revalidatePath("/company", "layout");
}

/**
 * Permanently delete a Company and everything cascading off it
 * (jobs, employer profiles, team invites, events, cohorts,
 * verification requests, competitions, follows). Used by platform
 * admins to clean up duplicate / spam company pages — the equivalent
 * of LinkedIn's "merge or delete" affordance.
 *
 * What survives the delete (relations are SetNull, not Cascade):
 *   • Candidate Experience entries that linked to the company —
 *     they remain as plain-text rows with the FK nulled.
 *   • Posts authored "as the company" — they revert to personal
 *     posts authored by the same User.
 *   • Salary submissions — kept for analytics but unlinked.
 *
 * Refused if the company has any APPLICATIONS attached to its jobs.
 * Job postings cascade-delete fine, but losing application history
 * (interviews, stage moves, candidate notes) is unrecoverable, so we
 * force the admin to first manually deal with applications.
 */
export async function deleteCompany(formData: FormData) {
  const session = await requireAdmin();
  const companyId = z.string().parse(formData.get("companyId"));

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { jobs: true, team: true, events: true } },
    },
  });
  if (!company) {
    redirect("/admin/employers?error=" + encodeURIComponent("Company not found."));
  }

  // Hard guard — refuse if any job has live applications. Application
  // rows have onDelete: Cascade against JobPosting, so if we don't
  // refuse here a single click would erase candidate application
  // history irreversibly.
  const appsCount = await db.application.count({
    where: { job: { companyId } },
  });
  if (appsCount > 0) {
    redirect(
      "/admin/employers?error=" +
        encodeURIComponent(
          `Can't delete "${company!.name}" — ${appsCount} application(s) attached to its jobs would be lost. Reject the company instead (hides it publicly) or move applications elsewhere first.`,
        ),
    );
  }

  // Cascade-delete via Prisma. Schema-level onDelete: Cascade fires
  // for jobs, employer profiles, team invites, events, cohorts,
  // verification requests, competitions, follows.
  await db.company.delete({ where: { id: companyId } });

  await audit({
    actorId: session.user.id,
    action: "company.deleted",
    entity: "Company",
    entityId: companyId,
    meta: {
      name: company!.name,
      slug: company!.slug,
      cascadedJobs: company!._count.jobs,
      cascadedTeam: company!._count.team,
      cascadedEvents: company!._count.events,
    },
  });

  revalidatePath("/admin/employers");
  revalidatePath("/companies");
  revalidatePath("/company", "layout");
  redirect(
    "/admin/employers?notice=" +
      encodeURIComponent(`Deleted "${company!.name}".`),
  );
}

/**
 * Bulk-delete every REJECTED company that has no live applications.
 * The admin UI hides REJECTED rows past the pagination cutoff, so
 * this is the cleanup hatch for clearing them all at once.
 *
 * Companies with applications attached to their jobs are skipped (we
 * never silently destroy candidate application history). The admin
 * sees a count of deleted vs skipped in the success notice.
 */
export async function bulkDeleteRejectedCompanies() {
  const session = await requireAdmin();

  const candidates = await db.company.findMany({
    where: { verificationStatus: "REJECTED" },
    select: { id: true, name: true, slug: true },
  });

  // Build a parallel query to find which of those still have
  // applications. Doing this in one go is cheaper than per-company.
  const withApps = candidates.length === 0
    ? []
    : await db.application.groupBy({
        by: ["jobId"],
        where: { job: { companyId: { in: candidates.map((c) => c.id) } } },
        _count: { _all: true },
      });
  const blockedJobIds = new Set(withApps.map((w) => w.jobId));
  const blockedCompanyIds = new Set<string>();
  if (blockedJobIds.size > 0) {
    const blockedJobs = await db.jobPosting.findMany({
      where: { id: { in: [...blockedJobIds] } },
      select: { companyId: true },
    });
    for (const j of blockedJobs) blockedCompanyIds.add(j.companyId);
  }

  const toDelete = candidates.filter((c) => !blockedCompanyIds.has(c.id));
  let deleted = 0;
  for (const c of toDelete) {
    try {
      await db.company.delete({ where: { id: c.id } });
      deleted += 1;
    } catch {
      // Cascade-failure on a single row shouldn't abort the whole
      // bulk run. Skip and continue.
    }
  }

  await audit({
    actorId: session.user.id,
    action: "company.bulk_deleted",
    entity: "Company",
    entityId: "bulk",
    meta: {
      attempted: candidates.length,
      deleted,
      skippedDueToApplications: candidates.length - toDelete.length,
    },
  });

  revalidatePath("/admin/employers");
  revalidatePath("/companies");
  revalidatePath("/company", "layout");

  const skipped = candidates.length - deleted;
  redirect(
    "/admin/employers?notice=" +
      encodeURIComponent(
        skipped === 0
          ? `Deleted ${deleted} rejected compan${deleted === 1 ? "y" : "ies"}.`
          : `Deleted ${deleted}, skipped ${skipped} (had application history attached). Move applications elsewhere first to delete those.`,
      ),
  );
}

// ─── DIYguru roster import ───────────────────────────────────

export async function importDIYguruRoster(formData: FormData) {
  // Admins always; approved placement officers also. We narrow what
  // a non-admin can do (no auto-verify badge flip) further down.
  const { session, isAdmin } = await requireAdminOrTpo();
  const file = formData.get("file") as File | null;
  const notes = String(formData.get("notes") ?? "");
  // `returnTo` lets the form post from either /admin/diyguru or
  // /tpo/cohorts/* and land back on the page that invoked it. Falls
  // back to the legacy admin route if missing.
  const returnToRaw = String(formData.get("returnTo") ?? "/admin/diyguru");
  const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "/admin/diyguru";
  if (!file) redirect(`${returnTo}?error=No+file`);

  if ((file as File).size > 10 * 1024 * 1024) {
    redirect(`${returnTo}?error=` + encodeURIComponent("CSV too large (max 10MB)"));
  }

  const text = await (file as File).text();
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  // Cap at 10k rows per import to bound memory + transaction time
  const rows = result.data.slice(0, 10_000);

  const seen = new Set<string>();
  const normalized = rows
    .map((row) => {
      const email = (row.email ?? "").trim().toLowerCase();
      if (!email || seen.has(email)) return null;
      seen.add(email);
      return {
        email,
        fullName: row.full_name ?? row.name ?? "",
        studentId: row.student_id ?? row.id ?? null,
        phone: row.phone ?? null,
        courseName: row.course_name ?? row.course ?? null,
        courseSlug: row.course_slug ?? null,
        completionDate: row.completion_date ? new Date(row.completion_date) : null,
        grade: row.grade ?? null,
        labTags: row.lab_tags ? row.lab_tags.split("|").map((s) => s.trim()).filter(Boolean) : [],
        capstoneTitle: row.capstone_title ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // 1. Create batch + bulk roster insert in one transaction
  const batch = await db.$transaction(async (tx) => {
    const b = await tx.dIYguruImportBatch.create({
      data: {
        uploadedById: session.user.id,
        rowCount: normalized.length,
        notes: notes || null,
      },
    });
    if (normalized.length > 0) {
      await tx.dIYguruRoster.createMany({
        data: normalized.map((r) => ({ ...r, importBatchId: b.id })),
        skipDuplicates: true,
      });
    }
    return b;
  });

  // 2. Match against existing candidate profiles in one query
  const matchedUsers = await db.user.findMany({
    where: { email: { in: normalized.map((r) => r.email) } },
    select: { id: true, email: true, candidateProfile: { select: { id: true } } },
  });
  const userByEmail = new Map(matchedUsers.map((u) => [u.email, u]));

  const claims = normalized
    .map((r) => {
      const u = userByEmail.get(r.email);
      return u?.candidateProfile
        ? { email: r.email, userId: u.id, profileId: u.candidateProfile.id, row: r }
        : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (claims.length > 0) {
    await db.$transaction([
      ...claims.map((c) =>
        db.candidateProfile.update({
          where: { id: c.profileId },
          data: {
            // The DIYguru-verified badge is a brand trust signal —
            // granting it requires ADMIN. A college TPO running the
            // same import for their cohort still populates the roster
            // table (so candidates show up in the TPO funnel) but
            // does NOT flip the badge.
            ...(isAdmin
              ? { isDIYguruVerified: true, diyguruVerifiedAt: new Date() }
              : {}),
            diyguruStudentId: c.row.studentId,
            ...(c.row.labTags.length > 0 ? { labExposureTags: c.row.labTags } : {}),
          },
        }),
      ),
      db.dIYguruRoster.updateMany({
        where: { importBatchId: batch.id, email: { in: claims.map((c) => c.email) } },
        data: { claimedAt: new Date() },
      }),
      db.dIYguruImportBatch.update({
        where: { id: batch.id },
        data: { matchedCount: claims.length },
      }),
    ]);
  }

  await audit({
    actorId: session.user.id,
    action: "diyguru.import",
    entity: "DIYguruImportBatch",
    entityId: batch.id,
    meta: { rowCount: normalized.length, matchedCount: claims.length, byAdmin: isAdmin },
  });

  revalidatePath(returnTo);
  redirect(`${returnTo}?imported=${normalized.length}&matched=${claims.length}`);
}

export async function manuallyVerifyCandidate(formData: FormData) {
  await requireAdmin();
  const candidateId = z.string().parse(formData.get("candidateId"));
  const verified = formData.get("verified") === "true";
  await db.candidateProfile.update({
    where: { id: candidateId },
    data: {
      isDIYguruVerified: verified,
      diyguruVerifiedAt: verified ? new Date() : null,
    },
  });
  revalidatePath("/admin/diyguru");
}

// ─── Skill taxonomy ──────────────────────────────────────────

export async function createSkill(formData: FormData) {
  await requireAdmin();
  const name = z.string().min(1).max(80).parse(formData.get("name"));
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const evDomainId = String(formData.get("evDomainId") ?? "") || null;
  await db.skill.upsert({
    where: { slug },
    create: { slug, name, evDomainId, category: "Manual" },
    update: { name, evDomainId },
  });
  revalidatePath("/admin/skills");
}

export async function deleteSkill(formData: FormData) {
  await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  await db.skill.delete({ where: { id } });
  revalidatePath("/admin/skills");
}

/**
 * Inline-edit a single skill row. Allows renaming + re-categorising
 * an existing canonical skill. We preserve the slug — renaming would
 * require a slug change too, which would invalidate any URL or cached
 * reference. Admins who really need to rename should add a new skill
 * and delete the old one (deletion cascades cleanly via Prisma).
 */
export async function updateSkill(formData: FormData) {
  await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  const name = z.string().min(1).max(80).parse(formData.get("name"));
  const evDomainId = String(formData.get("evDomainId") ?? "") || null;
  await db.skill.update({
    where: { id },
    data: { name, evDomainId },
  });
  revalidatePath("/admin/skills");
}

// ─── Job moderation ──────────────────────────────────────────

export async function setJobStatus(formData: FormData) {
  await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  const status = z.string().parse(formData.get("status"));
  await db.jobPosting.update({
    where: { id },
    data: { status: status as "DRAFT" | "OPEN" | "PAUSED" | "CLOSED" | "PENDING_REVIEW" },
  });
  revalidatePath("/admin/jobs");
}

// ─── Email diagnostics ───────────────────────────────────────
//
// Triggered from /admin/settings?tab=email. Tries to send a test email
// to the supplied address using whichever provider is configured. We
// surface the raw provider error message back as a query-string flash
// so the admin can see (e.g.) "SignatureDoesNotMatch" or "domain not
// verified" without SSH-ing to the box.
export async function sendTestEmail(formData: FormData) {
  await requireAdmin();
  const to = z.string().email().parse(formData.get("to"));

  const { sendMail, activeMailProvider } = await import("@/lib/mail");
  const provider = activeMailProvider();

  if (provider === "none") {
    redirect(
      `/admin/settings?tab=email&testEmail=err&testMsg=${encodeURIComponent(
        "No email provider is configured. Set AWS_SES_REGION + AWS_SES_ACCESS_KEY_ID + AWS_SES_SECRET_ACCESS_KEY (or RESEND_API_KEY) in .env on the host and restart the web container.",
      )}`,
    );
  }

  try {
    await sendMail({
      to,
      subject: "eMobility Careers — test email",
      html: `<p>This is a test email from your <strong>eMobility Careers</strong> admin settings.</p>
<p>Provider: <code>${provider}</code></p>
<p>If you see this in your inbox, transactional emails (sign-up verification, magic links, password resets, etc.) are delivering correctly.</p>`,
      text: `This is a test email from eMobility Careers admin settings.\nProvider: ${provider}.\nIf you see this in your inbox, transactional email is delivering.`,
    });
    redirect(
      `/admin/settings?tab=email&testEmail=ok&testMsg=${encodeURIComponent(
        `Sent via ${provider} to ${to}. Check the inbox (and spam) within a minute.`,
      )}`,
    );
  } catch (err) {
    // Re-throw redirect / not-found errors Next.js uses for control
    // flow. Using the canonical helper instead of an ad-hoc
    // `err.message === "NEXT_REDIRECT"` check — the helper handles
    // both NEXT_REDIRECT and NEXT_NOT_FOUND and survives any future
    // Next.js error-format change.
    if (isRouterControlError(err)) throw err;
    const message =
      err instanceof Error
        ? `${err.name}: ${err.message}`.slice(0, 600)
        : "Unknown error — check server logs (pm2 logs emce-web).";
    redirect(
      `/admin/settings?tab=email&testEmail=err&testMsg=${encodeURIComponent(message)}`,
    );
  }
}
