"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { withUniqueSlug } from "@/lib/slug";
import { audit } from "@/lib/audit";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { buildTsQuery } from "@/lib/search-fts";
import type { InstitutionType } from "@prisma/client";
import { optionalUrl } from "@/lib/forms/zod-url";
import {
  resolveProtectedCompany,
  resolveProtectedInstitution,
} from "@/lib/protected-brands";

/**
 * Lookup + create endpoints for the two "entity references" candidates can
 * attach to their profile: Companies (for Experience entries) and
 * Institutions (for Education entries). Same UX as LinkedIn's "search or
 * create" autocomplete in profile editing.
 *
 * Flow (PENDING-review variant, as of 2026-06):
 *   1. The autocomplete client calls `searchX(q)` and renders matches.
 *      VERIFIED rows appear first; PENDING rows appear below with a
 *      "pending review" pill so candidates can pick already-submitted
 *      entries instead of creating duplicates.
 *   2. If the user picks a match → server returns the existing id.
 *   3. If no match and the user submits a fresh name → "Submit for
 *      review" CTA calls `createX({ name, ... })` which makes a PENDING
 *      row. The row's id flows back to the profile editor like any
 *      other match — but admin must approve before the row becomes
 *      VERIFIED (and the public `/company/<slug>` or `/institutions/<slug>`
 *      page becomes linkable).
 *   4. Profile-editor submits the chosen id with the entry. Plain-text
 *      ("don't link") is also valid — the FK just stays null.
 *
 * Display rule: a PENDING-status row still shows on the candidate's
 * profile by name, but the name is NOT a hyperlink until an admin
 * promotes it to VERIFIED via the moderation queue.
 */

// ─── Companies (public lookup for candidates) ──────────────

export interface CompanyMatch {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  hqLocation: string | null;
  // Surfaced so the picker UI can render a "pending review" pill on
  // UNVERIFIED / PENDING rows and a "verified" tick on VERIFIED rows.
  // The picker treats PENDING as selectable so candidates don't
  // create duplicate submissions for the same company.
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
}

export async function searchCompanies(q: string): Promise<CompanyMatch[]> {
  if (!q || q.trim().length < 2) return [];
  // Migrated to Postgres FTS on Company.searchTsv (2026-05). The
  // 'simple' tokenizer + unaccent give us proper-noun-friendly
  // matching without English stemming false-positives. We still
  // OR with a slug exact-match because pickers sometimes get
  // pasted an exact slug from a URL — no FTS magic needed there.
  //
  // REJECTED rows are excluded (admin-banned dups / spam). PENDING +
  // UNVERIFIED rows ARE included so a candidate typing "ACME EV"
  // finds the row another candidate submitted yesterday — preventing
  // duplicate submissions piling up in the admin queue.
  const tsq = buildTsQuery(q);
  if (!tsq) return [];
  const slugCandidate = q.toLowerCase().replace(/\s+/g, "-");
  // Wrap FTS in try/catch so a missing `searchTsv` column (setup-fts.sql
  // not yet run on this DB) falls through to the ILIKE branch below
  // instead of throwing an uncaught error to the user. Previously only
  // EMPTY results triggered the fallback — a thrown error from a
  // missing column crashed the company autocomplete entirely.
  let fts: CompanyMatch[] = [];
  try {
    fts = await db.$queryRaw<CompanyMatch[]>`
      SELECT id, slug, name, "logoUrl", "hqLocation", "verificationStatus"::text
      FROM "Company"
      WHERE ("searchTsv" @@ to_tsquery('simple', ${tsq})
          OR slug = ${slugCandidate})
        AND "verificationStatus" <> 'REJECTED'
      ORDER BY
        ts_rank("searchTsv", to_tsquery('simple', ${tsq}))
          + CASE WHEN "verificationStatus" = 'VERIFIED' THEN 0.1 ELSE 0 END
          DESC,
        name ASC
      LIMIT 10
    `;
  } catch (err) {
    console.warn(
      "[searchCompanies] FTS path failed, falling back to ILIKE. Run scripts/setup-fts.sql on the DB.",
      err instanceof Error ? err.message : String(err),
    );
  }
  if (fts.length > 0) return fts;
  // Fallback — when searchTsv is NULL on every row (typically because
  // scripts/setup-fts.sql wasn't run after `prisma db push` on a
  // fresh deploy), the FTS pass returns 0 results regardless of input.
  // Drop to a plain ILIKE prefix match so the autocomplete is still
  // usable until the FTS migration lands. The slow-path is fine for
  // the directory-sized tables we have today (Company ≪ 10k rows).
  // Index hint: not needed — Postgres uses the existing btree on
  // (lower(name)) if present, otherwise a sequential scan that's
  // sub-50ms at our scale.
  return db.$queryRaw<CompanyMatch[]>`
    SELECT id, slug, name, "logoUrl", "hqLocation", "verificationStatus"::text
    FROM "Company"
    WHERE ("name" ILIKE ${"%" + q.trim() + "%"} OR slug ILIKE ${"%" + slugCandidate + "%"})
      AND "verificationStatus" <> 'REJECTED'
    ORDER BY
      CASE WHEN lower("name") = lower(${q.trim()}) THEN 0 ELSE 1 END,
      CASE WHEN "verificationStatus" = 'VERIFIED' THEN 0 ELSE 1 END,
      name ASC
    LIMIT 10
  `;
}

