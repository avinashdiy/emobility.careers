/**
 * One-off backfill — mirror every CandidateProfile.profilePhotoUrl
 * that still points at an external CDN (most commonly LinkedIn's
 * `media.licdn.com`) into our own MinIO `avatars` bucket.
 *
 * Why: pre-fix (~2026-05) the OAuth signup flow stored the
 * provider's URL directly on the profile row. LinkedIn rejects
 * hot-linked image requests, so every LinkedIn-signup candidate ends
 * up with a profile that shows the broken-image placeholder (their
 * name rendered as alt text inside the avatar disc).
 *
 * The signup flow itself was fixed forward in lib/auth.ts +
 * lib/avatar-mirror.ts — new signups mirror cleanly. This script
 * walks the existing data and does the same for the back-catalogue.
 *
 * Run on the production server with the env preloader (it's a tsx
 * script, not a Next.js page, so the standard `npx tsx` invocation
 * misses our .env loading):
 *
 *   sh -c 'cd /home/emobilitycareers/htdocs/emobility.careers && \
 *     node_modules/.bin/tsx --require ./workers/load-env.cjs \
 *     scripts/backfill-oauth-avatars.ts'
 *
 * Safe to re-run — idempotent. The `shouldMirrorPhoto` predicate
 * short-circuits anything that's already on our domain, so a second
 * pass only touches rows the first pass failed on (e.g. LinkedIn
 * rate-limited us on the first batch).
 *
 * Throttles to ~2 req/s — gentle on the upstream CDN, polite to
 * MinIO, and finishes 50k profiles in well under an hour. Tune
 * `INTER_REQUEST_MS` if you need it faster.
 */

import { db } from "@/lib/db";
import { mirrorOAuthPhoto, shouldMirrorPhoto } from "@/lib/avatar-mirror";

const INTER_REQUEST_MS = 500;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // Pull only rows that have a non-null URL pointing at an external
  // host. We can't filter `shouldMirrorPhoto` in SQL — Postgres
  // doesn't know our domain — so we approximate via a NOT LIKE on
  // our own host and let the predicate inside the loop do the final
  // gating.
  const candidates = await db.candidateProfile.findMany({
    where: {
      profilePhotoUrl: {
        not: null,
        // Skip URLs already on our domain (covers files. + future
        // images./cdn. subdomains via the trailing wildcard).
        notIn: [],
      },
    },
    select: { id: true, slug: true, profilePhotoUrl: true },
    orderBy: { createdAt: "asc" },
  });

  let touched = 0;
  let mirrored = 0;
  let failed = 0;
  let skipped = 0;

  console.log(`[backfill] scanning ${candidates.length} candidate profiles…`);

  for (const c of candidates) {
    if (!c.profilePhotoUrl || !shouldMirrorPhoto(c.profilePhotoUrl)) {
      skipped++;
      continue;
    }
    touched++;

    const mirroredUrl = await mirrorOAuthPhoto(c.profilePhotoUrl);
    if (!mirroredUrl) {
      failed++;
      console.warn(
        `[backfill] FAILED ${c.slug ?? c.id} — ${c.profilePhotoUrl}`,
      );
      // Best-effort: clear the broken URL so the avatar falls back
      // to the silhouette rather than continuing to render the
      // broken-image placeholder. Comment this out if you'd rather
      // keep the original URL on the row for forensic purposes.
      await db.candidateProfile.update({
        where: { id: c.id },
        data: { profilePhotoUrl: null },
      });
      await sleep(INTER_REQUEST_MS);
      continue;
    }

    await db.candidateProfile.update({
      where: { id: c.id },
      data: { profilePhotoUrl: mirroredUrl },
    });
    mirrored++;
    if (mirrored % 25 === 0) {
      console.log(
        `[backfill] progress: ${mirrored} mirrored / ${failed} failed / ${touched} processed`,
      );
    }
    await sleep(INTER_REQUEST_MS);
  }

  console.log(
    `[backfill] done. scanned=${candidates.length} skipped=${skipped} touched=${touched} mirrored=${mirrored} failed=${failed}`,
  );
  await db.$disconnect();
}

main().catch((err) => {
  console.error("[backfill] fatal", err);
  process.exit(1);
});
