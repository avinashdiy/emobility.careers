import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CompetitionCard } from "@/components/competitions/CompetitionCard";

export const metadata = { title: "Search" };

const TABS = [
  { value: "all", label: "All" },
  { value: "people", label: "People" },
  { value: "jobs", label: "Jobs" },
  { value: "companies", label: "Companies" },
  { value: "mentors", label: "Mentors" },
  { value: "competitions", label: "Competitions" },
  { value: "posts", label: "Posts" },
] as const;

type Tab = typeof TABS[number]["value"];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: Tab }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const tab: Tab = sp.tab && TABS.some((t) => t.value === sp.tab) ? sp.tab : "all";
  const TAKE_PER_GROUP = tab === "all" ? 5 : 30;

  const showPeople = tab === "all" || tab === "people";
  const showJobs = tab === "all" || tab === "jobs";
  const showCompanies = tab === "all" || tab === "companies";
  const showMentors = tab === "all" || tab === "mentors";
  const showComps = tab === "all" || tab === "competitions";
  const showPosts = tab === "all" || tab === "posts";

  const [people, jobs, companies, mentors, competitions, posts] = await Promise.all([
    showPeople && q
      ? db.candidateProfile.findMany({
          where: {
            cvVisibility: { in: ["EVERYONE", "EMPLOYERS_ONLY"] },
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { headline: { contains: q, mode: "insensitive" } },
              { institution: { contains: q, mode: "insensitive" } },
            ],
          },
          take: TAKE_PER_GROUP,
          orderBy: { followersCount: "desc" },
          select: {
            id: true, slug: true, firstName: true, lastName: true, headline: true,
            profilePhotoUrl: true, isDIYguruVerified: true, personType: true,
          },
        })
      : Promise.resolve([]),
    showJobs && q
      ? db.jobPosting.findMany({
          where: {
            status: "OPEN",
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
          take: TAKE_PER_GROUP,
          orderBy: { publishedAt: "desc" },
          select: {
            id: true, slug: true, title: true, locations: true, workMode: true,
            company: { select: { name: true, logoUrl: true, slug: true } },
          },
        })
      : Promise.resolve([]),
    showCompanies && q
      ? db.company.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
          take: TAKE_PER_GROUP,
          select: { id: true, slug: true, name: true, logoUrl: true, hqLocation: true, teamSize: true, _count: { select: { jobs: true } } },
        })
      : Promise.resolve([]),
    showMentors && q
      ? db.mentorProfile.findMany({
          where: {
            isPublished: true, kycStatus: "APPROVED",
            OR: [
              { headline: { contains: q, mode: "insensitive" } },
              { bio: { contains: q, mode: "insensitive" } },
              { expertiseTags: { has: q.toLowerCase() } },
            ],
          },
          take: TAKE_PER_GROUP,
          orderBy: { avgRating: "desc" },
          include: {
            user: {
              select: {
                candidateProfile: { select: { firstName: true, lastName: true, slug: true, profilePhotoUrl: true, isDIYguruVerified: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    showComps && q
      ? db.competition.findMany({
          where: {
            status: { in: ["LIVE", "JUDGING", "RESULTS"] },
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
          take: TAKE_PER_GROUP,
          orderBy: { startsAt: "desc" },
          include: {
            hostCompany: { select: { id: true, slug: true, name: true, logoUrl: true } },
            prizes: { orderBy: { rank: "asc" } },
            _count: { select: { registrations: true, perks: true } },
          },
        })
      : Promise.resolve([]),
    showPosts && q
      ? db.post.findMany({
          where: {
            visibility: "PUBLIC",
            OR: [
              { body: { contains: q, mode: "insensitive" } },
              { hashtags: { has: q.toLowerCase().replace(/^#/, "") } },
            ],
          },
          take: TAKE_PER_GROUP,
          orderBy: { createdAt: "desc" },
          include: {
            author: { select: { candidateProfile: { select: { firstName: true, lastName: true, slug: true, profilePhotoUrl: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);

  const totalResults = people.length + jobs.length + companies.length + mentors.length + competitions.length + posts.length;

  return (
    <>
      <SiteHeader />
      <div className="container max-w-5xl py-6 md:py-8">
        <form className="flex gap-2">
          <Input name="q" defaultValue={q} placeholder="Search people, jobs, mentors, competitions, posts…" autoFocus />
          <Button type="submit">Search</Button>
        </form>

        {q && (
          <>
            <p className="mt-3 text-sm text-emce-text-sec">
              {totalResults} result{totalResults === 1 ? "" : "s"} for <strong className="text-emce-text">"{q}"</strong>
            </p>
            <nav className="mt-4 flex gap-1 overflow-x-auto rounded-md border border-emce-border p-1">
              {TABS.map((t) => (
                <Link
                  key={t.value}
                  href={`/search?q=${encodeURIComponent(q)}&tab=${t.value}`}
                  className={`rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${t.value === tab ? "bg-emce-light-soft text-emce-darkest" : "text-emce-text-sec hover:text-emce-text"}`}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          </>
        )}

        {!q && (
          <EmptyState
            icon="🔎"
            title="Search anything across the platform"
            body="People, jobs, companies, mentors, competitions, and posts — all indexed in one place."
            className="mt-6"
          />
        )}

        {q && totalResults === 0 && (
          <EmptyState
            icon="🤔"
            title="No matches"
            body="Try a different keyword or check the spelling."
            className="mt-6"
          />
        )}

        <div className="mt-6 space-y-8">
          {people.length > 0 && (
            <Section title="People" allHref={`/search?q=${encodeURIComponent(q)}&tab=people`} showAll={tab === "all"}>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {people.map((p) => {
                  const name = `${p.firstName} ${p.lastName ?? ""}`.trim();
                  return (
                    <li key={p.id}>
                      <Card className="h-full">
                        <Link href={`/${p.slug}`} className="flex items-start gap-3">
                          <Avatar src={p.profilePhotoUrl} name={name} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-emce-text hover:underline">{name}</span>
                              {p.isDIYguruVerified && <Badge variant="verified" className="text-[10px]">⭐</Badge>}
                            </div>
                            {p.headline && <p className="line-clamp-2 text-hint text-emce-text-sec">{p.headline}</p>}
                            <Badge variant="outline" className="mt-1 text-[10px]">{p.personType}</Badge>
                          </div>
                        </Link>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {mentors.length > 0 && (
            <Section title="Mentors" allHref={`/search?q=${encodeURIComponent(q)}&tab=mentors`} showAll={tab === "all"}>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mentors.map((m) => {
                  const cp = m.user.candidateProfile;
                  const name = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : "Mentor";
                  return (
                    <li key={m.id}>
                      <Card className="h-full">
                        <Link href={cp ? `/mentors/${cp.slug}` : "#"} className="flex items-start gap-3">
                          <Avatar src={cp?.profilePhotoUrl} name={name} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-emce-text hover:underline">{name}</div>
                            <p className="line-clamp-2 text-hint text-emce-text-sec">{m.headline}</p>
                          </div>
                        </Link>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {jobs.length > 0 && (
            <Section title="Jobs" allHref={`/search?q=${encodeURIComponent(q)}&tab=jobs`} showAll={tab === "all"}>
              <ul className="space-y-2">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <Card>
                      <div className="flex items-start gap-3">
                        <Avatar src={j.company.logoUrl} name={j.company.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/jobs/${j.id}`} className="font-bold text-emce-text hover:underline">{j.title}</Link>
                          <p className="text-hint text-emce-text-sec">
                            {j.company.name} · {j.locations.join(", ") || "Remote"} · {j.workMode}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {companies.length > 0 && (
            <Section title="Companies" allHref={`/search?q=${encodeURIComponent(q)}&tab=companies`} showAll={tab === "all"}>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {companies.map((c) => (
                  <li key={c.id}>
                    <Card>
                      <Link href={`/companies/${c.slug}`} className="flex items-start gap-3">
                        <Avatar src={c.logoUrl} name={c.name} size="md" />
                        <div className="min-w-0">
                          <div className="font-bold text-emce-text hover:underline">{c.name}</div>
                          <p className="text-hint text-emce-text-sec">{c.hqLocation ?? "—"} · {c._count.jobs} open roles</p>
                        </div>
                      </Link>
                    </Card>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {competitions.length > 0 && (
            <Section title="Competitions" allHref={`/search?q=${encodeURIComponent(q)}&tab=competitions`} showAll={tab === "all"}>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {competitions.map((c) => (
                  <li key={c.id}>
                    <CompetitionCard c={c} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {posts.length > 0 && (
            <Section title="Posts" allHref={`/search?q=${encodeURIComponent(q)}&tab=posts`} showAll={tab === "all"}>
              <ul className="space-y-2">
                {posts.map((p) => {
                  const name = p.author.candidateProfile ? `${p.author.candidateProfile.firstName} ${p.author.candidateProfile.lastName ?? ""}`.trim() : "Author";
                  return (
                    <li key={p.id}>
                      <Card>
                        <Link href={`/posts/${p.id}`} className="block">
                          <div className="flex items-center gap-2 text-sm">
                            <Avatar src={p.author.candidateProfile?.profilePhotoUrl} name={name} size="sm" />
                            <span className="font-bold text-emce-text">{name}</span>
                          </div>
                          <p className="mt-2 line-clamp-3 text-sm text-emce-text">{p.body}</p>
                        </Link>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
        </div>
      </div>
      <SiteFooter />
    </>
  );
}

function Section({ title, allHref, showAll, children }: { title: string; allHref: string; showAll: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-section text-emce-text">{title}</h2>
        {showAll && (
          <Link href={allHref} className="text-xs font-bold text-emce-dark hover:underline">See all →</Link>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
