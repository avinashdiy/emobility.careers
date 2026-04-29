import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getCompetitionBySlug, getMyRegistration } from "@/server/competitions/queries";
import { formatMinor } from "@/components/mentorship/PriceLabel";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await getCompetitionBySlug(slug);
  if (!c) return { title: "Competition not found" };
  return { title: c.title, description: c.tagline ?? undefined };
}

export default async function CompetitionDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const c = await getCompetitionBySlug(slug);
  if (!c) notFound();
  if (c.status !== "LIVE" && c.status !== "JUDGING" && c.status !== "RESULTS" && c.status !== "APPROVED") {
    // Drafts / pending review aren't publicly visible
    if (!session?.user || (session.user.id !== c.postedById && session.user.role !== "ADMIN")) notFound();
  }

  const myReg = session?.user ? await getMyRegistration(c.id, session.user.id) : null;
  const now = Date.now();
  const regOpen = c.status === "LIVE"
    && (!c.registrationOpensAt || c.registrationOpensAt.getTime() <= now)
    && (!c.registrationClosesAt || c.registrationClosesAt.getTime() >= now);

  return (
    <>
      <SiteHeader />

      <div className="bg-emce-light-soft">
        <div
          className="aspect-[4/1] w-full bg-cover bg-center"
          style={c.bannerImageUrl ? { backgroundImage: `url(${c.bannerImageUrl})` } : undefined}
        >
          {!c.bannerImageUrl && <div className="grid h-full place-items-center text-6xl">🏆</div>}
        </div>
      </div>

      <div className="container max-w-6xl py-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{c.type.replace("_", " ")}</Badge>
                {c.evDomainSlugs.map((d) => (
                  <Badge key={d} variant="default" className="text-[10px]">#{d}</Badge>
                ))}
                <Badge variant={c.status === "LIVE" ? "verified" : c.status === "RESULTS" ? "default" : "warning"} className="text-[10px]">
                  {c.status}
                </Badge>
              </div>
              <h1 className="mt-2 text-dashboard text-emce-text md:text-3xl">{c.title}</h1>
              {c.tagline && <p className="mt-1 text-sm text-emce-text-sec">{c.tagline}</p>}
              <div className="mt-3 flex items-center gap-3">
                <Avatar src={c.hostCompany.logoUrl} name={c.hostCompany.name} size="sm" />
                <Link href={`/companies/${c.hostCompany.slug}`} className="font-bold text-emce-text hover:underline">
                  Hosted by {c.hostCompany.name}
                </Link>
              </div>
            </Card>

            <Card>
              <h2 className="text-section text-emce-text">About</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-emce-text">{c.description}</p>
            </Card>

            {c.eligibility && (
              <Card>
                <h2 className="text-section text-emce-text">Eligibility</h2>
                <p className="mt-2 whitespace-pre-line text-sm text-emce-text">{c.eligibility}</p>
              </Card>
            )}

            {c.rules && (
              <Card>
                <h2 className="text-section text-emce-text">Rules</h2>
                <p className="mt-2 whitespace-pre-line text-sm text-emce-text">{c.rules}</p>
              </Card>
            )}

            <Card>
              <h2 className="text-section text-emce-text">Stages</h2>
              <ol className="mt-2 space-y-2">
                {c.stages.map((s) => (
                  <li key={s.id} className="rounded-md border border-emce-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-emce-text">{s.order}. {s.name}</span>
                      <Badge variant="outline" className="text-[10px]">{s.kind}</Badge>
                    </div>
                    {s.description && <p className="mt-1 text-sm text-emce-text-sec">{s.description}</p>}
                    <p className="mt-1 text-hint text-emce-text-sec">
                      {s.startsAt.toLocaleString("en-IN")} → {s.endsAt.toLocaleString("en-IN")}
                    </p>
                  </li>
                ))}
              </ol>
            </Card>

            {c.announcements.length > 0 && (
              <Card>
                <h2 className="text-section text-emce-text">Announcements</h2>
                <ul className="mt-2 space-y-3">
                  {c.announcements.map((a) => (
                    <li key={a.id} className="border-l-2 border-emce-mid pl-3">
                      <p className="font-bold text-emce-text">{a.title}</p>
                      <p className="mt-0.5 text-hint text-emce-text-sec">{a.createdAt.toLocaleString("en-IN")}</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-emce-text">{a.body}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <aside className="space-y-4">
            <Card className="sticky top-20">
              <h3 className="text-section text-emce-text">Key dates (IST)</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {c.registrationOpensAt && <li><span className="text-emce-text-sec">Registration opens:</span> <strong>{c.registrationOpensAt.toLocaleString("en-IN")}</strong></li>}
                {c.registrationClosesAt && <li><span className="text-emce-text-sec">Registration closes:</span> <strong>{c.registrationClosesAt.toLocaleString("en-IN")}</strong></li>}
                <li><span className="text-emce-text-sec">Starts:</span> <strong>{c.startsAt.toLocaleString("en-IN")}</strong></li>
                <li><span className="text-emce-text-sec">Ends:</span> <strong>{c.endsAt.toLocaleString("en-IN")}</strong></li>
                {c.resultsAt && <li><span className="text-emce-text-sec">Results:</span> <strong>{c.resultsAt.toLocaleString("en-IN")}</strong></li>}
              </ul>

              <div className="mt-4 border-t border-emce-border pt-4">
                {!session?.user ? (
                  <Button asChild variant="accent" className="w-full">
                    <Link href={`/signin?next=/competitions/${c.slug}`}>Sign in to register</Link>
                  </Button>
                ) : myReg ? (
                  <div className="space-y-2">
                    <p className="text-sm text-emce-text">
                      You're registered{myReg.teamName ? ` as "${myReg.teamName}"` : ""}.
                    </p>
                    <Button asChild className="w-full">
                      <Link href={`/me/competitions`}>Open my dashboard →</Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full">
                      <Link href={`/competitions/${c.slug}/submit`}>Submit / update</Link>
                    </Button>
                  </div>
                ) : regOpen ? (
                  <Button asChild variant="accent" className="w-full">
                    <Link href={`/competitions/${c.slug}/register`}>Register {c.isTeamBased ? "your team" : "now"}</Link>
                  </Button>
                ) : (
                  <Button disabled className="w-full">Registration {c.registrationClosesAt && now > c.registrationClosesAt.getTime() ? "closed" : "not open"}</Button>
                )}
              </div>
            </Card>

            {c.prizes.length > 0 && (
              <Card>
                <h3 className="text-section text-emce-text">Prizes</h3>
                <ul className="mt-2 space-y-2">
                  {c.prizes.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-emce-border p-2.5 text-sm">
                      <div>
                        <p className="font-bold text-emce-text">#{p.rank} {p.title}</p>
                        {p.description && <p className="text-hint text-emce-text-sec">{p.description}</p>}
                        {p.inKind && <p className="text-hint text-emce-text-sec">+ {p.inKind}</p>}
                      </div>
                      {p.cashAmountMinor > 0 && (
                        <span className="font-bold text-emce-text">{formatMinor(p.cashAmountMinor, p.currency)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {c.perks.length > 0 && (
              <Card>
                <h3 className="text-section text-emce-text">Recruitment perks</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {c.perks.map((p) => (
                    <li key={p.id} className="rounded-md border border-emce-border p-2.5">
                      <Link href={`/jobs/${p.job.id}`} className="font-bold text-emce-text hover:underline">
                        {p.job.title}
                      </Link>
                      <p className="text-hint text-emce-text-sec">
                        Ranks {p.forRanks.join(", ")} fast-tracked to {p.ataStage}.
                      </p>
                      {p.notes && <p className="text-hint text-emce-text-sec">{p.notes}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </aside>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
