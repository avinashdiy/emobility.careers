import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { JobCard } from "@/components/jobs/JobCard";
import { FollowCompanyButton } from "@/components/social/FollowButton";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { breadcrumbJsonLd, organizationJsonLd } from "@/lib/seo/schemas";
import { getCompanyResponseStats, getRecruiterRating } from "@/lib/sla";
import { ResponseTimePill } from "@/components/recruiter/ResponseTimePill";
import { RecruiterRating } from "@/components/recruiter/RecruiterRating";
import { Globe, MapPin, Users } from "lucide-react";

const TABS = ["home", "jobs", "events", "people"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const company = await db.company.findUnique({ where: { slug } });
  return company
    ? { title: company.name, description: company.description ?? `${company.name} on eMobility Careers` }
    : { title: "Company not found" };
}

export default async function PublicCompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const activeTab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as Tab)
    : "home";

  const session = await auth();

  const company = await db.company.findUnique({
    where: { slug },
    include: {
      jobs: {
        where: { status: "OPEN" },
        orderBy: { publishedAt: "desc" },
        take: 20,
        include: { company: { select: { name: true, slug: true, logoUrl: true } } },
      },
      _count: { select: { jobs: { where: { status: "OPEN" } }, followedBy: true, experienceLinks: true } },
    },
  });
  if (!company) notFound();

  // Recruiter response-time stats — median time from APPLIED to first
  // forward stage move, scoped to last 90 days. Returns null when there
  // aren't enough samples; the pill component hides itself in that case.
  const [responseStats, recruiterRating, upcomingEvents, pastEvents] = await Promise.all([
    getCompanyResponseStats(company.id),
    getRecruiterRating(company.id),
    db.event.findMany({
      where: {
        companyId: company.id,
        status: { in: ["OPEN", "CANCELLED"] },
        startsAt: { gte: new Date() },
      },
      orderBy: { startsAt: "asc" },
      take: 12,
      include: {
        _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
      },
    }),
    db.event.findMany({
      where: {
        companyId: company.id,
        OR: [{ status: "COMPLETED" }, { startsAt: { lt: new Date() } }],
      },
      orderBy: { startsAt: "desc" },
      take: 6,
      include: {
        _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
      },
    }),
  ]);

  // People who currently work here (Experience.current === true linked to
  // this Company via the new FK). LinkedIn shows this on the People tab.
  const peopleHere = await db.experience.findMany({
    where: {
      companyId: company.id,
      candidate: { cvVisibility: "EVERYONE" },
    },
    orderBy: [{ current: "desc" }, { startDate: "desc" }],
    take: 24,
    include: {
      candidate: {
        select: {
          id: true, slug: true, firstName: true, lastName: true,
          headline: true, profilePhotoUrl: true,
        },
      },
    },
  });
  // Dedupe — a candidate might have multiple roles at the same company
  const seenCandidate = new Set<string>();
  const uniquePeople = peopleHere.filter((p) => {
    if (seenCandidate.has(p.candidate.id)) return false;
    seenCandidate.add(p.candidate.id);
    return true;
  });

  // Is the viewer following?
  const isFollowing = session?.user
    ? Boolean(
        await db.follow.findUnique({
          where: {
            followerId_followeeCompanyId: {
              followerId: session.user.id,
              followeeCompanyId: company.id,
            },
          },
          select: { id: true },
        }),
      )
    : false;

  const orgLd = organizationJsonLd({
    name: company.name,
    slug: company.slug,
    website: company.website,
    logoUrl: company.logoUrl,
    description: company.description,
    hqLocation: company.hqLocation,
    foundedYear: company.foundedYear,
  });
  const breadcrumbLd = breadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "Companies", href: "/companies" },
    { name: company.name, href: `/company/${company.slug}` },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <SiteHeader />

      <div className="container max-w-5xl py-4 sm:py-6">
        {/* LinkedIn-style company header card */}
        <Card className="overflow-hidden p-0 shadow-sm">
          <div
            className={`h-32 sm:h-44 ${company.bannerUrl ? "" : "emce-hero-gradient"}`}
            style={
              company.bannerUrl
                ? { backgroundImage: `url(${company.bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                : undefined
            }
          />
          <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
            {/* Logo — square, white background, overlaps banner like LinkedIn */}
            <div className="absolute left-4 top-0 -translate-y-1/2 sm:left-6">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-lg border border-emce-border bg-white text-2xl font-extrabold text-emce-dark shadow-sm sm:h-32 sm:w-32">
                {company.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={company.logoUrl} alt={company.name} className="h-full w-full object-cover" />
                ) : (
                  company.name[0]?.toUpperCase()
                )}
              </div>
            </div>
            <div className="h-14 sm:h-18" />

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h1 className="text-2xl font-bold leading-tight text-emce-text sm:text-[28px]">{company.name}</h1>
                {company.verificationStatus === "VERIFIED" && (
                  <Badge variant="verified" className="text-[10px]">Verified</Badge>
                )}
                <RecruiterRating rating={recruiterRating} variant="pill" className="ml-1" />
                <ResponseTimePill stats={responseStats} className="ml-1" />
              </div>
              {company.description && (
                <p className="text-[15px] text-emce-text">{company.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-emce-text-sec">
                <span>{company.companyType?.replace("_", " ").toLowerCase()}</span>
                {company.hqLocation && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {company.hqLocation}
                  </span>
                )}
                {company.teamSize && <span>{company.teamSize} employees</span>}
                {company.website && (
                  <a href={company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-emce-dark">
                    <Globe className="h-3.5 w-3.5" /> Website
                  </a>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
                <span className="font-bold text-emce-dark">
                  {company._count.followedBy.toLocaleString()} <span className="font-normal text-emce-text-sec">followers</span>
                </span>
                <span className="text-emce-text-sec">·</span>
                <span className="font-bold text-emce-dark">
                  {company._count.experienceLinks.toLocaleString()} <span className="font-normal text-emce-text-sec">on the platform</span>
                </span>
              </div>
            </div>

            {/* Action buttons row */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <FollowCompanyButton
                companyId={company.id}
                initialFollowing={isFollowing}
                signedIn={Boolean(session?.user)}
              />
              {company.website && (
                <Button asChild variant="outline" size="sm">
                  <a href={company.website} target="_blank" rel="noopener noreferrer">Visit website</a>
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href={`/company/${company.slug}?tab=jobs`}>{company._count.jobs} open jobs</Link>
              </Button>
            </div>
          </div>

          {/* Tabs — Home / Jobs / People (LinkedIn-style thin underline) */}
          <nav className="border-t border-emce-border" aria-label="Company sections">
            <ul className="flex overflow-x-auto px-2 sm:px-4">
              {TABS.map((t) => (
                <li key={t}>
                  <Link
                    href={`/company/${company.slug}?tab=${t}`}
                    className={`block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold capitalize transition-colors ${
                      activeTab === t
                        ? "border-emce-dark text-emce-text"
                        : "border-transparent text-emce-text-sec hover:border-emce-border hover:text-emce-text"
                    }`}
                  >
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </Card>

        {/* Tab content */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {activeTab === "home" && (
              <>
                {company.about && (
                  <Card>
                    <h2 className="text-section text-emce-text">About</h2>
                    <p className="mt-2 whitespace-pre-line text-sm text-emce-text">{company.about}</p>
                  </Card>
                )}
                {company.jobs.length > 0 && (
                  <Card>
                    <div className="flex items-center justify-between">
                      <h2 className="text-section text-emce-text">Latest jobs</h2>
                      <Link href={`/company/${company.slug}?tab=jobs`} className="text-xs font-bold text-emce-dark hover:underline">
                        See all {company._count.jobs}
                      </Link>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {company.jobs.slice(0, 3).map((j) => (
                        <li key={j.id}><JobCard job={j} /></li>
                      ))}
                    </ul>
                  </Card>
                )}
              </>
            )}

            {activeTab === "jobs" && (
              <Card>
                <h2 className="text-section text-emce-text">Open positions ({company.jobs.length})</h2>
                {company.jobs.length === 0 ? (
                  <EmptyState
                    className="mt-3 border-0 p-6"
                    icon="💼"
                    title="No open positions right now"
                    body="Follow the company to be notified when new roles open."
                  />
                ) : (
                  <ul className="mt-3 space-y-2">
                    {company.jobs.map((j) => (
                      <li key={j.id}><JobCard job={j} /></li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {activeTab === "events" && (
              <>
                <Card>
                  <div className="flex items-center justify-between">
                    <h2 className="text-section text-emce-text">
                      Upcoming events & webinars
                    </h2>
                    <Badge variant="outline" className="text-[10px]">{upcomingEvents.length}</Badge>
                  </div>
                  {upcomingEvents.length === 0 ? (
                    <EmptyState
                      className="mt-3 border-0 p-6"
                      icon="📅"
                      title="No upcoming events"
                      body={`Follow ${company.name} to be notified when they host one.`}
                    />
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {upcomingEvents.map((e) => (
                        <li key={e.id}>
                          <Link
                            href={`/events/${e.slug}`}
                            className="block rounded-md border border-emce-border p-3 transition hover:border-emce-mid hover:shadow-emce-hover"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="default" className="text-[10px]">
                                {e.eventType === "WEBINAR" ? "Webinar" : e.eventType === "IN_PERSON" ? "In person" : "Hybrid"}
                              </Badge>
                              {e.status === "CANCELLED" && (
                                <Badge variant="outline" className="text-[10px] text-emce-orange">Cancelled</Badge>
                              )}
                            </div>
                            <p className="mt-1 text-sm font-bold text-emce-text">{e.title}</p>
                            <p className="text-hint text-emce-text-sec">
                              {new Intl.DateTimeFormat("en-IN", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                                hour: "numeric",
                                minute: "2-digit",
                                timeZone: e.timezone,
                              }).format(e.startsAt)}
                              {" · "}
                              {e._count.registrations} registered
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                {pastEvents.length > 0 && (
                  <Card>
                    <h2 className="text-section text-emce-text">Past events</h2>
                    <ul className="mt-3 space-y-2">
                      {pastEvents.map((e) => (
                        <li key={e.id}>
                          <Link
                            href={`/events/${e.slug}`}
                            className="block rounded-md border border-emce-border p-3 transition hover:border-emce-mid hover:bg-emce-light-soft"
                          >
                            <p className="text-sm font-bold text-emce-text">{e.title}</p>
                            <p className="text-hint text-emce-text-sec">
                              {new Intl.DateTimeFormat("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }).format(e.startsAt)}
                              {" · "}
                              {e._count.registrations} attended
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </>
            )}

            {activeTab === "people" && (
              <Card>
                <div className="flex items-center justify-between">
                  <h2 className="text-section text-emce-text">People who work here</h2>
                  <Badge variant="outline" className="text-[10px]">{uniquePeople.length}</Badge>
                </div>
                {uniquePeople.length === 0 ? (
                  <EmptyState
                    className="mt-3 border-0 p-6"
                    icon={<Users className="mx-auto h-8 w-8 text-emce-text-sec" />}
                    title="Nobody on the platform yet"
                    body="Once employees link this company in their experience, they'll show up here."
                  />
                ) : (
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                    {uniquePeople.map((p) => {
                      const c = p.candidate;
                      const name = `${c.firstName} ${c.lastName ?? ""}`.trim();
                      return (
                        <li key={c.id}>
                          <Link
                            href={`/${c.slug}`}
                            className="flex items-start gap-2 rounded-md border border-emce-border p-2.5 hover:border-emce-mid"
                          >
                            <Avatar src={c.profilePhotoUrl} name={name} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-emce-text">{name}</p>
                              <p className="line-clamp-2 text-hint text-emce-text-sec">{p.title}</p>
                              {c.headline && (
                                <p className="line-clamp-1 text-hint text-emce-text-sec">{c.headline}</p>
                              )}
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            )}
          </div>

          <aside className="space-y-4">
            {/* Recruiter rating card — surfaced as the first item in the
                right rail because it's the highest-trust signal a
                candidate looks for before applying. Hidden when null. */}
            {recruiterRating && <RecruiterRating rating={recruiterRating} variant="card" />}

            {company.benefits.length > 0 && (
              <Card>
                <h3 className="text-section text-emce-text">Benefits</h3>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {company.benefits.map((b) => (
                    <Badge key={b} variant="default" className="text-[10px]">{b}</Badge>
                  ))}
                </div>
              </Card>
            )}
            {company.techStack.length > 0 && (
              <Card>
                <h3 className="text-section text-emce-text">Tech / domain</h3>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {company.techStack.map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </Card>
            )}
            {(company.linkedinUrl || company.twitterUrl || company.facebookUrl) && (
              <Card>
                <h3 className="text-section text-emce-text">Social</h3>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {company.linkedinUrl && (
                    <li><a href={company.linkedinUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-emce-dark hover:underline">LinkedIn →</a></li>
                  )}
                  {company.twitterUrl && (
                    <li><a href={company.twitterUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-emce-dark hover:underline">X / Twitter →</a></li>
                  )}
                  {company.facebookUrl && (
                    <li><a href={company.facebookUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-emce-dark hover:underline">Facebook →</a></li>
                  )}
                </ul>
              </Card>
            )}
            <Card className="bg-emce-light-soft">
              <h3 className="text-section text-emce-text">Hiring on emobility.careers</h3>
              <p className="mt-1 text-hint text-emce-text-sec">
                Apply with one click using your candidate profile.
              </p>
              <Button asChild className="mt-3 w-full" size="sm">
                <Link href="/signup?role=CANDIDATE">Create your profile →</Link>
              </Button>
            </Card>
          </aside>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
