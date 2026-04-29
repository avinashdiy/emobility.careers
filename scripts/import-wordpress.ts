#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * One-shot importer that reads users, companies, and job posts from the
 * legacy emobility.careers WordPress install (MySQL) and upserts them into
 * the new Postgres schema.
 *
 *   USAGE
 *     pnpm tsx scripts/import-wordpress.ts --phase=users         # users only
 *     pnpm tsx scripts/import-wordpress.ts --phase=companies     # companies only
 *     pnpm tsx scripts/import-wordpress.ts --phase=jobs          # jobs only
 *     pnpm tsx scripts/import-wordpress.ts --phase=all           # all three, in order
 *     pnpm tsx scripts/import-wordpress.ts --phase=all --dry-run # no writes
 *     pnpm tsx scripts/import-wordpress.ts --phase=all --limit=50 # safety cap per phase
 *
 *   ENV
 *     WP_DB_HOST           MySQL host (e.g. 127.0.0.1)
 *     WP_DB_PORT           MySQL port (default 3306)
 *     WP_DB_USER           MySQL user (read-only is fine)
 *     WP_DB_PASSWORD       MySQL password
 *     WP_DB_NAME           Database name (e.g. emobility_wp)
 *     WP_TABLE_PREFIX      Table prefix (default "wp_")
 *     # Plus the standard DATABASE_URL for our Postgres target.
 *
 * Idempotency:
 *   - Each phase upserts by `wpLegacyId` (User.wpLegacyId / Company.wpLegacyId
 *     / JobPosting.wpLegacyId). Re-running the script is safe: rows that
 *     already match get UPDATE; new rows get CREATE.
 *
 * What we DO NOT migrate (out of scope):
 *   - Passwords (WP uses phpass; we use Argon2). Imported users have
 *     `passwordHash = null` and must claim their account via magic link
 *     (use the /admin/import "Send claim emails" button after import).
 *   - Applications / job applications history (low value, often noisy data).
 *     If you need it, extend phase 4 here.
 *   - Resume PDFs (need a separate S3 sync — see notes at the bottom).
 *
 * What we DO migrate:
 *   - Users: id, email, name, role guess, registration date.
 *   - CandidateProfiles: derived from user_meta + the emob-engine plugin's
 *     custom rows. Best-effort; gaps are filled with sensible defaults so
 *     the user can finish their profile after claiming.
 *   - Companies: name, slug, owner (linked via wp user id), logo URL,
 *     description, website, hq.
 *   - Jobs: title, description, locations, employment type, status,
 *     publishedAt, posted-by user, company.
 *
 * The mapping below ASSUMES standard WP + the emob-engine-v3 plugin
 * conventions referenced in the Prisma schema header. If your plugin uses
 * different meta keys or post types, change the constants in MAPPING and
 * the SELECT statements accordingly — the function bodies are intentionally
 * small and table-driven for that reason.
 */

import "dotenv/config";
import mysql from "mysql2/promise";
import { PrismaClient, type Prisma } from "@prisma/client";
import { withUniqueSlug } from "../lib/slug";
import { slugify } from "../lib/utils";

// ─── CLI parsing ───────────────────────────────────────────────────────────

interface Args {
  phase: "users" | "companies" | "jobs" | "all";
  dryRun: boolean;
  limit: number | undefined;
  verbose: boolean;
}
function parseArgs(): Args {
  const out: Args = { phase: "all", dryRun: false, limit: undefined, verbose: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--verbose" || arg === "-v") out.verbose = true;
    else if (arg.startsWith("--phase=")) out.phase = arg.slice(8) as Args["phase"];
    else if (arg.startsWith("--limit=")) out.limit = Number(arg.slice(8));
  }
  if (!["users", "companies", "jobs", "all"].includes(out.phase)) {
    throw new Error(`Invalid --phase. Use users | companies | jobs | all.`);
  }
  return out;
}

// ─── WP table mapping ──────────────────────────────────────────────────────
//
// Tweak these if your plugin diverges from the defaults documented in the
// Prisma schema header. Every reference to a wp_table or meta_key in the
// SQL below routes through here.

