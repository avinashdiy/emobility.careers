"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { withUniqueSlug } from "@/lib/slug";
import { audit } from "@/lib/audit";
import { rateLimitOrThrow } from "@/lib/rate-limit";
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
  return db.company.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q.toLowerCase().replace(/\s+/g, "-") } },
      ],
    },
    take: 10,
    orderBy: [{ verificationStatus: "desc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, logoUrl: true, hqLocation: true },
  });
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
  return db.institution.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { shortName: { contains: q, mode: "insensitive" } },
        { slug: { contains: q.toLowerCase().replace(/\s+/g, "-") } },
      ],
      verificationStatus: { not: "REJECTED" },
    },
    take: 10,
    orderBy: [{ verificationStatus: "desc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, type: true, city: true, logoUrl: true },
  });
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
  return { ok: true, id: created.id, slug: created.slug };
}
