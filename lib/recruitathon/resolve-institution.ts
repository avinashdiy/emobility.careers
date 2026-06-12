import "server-only";
import { db } from "@/lib/db";

/**
 * Resolve a Recruitathon registration's college to a canonical
 * Institution — and, where confidence is high, to that college's
 * approved placement cell — even when the student registered directly
 * (no TPO invite link) and typed a sloppy / abbreviated college name.
 *
 * Signal precedence (strongest first):
 *   1. picked  — they selected a row from the autocomplete (institutionId)
 *   2. email   — their signup email domain matches Institution.emailDomains
 *   3. alias   — typed text exactly matches name / shortName / an admin
 *                curated alias (case-insensitive)
 *   4. fuzzy   — trigram similarity to a canonical name above threshold
 *
 * 1–3 are HIGH confidence → `autoAttribute: true`, so the action may set
 * viaTpoCellId automatically. 4 (fuzzy) is medium confidence → we link
 * the institution (helps admin/TPO grouping) but DON'T auto-credit a
 * TPO; those land in the TPO "claim" queue for a one-click confirm,
 * avoiding wrongly attributing a student to the wrong college's cell.
 */

export type InstitutionMatchVia = "picked" | "email" | "alias" | "fuzzy" | "none";

export interface ResolvedInstitution {
  institutionId: string | null;
  matchedVia: InstitutionMatchVia;
  /** Approved placement cell for the resolved institution, if one exists. */
  placementCellId: string | null;
  /** High-confidence match (picked / email / alias) — safe to auto-attribute. */
  autoAttribute: boolean;
}

function emailDomainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const dom = email.slice(at + 1).trim().toLowerCase();
  return dom.length > 0 ? dom : null;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function approvedCellFor(institutionId: string): Promise<string | null> {
  const cell = await db.collegePlacementCell.findFirst({
    where: { institutionId, status: "APPROVED" },
    select: { id: true },
  });
  return cell?.id ?? null;
}

export async function resolveInstitution(opts: {
  typedName: string;
  pickedId: string | null;
  email: string | null;
}): Promise<ResolvedInstitution> {
  // 1. Explicit pick — strongest signal, no further work.
  if (opts.pickedId && opts.pickedId.length > 0) {
    return {
      institutionId: opts.pickedId,
      matchedVia: "picked",
      placementCellId: await approvedCellFor(opts.pickedId),
      autoAttribute: true,
    };
  }

  // 2. Email domain — high confidence, zero student friction.
  const dom = emailDomainOf(opts.email);
  if (dom) {
    const inst = await db.institution.findFirst({
      where: { emailDomains: { has: dom }, verificationStatus: { not: "REJECTED" } },
      select: { id: true },
    });
    if (inst) {
      return {
        institutionId: inst.id,
        matchedVia: "email",
        placementCellId: await approvedCellFor(inst.id),
        autoAttribute: true,
      };
    }
  }

  const norm = normalizeName(opts.typedName);
  if (norm.length >= 2) {
    // 3. Exact (case-insensitive) name / shortName / curated alias.
    const aliasMatch = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Institution"
      WHERE "verificationStatus" <> 'REJECTED'
        AND (
          lower(name) = ${norm}
          OR lower("shortName") = ${norm}
          OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE lower(a) = ${norm})
        )
      LIMIT 1
    `;
    if (aliasMatch.length > 0) {
      return {
        institutionId: aliasMatch[0].id,
        matchedVia: "alias",
        placementCellId: await approvedCellFor(aliasMatch[0].id),
        autoAttribute: true,
      };
    }

    // 4. Trigram fuzzy — medium confidence. Link only; do not auto-credit
    //    a TPO. Wrapped in try/catch so a missing pg_trgm extension
    //    degrades gracefully to "no fuzzy match" instead of throwing.
    try {
      const fuzzy = await db.$queryRaw<{ id: string }[]>`
        SELECT id, similarity(name, ${opts.typedName}) AS sim
        FROM "Institution"
        WHERE "verificationStatus" <> 'REJECTED'
          AND similarity(name, ${opts.typedName}) > 0.4
        ORDER BY sim DESC
        LIMIT 1
      `;
      if (fuzzy.length > 0) {
        return {
          institutionId: fuzzy[0].id,
          matchedVia: "fuzzy",
          placementCellId: null,
          autoAttribute: false,
        };
      }
    } catch {
      // pg_trgm unavailable — skip fuzzy.
    }
  }

  return { institutionId: null, matchedVia: "none", placementCellId: null, autoAttribute: false };
}