const WP_PREFIX = process.env.WP_TABLE_PREFIX ?? "wp_";
const T = {
  users: `${WP_PREFIX}users`,
  usermeta: `${WP_PREFIX}usermeta`,
  posts: `${WP_PREFIX}posts`,
  postmeta: `${WP_PREFIX}postmeta`,
};

// Custom-post-type slugs for companies + jobs in the emob-engine plugin.
// If your plugin uses different CPTs, change here.
const CPT = {
  company: "company",
  job: "job_listing", // also try "emob_job" if the standard one is empty
};

// User-meta keys we read for the candidate profile. Anything not in the
// list is ignored. Keys with the `emob_` prefix come from emob-engine; the
// generic ones (first_name, last_name) come from WP core.
const USER_META_KEYS = [
  "first_name",
  "last_name",
  "description",
  "wp_capabilities", // role detection
  "emob_phone",
  "emob_location",
  "emob_headline",
  "emob_resume_url",
  "emob_linkedin_url",
  "emob_github_url",
  "emob_portfolio_url",
  "emob_total_experience_months",
  "emob_is_diyguru_verified",
  "emob_diyguru_student_id",
];

// Post-meta keys for jobs.
const JOB_META_KEYS = [
  "_company_id",          // wp post id of the linked company
  "_company_name",
  "_application_url",
  "_application_email",
  "_job_location",
  "_job_locations",       // some plugins store an array
  "_employment_type",     // FULL_TIME | PART_TIME | INTERNSHIP | CONTRACT
  "_work_mode",           // ONSITE | REMOTE | HYBRID
  "_seniority_level",     // ENTRY | JUNIOR | MID | SENIOR | LEAD
  "_experience_min",
  "_experience_max",
  "_salary_min",
  "_salary_max",
  "_salary_currency",
  "_published_at",
  "_closes_at",
];

// Post-meta keys for companies.
const COMPANY_META_KEYS = [
  "_logo_url",
  "_banner_url",
  "_website",
  "_hq_location",
  "_team_size",
  "_company_type",
  "_founded_year",
  "_owner_user_id",
];

// ─── Helpers ───────────────────────────────────────────────────────────────

const log = (...args: unknown[]) => console.log("[wp-import]", ...args);
const verbose = (args: Args, ...rest: unknown[]) => {
  if (args.verbose) console.log("[wp-import:trace]", ...rest);
};

/** Convert a wp_capabilities serialized blob to our Role enum. */
function detectRole(capsSerialized: string | null): "ADMIN" | "EMPLOYER" | "CANDIDATE" {
  const lc = (capsSerialized ?? "").toLowerCase();
  if (lc.includes("administrator")) return "ADMIN";
  if (lc.includes("employer") || lc.includes("recruiter") || lc.includes("company")) return "EMPLOYER";
  return "CANDIDATE";
}

/** Roll up wp_usermeta rows into a plain object keyed by meta_key. */
async function getUserMeta(
  wp: mysql.Connection,
  userIds: number[],
): Promise<Map<number, Record<string, string>>> {
  const out = new Map<number, Record<string, string>>();
  if (userIds.length === 0) return out;
  const placeholders = userIds.map(() => "?").join(",");
  const [rows] = await wp.execute<any[]>(
    `SELECT user_id, meta_key, meta_value FROM ${T.usermeta}
       WHERE user_id IN (${placeholders}) AND meta_key IN (${USER_META_KEYS.map(() => "?").join(",")})`,
    [...userIds, ...USER_META_KEYS],
  );
  for (const r of rows) {
    const m = out.get(r.user_id) ?? {};
    m[r.meta_key] = String(r.meta_value ?? "");
    out.set(r.user_id, m);
  }
  return out;
}

/** Roll up wp_postmeta rows into a plain object keyed by meta_key. */
async function getPostMeta(
  wp: mysql.Connection,
  postIds: number[],
  keys: string[],
): Promise<Map<number, Record<string, string>>> {
  const out = new Map<number, Record<string, string>>();
  if (postIds.length === 0) return out;
  const idPlaceholders = postIds.map(() => "?").join(",");
  const keyPlaceholders = keys.map(() => "?").join(",");
  const [rows] = await wp.execute<any[]>(
    `SELECT post_id, meta_key, meta_value FROM ${T.postmeta}
       WHERE post_id IN (${idPlaceholders}) AND meta_key IN (${keyPlaceholders})`,
    [...postIds, ...keys],
  );
  for (const r of rows) {
    const m = out.get(r.post_id) ?? {};
    m[r.meta_key] = String(r.meta_value ?? "");
    out.set(r.post_id, m);
  }
  return out;
}

