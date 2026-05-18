/**
 * Seed the enrichment review queue with the top 100 companies —
 * the marquee OEMs + Indian household-name brands + global cell
 * makers from batches 1-2 of seed-company-enrichment.ts.
 *
 * These are the highest-traffic pages on the platform, so getting
 * web-verified logos + Wikipedia summaries onto them first delivers
 * the most user-visible improvement.
 *
 * What this script does:
 *   1. Reads BATCH_01 + BATCH_02 slugs out of
 *      scripts/seed-company-enrichment.ts (just the raw slug strings —
 *      we don't import the file because it has its own driver).
 *   2. Looks up the Company rows in the DB by slug.
 *   3. For each one, runs the enrichment orchestrator (which fetches
 *      logo + Wikipedia, then upserts a CompanyEnrichmentProposal).
 *   4. Logs a one-line status per company so you can `| tee` the
 *      output and grep for ERROR / no-op cases.
 *
 * Throughput:
 *   • Concurrency limited to 5 — Wikipedia anon rate-limit is gentle
 *     (~100 req/s per IP) but Logo.dev free-tier is conservative;
 *     keeping concurrency low prevents 429s.
 *   • Per-company time: ~3-5s (two fetches in parallel + an S3 PUT).
 *     100 companies finishes in ~3 minutes.
 *
 * Re-running is safe — the orchestrator deletes the prior COMPOSITE
 * proposal before writing a new one, so duplicates can't accumulate.
 *
 * Run with:
 *   pnpm exec tsx scripts/queue-top-100-enrichment.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { enrichOneCompany } from "@/lib/enrichment/orchestrator";

const db = new PrismaClient();

// ─── Slug extractor ───────────────────────────────────────────
// We parse the enrichment file as text rather than importing it
// (importing would run its driver too). We need every literal
// `slug: "..."` that appears between `const BATCH_01: ...` and the
// end of `const BATCH_02: ...`.

function extractBatchSlugs(filePath: string, batches: string[]): string[] {
  const src = readFileSync(filePath, "utf-8");
  const slugs: string[] = [];
  for (const batch of batches) {
    // Find the batch block by walking from the const declaration to
    // the matching closing `];` at column 0. Inside that block, grab
    // every literal `slug: "..."`.
    const startIdx = src.indexOf(`const ${batch}: EnrichmentSpec[] = [`);
    if (startIdx === -1) {
      console.warn(`⚠ Batch "${batch}" not found in ${filePath}`);
      continue;
    }
    const endIdx = src.indexOf("\n];", startIdx);
    const block = src.slice(startIdx, endIdx === -1 ? src.length : endIdx);
    const matches = block.match(/slug:\s*"([a-z0-9-]+)"/g) ?? [];
    for (const m of matches) {
      const slug = m.match(/"([^"]+)"/)?.[1];
      if (slug) slugs.push(slug);
    }
  }
  // De-dupe while preserving order — first-occurrence wins.
  return Array.from(new Set(slugs));
}

// ─── Concurrency-limited runner ───────────────────────────────
// Plain promise pool — small enough that pulling in p-limit isn't
// worth the dependency. Walks the input array CONCURRENCY at a time.

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T, idx: number) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(
      (async () => {
        while (true) {
          const myIdx = idx++;
          if (myIdx >= items.length) return;
          await task(items[myIdx]!, myIdx);
        }
      })(),
    );
  }
  await Promise.all(workers);
}

async function main() {
  const slugs = extractBatchSlugs(
    join(process.cwd(), "scripts", "seed-company-enrichment.ts"),
    ["BATCH_01", "BATCH_02"],
  );

  // First 100 — the slug list from BATCH_01 + BATCH_02 is in the
  // order I curated them, with the marquee Indian + global brands
  // first. Slice keeps the priority intact.
  const targetSlugs = slugs.slice(0, 100);
  console.log(`🎯 Enqueuing ${targetSlugs.length} top companies for enrichment\n`);

  // Resolve slug → company row. Filter out any we can't find (could
  // happen if dedupe redirected the slug since the enrichment file
  // was written — the SlugRedirect table covers the public URL but
  // the company itself lives at the canonical slug).
  const companies = await db.company.findMany({
    where: { slug: { in: targetSlugs } },
    select: { id: true, slug: true, name: true },
  });
  const bySlug = new Map(companies.map((c) => [c.slug, c]));
  const missing = targetSlugs.filter((s) => !bySlug.has(s));
  if (missing.length > 0) {
    console.warn(`⚠ ${missing.length} slugs not found in DB (likely deduped):`);
    for (const s of missing) console.warn(`   - ${s}`);
    console.warn("");
  }

  const queue = targetSlugs
    .map((s) => bySlug.get(s))
    .filter((c): c is { id: string; slug: string; name: string } => !!c);

  let ok = 0;
  let noOp = 0;
  let errors = 0;

  await runWithConcurrency(queue, 5, async (c, idx) => {
    const tag = `[${idx + 1}/${queue.length}]`;
    try {
      const result = await enrichOneCompany(c.id);
      if (result.status === "ERROR") {
        errors++;
        console.log(`${tag} ✗ ${c.name} — ERROR`);
      } else if (result.noOp) {
        noOp++;
        console.log(`${tag} = ${c.name} — no-op (nothing differs)`);
      } else {
        ok++;
        console.log(`${tag} ✓ ${c.name} — ${result.proposedFieldCount} field${result.proposedFieldCount === 1 ? "" : "s"} pending`);
      }
    } catch (err) {
      errors++;
      console.error(`${tag} ✗ ${c.name} — UNCAUGHT:`, err instanceof Error ? err.message : err);
    }
  });

  console.log(
    `\n✅ Done. ${ok} pending review · ${noOp} no-op · ${errors} errors · ${missing.length} not found.`,
  );
  console.log(`   Open /admin/companies/enrichment-queue to review.`);
}

main()
  .catch((err) => {
    console.error("✗ Enrichment queue seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
