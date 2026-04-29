import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { listCompetitions } from "@/server/competitions/queries";
import { CompetitionCard } from "@/components/competitions/CompetitionCard";
import { isFeatureOff, FeatureOffNotice } from "@/components/layout/FeatureGate";

export const metadata = {
  title: "EV competitions & challenges",
  description: "Hackathons, case studies, design challenges and more — hosted by EV companies on eMobility Careers.",
};

const TYPE_OPTIONS = [
  { value: "", label: "Any type" },
  { value: "HACKATHON", label: "Hackathon" },
  { value: "CASE_STUDY", label: "Case study" },
  { value: "QUIZ", label: "Quiz" },
  { value: "DESIGN_CHALLENGE", label: "Design challenge" },
  { value: "INNOVATION", label: "Innovation challenge" },
  { value: "INTERNSHIP_HUNT", label: "Internship hunt" },
  { value: "IDEATHON", label: "Ideathon" },
  { value: "RESEARCH", label: "Research challenge" },
];

export default async function CompetitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; domain?: string; status?: "live" | "upcoming" | "results" }>;
}) {
  if (await isFeatureOff("feature.competitions_enabled")) return <FeatureOffNotice title="Competitions" />;
  const sp = await searchParams;
  const [list, evDomains] = await Promise.all([
    listCompetitions({ q: sp.q, type: sp.type, domain: sp.domain, status: sp.status ?? undefined }),
    db.eVDomain.findMany({ orderBy: { order: "asc" } }),
  ]);

  return (
    <>
      <SiteHeader />
      <div className="container max-w-6xl py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-dashboard text-emce-text md:text-3xl">EV competitions & challenges</h1>
            <p className="mt-1 max-w-2xl text-sm text-emce-text-sec">
              Hackathons, ideathons, case studies, and design challenges from EV companies and institutes. Win prize money or just sharpen your craft.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/employer/competitions/new">Host a competition →</Link>
          </Button>
        </div>

        <Card className="mt-6">
          <form className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-4">
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search by name or description" />
            </div>
            <div className="sm:col-span-3">
              <NativeSelect name="type" defaultValue={sp.type ?? ""}>
                {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <NativeSelect name="domain" defaultValue={sp.domain ?? ""}>
                <option value="">Any domain</option>
                {evDomains.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <NativeSelect name="status" defaultValue={sp.status ?? ""}>
                <option value="">All</option>
                <option value="live">Live now</option>
                <option value="upcoming">Upcoming</option>
                <option value="results">Results out</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-1">
              <Button type="submit" className="w-full">Go</Button>
            </div>
          </form>
        </Card>

        <p className="mt-4 text-sm text-emce-text-sec">{list.length} competitions</p>

        <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <li key={c.id}>
              <CompetitionCard c={c} />
            </li>
          ))}
        </ul>

        {list.length === 0 && (
          <Card className="mt-6 p-10 text-center">
            <div className="text-4xl">🏁</div>
            <p className="mt-3 text-section text-emce-text">No competitions match your filters</p>
            <p className="mt-1 text-sm text-emce-text-sec">Try clearing them or check back tomorrow.</p>
          </Card>
        )}
      </div>
      <SiteFooter />
    </>
  );
}