// ─── Phase 1: users + candidate profiles ──────────────────────────────────

async function importUsers(wp: mysql.Connection, db: PrismaClient, args: Args) {
  log("Phase: users");
  const limit = args.limit ?? 100_000;
  const [rows] = await wp.execute<any[]>(
    `SELECT ID, user_login, user_email, display_name, user_registered
       FROM ${T.users}
       WHERE user_email IS NOT NULL AND user_email != ''
       ORDER BY ID ASC LIMIT ?`,
    [limit],
  );
  log(`  found ${rows.length} WP users`);
  const meta = await getUserMeta(wp, rows.map((r) => r.ID));

  let created = 0, updated = 0, skipped = 0;

  for (const u of rows) {
    const m = meta.get(u.ID) ?? {};
    const role = detectRole(m["wp_capabilities"] ?? null);
    const firstName = m.first_name?.trim() || (u.display_name?.split(" ")[0] ?? u.user_login ?? "User");
    const lastName = m.last_name?.trim() || u.display_name?.split(" ").slice(1).join(" ") || null;
    const baseSlug = slugify([firstName, lastName].filter(Boolean).join("-")) || `u-${u.ID}`;

    verbose(args, `  user #${u.ID}: ${u.user_email} role=${role}`);

    if (args.dryRun) {
      const existing = await db.user.findUnique({ where: { wpLegacyId: u.ID }, select: { id: true } });
      existing ? updated++ : created++;
      continue;
    }

    try {
      const result = await db.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { wpLegacyId: u.ID },
          select: { id: true, candidateProfile: { select: { id: true } } },
        });
        const email = String(u.user_email).toLowerCase();
        const createdAt = u.user_registered ? new Date(u.user_registered) : undefined;
        const user = existing
          ? await tx.user.update({
              where: { id: existing.id },
              data: { email, name: u.display_name || null, role, createdAt },
            })
          : await tx.user.create({
              data: { email, name: u.display_name || null, role, createdAt, wpLegacyId: u.ID },
            });

        // CandidateProfile: only create if missing — preserve any post-import
        // edits the user may have made.
        if (!existing?.candidateProfile) {
          await withUniqueSlug(baseSlug, (slug) =>
            tx.candidateProfile.create({
              data: {
                userId: user.id,
                slug,
                firstName,
                lastName,
                headline: m.emob_headline || null,
                summary: m.description || null,
                phone: m.emob_phone || null,
                email: String(u.user_email).toLowerCase(),
                location: m.emob_location || null,
                resumeUrl: m.emob_resume_url || null,
                linkedinUrl: m.emob_linkedin_url || null,
                githubUrl: m.emob_github_url || null,
                portfolioUrl: m.emob_portfolio_url || null,
                totalExperienceMonths: Number(m.emob_total_experience_months ?? 0) || 0,
                isDIYguruVerified: m.emob_is_diyguru_verified === "1" || m.emob_is_diyguru_verified === "yes",
                diyguruStudentId: m.emob_diyguru_student_id || null,
              },
            }),
          );
        }
        return existing ? "updated" : "created";
      });
      result === "created" ? created++ : updated++;
    } catch (err) {
      skipped++;
      console.error(`  ✗ user ${u.user_email}:`, (err as Error).message);
    }
  }
  log(`  users: ${created} created · ${updated} updated · ${skipped} skipped${args.dryRun ? " (dry-run)" : ""}`);
}

// ─── Phase 2: companies ───────────────────────────────────────────────────

