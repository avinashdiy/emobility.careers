import type { Country, Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { htmlOrFallback, stripHtml } from "@/lib/cms/job-sanitize";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";

/**
 * JobPosting structured data conforming to Google for Jobs requirements.
 *
 * Specification:
 *   https://developers.google.com/search/docs/appearance/structured-data/job-posting
 *
 * Required fields (Google rejects the listing if these are missing):
 *   - datePosted, description, hiringOrganization, jobLocation OR
 *     applicantLocationRequirements + jobLocationType, title, validThrough
 *
 * Recommended for ranking:
 *   - baseSalary, employmentType, identifier, directApply, educationRequirements,
 *     experienceRequirements, occupationalCategory, qualifications, skills,
 *     industry, jobBenefits.
 */

const MAP_EMPLOYMENT_TYPE: Record<string, string> = {
  FULL_TIME: "FULL_TIME",
  PART_TIME: "PART_TIME",
  CONTRACT: "CONTRACTOR",
  INTERNSHIP: "INTERN",
  TEMPORARY: "TEMPORARY",
};

const MAP_SENIORITY_TO_OCCUPATIONAL: Record<string, string> = {
  ENTRY: "Entry level",
  JUNIOR: "Associate",
  MID: "Mid-Senior level",
  SENIOR: "Mid-Senior level",
  LEAD: "Director",
  PRINCIPAL: "Executive",
};

export interface JobForSchema {
  id: string;
  slug: string;
  title: string;
  description: string;
  responsibilities: string | null;
  requirements: string | null;
  benefits: string | null;
  employmentType: string;
  workMode: string;
  seniorityLevel: string;
  locations: string[];
  /// Country this job is based in (ISO 3166-1 alpha-2). Drives the
  /// `addressCountry` on each Place + the `applicantLocationRequirements`
  /// on remote roles. Optional only for type compatibility with the
  /// pre-PR 1 dataset; new jobs always have it (Prisma default IN).
  country?: Country | null;
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: Prisma.Decimal | null;
  salaryMax: Prisma.Decimal | null;
  salaryCurrency: string;
  salaryHidden: boolean;
  publishedAt: Date | null;
  closesAt: Date | null;
  updatedAt: Date;
  company: {
    name: string;
    slug: string;
    website: string | null;
    logoUrl: string | null;
    description: string | null;
  };
  evDomains?: { evDomain: { name: string } }[];
  skills?: { skill: { name: string } }[];
}

/** Build the canonical JobPosting JSON-LD object (Google for Jobs). */
export function jobPostingJsonLd(job: JobForSchema) {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  // Canonical URL is the slug-based route. Crawlers + Google for Jobs
  // index this exact URL — `/jobs/{id}` still 308-redirects here for
  // legacy inbound links but should never appear in JSON-LD output.
  const url = `${base}/job/${job.slug}`;
  const datePosted = (job.publishedAt ?? job.updatedAt).toISOString();
  // validThrough is required — Google de-indexes JobPostings without it.
  // Default to 60 days from publish if no closesAt is set.
  const validThrough = (job.closesAt ?? new Date((job.publishedAt ?? job.updatedAt).getTime() + 60 * 24 * 3600 * 1000)).toISOString();

  // Description: structured, HTML-rich (Google prefers HTML for better
  // rendering). Post rich-text migration these fields ARE HTML already,
  // sanitised at write time. `htmlOrFallback` passes them through if
  // they contain tags, or wraps legacy plain-text rows in a `<p>` so
  // pre-migration rows still produce valid HTML. The previous code
  // ran `escapeHtml` over the description which double-escaped the
  // now-HTML content (Google saw `&lt;p&gt;...` literal markup).
  const descriptionParts: string[] = [htmlOrFallback(job.description)];
  if (job.responsibilities) descriptionParts.push(`<h3>Responsibilities</h3>${htmlOrFallback(job.responsibilities)}`);
  if (job.requirements) descriptionParts.push(`<h3>Requirements</h3>${htmlOrFallback(job.requirements)}`);
  if (job.benefits) descriptionParts.push(`<h3>Benefits</h3>${htmlOrFallback(job.benefits)}`);
  const description = descriptionParts.join("");

  // Job location: structured PostalAddress for each city; for remote, also set
  // jobLocationType: "TELECOMMUTE" + applicantLocationRequirements.
  //
  // Country attribution comes from the job's own `country` column
  // (set at post time, defaults to IN for legacy rows). Previously
  // every job was hard-coded `addressCountry: "IN"` which Google
  // for Jobs read as "India role" regardless of the actual market
  // — a UK role would surface in Indian search results, not UK
  // ones, costing us the GSC country-targeting boost. Now each
  // job lands in the right country's Google for Jobs surface.
  const isRemote = job.workMode === "REMOTE";
  const jobCountryCode: Country = (job.country ?? "IN") as Country;
  const jobLocation = job.locations.length > 0
    ? job.locations.map((loc) => ({
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: loc,
          addressCountry: jobCountryCode,
        },
      }))
    : isRemote
    ? undefined
    : [{
        "@type": "Place",
        address: { "@type": "PostalAddress", addressCountry: jobCountryCode },
      }];

  const skillsArr = (job.skills ?? []).map((s) => s.skill.name);
  const domainsArr = (job.evDomains ?? []).map((d) => d.evDomain.name);

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "@id": url,
    title: job.title,
    description,
    identifier: {
      "@type": "PropertyValue",
      name: "eMobility Careers",
      value: job.id,
    },
    datePosted,
    validThrough,
    employmentType: MAP_EMPLOYMENT_TYPE[job.employmentType] ?? job.employmentType,
    hiringOrganization: {
      "@type": "Organization",
      name: job.company.name,
      sameAs: job.company.website ?? `${base}/company/${job.company.slug}`,
      ...(job.company.logoUrl && { logo: job.company.logoUrl }),
      ...(job.company.description && { description: job.company.description }),
    },
    industry: ["Electric vehicles", ...domainsArr].filter(Boolean).join(", "),
    occupationalCategory: MAP_SENIORITY_TO_OCCUPATIONAL[job.seniorityLevel] ?? "Mid-Senior level",
    // directApply tells Google "the apply button on emobility.careers is the
    // primary apply path" and earns the "Apply on company site" badge.
    directApply: true,
    url,
  };

  if (jobLocation) schema.jobLocation = jobLocation.length === 1 ? jobLocation[0] : jobLocation;
  if (isRemote) {
    schema.jobLocationType = "TELECOMMUTE";
    schema.applicantLocationRequirements = {
      "@type": "Country",
      // Use the supported-country metadata so the name reads
      // human ("United Arab Emirates", not just "AE"). Falls back
      // to the ISO code for the (impossible-after-PR-1) case of a
      // job whose country isn't in our supported set.
      name: SUPPORTED_COUNTRIES[jobCountryCode]?.name ?? jobCountryCode,
    };
  }

  if (!job.salaryHidden && (job.salaryMin || job.salaryMax)) {
    const min = job.salaryMin ? Number(job.salaryMin) : null;
    const max = job.salaryMax ? Number(job.salaryMax) : null;
    schema.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salaryCurrency,
      value: {
        "@type": "QuantitativeValue",
        ...(min != null && { minValue: min }),
        ...(max != null && { maxValue: max }),
        unitText: "YEAR",
      },
    };
  }

  if (job.experienceMin != null || job.experienceMax != null) {
    const months = (job.experienceMin ?? 0) * 12;
    schema.experienceRequirements = {
      "@type": "OccupationalExperienceRequirements",
      monthsOfExperience: months,
    };
  }

  if (skillsArr.length > 0) schema.skills = skillsArr.join(", ");
  // jobBenefits is a plain-text Google field — strip the rich-text
  // markup so `<p><strong>` doesn't end up in the structured data.
  if (job.benefits) {
    const benefitsText = stripHtml(job.benefits);
    if (benefitsText) schema.jobBenefits = benefitsText;
  }

  return schema;
}

