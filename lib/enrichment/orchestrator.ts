/**
 * Company enrichment orchestrator.
 *
 * Runs both fetchers (Logo.dev + Wikipedia) concurrently for a single
 * company, normalises their outputs into the Company column shape, and
 * upserts a CompanyEnrichmentProposal row. Idempotent — re-running for
 * the same company replaces its existing PENDING proposal.
 *
 * Called from:
 *   • scripts/queue-top-100-enrichment.ts (batch seed)
 *   • app/admin/companies/enrichment-queue/actions.ts (admin "Re-fetch"
 *     button on a single proposal)
 *
 * Design choices:
 *   • Only ONE proposal per (companyId, source=COMPOSITE) lives at a
 *     time — re-fetches replace it via upsert keyed on the unique
 *     (companyId, source) tuple (enforced at insert via raw SQL since
 *     Prisma doesn't have a compound unique on (companyId, source)
 *     here — we delete-then-create to keep the schema flat).
 *   • We never propose a value that matches what's already on the row.
 *     The diff view stays meaningful instead of cluttering it with
 *     unchanged fields.
 */

import { db } from "@/lib/db";
import { EnrichmentSource, EnrichmentProposalStatus, Prisma } from "@prisma/client";
import { domainFromWebsite, fetchLogoToS3 } from "./logo-dev";
import { fetchWikipediaSummary } from "./wikipedia";

export interface EnrichmentResult {
  proposalId: string;
  status: EnrichmentProposalStatus;
  proposedFieldCount: number;
  /// True when nothing changed — the worker still writes the proposal
  /// row so the admin can see "we tried + nothing differed".
  noOp: boolean;
}

/**
 * Run enrichment for one company. Returns the proposal id + a small
 * summary that the caller can log without re-querying.
 */
export async function enrichOneCompany(companyId: string): Promise<EnrichmentResult> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      slug: true,
      name: true,
      website: true,
      logoUrl: true,
      description: true,
      about: true,
      foundedYear: true,
      linkedinUrl: true,
      twitterUrl: true,
      facebookUrl: true,
    },
  });

  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }

  // ─── Run both fetchers concurrently ──────────────────────────
  // Even on a slow link this finishes in ≤8s (the AbortSignal cap
  // inside each fetcher). Sequential would be ~16s — wasteful when
  // the calls are independent.
  const domain = domainFromWebsite(company.website);

  const [logoResult, wikiResult] = await Promise.all([
    domain ? fetchLogoToS3(domain, company.slug) : Promise.resolve(null),
    fetchWikipediaSummary(company.name),
  ]);

  // ─── Build the proposal payload ──────────────────────────────
  // For each field, only include it if (a) the fetcher returned
  // something AND (b) it differs from what's already on the row.
  const proposedFields: Record<string, string | number> = {};
  const rawSources: Record<string, unknown> = {};

  if (logoResult) {
    rawSources.logo_dev = {
      url: logoResult.url,
      key: logoResult.key,
      bytes: logoResult.bytes,
      contentType: logoResult.contentType,
      fetchedAt: new Date().toISOString(),
    };
    if (logoResult.url !== company.logoUrl) {
      proposedFields.logoUrl = logoResult.url;
    }
  }

  if (wikiResult) {
    rawSources.wikipedia = {
      title: wikiResult.title,
      shortDescription: wikiResult.shortDescription,
      extract: wikiResult.extract,
      url: wikiResult.url,
      thumbnailUrl: wikiResult.thumbnailUrl,
      fetchedAt: new Date().toISOString(),
    };
    // Only propose `description` when ours is sparse (< 40 chars) or
    // unset — we don't want to overwrite carefully-curated seed prose
    // with the Wikipedia tagline.
    if (
      wikiResult.shortDescription &&
      (!company.description || company.description.length < 40)
    ) {
      proposedFields.description = wikiResult.shortDescription;
    }
    // Similar guard for `about` — propose only when ours is short.
    // We trim Wikipedia's extract to ~600 chars so the proposal stays
    // bounded; the admin can expand or replace in the edit flow.
    if (wikiResult.extract && (!company.about || company.about.length < 120)) {
      const trimmed = wikiResult.extract.length > 600
        ? wikiResult.extract.slice(0, 600).replace(/\s+\S*$/, "") + "…"
        : wikiResult.extract;
      proposedFields.about = trimmed;
    }
  }

  // ─── Confidence scoring (0–100) ──────────────────────────────
  // Simple heuristic: each source that landed something useful adds
  // 50. Cap at 100. Drives the badge colour in the admin queue —
  // green at 100, amber at 50, red at 0 (which becomes ERROR below).
  let confidence = 0;
  if (logoResult) confidence += 50;
  if (wikiResult) confidence += 50;

  // ─── Decide status ───────────────────────────────────────────
  // Both fetchers returned nothing → ERROR (worker should re-try with
  // different input). One returned something → PENDING for admin
  // review. Zero new fields differ from existing → still PENDING
  // (noOp=true) so the admin sees the "we checked, nothing changed"
  // row instead of an empty list of recent runs.
  const noOp = Object.keys(proposedFields).length === 0;
  const status: EnrichmentProposalStatus =
    !logoResult && !wikiResult
      ? EnrichmentProposalStatus.ERROR
      : EnrichmentProposalStatus.PENDING;

  const errorMessage =
    status === EnrichmentProposalStatus.ERROR
      ? `No data returned. ${!domain ? "Company has no website to derive a logo domain from." : "Logo.dev returned no usable image."} ${!wikiResult ? "Wikipedia has no matching page." : ""}`.trim()
      : null;

  // ─── Upsert: one COMPOSITE proposal per company ──────────────
  // We delete the prior COMPOSITE proposal (if any) before inserting
  // the new one so the queue never accumulates stale duplicates.
  // Keeps `findMany({ where: { status: PENDING } })` cheap.
  await db.companyEnrichmentProposal.deleteMany({
    where: { companyId, source: EnrichmentSource.COMPOSITE },
  });

  const created = await db.companyEnrichmentProposal.create({
    data: {
      companyId,
      source: EnrichmentSource.COMPOSITE,
      status,
      // Prisma's generated types want Json fields to be JsonValue,
      // not Record<string, unknown> — cast so the typed shape we
      // produced above passes through unchanged.
      proposedFields: proposedFields as Prisma.InputJsonValue,
      rawSources: rawSources as Prisma.InputJsonValue,
      confidence,
      errorMessage,
    },
    select: { id: true, status: true },
  });

  return {
    proposalId: created.id,
    status: created.status,
    proposedFieldCount: Object.keys(proposedFields).length,
    noOp,
  };
}
