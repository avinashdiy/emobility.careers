/**
 * Parser-only dry-run for the WordPress importer. Reads the XML
 * file(s) you pass on the command line, runs them through the
 * same parser + sanitiser the production action uses, and prints
 * what WOULD be imported (without touching the DB).
 *
 * Useful for previewing a tricky export before you upload it
 * through the admin UI.
 *
 * Run: `pnpm tsx scripts/wp-import-dryrun.ts /path/to/export.xml [more.xml ...]`
 */

import { readFileSync } from "node:fs";
import {
  parseWordPressXml,
  sanitizeWordPressBody,
  fallbackSlug,
  deriveExcerpt,
} from "@/lib/cms/wordpress-import";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: pnpm tsx scripts/wp-import-dryrun.ts <file.xml> [more.xml ...]");
  process.exit(2);
}

for (const file of files) {
  console.log(`\n━━━ ${file} ━━━`);
  const xml = readFileSync(file, "utf8");
  const parsed = parseWordPressXml(xml);
  console.log(`channel: ${parsed.channelTitle}`);
  console.log(`source : ${parsed.baseUrl}`);
  console.log(`counts : ${JSON.stringify(parsed.counts)}`);

  for (const kind of ["page", "post"] as const) {
    const items = parsed.items.filter((i) => i.kind === kind);
    if (items.length === 0) continue;
    console.log(`\n${kind.toUpperCase()}S (${items.length}):`);
    for (const it of items) {
      const slug = it.slug || fallbackSlug(it.title, it.wpPostId);
      const sanitized = sanitizeWordPressBody(it.bodyRaw);
      const excerpt = deriveExcerpt(it.bodyRaw, it.excerpt);
      const ratio = it.bodyRaw.length > 0
        ? `${((sanitized.length / it.bodyRaw.length) * 100).toFixed(0)}%`
        : "—";
      console.log(
        `  wp#${it.wpPostId.toString().padStart(5)} ` +
        `slug=${slug.slice(0, 32).padEnd(32)} ` +
        `body ${it.bodyRaw.length.toString().padStart(6)}c → ${sanitized.length.toString().padStart(6)}c (${ratio.padStart(4)}) ` +
        `| ${it.title.slice(0, 50)}`,
      );
      if (excerpt) {
        console.log(`         excerpt: ${excerpt.slice(0, 100)}${excerpt.length > 100 ? "…" : ""}`);
      }
    }
  }
}

console.log("\n✓ dry-run complete. No DB writes.");
