import Link from "next/link";
import type { Country, Prisma } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { MatchScorePill } from "@/components/jobs/MatchScoreCard";
import { formatSalaryRange, relativeTime } from "@/lib/utils";
import { formatLocalSalary } from "@/lib/currency";
import { MapPin, Briefcase } from "lucide-react";

export interface JobCardData {
  id: string;
  slug: string;
  title: string;
  workMode: string;
  profileMode: string;
  locations: string[];
  /// Opt-in cross-border flag — when true, renders a "🌍 Open to
  /// relocation" badge so a candidate browsing from a different
  /// country knows this role is visa-sponsored / relocation-
  /// friendly. Optional for back-compat with callers that don't
  /// select the field yet; missing/false → no badge.
  openToRelocation?: boolean | null;
  /// Country the job is posted in. Pairs with `viewerCountry`
  /// (the prop) to drive local-currency conversion in the salary
  /// badge. Optional for back-compat with callers selecting
  /// against an older shape — missing/null → no conversion,
  /// renders original currency only.
  country?: Country | null;
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: Prisma.Decimal | number | string | null;
  salaryMax: Prisma.Decimal | number | string | null;
  salaryCurrency: string;
  salaryPeriod?: "YEARLY" | "MONTHLY" | null;
  salaryHidden: boolean;
  publishedAt: Date | null;
  company: {
    name: string;
    slug: string;
    logoUrl: string | null;
  };
}

/**
 * @param viewerCountry - The viewing user's country. When passed,
 *   the salary badge renders in their local currency with the
 *   recruiter's original currency in parens (e.g. "£3.8k–£5.1k /mo
 *   (AED 18,000–24,000)"). When omitted, falls back to showing
 *   the recruiter's original currency only — preserves the
 *   pre-PR-4 behaviour for callers that haven't been migrated
 *   yet. Server components should resolve this once via
 *   `getViewerCountry()` and pass it down.
 */
export function JobCard({
  job,
  matchScore,
  viewerCountry,
}: {
  job: JobCardData;
  matchScore?: number | null;
  viewerCountry?: Country;
}) {
  // Cross-currency salary formatting. We compute once here so the
  // JSX can branch on whether conversion happened (display vs
  // original-only) without re-running the formatter. When
  // `viewerCountry` is undefined the formatter is a noop — it
  // renders the recruiter's original currency only.
  const formatted =
    viewerCountry !== undefined
      ? formatLocalSalary({
          min: job.salaryMin != null ? Number(job.salaryMin) : null,
          max: job.salaryMax != null ? Number(job.salaryMax) : null,
          originalCurrency: job.salaryCurrency,
          postedFromCountry: job.country ?? null,
          viewerCountry,
          period: job.salaryPeriod,
          salaryHidden: job.salaryHidden,
        })
      : null;
  return (
    <Link
      href={`/job/${job.slug}`}
      className="block rounded-lg border border-emce-border bg-white p-4 shadow-emce transition-all hover:-translate-y-0.5 hover:shadow-emce-hover focus-visible:ring-2 focus-visible:ring-emce-mid"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 flex-shrink-0 place-items-center overflow-hidden rounded-md bg-emce-light-soft text-base font-extrabold text-emce-dark">
          {job.company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={job.company.logoUrl} alt={job.company.name} className="h-full w-full object-cover" />
          ) : (
            job.company.name[0]?.toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-emce-text">{job.title}</h3>
            <div className="flex flex-shrink-0 items-center gap-2">
              {/* Match-score pill — only when the page passed in a
                  candidate-specific score. Same colour scale as the
                  full card on the job-detail page. */}
              {typeof matchScore === "number" && <MatchScorePill score={matchScore} />}
              {job.publishedAt && (
                <span className="hidden whitespace-nowrap text-hint text-emce-text-muted sm:inline">
                  {relativeTime(job.publishedAt)}
                </span>
              )}
            </div>
          </div>
          <p className="text-hint text-emce-text-sec">{job.company.name}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-hint text-emce-text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {job.locations.length ? job.locations.slice(0, 2).join(", ") : "Remote"}
              {job.workMode && ` · ${job.workMode.toLowerCase()}`}
            </span>
            {(job.experienceMin != null || job.experienceMax != null) && (
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                {job.experienceMin ?? 0}–{job.experienceMax ?? "+"} yrs
              </span>
            )}
            {job.publishedAt && (
              <span className="whitespace-nowrap text-emce-text-muted sm:hidden">
                {relativeTime(job.publishedAt)}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="default">{job.profileMode}</Badge>
            {/* Salary badge — two paths:
                  • `formatted` set (viewerCountry was passed): use
                    the cross-currency `display` field which is
                    "₹3.6L–₹5.2L /mo (AED 18,000–24,000)" when
                    viewer & posted currencies differ, or just one
                    string when they match.
                  • `formatted === null` (legacy callers without
                    viewerCountry, OR salary hidden, OR empty band):
                    fall back to the original `formatSalaryRange`
                    that's been on the platform — preserves the
                    pre-PR-4 visual for unmigrated call sites. */}
            {formatted ? (
              <Badge variant="success">{formatted.display}</Badge>
            ) : (
              !job.salaryHidden &&
              (job.salaryMin || job.salaryMax) && (
                <Badge variant="success">
                  {formatSalaryRange(
                    job.salaryMin ? Number(job.salaryMin) : null,
                    job.salaryMax ? Number(job.salaryMax) : null,
                    job.salaryCurrency,
                    job.salaryPeriod,
                  )}
                </Badge>
              )
            )}
            {/* Cross-border opt-in badge — only renders when the
                recruiter explicitly flagged the role as relocation-
                friendly. Helps a candidate browsing from a
                different country recognise "this is a job I can
                actually apply for from abroad" without parsing the
                JD. Pairs with the country chip on /jobs and the
                relocation toggle in the filter sidebar. */}
            {job.openToRelocation && (
              <Badge variant="outline" className="border-emce-dark/40 text-emce-dark">
                🌍 Open to relocation
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
