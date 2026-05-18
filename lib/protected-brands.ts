import "server-only";
import { db } from "@/lib/db";

/**
 * "Protected brand" guard for the user-facing Company / Institution
 * entity-picker create flow.
 *
 * Problem: candidates and TPOs typing "DIYguru", "DIY guru",
 * "DIYguru Mobility Pvt Ltd", "diyguru-academy" etc. into the
 * picker were creating multiple Company / Institution rows for
 * the same underlying brand. The dedupe-diyguru script consolidates
 * the existing variants into a single canonical Company
 * (slug `u-diyguru`) and a single canonical Institution
 * (slug `emobility-academy-by-diyguru`) — and this module makes
 * sure no new variants get created going forward.
 *
 * How it's used:
 *   • `createCompanyLite` calls `resolveProtectedCompany(name)`
 *     before its own dedupe step. If the name matches a protected
 *     pattern, the function returns the canonical row id + slug
 *     directly — the picker transparently links the candidate's
 *     experience to the canonical row instead of creating a new
 *     one.
 *   • `createInstitutionLite` does the same with
 *     `resolveProtectedInstitution(name)`.
 *
 * Adding a new protected brand: append to `PROTECTED_COMPANIES` /
 * `PROTECTED_INSTITUTIONS` below. The canonical row must exist in
 * the DB; the dedupe script for that brand should run first.
 */

interface ProtectedBrand {
  /// Case-insensitive regex matched against `name` after normalisation
  /// (lowercased, whitespace collapsed, dashes / dots / Pvt Ltd
  /// suffixes removed). Anything that matches resolves to canonical.
  match: RegExp;
  /// Slug of the canonical row in the relevant table.
  canonicalSlug: string;
  /// User-facing message — surfaced as a toast if the picker UI
  /// wants to explain why the create button didn't fire.
  message: string;
}

const PROTECTED_COMPANIES: ProtectedBrand[] = [
  {
    match: /diy\s*-?\s*guru/i,
    canonicalSlug: "u-diyguru",
    message:
      "DIYguru is a recognised company. Pick the existing DIYguru entry from the dropdown — duplicate rows are not allowed.",
  },
  // Six additional companies deduped in May 2026 — see
  // scripts/dedupe-companies.ts. The regex catches the brand name +
  // common variants (E-mobility suffix, "Charging" descriptor, etc.).
  {
    match: /\babb\s+india\b|\babb\s+e\s*-?\s*mobility\b/i,
    canonicalSlug: "abb-india",
    message: "ABB India has a canonical entry — pick the existing row.",
  },
  {
    match: /adani\s+totalenergies/i,
    canonicalSlug: "adani-totalenergies-emobility",
    message: "Adani TotalEnergies E-Mobility has a canonical entry — pick the existing row.",
  },
  {
    match: /\bhpcl\s+(ev|e\s*-?\s*mobility|charging)/i,
    canonicalSlug: "hpcl-ev-charging",
    message: "HPCL EV Charging has a canonical entry — pick the existing row.",
  },
  {
    match: /^\s*lime\s*$|lime\s+(mobility|electric|scoot|bike)/i,
    canonicalSlug: "lime-mobility",
    message: "Lime has a canonical entry — pick the existing row.",
  },
  {
    match: /servotech\s+(power|systems?)/i,
    canonicalSlug: "servotech",
    message: "Servotech Power Systems has a canonical entry — pick the existing row.",
  },
  {
    match: /\btritium\b/i,
    canonicalSlug: "tritium-charging",
    message: "Tritium DCFC has a canonical entry — pick the existing row.",
  },
];