const CreateCompanySchema = z.object({
  name: z.string().min(2).max(120),
  hqLocation: z.string().max(120).optional(),
  website: optionalUrl,
});

export async function createCompanyLite(input: {
  name: string;
  hqLocation?: string;
  website?: string;
}): Promise<{ ok: boolean; id?: string; slug?: string; message?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sign in first." };
  await rateLimitOrThrow(`company-create:${session.user.id}`, "invite").catch(() => undefined);

  const parsed = CreateCompanySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid company details." };

  // Protected-brand guard — DIYguru (and any future protected brands)
  // resolve to the canonical row instead of creating a new variant.
  // See lib/protected-brands.ts for the canonical-slug map.
  const protectedHit = await resolveProtectedCompany(parsed.data.name);
  if (protectedHit.protected) {
    return { ok: true, id: protectedHit.id, slug: protectedHit.slug, message: protectedHit.message };
  }

  // Dedupe by case-insensitive name match — surfaces existing rows the user
  // might have missed in the search list.
  const existing = await db.company.findFirst({
    where: { name: { equals: parsed.data.name.trim(), mode: "insensitive" } },
    select: { id: true, slug: true },
  });
  if (existing) return { ok: true, id: existing.id, slug: existing.slug };

  const created = await withUniqueSlug(parsed.data.name, (slug) =>
    db.company.create({
      data: {
        slug,
        name: parsed.data.name.trim(),
        ownerUserId: session.user.id, // placeholder — admin can re-assign during verification
        hqLocation: parsed.data.hqLocation || null,
        website: parsed.data.website || null,
        // PENDING (was UNVERIFIED) — change in 2026-06: user-submitted
        // companies must go through admin review before the public
        // /company/<slug> page is treated as real. PENDING rows still
        // surface in the candidate's profile by name (just not as a
        // link) and in search autocomplete with a "pending review"
        // pill so future candidates can pick them rather than
        // re-submit duplicates. Admin moderation queue:
        // /admin/employers?status=PENDING.
        verificationStatus: "PENDING",
      },
      select: { id: true, slug: true },
    }),
  );
  await audit({
    actorId: session.user.id,
    action: "company.user-submitted",
    entity: "Company",
    entityId: created.id,
    meta: { source: "candidate-experience-editor", status: "PENDING" },
  });
  // Bust the admin moderation queue so the new submission surfaces
  // immediately. We deliberately do NOT revalidate the public
  // /companies + /company/<slug> caches anymore — PENDING rows are
  // not supposed to be discoverable on the public surface until
  // admin promotes them to VERIFIED.
  revalidatePath("/admin/employers");
  return { ok: true, id: created.id, slug: created.slug };
}

// ─── Institutions (public lookup for candidates) ───────────

export interface InstitutionMatch {
  id: string;
  slug: string;
  name: string;
  type: InstitutionType;
  city: string | null;
  logoUrl: string | null;
  // Same rationale as CompanyMatch — picker UI uses this to render
  // a "pending review" pill on UNVERIFIED + PENDING rows so users
  // can still select them (avoiding duplicate submissions).
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
}

