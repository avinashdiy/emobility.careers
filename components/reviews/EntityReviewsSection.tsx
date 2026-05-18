import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Reusable review-list + aggregate-rating renderer used by both
 * the Company detail page and the Institution detail page.
 *
 * The shape is generic — the caller passes the already-resolved
 * `reviews` array + the URL of the review submission form. Both
 * surfaces feed the same UI; the rating axes differ (companies
 * use Culture / Comp / Mgmt / Growth / Work-Life, institutions
 * use Faculty / Infra / Placement / Content / Alumni) so the
 * caller passes a `criteriaLabels` map.
 *
 * SEO note: every published review surfaces inline as plain
 * text so Google picks it up. The AggregateRating JSON-LD is
 * emitted by the calling page (it knows the entity URL / name).
 */

export interface ReviewItem {
  id: string;
  headline: string;
  pros: string;
  cons: string;
  overallRating: number;
  /// Per-axis scores keyed by the criterion key. Caller's
  /// criteriaLabels translates each key to a display label.
  axisScores: Record<string, number>;
  reviewerLabel: string;
  reviewerJobTitle?: string | null;
  reviewerLocation?: string | null;
  /// Optional badge — e.g. "Verified alumni" / "Verified employee"
  /// for signed-in reviewers whose Education / EmployerProfile FK
  /// matches the entity.
  verifiedBadge?: string;
  createdAt: Date;
  helpfulCount: number;
}

interface Props {
  reviews: ReviewItem[];
  criteriaLabels: Record<string, string>;
  /// URL of the "Write a review" page for this entity.
  writeReviewHref: string;
  /// Pretty entity name — surfaced in the empty state + CTA copy.
  entityName: string;
}

/** Compute average + per-axis averages from the loaded review array. */
function computeAverages(reviews: ReviewItem[]) {
  if (reviews.length === 0) {
    return { overall: 0, perAxis: {} as Record<string, number>, count: 0 };
  }
  const sum = reviews.reduce((acc, r) => acc + r.overallRating, 0);
  const overall = sum / reviews.length;
  const perAxis: Record<string, number> = {};
  for (const key of Object.keys(reviews[0]!.axisScores)) {
    perAxis[key] =
      reviews.reduce((acc, r) => acc + (r.axisScores[key] ?? 0), 0) /
      reviews.length;
  }
  return { overall, perAxis, count: reviews.length };
}

/** Star-row renderer — simple unicode stars, no external dep. */
function Stars({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span aria-label={`${rating.toFixed(1)} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < filled ? "text-emce-orange" : "text-emce-text-muted"}>
          ★
        </span>
      ))}
    </span>
  );
}

export function EntityReviewsSection({
  reviews,
  criteriaLabels,
  writeReviewHref,
  entityName,
}: Props) {
  const { overall, perAxis, count } = computeAverages(reviews);

  return (
    <section className="space-y-6" aria-labelledby="reviews-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="reviews-heading" className="text-section text-emce-text">
            Reviews ({count.toLocaleString("en-IN")})
          </h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Submitted by candidates, employees, alumni and recruiters.
            Moderated before publishing.
          </p>
        </div>
        <Button asChild>
          <Link href={writeReviewHref}>✍️ Write a review</Link>
        </Button>
      </div>

      {/* Aggregate panel — overall + per-axis breakdown */}
      {count > 0 && (
        <Card className="p-5">
          <div className="flex flex-wrap items-start gap-6">
            <div className="text-center">
              <p className="text-4xl font-extrabold text-emce-darkest">
                {overall.toFixed(1)}
              </p>
              <Stars rating={overall} />
              <p className="mt-1 text-hint text-emce-text-sec">
                Based on {count} review{count === 1 ? "" : "s"}
              </p>
            </div>
            <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(criteriaLabels).map(([key, label]) => {
                const v = perAxis[key] ?? 0;
                return (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span className="text-hint font-bold text-emce-text">{label}</span>
                    <span className="flex items-center gap-2">
                      <Stars rating={v} />
                      <span className="text-hint font-bold text-emce-text-sec">
                        {v.toFixed(1)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* List */}
      {count === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-section text-emce-text">No reviews yet</p>
          <p className="mt-1 text-hint text-emce-text-sec">
            Be the first to share your experience with {entityName}.
          </p>
          <Button asChild className="mt-4">
            <Link href={writeReviewHref}>Write the first review</Link>
          </Button>
        </Card>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars rating={r.overallRating} />
                    <span className="font-bold text-emce-text">{r.headline}</span>
                  </div>
                  {r.verifiedBadge && (
                    <Badge variant="success" size="sm">
                      {r.verifiedBadge}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-hint text-emce-text-sec">
                  {r.reviewerLabel}
                  {r.reviewerJobTitle && ` · ${r.reviewerJobTitle}`}
                  {r.reviewerLocation && ` · ${r.reviewerLocation}`}
                  {" · "}
                  {r.createdAt.toISOString().slice(0, 10)}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">
                      Pros
                    </p>
                    <p className="mt-1 text-body text-emce-text">{r.pros}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emce-mid-muted">
                      Cons
                    </p>
                    <p className="mt-1 text-body text-emce-text">{r.cons}</p>
                  </div>
                </div>
                {/* Per-axis chips — compact strip so users can scan
                    the rubric without scrolling */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(r.axisScores).map(([key, v]) => (
                    <span
                      key={key}
                      className="rounded-sm bg-emce-light-soft px-2 py-0.5 text-[10px] font-bold text-emce-text-sec"
                    >
                      {criteriaLabels[key] ?? key} {v}/5
                    </span>
                  ))}
                </div>
                {r.helpfulCount > 0 && (
                  <p className="mt-2 text-hint text-emce-text-muted">
                    👍 {r.helpfulCount} found this helpful
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Build the `AggregateRating` + `Review[]` JSON-LD chunk for the
 * entity detail page. Caller embeds this inside their existing
 * Organization / EducationalOrganization JSON-LD.
 */
export function buildReviewJsonLdChunk(reviews: ReviewItem[]) {
  if (reviews.length === 0) return undefined;
  const overall =
    reviews.reduce((acc, r) => acc + r.overallRating, 0) / reviews.length;
  return {
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: overall.toFixed(1),
      reviewCount: reviews.length,
      bestRating: 5,
      worstRating: 1,
    },
    review: reviews.slice(0, 5).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.reviewerLabel },
      datePublished: r.createdAt.toISOString(),
      name: r.headline,
      reviewBody: `Pros: ${r.pros}\nCons: ${r.cons}`,
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.overallRating,
        bestRating: 5,
        worstRating: 1,
      },
    })),
  };
}
