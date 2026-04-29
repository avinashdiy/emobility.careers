import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { formatSalaryRange, relativeTime } from "@/lib/utils";
import { MapPin, Briefcase } from "lucide-react";

export interface JobCardData {
  id: string;
  slug: string;
  title: string;
  workMode: string;
  profileMode: string;
  locations: string[];
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: Prisma.Decimal | number | string | null;
  salaryMax: Prisma.Decimal | number | string | null;
  salaryCurrency: string;
  salaryHidden: boolean;
  publishedAt: Date | null;
  company: {
    name: string;
    slug: string;
    logoUrl: string | null;
  };
}

export function JobCard({ job }: { job: JobCardData }) {
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
            {job.publishedAt && (
              <span className="hidden flex-shrink-0 whitespace-nowrap text-hint text-emce-text-muted sm:inline">
                {relativeTime(job.publishedAt)}
              </span>
            )}
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
            {!job.salaryHidden && (job.salaryMin || job.salaryMax) && (
              <Badge variant="success">
                {formatSalaryRange(
                  job.salaryMin ? Number(job.salaryMin) : null,
                  job.salaryMax ? Number(job.salaryMax) : null,
                  job.salaryCurrency,
                )}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