export async function searchInstitutions(q: string): Promise<InstitutionMatch[]> {
  if (!q || q.trim().length < 2) return [];
  // Same FTS migration as searchCompanies — see lib/search-fts.ts
  // for the rationale and lib/institution-search.ts for the
  // canonical implementation. This function is the version used by
  // the profile-editor entity-picker (it shapes the result
  // differently — `type` instead of `verificationStatus`).
  //
  // REJECTED rows are excluded. PENDING + UNVERIFIED rows are
  // included so candidates pick existing submissions instead of
  // duplicating them.
  const tsq = buildTsQuery(q);
  if (!tsq) return [];
  const slugCandidate = q.toLowerCase().replace(/\s+/g, "-");
  // Same defensive wrap as searchCompanies — missing column falls
  // through to ILIKE rather than crashing the institution picker.
  let fts: InstitutionMatch[] = [];
  try {
    fts = await db.$queryRaw<InstitutionMatch[]>`
      SELECT id, slug, name, type::text, city, "logoUrl", "verificationStatus"::text
      FROM "Institution"
      WHERE ("searchTsv" @@ to_tsquery('simple', ${tsq})
          OR slug = ${slugCandidate})
        AND "verificationStatus" <> 'REJECTED'
      ORDER BY
        ts_rank("searchTsv", to_tsquery('simple', ${tsq}))
          + CASE WHEN "verificationStatus" = 'VERIFIED' THEN 0.1 ELSE 0 END
          DESC,
        name ASC
      LIMIT 10
    `;
  } catch (err) {
    console.warn(
      "[searchInstitutions/entities] FTS path failed, falling back to ILIKE. Run scripts/setup-fts.sql on the DB.",
      err instanceof Error ? err.message : String(err),
    );
  }
  if (fts.length > 0) return fts;
  // ILIKE fallback — see searchCompanies for rationale. Kept in
  // lock-step so neither entity-picker degrades silently when FTS
  // isn't populated.
  return db.$queryRaw<InstitutionMatch[]>`
    SELECT id, slug, name, type::text, city, "logoUrl", "verificationStatus"::text
    FROM "Institution"
    WHERE ("name" ILIKE ${"%" + q.trim() + "%"} OR slug ILIKE ${"%" + slugCandidate + "%"})
      AND "verificationStatus" <> 'REJECTED'
    ORDER BY
      CASE WHEN lower("name") = lower(${q.trim()}) THEN 0 ELSE 1 END,
      CASE WHEN "verificationStatus" = 'VERIFIED' THEN 0 ELSE 1 END,
      name ASC
    LIMIT 10
  `;
}

const CreateInstitutionSchema = z.object({
  name: z.string().min(2).max(140),
  type: z.enum(["UNIVERSITY", "COLLEGE", "SCHOOL", "ITI", "POLYTECHNIC", "RESEARCH_INSTITUTE", "TRAINING_CENTER", "OTHER"]),
  city: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  website: optionalUrl,
});

export async function createInstitutionLite(input: {
  name: string;
  type: InstitutionType;
  city?: string;
  state?: string;
  website?: string;
}): Promise<{ ok: boolean; id?: string; slug?: string; message?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sign in first." };
  await rateLimitOrThrow(`institution-create:${session.user.id}`, "invite").catch(() => undefined);

  const parsed = CreateInstitutionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid institution details." };

  // Protected-brand guard — DIYguru eMobility Academy (and any
  // future protected brands) resolve to the canonical row.
  const protectedHit = await resolveProtectedInstitution(parsed.data.name);
  if (protectedHit.protected) {
    return { ok: true, id: protectedHit.id, slug: protectedHit.slug, message: protectedHit.message };
  }

  // Same dedupe trick as companies — case-insensitive name + same city tier.
  const existing = await db.institution.findFirst({
    where: {
      name: { equals: parsed.data.name.trim(), mode: "insensitive" },
      ...(parsed.data.city ? { city: { equals: parsed.data.city, mode: "insensitive" } } : {}),
    },
    select: { id: true, slug: true },
  });
  if (existing) return { ok: true, id: existing.id, slug: existing.slug };

  const created = await withUniqueSlug(parsed.data.name, (slug) =>
    db.institution.create({
      data: {
        slug,
        name: parsed.data.name.trim(),
        type: parsed.data.type,
        city: parsed.data.city || null,
        state: parsed.data.state || null,
        country: "IN",
        website: parsed.data.website || null,
        createdById: session.user.id,
        // PENDING (was UNVERIFIED) — same change as createCompanyLite
        // above. User-submitted institutions need admin review before
        // the /institutions/<slug> page is treated as discoverable.
        verificationStatus: "PENDING",
      },
      select: { id: true, slug: true },
    }),
  );
  await audit({
    actorId: session.user.id,
    action: "institution.user-submitted",
    entity: "Institution",
    entityId: created.id,
    meta: { source: "candidate-education-editor", type: parsed.data.type, status: "PENDING" },
  });
  // Bust the admin moderation queue. We do NOT revalidate the public
  // /institutions + /institutions/<slug> caches anymore — PENDING
  // institutions are not discoverable on the public surface until
  // admin promotes them.
  revalidatePath("/admin/institutions");
  return { ok: true, id: created.id, slug: created.slug };
}
