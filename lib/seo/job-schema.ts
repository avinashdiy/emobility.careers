import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";

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

  // Description: structured, HTML-rich (Google prefers HTML for better rendering)
  const descriptionParts: string[] = [`<p>${escapeHtml(job.description)}</p>`];
  if (job.responsibilities) descriptionParts.push(`<h3>Responsibilities</h3>${plainToHtml(job.responsibilities)}`);
  if (job.requirements) descriptionParts.push(`<h3>Requirements</h3>${plainToHtml(job.requirements)}`);
  if (job.benefits) descriptionParts.push(`<h3>Benefits</h3>${plainToHtml(job.benefits)}`);
  const description = descriptionParts.join("");

  // Job location: structured PostalAddress for each city; for remote, also set
  // jobLocationType: "TELECOMMUTE" + applicantLocationRequirements.
  const isRemote = job.workMode === "REMOTE";
  const jobLocation = job.locations.length > 0
    ? job.locations.map((loc) => ({
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: loc,
          addressCountry: "IN",
        },
      }))
    : isRemote
    ? undefined
    : [{
        "@type": "Place",
        address: { "@type": "PostalAddress", addressCountry: "IN" },
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
      name: "India",
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
  if (job.benefits) schema.jobBenefits = job.benefits;

  return schema;
}

function plainToHtml(text: string): string {
  // Convert bullet-style plain text to a simple <ul>; otherwise keep paragraphs.
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const isBulletList = lines.length > 1 && lines.every((l) => /^[-•*]/.test(l));
  if (isBulletList) {
    return `<ul>${lines.map((l) => `<li>${escapeHtml(l.replace(/^[-•*]\s*/, ""))}</li>`).join("")}</ul>`;
  }
  return lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
