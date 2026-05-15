import type { Prisma, EmployerAwardCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * #26 Best EV Employer — yearly award computation.
 *
 * Composite score per company per category. Inputs:
 *   - Average of overallRating from PUBLISHED CompanyReview rows in
 *     the calendar year (50% weight).
 *   - Per-category proxy: BEST_FOR_BATTERY_ROLES uses the average
 *     overallRating from reviewers whose reviewerJobTitle matches a
 *     domain keyword. Coarse but actionable for v1.
 *   - Response-rate / time-to-respond signals — derived from existing
 *     SLA tracking, integrated when those tables exist (placeholder
 *     of zero contribution for now so the math stays defined).
 *   - Minimum samples gate: a company needs >=N reviews to be
 *     considered. Keeps a single 5-star review from skewing the
 *     ranking.
 *
 * Output: top 10 in each category go into EmployerAward, ranked
 * 1..10. The Company page renders the badge for any row that has an
 * EmployerAward in the current year.
 *
 * Called from:
 *   - admin trigger (manual yearly compute);
 *   - a yearly cron tick once we have one.
 */

const MIN_REVIEWS = 5;

interface CategoryRule {
  category: EmployerAwardCategory;
  /** Keyword (lower-cased) that has to appear in reviewerJobTitle for
   *  the review to count toward this category. `null` = all reviews
   *  count (BEST_OVERALL / BEST_FOR_FRESHERS / etc.). */
  keyword: string | null;
}

const CATEGORY_RULES: CategoryRule[] = [
  { category: "BEST_OVERALL", keyword: null },
  { category: "BEST_FOR_BATTERY_ROLES", keyword: "battery" },
  { category: "BEST_FOR_CHARGING_ROLES", keyword: "charging" },
  { category: "BEST_FOR_MOTOR_ROLES", keyword: "motor" },
  { category: "BEST_FOR_SOFTWARE_ROLES", keyword: "software" },
];

export async function computeEmployerAwards(year: number): Promise<{ computed: number }> {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));

  // Pull every published review in the year. For a v1 site (~hundreds
  // of reviews per year tops), loading them all in memory is fine. At
  // scale, switch to a per-company aggregation SQL pass.
  const reviews = await db.companyReview.findMany({
    where: {
      status: "PUBLISHED",
      createdAt: { gte: start, lt: end },
    },
    select: {
      companyId: true,
      overallRating: true,
      reviewerJobTitle: true,
      relationship: true,
    },
  });

  // Group by company → category.
  type Tally = { sum: number; count: number };
  const byCompanyCategory = new Map<string, Map<EmployerAwardCategory, Tally>>();

  for (const r of reviews) {
    const title = (r.reviewerJobTitle ?? "").toLowerCase();
    for (const rule of CATEGORY_RULES) {
      if (rule.keyword && !title.includes(rule.keyword)) continue;
      const cat = rule.category;
      const inner = byCompanyCategory.get(r.companyId) ?? new Map<EmployerAwardCategory, Tally>();
      const tally = inner.get(cat) ?? { sum: 0, count: 0 };
      tally.sum += r.overallRating;
      tally.count += 1;
      inner.set(cat, tally);
      byCompanyCategory.set(r.companyId, inner);
    }
  }

  // Compute the per-category ranking. Companies under MIN_REVIEWS are
  // dropped so a single perfect score can't crown a brand-new employer.
  type Row = { companyId: string; category: EmployerAwardCategory; score: number; samples: number };
  const rows: Row[] = [];
  for (const [companyId, cats] of byCompanyCategory.entries()) {
    for (const [category, tally] of cats.entries()) {
      if (tally.count < MIN_REVIEWS) continue;
      rows.push({
        companyId,
        category,
        score: tally.sum / tally.count,
        samples: tally.count,
      });
    }
  }

  // Sort + rank per category. We keep top 10.
  const byCategory = new Map<EmployerAwardCategory, Row[]>();
  for (const r of rows) {
    const arr = byCategory.get(r.category) ?? [];
    arr.push(r);
    byCategory.set(r.category, arr);
  }

  let computed = 0;
  for (const [category, arr] of byCategory.entries()) {
    arr.sort((a, b) => b.score - a.score);
    const top = arr.slice(0, 10);
    for (let i = 0; i < top.length; i++) {
      const r = top[i];
      await db.employerAward.upsert({
        where: { companyId_year_category: { companyId: r.companyId, year, category } },
        create: {
          companyId: r.companyId,
          year,
          category,
          rank: i + 1,
          scoreBreakdown: {
            avgOverallRating: Number(r.score.toFixed(3)),
            samples: r.samples,
            method: "v1-mean-overall",
          } as unknown as Prisma.InputJsonValue,
        },
        update: {
          rank: i + 1,
          scoreBreakdown: {
            avgOverallRating: Number(r.score.toFixed(3)),
            samples: r.samples,
            method: "v1-mean-overall",
          } as unknown as Prisma.InputJsonValue,
        },
      });
      computed += 1;
    }
  }

  logger.info({ year, computed }, "[awards] computed");
  return { computed };
}
