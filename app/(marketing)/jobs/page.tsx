import Link from "next/link";
import { searchJobs } from "@/server/jobs/queries";
import { db } from "@/lib/db";
import { JobCard } from "@/components/jobs/JobCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";

export const metadata = { title: "Browse EV jobs" };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; location?: string; domain?: string; workMode?: string; profileMode?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const filter = {
    q: sp.q,
    location: sp.location,
    domain: sp.domain,
    workMode: sp.workMode,
    profileMode: sp.profileMode,
    page: sp.page ? parseInt(sp.page) : 1,
  };
  const { jobs, total, page, pages } = await searchJobs(filter);
  const evDomains = await db.eVDomain.findMany({ orderBy: { order: "asc" } });

  return (
    <div className="container py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="default">EV Jobs</Badge>
          <h1 className="mt-2 text-dashboard text-emce-text md:text-3xl">
            {total > 0 ? `${total.toLocaleString()} EV jobs` : "EV jobs"}
          </h1>
        </div>
        {(filter.q || filter.location || filter.domain) && (
          <Button asChild variant="outline" size="sm">
            <Link href="/me/alerts">🔔 Save this search as alert</Link>
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <Card className="mb-6 p-4">
        <form className="grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <Input name="q" defaultValue={filter.q ?? ""} placeholder="Title, skill, company" />
          </div>
          <div className="sm:col-span-3">
            <Input name="location" defaultValue={filter.location ?? ""} placeholder="Location or 'Remote'" />
          </div>
          <div className="sm:col-span-2">
            <NativeSelect name="workMode" defaultValue={filter.workMode ?? ""}>
              <option value="">Any work mode</option>
              <option value="ONSITE">On-site</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
            </NativeSelect>
          </div>
          <div className="sm:col-span-2">
            <NativeSelect name="profileMode" defaultValue={filter.profileMode ?? ""}>
              <option value="">Any profile</option>
              <option value="FRESHER">Fresher</option>
              <option value="EXPERIENCED">Experienced</option>
              <option value="TECHNICIAN">Technician</option>
              <option value="LEADERSHIP">Leadership</option>
            </NativeSelect>
          </div>
          <div className="sm:col-span-1">
            <Button type="submit" className="w-full">Search</Button>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/jobs"
            className="rounded-full bg-emce-light-soft px-3 py-1 text-xs font-bold text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
          >
            All
          </Link>
          {evDomains.map((d) => (
            <Link
              key={d.slug}
              href={`/jobs?domain=${d.slug}`}
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                filter.domain === d.slug
                  ? "bg-emce-dark text-emce-light"
                  : "bg-emce-light-soft text-emce-dark hover:bg-emce-mid hover:text-emce-darkest"
              }`}
            >
              {d.name}
            </Link>
          ))}
        </div>
      </Card>

      {jobs.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="text-4xl">🔎</div>
          <h2 className="mt-3 text-section text-emce-text">No jobs match your filters</h2>
          <p className="mt-1 text-hint text-emce-text-sec">Try removing a filter or browsing by domain.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => (
            <li key={j.id}>
              <JobCard job={j} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/jobs?${new URLSearchParams({ ...sp, page: String(page - 1) })}`}>← Prev</Link>
            </Button>
          )}
          <span className="text-sm text-emce-text-sec">Page {page} of {pages}</span>
          {page < pages && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/jobs?${new URLSearchParams({ ...sp, page: String(page + 1) })}`}>Next →</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