async function importCompanies(wp: mysql.Connection, db: PrismaClient, args: Args) {
  log("Phase: companies");
  const limit = args.limit ?? 100_000;
  const [rows] = await wp.execute<any[]>(
    `SELECT ID, post_title, post_content, post_excerpt, post_status, post_date, post_author
       FROM ${T.posts}
       WHERE post_type = ? AND post_status IN ('publish', 'draft', 'pending')
       ORDER BY ID ASC LIMIT ?`,
    [CPT.company, limit],
  );
  log(`  found ${rows.length} WP companies (post_type=${CPT.company})`);
  const meta = await getPostMeta(wp, rows.map((r) => r.ID), COMPANY_META_KEYS);

  let created = 0, updated = 0, skipped = 0;

  for (const c of rows) {
    const m = meta.get(c.ID) ?? {};
    if (!c.post_title) { skipped++; continue; }

    // Owner: prefer the explicit meta link, fall back to the WP author.
    const ownerWpId = Number(m._owner_user_id || c.post_author);
    let ownerUserId: string | null = null;
    if (ownerWpId) {
      const owner = await db.user.findUnique({ where: { wpLegacyId: ownerWpId }, select: { id: true } });
      ownerUserId = owner?.id ?? null;
    }
    if (!ownerUserId) {
      console.warn(`  ⚠ company ${c.post_title} (#${c.ID}): owner not found — run users phase first or set _owner_user_id`);
      skipped++;
      continue;
    }

    if (args.dryRun) {
      const existing = await db.company.findUnique({ where: { wpLegacyId: c.ID }, select: { id: true } });
      existing ? updated++ : created++;
      continue;
    }

    try {
      const existing = await db.company.findUnique({ where: { wpLegacyId: c.ID }, select: { id: true } });
      const data = {
        name: c.post_title as string,
        ownerUserId,
        logoUrl: m._logo_url || null,
        bannerUrl: m._banner_url || null,
        website: m._website || null,
        description: c.post_excerpt || null,
        about: c.post_content || null,
        hqLocation: m._hq_location || null,
        teamSize: m._team_size || null,
        foundedYear: m._founded_year ? Number(m._founded_year) : null,
        verificationStatus: "VERIFIED" as const, // legacy companies are trusted
        createdAt: c.post_date ? new Date(c.post_date) : undefined,
      };
      if (existing) {
        await db.company.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await withUniqueSlug(c.post_title, (slug) =>
          db.company.create({ data: { ...data, slug, wpLegacyId: c.ID } }),
        );
        created++;
      }
    } catch (err) {
      skipped++;
      console.error(`  ✗ company ${c.post_title}:`, (err as Error).message);
    }
  }
  log(`  companies: ${created} created · ${updated} updated · ${skipped} skipped${args.dryRun ? " (dry-run)" : ""}`);
}

// ─── Phase 3: jobs ────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, "OPEN" | "DRAFT" | "PAUSED" | "CLOSED"> = {
  publish: "OPEN",
  draft: "DRAFT",
  pending: "DRAFT",
  expired: "CLOSED",
  closed: "CLOSED",
  paused: "PAUSED",
};

