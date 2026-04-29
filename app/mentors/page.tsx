import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { listMentors } from "@/server/mentorship/queries";
import { PriceLabel } from "@/components/mentorship/PriceLabel";
import { isFeatureOff, FeatureOffNotice } from "@/components/layout/FeatureGate";

export const metadata = {
  title: "Find an EV mentor",
  description: "Book 1:1 mentorship with EV professionals, DIYguru trainers, faculty, and industry experts.",
};

export default async function MentorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; domain?: string; paid?: "free" | "paid"; language?: string }>;
}) {
  if (await isFeatureOff("feature.mentorship_enabled")) return <FeatureOffNotice title="Mentorship" />;
  const sp = await searchParams;
  const [mentors, evDomains] = await Promise.all([
    listMentors({ q: sp.q, domain: sp.domain, paid: sp.paid, language: sp.language }),
    db.eVDomain.findMany({ orderBy: { order: "asc" } }),
  ]);

  return (
    <>
      <SiteHeader />
      <div className="container max-w-6xl py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-dashboard text-emce-text md:text-3xl">Find an EV mentor</h1>
            <p className="mt-1 max-w-2xl text-sm text-emce-text-sec">
              Book 1:1 sessions with EV professionals, DIYguru trainers, faculty, and industry experts. Free or paid — your call.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/me/mentor">Become a mentor →</Link>
          </Button>
        </div>

        <Card className="mt-6">
          <form className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="Skill, topic, or keyword" />
            </div>
            <div className="sm:col-span-3">
              <NativeSelect name="domain" defaultValue={sp.domain ?? ""}>
                <option value="">Any EV domain</option>
                {evDomains.map((d) => (
                  <option key={d.slug} value={d.slug}>{d.name}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <NativeSelect name="paid" defaultValue={sp.paid ?? ""}>
                <option value="">Free or paid</option>
                <option value="free">Free</option>
                <option value="paid">Paid</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full">Search</Button>
            </div>
          </form>
        </Card>

        <p className="mt-4 text-sm text-emce-text-sec">{mentors.length} mentors</p>

        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mentors.map((m) => {
            const cp = m.user.candidateProfile;
            const fullName = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : "Mentor";
            return (
              <li key={m.id}>
                <Card className="h-full">
                  <Link href={cp ? `/mentors/${cp.slug}` : "#"} className="block">
                    <div className="flex items-start gap-3">
                      <Avatar src={cp?.profilePhotoUrl} name={fullName} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-emce-text hover:underline">{fullName}</span>
                          {cp?.isDIYguruVerified && <Badge variant="verified" className="text-[10px]">⭐</Badge>}
                        </div>
                        <p className="line-clamp-2 text-hint text-emce-text-sec">{m.headline}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.expertiseTags.slice(0, 3).map((t) => (
                            <Badge key={t} variant="default" className="text-[10px]">#{t}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <PriceLabel
                        pricePerSessionMinor={m.pricePerSessionMinor}
                        currency={m.currency}
                        acceptingFree={m.acceptingFree}
                        acceptingPaid={m.acceptingPaid}
                      />
                      <span className="text-xs text-emce-text-sec">
                        {m.totalRatings > 0 ? `★ ${m.avgRating.toFixed(1)} (${m.totalRatings})` : "New mentor"}
                      </span>
                    </div>
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>

        {mentors.length === 0 && (
          <Card className="mt-6 p-10 text-center">
            <div className="text-4xl">🔎</div>
            <p className="mt-3 text-section text-emce-text">No mentors match your filters</p>
            <p className="mt-1 text-sm text-emce-text-sec">Try clearing the search or pick a different domain.</p>
          </Card>
        )}
      </div>
      <SiteFooter />
    </>
  );
}
