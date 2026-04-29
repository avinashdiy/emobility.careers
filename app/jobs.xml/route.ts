import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Public XML feed of all OPEN job postings — designed to be ingested by
 * job-search aggregators that prefer XML over schema.org:
 *
 *   - LinkedIn Limited Listings ("Job Wrapping")
 *   - Indeed (Common XML feed)
 *   - Glassdoor, ZipRecruiter, etc.
 *
 * Format is the lowest-common-denominator <source><job>…</job></source>
 * structure that all three accept. Cached for 1 hour.
 *
 * To register with LinkedIn Recruiter:
 *   https://docs.microsoft.com/en-us/linkedin/talent/job-postings/xml-feeds
 *   Submit https://emobility.careers/jobs.xml to LinkedIn Talent Hub support.
 *
 * To register with Indeed:
 *   https://docs.indeed.com/xml-feed
 *   Add the feed URL via your Indeed Employer dashboard.
 */

export const runtime = "nodejs";
// Rendered on demand at the edge / Caddy cache via the Cache-Control header below.
// We don't `force-static` because the build runs without a DB.
export const dynamic = "force-dynamic";

const MAP_JOBTYPE: Record<string, string> = {
  FULL_TIME: "fulltime",
  PART_TIME: "parttime",
  CONTRACT: "contract",
  INTERNSHIP: "internship",
  TEMPORARY: "temporary",
};

function escape(xml: string): string {
  return xml
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(text: string): string {
  // CDATA can't contain "]]>" — escape any occurrences.
  return `<![CDATA[${text.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function describeForFeed(job: {
  description: string;
  responsibilities: string | null;
  requirements: string | null;
  benefits: string | null;
}): string {
  const parts: string[] = [];
  parts.push(`<p>${escape(job.description)}</p>`);
  if (job.responsibilities) parts.push(`<h3>Responsibilities</h3><p>${escape(job.responsibilities)}</p>`);
  if (job.requirements) parts.push(`<h3>Requirements</h3><p>${escape(job.requirements)}</p>`);
  if (job.benefits) parts.push(`<h3>Benefits</h3><p>${escape(job.benefits)}</p>`);
  return parts.join("");
}

export async function GET() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const jobs = await db.jobPosting.findMany({
    where: { status: "OPEN", company: { verificationStatus: "VERIFIED" } },
    orderBy: { publishedAt: "desc" },
    take: 5000, // hard cap per feed; LinkedIn accepts paginated feeds — split into multiple if needed
    include: {
      company: { select: { name: true, slug: true, logoUrl: true, website: true } },
      skills: { include: { skill: { select: { name: true } } } },
      evDomains: { include: { evDomain: { select: { name: true } } } },
    },
  });

  const lastBuild = new Date().toUTCString();

  const items = jobs.map((j) => {
    const url = `${base}/jobs/${j.id}`;
    const datePosted = (j.publishedAt ?? j.updatedAt).toISOString();
    const validThrough = (j.closesAt ?? new Date(datePosted).valueOf() + 60 * 24 * 3600 * 1000);
    const expirationDate = typeof validThrough === "number"
      ? new Date(validThrough).toISOString()
      : (validThrough as Date).toISOString();
    const city = j.locations[0] ?? "";
    const isRemote = j.workMode === "REMOTE";
    const salary = !j.salaryHidden && (j.salaryMin || j.salaryMax)
      ? `${j.salaryMin ? Number(j.salaryMin) : ""}${j.salaryMin && j.salaryMax ? "-" : ""}${j.salaryMax ? Number(j.salaryMax) : ""} ${j.salaryCurrency}/year`
      : "";
    const expRange = (j.experienceMin != null || j.experienceMax != null)
      ? `${j.experienceMin ?? 0}-${j.experienceMax ?? "+"} years`
      : "";
    const category = (j.evDomains[0]?.evDomain.name) ?? "Electric Vehicles";
    const skillsList = j.skills.map((s) => s.skill.name).join(", ");

    return `  <job>
    <id>${escape(j.id)}</id>
    <referencenumber>${escape(j.id)}</referencenumber>
    <requisitionid>${escape(j.id)}</requisitionid>
    <title>${cdata(j.title)}</title>
    <date>${datePosted}</date>
    <expirationdate>${expirationDate}</expirationdate>
    <url>${escape(url)}</url>
    <company>${cdata(j.company.name)}</company>
    ${j.company.logoUrl ? `<logo>${escape(j.company.logoUrl)}</logo>` : ""}
    ${j.company.website ? `<companyurl>${escape(j.company.website)}</companyurl>` : ""}
    <city>${escape(city)}</city>
    <state></state>
    <country>India</country>
    <postalcode></postalcode>
    <jobtype>${escape(MAP_JOBTYPE[j.employmentType] ?? "fulltime")}</jobtype>
    <category>${cdata(category)}</category>
    ${skillsList ? `<skills>${cdata(skillsList)}</skills>` : ""}
    ${expRange ? `<experience>${escape(expRange)}</experience>` : ""}
    ${salary ? `<salary>${escape(salary)}</salary>` : ""}
    <remote>${isRemote ? "yes" : "no"}</remote>
    <description>${cdata(describeForFeed(j))}</description>
  </job>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<source>
  <publisher>eMobility Careers</publisher>
  <publisherurl>${base}</publisherurl>
  <lastbuilddate>${lastBuild}</lastbuilddate>
${items.join("\n")}
</source>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