const PROTECTED_INSTITUTIONS: ProtectedBrand[] = [
  {
    match: /diy\s*-?\s*guru/i,
    canonicalSlug: "emobility-academy-by-diyguru",
    message:
      "DIYguru eMobility Academy is a recognised institution. Pick the existing entry from the dropdown — duplicate rows are not allowed.",
  },
  // The legacy "eMobility Academy by DIYguru" naming pattern still
  // appears in some imported student profiles — catch that too.
  {
    match: /e\s*-?\s*mobility\s+academy/i,
    canonicalSlug: "emobility-academy-by-diyguru",
    message:
      "DIYguru eMobility Academy is the canonical entry. Pick the existing row from the dropdown.",
  },
  // Seven additional brands deduplicated in May 2026 — pin them to
  // their canonical slugs so candidates / TPOs can't recreate variants
  // by typing different name forms into the picker. See
  // scripts/dedupe-institutions.ts for the full pair list + rationale.
  {
    match: /automotive\s+skill(s?)\s+development\s+council|^\s*asdc\s*$/i,
    canonicalSlug: "asdc-india",
    message: "ASDC has a canonical entry — pick the existing row.",
  },
  {
    match: /carnegie\s+mellon/i,
    canonicalSlug: "cmu-pittsburgh",
    message: "Carnegie Mellon University has a canonical entry — pick the existing row.",
  },
  {
    match: /delft\s+university\s+of\s+technology|^\s*tu\s*delft\s*$/i,
    canonicalSlug: "tu-delft",
    message: "TU Delft has a canonical entry — pick the existing row.",
  },
  {
    match: /politecnico\s+di\s+milano|^\s*polimi\s*$/i,
    canonicalSlug: "polimi",
    message: "Politecnico di Milano has a canonical entry — pick the existing row.",
  },
  {
    match: /^\s*srm\s+(institute|ist)|srm\s+university/i,
    canonicalSlug: "srmist-chennai",
    message: "SRMIST has a canonical entry — pick the existing row.",
  },
  {
    match: /technical\s+university\s+of\s+munich|^\s*tum\s*$/i,
    canonicalSlug: "tum-munich",
    message: "TU München has a canonical entry — pick the existing row.",
  },
  {
    match: /vishwakarma\s+institute\s+of\s+technology|^\s*vit\s+pune\s*$/i,
    canonicalSlug: "vit-pune",
    message: "VIT Pune has a canonical entry — pick the existing row.",
  },
];

/** Normalise an input name so the regex match is robust. */
function normalise(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, " ")
    .replace(/\b(pvt|private|ltd|limited|inc|incorporated|llc|llp|foundation|academy|technologies|technology|tech)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ProtectedResolution {
  protected: true;
  id: string;
  slug: string;
  message: string;
}

export interface UnprotectedResolution {
  protected: false;
}

export type ProtectedResult = ProtectedResolution | UnprotectedResolution;

export async function resolveProtectedCompany(name: string): Promise<ProtectedResult> {
  const norm = normalise(name);
  for (const brand of PROTECTED_COMPANIES) {
    if (brand.match.test(norm) || brand.match.test(name)) {
      const row = await db.company.findUnique({
        where: { slug: brand.canonicalSlug },
        select: { id: true, slug: true },
      });
      if (row) {
        return {
          protected: true,
          id: row.id,
          slug: row.slug,
          message: brand.message,
        };
      }
      // Canonical row missing — bail and let the normal flow handle
      // it; the picker will fall through to "create new". This is
      // expected only during the brief window before the dedupe
      // script has run on a fresh DB.
      return { protected: false };
    }
  }
  return { protected: false };
}

export async function resolveProtectedInstitution(name: string): Promise<ProtectedResult> {
  const norm = normalise(name);
  for (const brand of PROTECTED_INSTITUTIONS) {
    if (brand.match.test(norm) || brand.match.test(name)) {
      const row = await db.institution.findUnique({
        where: { slug: brand.canonicalSlug },
        select: { id: true, slug: true },
      });
      if (row) {
        return {
          protected: true,
          id: row.id,
          slug: row.slug,
          message: brand.message,
        };
      }
      return { protected: false };
    }
  }
  return { protected: false };
}
