import Link from "next/link";
import type { Country } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";

/**
 * Card representation of a Company — used on `/companies`,
 * `/companies/a-z`, and the new `/[cc]/companies` country pages.
 * Extracted from the previously-inline render so the same visual
 * + flag-treatment + open-jobs badge stays consistent across
 * every directory surface.
 *
 * Country flag chip rationale:
 *   We show the company's `hqCountry` flag inline next to the
 *   name — it's the strongest at-a-glance signal of "is this
 *   relevant to me" for a candidate browsing a multi-country
 *   directory. Optional (`hqCountry` could legitimately be null
 *   for legacy rows pre-PR-1 if a backfill hadn't happened — in
 *   practice every row has IN via the default).
 */

export interface CompanyCardData {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  companyType: string;
  hqLocation: string | null;
  hqCountry?: Country | null;
  description: string | null;
  /// `_count.jobs` from the Prisma select — the OPEN-jobs count.
  /// Renders the "N open jobs" badge in the bottom row.
  _count?: { jobs?: number } | null;
}

export function CompanyCard({ company }: { company: CompanyCardData }) {
  const flag = company.hqCountry
    ? SUPPORTED_COUNTRIES[company.hqCountry]?.flag
    : null;
  const openJobs = company._count?.jobs ?? 0;
  return (
    <Link href={`/company/${company.slug}`}>
      <Card variant="interactive" className="h-full">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 flex-shrink-0 place-items-center overflow-hidden rounded-md bg-emce-light-soft text-base font-extrabold text-emce-dark">
            {company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logoUrl} alt={company.name} className="h-full w-full object-cover" />
            ) : (
              company.name[0]?.toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate font-bold text-emce-text">{company.name}</h3>
              {/* Country flag — tiny chip, not a separate row.
                  Reads as "where the company is HQ'd" at a glance
                  alongside the name. */}
              {flag && (
                <span
                  aria-hidden
                  className="text-sm leading-none"
                  title={SUPPORTED_COUNTRIES[company.hqCountry!]?.name}
                >
                  {flag}
                </span>
              )}
            </div>
            <p className="truncate text-hint text-emce-text-sec">
              {company.companyType}
              {company.hqLocation && ` · ${company.hqLocation}`}
            </p>
          </div>
        </div>
        {company.description && (
          <p className="mt-3 line-clamp-2 text-body text-emce-text-sec">
            {company.description}
          </p>
        )}
        <div className="mt-3">
          <Badge variant="success">
            {openJobs} open job{openJobs === 1 ? "" : "s"}
          </Badge>
        </div>
      </Card>
    </Link>
  );
}