async function importJobs(wp: mysql.Connection, db: PrismaClient, args: Args) {
  log("Phase: jobs");
  const limit = args.limit ?? 100_000;
  const [rows] = await wp.execute<any[]>(
    `SELECT ID, post_title, post_content, post_status, post_date, post_modified, post_author
       FROM ${T.posts}
       WHERE post_type = ? AND post_status NOT IN ('trash', 'auto-draft')
       ORDER BY ID ASC LIMIT ?`,
    [CPT.job, limit],
  );
  log(`  found ${rows.length} WP jobs (post_type=${CPT.job})`);
  const meta = await getPostMeta(wp, rows.map((r) => r.ID), JOB_META_KEYS);

  let created = 0, updated = 0, skipped = 0;

  for (const j of rows) {
    const m = meta.get(j.ID) ?? {};
    if (!j.post_title || !j.post_content) { skipped++; continue; }

    const wpCompanyId = m._company_id ? Number(m._company_id) : null;
    const company = wpCompanyId
      ? await db.company.findUnique({ where: { wpLegacyId: wpCompanyId }, select: { id: true } })
      : m._company_name
      ? await db.company.findFirst({ where: { name: m._company_name }, select: { id: true } })
      : null;

    if (!company) {
      console.warn(`  ⚠ job ${j.post_title} (#${j.ID}): company not found — run companies phase first or set _company_id`);
      skipped++;
      continue;
    }

    const wpAuthor = Number(j.post_author);
    const author = wpAuthor
      ? await db.user.findUnique({ where: { wpLegacyId: wpAuthor }, select: { id: true } })
      : null;
    if (!author) { skipped++; continue; }

    const locations = m._job_locations
      ? String(m._job_locations).split(",").map((s) => s.trim()).filter(Boolean)
      : m._job_location
      ? [String(m._job_location).trim()]
      : [];

    if (args.dryRun) {
      const existing = await db.jobPosting.findUnique({ where: { wpLegacyId: j.ID }, select: { id: true } });
      existing ? updated++ : created++;
      continue;
    }

    try {
      const data = {
        title: j.post_title as string,
        description: j.post_content as string,
        companyId: company.id,
        postedById: author.id,
        locations,
        employmentType: (m._employment_type as Prisma.JobPostingCreateInput["employmentType"]) || "FULL_TIME",
        workMode: (m._work_mode as Prisma.JobPostingCreateInput["workMode"]) || "ONSITE",
        seniorityLevel: (m._seniority_level as Prisma.JobPostingCreateInput["seniorityLevel"]) || "MID",
        experienceMin: m._experience_min ? Number(m._experience_min) : null,
        experienceMax: m._experience_max ? Number(m._experience_max) : null,
        salaryMin: m._salary_min ? Number(m._salary_min) : null,
        salaryMax: m._salary_max ? Number(m._salary_max) : null,
        salaryCurrency: m._salary_currency || "INR",
        applicationEmail: m._application_email || null,
        applicationUrl: m._application_url || null,
        status: STATUS_MAP[j.post_status] ?? "DRAFT",
        publishedAt: j.post_status === "publish" ? new Date(j.post_date) : null,
        closesAt: m._closes_at ? new Date(m._closes_at) : null,
      };
      const existing = await db.jobPosting.findUnique({ where: { wpLegacyId: j.ID }, select: { id: true } });
      if (existing) {
        await db.jobPosting.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await withUniqueSlug(j.post_title, (slug) =>
          db.jobPosting.create({ data: { ...data, slug, wpLegacyId: j.ID } }),
        );
        created++;
      }
    } catch (err) {
      skipped++;
      console.error(`  ✗ job ${j.post_title}:`, (err as Error).message);
    }
  }
  log(`  jobs: ${created} created · ${updated} updated · ${skipped} skipped${args.dryRun ? " (dry-run)" : ""}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  log(`Starting WP import — phase=${args.phase}${args.dryRun ? " (DRY-RUN)" : ""}${args.limit ? ` limit=${args.limit}` : ""}`);

  const required = ["WP_DB_HOST", "WP_DB_USER", "WP_DB_PASSWORD", "WP_DB_NAME"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(", ")}`);

  const wp = await mysql.createConnection({
    host: process.env.WP_DB_HOST,
    port: Number(process.env.WP_DB_PORT ?? 3306),
    user: process.env.WP_DB_USER,
    password: process.env.WP_DB_PASSWORD,
    database: process.env.WP_DB_NAME,
  });
  const db = new PrismaClient();

  try {
    if (args.phase === "users" || args.phase === "all") await importUsers(wp, db, args);
    if (args.phase === "companies" || args.phase === "all") await importCompanies(wp, db, args);
    if (args.phase === "jobs" || args.phase === "all") await importJobs(wp, db, args);
    log("Done.");
  } finally {
    await wp.end();
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("[wp-import] fatal:", err);
  process.exit(1);
});

/* ────────────────────────────────────────────────────────────────────────
   Resume / asset migration (out of script — do this separately):

   The script copies resume URLs as-is into CandidateProfile.resumeUrl. If
   your WP install hosts those PDFs at https://emobility.careers/wp-content/
   uploads/... they'll stay accessible until the WP site is decommissioned.
   To move them into MinIO so they survive WP teardown:

     1. mc alias set b2-or-minio <endpoint> <key> <secret>
     2. wget -r -np -nH --cut-dirs=2 -A '*.pdf' \
          https://emobility.careers/wp-content/uploads/resumes/
     3. mc mirror ./resumes/ minio/emce-resumes/legacy/
     4. UPDATE "CandidateProfile" SET "resumeUrl" =
          REPLACE("resumeUrl",
            'https://emobility.careers/wp-content/uploads/resumes/',
            'https://static.emobility.careers/legacy/');

   Same pattern for company logos (S3_BUCKET_LOGOS) and avatars.
   ──────────────────────────────────────────────────────────────────────── */
