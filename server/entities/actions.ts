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

/**
 * Lookup + create endpoints for the two "entity references" candidates can
 * attach to their profile: Companies (for Experience entries) and
 * Institutions (for Education entries). Same UX as LinkedIn's "search or
 * create" autocomplete in profile editing.
 *
 * Both follow the same flow:
 *   1. The autocomplete client calls `searchX(q)` and renders matches.
 *   2. If the user picks a match → server returns the existing id.
 *   3. If no match and the user types a fresh name → "Create new" CTA
 *      calls `createX({ name, ... })` which makes an UNVERIFIED row.
 *   4. Profile-editor submits the chosen id with the entry. Plain-text
 *      ("don't link") is also valid — the FK just stays null.
 */

// ─── Companies (public lookup for candidates) ──────────────

export interface CompanyMatch {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  hqLocation: string | null;
}

export async function searchCompanies(q: string): Promise<CompanyMatch[]> {
  if (!q || q.trim().length < 2) return [];
  // Migrated to Postgres FTS on Company.searchTsv (2026-05). The
  // 'simple' tokenizer + unaccent give us proper-noun-friendly
  // matching without English stemming false-positives. We still
  // OR with a slug exact-match because pickers sometimes get
  // pasted an exact slug from a URL — no FTS magic needed there.
  const tsq = buildTsQuery(q);
  if (!tsq) return [];
  const slugCandidate = q.toLowerCase().replace(/\s+/g, "-");
  const fts = await db.$queryRaw<CompanyMatch[]>`
    SELECT id, slug, name, "logoUrl", "hqLocation"
    FROM "Company"
    WHERE "searchTsv" @@ to_tsquery('simple', ${tsq})
       OR slug = ${slugCandidate}
    ORDER BY
      ts_rank("searchTsv", to_tsquery('simple', ${tsq}))
        + CASE WHEN "verificationStatus" = 'VERIFIED' THEN 0.1 ELSE 0 END
        DESC,
      name ASC
    LIMIT 10
  `;
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
    SELECT id, slug, name, "logoUrl", "hqLocation"
    FROM "Company"
    WHERE "name" ILIKE ${"%" + q.trim() + "%"}
       OR slug ILIKE ${"%" + slugCandidate + "%"}
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
  website: z.string().url().optional().or(z.literal("")),
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
        verificationStatus: "UNVERIFIED",
      },
      select: { id: true, slug: true },
    }),
  );
  await audit({
    actorId: session.user.id,
    action: "company.user-created",
    entity: "Company",
    entityId: created.id,
    meta: { source: "candidate-experience-editor" },
  });
  // Bust the public directory + company detail page caches so the
  // new row surfaces immediately. Without these, a candidate who
  // creates "Acme EV" inline from their profile editor doesn't see
  // the company on /companies until the next deploy or 60-min
  // cache window — confusing UX.
  revalidatePath("/companies");
  revalidatePath(`/company/${created.slug}`);
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
}

export async function searchInstitutions(q: string): Promise<InstitutionMatch[]> {
  if (!q || q.trim().length < 2) return [];
  // Same FTS migration as searchCompanies — see lib/search-fts.ts
  // for the rationale and lib/institution-search.ts for the
  // canonical implementation. This function is the version used by
  // the profile-editor entity-picker (it shapes the result
  // differently — `type` instead of `verificationStatus`).
  const tsq = buildTsQuery(q);
  if (!tsq) return [];
  const slugCandidate = q.toLowerCase().replace(/\s+/g, "-");
  const fts = await db.$queryRaw<InstitutionMatch[]>`
    SELECT id, slug, name, type::text, city, "logoUrl"
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
  if (fts.length > 0) return fts;
  // ILIKE fallback — see searchCompanies for rationale. Kept in
  // lock-step so neither entity-picker degrades silently when FTS
  // isn't populated.
  return db.$queryRaw<InstitutionMatch[]>`
    SELECT id, slug, name, type::text, city, "logoUrl"
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
  website: z.string().url().optional().or(z.literal("")),
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
        verificationStatus: "UNVERIFIED",
      },
      select: { id: true, slug: true },
    }),
  );
  await audit({
    actorId: session.user.id,
    action: "institution.user-created",
    entity: "Institution",
    entityId: created.id,
    meta: { source: "candidate-education-editor", type: parsed.data.type },
  });
  // Same revalidation rationale as createCompanyLite — keep the
  // public directory in sync after a candidate adds a brand-new
  // institution from their education editor.
  revalidatePath("/institutions");
  revalidatePath(`/institutions/${created.slug}`);
  return { ok: true, id: created.id, slug: created.slug };
}
