import { db } from "@/lib/db";
import { recalcCompleteness } from "@/lib/profile-completeness";

/**
 * One-shot backfill — sweeps every CandidateProfile and writes a fresh
 * `profileCompleteness` value. Run once after deploying the Tier-0
 * profile-gate feature so existing accounts pick up the right gate
 * states (otherwise they all sit at 0% and trip the soft banner).
 *
 *   pnpm tsx scripts/recalc-completeness.ts
 *
 * Idempotent — running it twice is a no-op modulo a write storm.
 */
async function main() {
  const profiles = await db.candidateProfile.findMany({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`[backfill] recalculating ${profiles.length} candidate profiles…`);
  let i = 0;
  for (const p of profiles) {
    try {
      await recalcCompleteness(p.id);
    } catch (err) {
      console.warn(`[backfill] profile ${p.id} failed:`, err);
    }
    i += 1;
    if (i % 100 === 0) console.log(`[backfill] ${i}/${profiles.length}`);
  }
  console.log(`[backfill] done — ${i} profiles updated.`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
