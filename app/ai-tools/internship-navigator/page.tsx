import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InternshipNavigatorForm } from "@/components/ai-tools/InternshipNavigatorForm";
import { env } from "@/lib/env";
import { EmploymentType, JobStatus } from "@prisma/client";

export const metadata: Metadata = {
  title: "Internship Hunt Navigator — AI-ranked EV internships",
  description:
    "Find the right EV internship for your skill set. We re-rank live postings against your profile and flag the skills to close before applying.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/ai-tools/internship-navigator` },
};

export default async function InternshipNavigatorPage() {
  const [evDomains, internshipCount] = await Promise.all([
    db.eVDomain.findMany({
      orderBy: { order: "asc" },
      select: { slug: true, name: true },
    }),
    // Surface the live count so candidates know the pool size before
    // they fill the form — keeps expectations honest on a young
    // platform where the number is sometimes small.
    db.jobPosting.count({
      where: {
        status: JobStatus.OPEN,
        employmentType: EmploymentType.INTERNSHIP,
      },
    }),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <section className="emce-hero-gradient text-white">
          <div className="container max-w-3xl py-12 md:py-16">
            <p className="text-hint font-bold uppercase tracking-wide text-emce-mid">
              AI Tool · Free · No signup needed
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight md:text-4xl">
              🎯 Internship Hunt Navigator
            </h1>
            <p className="mt-3 max-w-2xl text-white/85">
              We re-rank live EV internship postings against your skill set and
              goals, surface the 5 strongest matches, and flag the 2-3 skills
              you should close before applying.
            </p>
            <div className="mt-4">
              <Badge className="bg-emce-mid text-emce-darkest">
                {internshipCount.toLocaleString()} open EV internship
                {internshipCount === 1 ? "" : "s"} in the database right now
              </Badge>
            </div>
          </div>
        </section>

        <div className="container max-w-3xl py-8 md:py-10">
          <InternshipNavigatorForm evDomains={evDomains} />

          <Card className="mt-6 bg-emce-light-soft">
            <h3 className="text-section text-emce-text">What this does (and doesn&apos;t)</h3>
            <ul className="mt-2 space-y-1 text-sm text-emce-text">
              <li>
                ✅ <strong>Does:</strong> re-rank the internships we have right
                now against your skills, location prefs, and goal.
              </li>
              <li>
                ✅ <strong>Does:</strong> tell you the 2-3 things to learn to
                push a &ldquo;stretch&rdquo; match into &ldquo;strong&rdquo;.
              </li>
              <li>
                ❌ <strong>Doesn&apos;t:</strong> apply for you, or invent
                roles that don&apos;t exist on the platform. We only re-rank
                real postings.
              </li>
            </ul>
            <p className="mt-3 text-hint text-emce-text-sec">
              Already know what to focus on?{" "}
              <Link href="/jobs?employmentType=INTERNSHIP" className="font-bold text-emce-dark underline">
                Browse internships directly →
              </Link>
            </p>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
