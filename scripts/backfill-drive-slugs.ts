import { db } from "@/lib/db";
import { withUniqueSlug } from "@/lib/slug";
import { env } from "@/lib/env";

/**
 * One-shot backfill — assigns a slug + auto-generated landingPageUrl to
 * every CampusDrive that doesn't have one yet. Run once after the
 * Tier 0 drive-landing-page feature is deployed:
 *
 *   pnpm tsx scripts/backfill-drive-slugs.ts
 *
 * Idempotent — drives that already have a slug are skipped.
 */
async function main() {
  const drives = await db.campusDrive.findMany({
    where: { slug: null },
    include: { company: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`[backfill] ${drives.length} drives need slugs`);

  for (const d of drives) {
    const updated = await withUniqueSlug(`${d.title}-${d.company.slug}`, (slug) =>
      db.campusDrive.update({
        where: { id: d.id },
        data: {
          slug,
          landingPageUrl:
            d.landingPageUrl ?? `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/campus/${slug}`,
        },
        select: { id: true, slug: true },
      }),
    );
    console.log(`[backfill]  ${d.id} → /campus/${updated.slug}`);
  }
  console.log(`[backfill] done`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
