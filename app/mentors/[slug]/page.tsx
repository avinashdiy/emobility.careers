import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getMentorBySlug, getMentorSlots } from "@/server/mentorship/queries";
import { BookingDialog } from "@/components/mentorship/BookingDialog";
import { PriceLabel } from "@/components/mentorship/PriceLabel";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMentorBySlug(slug);
  if (!m) return { title: "Mentor not found" };
  const cp = m.user.candidateProfile;
  const name = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : "Mentor";
  return {
    title: `${name} — EV mentor on eMobility Careers`,
    description: m.headline,
  };
}

export default async function MentorPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const mentor = await getMentorBySlug(slug);
  if (!mentor || !mentor.isPublished || mentor.kycStatus !== "APPROVED") notFound();

  const slots = await getMentorSlots({ mentorId: mentor.id, daysAhead: 14 });
  const cp = mentor.user.candidateProfile;
  const fullName = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : "Mentor";
  const isOwner = session?.user?.id === mentor.userId;

  return (
    <>
      <SiteHeader />
      <div className="container max-w-5xl py-6 md:py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <Avatar src={cp?.profilePhotoUrl} name={fullName} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-section text-emce-text md:text-2xl">{fullName}</h1>
                    {cp?.isDIYguruVerified && <Badge variant="verified" className="text-[10px]">⭐ DIYguru</Badge>}
                    <Badge variant="default" className="text-[10px]">{cp?.personType?.replace("_", " ")}</Badge>
                  </div>
                  <p className="mt-1 text-emce-text">{mentor.headline}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {mentor.expertiseTags.map((t) => (
                      <Badge key={t} variant="default" className="text-[10px]">#{t}</Badge>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-emce-text-sec">
                    <span><strong className="text-emce-text">{mentor.yearsExperience}</strong> years</span>
                    <span>·</span>
                    <span>{mentor.totalSessions} sessions</span>
                    {mentor.totalRatings > 0 && (
                      <>
                        <span>·</span>
                        <span>★ {mentor.avgRating.toFixed(1)} ({mentor.totalRatings})</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <h2 className="text-section text-emce-text">About</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-emce-text">{mentor.bio}</p>
              {mentor.languages.length > 0 && (
                <p className="mt-3 text-sm text-emce-text-sec">
                  <strong className="text-emce-text">Languages:</strong> {mentor.languages.join(", ")}
                </p>
              )}
            </Card>

            {mentor.reviews.length > 0 && (
              <Card>
                <h2 className="text-section text-emce-text">Reviews</h2>
                <ul className="mt-2 space-y-3">
                  {mentor.reviews.map((r) => {
                    const reviewerName = r.reviewer.candidateProfile
                      ? `${r.reviewer.candidateProfile.firstName} ${r.reviewer.candidateProfile.lastName ?? ""}`.trim()
                      : "Mentee";
                    return (
                      <li key={r.id} className="border-l-2 border-emce-mid pl-3">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-bold text-emce-text">{reviewerName}</span>
                          <span className="text-emce-text-sec">★ {r.rating}/5</span>
                        </div>
                        {r.body && <p className="mt-1 text-sm text-emce-text">{r.body}</p>}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </div>

          <aside className="lg:col-span-1">
            <Card className="sticky top-20">
              <div className="space-y-3">
                <PriceLabel
                  pricePerSessionMinor={mentor.pricePerSessionMinor}
                  currency={mentor.currency}
                  acceptingFree={mentor.acceptingFree}
                  acceptingPaid={mentor.acceptingPaid}
                />
                <div className="text-xs text-emce-text-sec">
                  Sessions: {mentor.sessionDurations.join(" / ")} min · {mentor.defaultMode.toLowerCase()}
                </div>
                {isOwner ? (
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/me/mentor">Edit your mentor profile</Link>
                  </Button>
                ) : !session?.user ? (
                  <Button asChild variant="accent" className="w-full">
                    <Link href={`/signin?next=/mentors/${slug}`}>Sign in to book</Link>
                  </Button>
                ) : (
                  <BookingDialog
                    mentorId={mentor.id}
                    mentorName={fullName}
                    mentorPhotoUrl={cp?.profilePhotoUrl ?? null}
                    pricePerSessionMinor={mentor.pricePerSessionMinor}
                    currency={mentor.currency}
                    acceptingFree={mentor.acceptingFree}
                    acceptingPaid={mentor.acceptingPaid}
                    sessionDurations={mentor.sessionDurations}
                    defaultMode={mentor.defaultMode}
                    slots={slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() }))}
                    viewerEmail={session.user.email ?? ""}
                    viewerName={session.user.name ?? ""}
                  />
                )}
                {cp?.slug && (
                  <Link href={`/${cp.slug}`} className="block text-center text-xs font-semibold text-emce-text-sec hover:text-emce-text">
                    View full profile →
                  </Link>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
