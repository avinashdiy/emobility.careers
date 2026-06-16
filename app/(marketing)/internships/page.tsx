import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { searchJobs } from "@/server/jobs/queries";
import { JobCard } from "@/components/jobs/JobCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getViewerCountry } from "@/lib/viewer-country";
import { prewarmRates } from "@/lib/currency";

/**
 * /internships — dedicated EV internship landing. GSC already shows
 * "summer internship 2026" / "ev internships" driving real clicks with
 * NO dedicated page; this captures that intent with one indexable hub
 * (employmentType = INTERNSHIP), reusing the real job query + JobCard.
 */
const PAGE_SIZE = 24;

export const metadata: Metadata = {
  title: "EV Internships in India — battery, charging, software & more",
  description:
    "Live EV-industry internships across India — battery, charging, motors, vehicle engineering and software. Summer + year-round internships at OEMs, startups and suppliers. Apply free on eMobility Careers.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/internships` },
  openGraph: {
    type: "website",
    title: "EV Internships in India",
    description:
      "Live EV-industry internships across India — apply free on eMobility Careers.",
    siteName: "eMobility Careers",
  },
};

export default async function InternshipsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const session = await auth();

  let viewerIsDIYguru = false;
  if (session?.user) {
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { isDIYguruVerified: true },
    });
    viewerIsDIYguru = profile?.isDIYguruVerified ?? false;
  }

  const { jobs, total, pages } = await searchJobs({
    employmentType: "INTERNSHIP",
    viewerIsDIYguru,
    page,
    pageSize: PAGE_SIZE,
  });

  const viewerCountry = await getViewerCountry();
  await prewarmRates([viewerCountry, ...jobs.map((j) => j.country)]);

  return (
    <div className="container max-w-4xl py-8 md:py-12">
      <h1 className="text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
        EV internships in India
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-emce-text-sec md:text-base">
        {total > 0
          ? `${total.toLocaleString("en-IN")} live internship${total === 1 ? "" : "s"} across battery, charging, motors, vehicle engineering and software — at OEMs, startups and suppliers.`
          : "No internships are open right now — new ones are posted regularly. Browse all EV jobs or create a profile to get matched."}
      </p>

      <div className="mt-6">
        {jobs.length === 0 ? (
          <EmptyState
            icon="🎓"
            title="No internships open right now"
            body="EV internships go live throughout the year — especially before summer. Browse the full board or set up a profile to get matched the moment one opens."
            action={
              <Button asChild>
                <Link href="/jobs">Browse all EV jobs →</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {jobs.map((j) => (
              <li key={j.id}>
                <JobCard job={j} matchScore={null} viewerCountry={viewerCountry} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/internships?page=${page - 1}`}>← Prev</Link>
            </Button>
          )}
          <span className="text-sm text-emce-text-sec">Page {page} of {pages}</span>
          {page < pages && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/internships?page=${page + 1}`}>Next →</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
